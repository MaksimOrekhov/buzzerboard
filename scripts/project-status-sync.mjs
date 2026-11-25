import { readFile } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'

const owner = 'MaksimOrekhov'
const repo = 'buzzerboard'
const repository = owner + '/' + repo
const projectNumber = 1
const attempts = 4
const defaultPause = 1000

export const statusNames = new Map([
  ['status:backlog', 'Backlog'],
  ['status:ready', 'Ready'],
  ['status:in-progress', 'In Progress'],
  ['status:in-review', 'In Review'],
  ['status:ready-to-deploy', 'Ready to Deploy'],
  ['status:done', 'Done'],
])

const isStatusLabel = (name) => typeof name === 'string' && /^status:/i.test(name)

export function eventIssue(event) {
  if (event.repository?.full_name?.toLowerCase() !== repository.toLowerCase()) return null
  const number = event.issue?.number
  if (!Number.isInteger(number) || number < 1 || event.issue.pull_request) return null
  if (['opened', 'reopened'].includes(event.action)) return number
  if (['labeled', 'unlabeled'].includes(event.action) && isStatusLabel(event.label?.name)) {
    return number
  }
  return null
}

class RetryableError extends Error {
  constructor(message, { minimumWait = 0, cause } = {}) {
    super(message, { cause })
    this.minimumWait = minimumWait
  }
}

async function retry(operation, pause) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation()
    } catch (error) {
      if (!(error instanceof RetryableError) || attempt >= attempts - 1) throw error
      const delay = Math.max(defaultPause * 2 ** attempt, error.minimumWait)
      if (delay > 65_000) {
        throw new Error(error.message + ' Retry after the GitHub rate limit resets.', {
          cause: error,
        })
      }
      console.warn(
        'Retrying GitHub operation in %d seconds. %s',
        Math.ceil(delay / 1000),
        error.message,
      )
      await pause(delay)
    }
  }
}

export function createGraphql(token, fetchImpl = fetch) {
  if (!token) throw new Error('Set PROJECT_STATUS_TOKEN. See docs/github-project-status.md.')
  return async (query, variables) => {
    let response
    try {
      response = await fetchImpl('https://api.github.com/graphql', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(20_000),
      })
    } catch (cause) {
      throw new RetryableError('Could not reach GitHub GraphQL.', { cause })
    }

    if ([408, 500, 502, 503, 504].includes(response.status)) {
      throw new RetryableError('GitHub GraphQL returned HTTP ' + response.status + '.')
    }

    const result = await response.json().catch(() => ({}))
    const errors = result.errors ?? []
    const messages = errors.map(({ message }) => message).join('; ')
    const retryAfter = response.headers.get('retry-after')
    const remaining = response.headers.get('x-ratelimit-remaining')
    if (
      response.status === 429 ||
      retryAfter ||
      (remaining === '0' && (!response.ok || errors.length)) ||
      errors.some(({ type }) => type === 'RATE_LIMITED') ||
      /rate limit|abuse detection/i.test(messages)
    ) {
      const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000 - Date.now()
      const wait = remaining === '0' && reset > 0 ? reset : Number(retryAfter) * 1000 || 60_000
      throw new RetryableError('GitHub GraphQL rate limit reached.', { minimumWait: wait })
    }

    if (
      [401, 403].includes(response.status) ||
      errors.some(({ type }) => type === 'FORBIDDEN') ||
      /resource not accessible|insufficient scopes|permission|not authorized/i.test(messages)
    ) {
      throw new Error(
        'GitHub rejected project access. Check PROJECT_STATUS_TOKEN and its project scope.',
      )
    }
    if (!response.ok || errors.length || !result.data) {
      throw new Error(
        'GitHub GraphQL ' + (messages || 'returned HTTP ' + response.status + ' without data'),
      )
    }
    return result.data
  }
}

const projectQuery = `query ProjectForStatusSync($owner: String!, $number: Int!) {
  user(login: $owner) {
    projectV2(number: $number) {
      id closed viewerCanUpdate
      field(name: "Status") {
        ... on ProjectV2SingleSelectField { id options { id name } }
      }
      workflows(first: 100) { nodes { name enabled } }
    }
  }
}`

export async function loadProject(graphql, { apply = false, pause = sleep } = {}) {
  const data = await retry(() => graphql(projectQuery, { owner, number: projectNumber }), pause)
  const project = data.user?.projectV2
  if (!project || project.closed) {
    throw new Error('Cannot access open Project #1 owned by ' + owner + '. Check token access.')
  }
  if (!project.field?.id) throw new Error('Project #1 needs a single-select Status field.')
  const options = new Map(project.field.options.map(({ name, id }) => [name, id]))
  for (const name of statusNames.values()) {
    if (!options.get(name))
      throw new Error('Project #1 Status is missing the option "' + name + '".')
  }
  if (apply) {
    if (!project.viewerCanUpdate)
      throw new Error('PROJECT_STATUS_TOKEN needs write access to Project #1.')
    const conflicts = new Set([
      'Auto-close issue',
      'Item added to project',
      'Item closed',
      'Pull request linked to issue',
    ])
    const enabled = project.workflows.nodes.filter(
      ({ name, enabled }) => enabled && conflicts.has(name),
    )
    if (enabled.length) {
      throw new Error(
        'Disable these Project #1 workflows before syncing Issue statuses: ' +
          enabled.map(({ name }) => name).join(', ') +
          '. See docs/github-project-status.md.',
      )
    }
  }
  return { id: project.id, fieldId: project.field.id, options }
}

const issueQuery = `query IssueForStatusSync(
  $owner: String!, $repo: String!, $number: Int!, $labelsAfter: String, $itemsAfter: String
) {
  repository(owner: $owner, name: $repo) {
    issue(number: $number) {
      id
      labels(first: 100, after: $labelsAfter) {
        nodes { name } pageInfo { hasNextPage endCursor }
      }
      projectItems(first: 100, after: $itemsAfter, includeArchived: true) {
        nodes {
          id isArchived project { id }
          fieldValueByName(name: "Status") {
            ... on ProjectV2ItemFieldSingleSelectValue { name optionId }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}`

async function loadIssue(graphql, project, number) {
  const labels = new Set()
  const items = new Map()
  let labelsAfter = null
  let itemsAfter = null
  let issue
  let hasNextPage
  do {
    const data = await graphql(issueQuery, { owner, repo, number, labelsAfter, itemsAfter })
    if (!data.repository) throw new Error('Cannot access repository ' + repository + '.')
    issue = data.repository.issue
    if (!issue)
      throw new RetryableError('Issue #' + number + ' is unavailable in ' + repository + '.')
    for (const { name } of issue.labels.nodes) if (isStatusLabel(name)) labels.add(name)
    for (const item of issue.projectItems.nodes) {
      if (item.project.id === project.id) items.set(item.id, item)
    }
    const next = (connection) =>
      connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null
    // Once a connection ends, leave its cursor on the last page while the other finishes.
    const labelCursor = next(issue.labels)
    const itemCursor = next(issue.projectItems)
    hasNextPage = Boolean(labelCursor || itemCursor)
    labelsAfter = labelCursor ?? labelsAfter
    itemsAfter = itemCursor ?? itemsAfter
  } while (hasNextPage)
  if (items.size > 1) throw new Error('Issue #' + number + ' has duplicate cards in Project #1.')
  return { id: issue.id, labels: [...labels].sort(), item: items.values().next().value }
}

const projectItemsQuery = `query BoardIssuesForReconciliation($project: ID!, $after: String) {
  node(id: $project) {
    ... on ProjectV2 {
      items(first: 100, after: $after) {
        nodes { content { ... on Issue { number repository { nameWithOwner } } } }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}`

export async function boardIssueNumbers(graphql, project, pause = sleep) {
  const numbers = new Set()
  let after = null
  do {
    const data = await retry(
      () => graphql(projectItemsQuery, { project: project.id, after }),
      pause,
    )
    if (!data.node) throw new Error('Cannot list items in Project #1. Check PROJECT_STATUS_TOKEN.')
    const { nodes, pageInfo } = data.node.items
    for (const { content } of nodes) {
      if (content?.repository?.nameWithOwner.toLowerCase() === repository.toLowerCase()) {
        numbers.add(content.number)
      }
    }
    after = pageInfo.hasNextPage ? pageInfo.endCursor : null
  } while (after)
  return [...numbers].sort((a, b) => a - b)
}

const addItem = `mutation AddIssueToStatusProject($project: ID!, $issue: ID!) {
  addProjectV2ItemById(input: { projectId: $project, contentId: $issue }) { item { id } }
}`

const setStatus = `mutation SetProjectIssueStatus($project: ID!, $item: ID!, $field: ID!, $option: String!) {
  updateProjectV2ItemFieldValue(
    input: { projectId: $project, itemId: $item, fieldId: $field, value: { singleSelectOptionId: $option } }
  ) { projectV2Item { id } }
}`

export async function syncIssue(graphql, project, number, { apply = false, pause = sleep } = {}) {
  let added = false
  let updated = false
  let writes = 0
  for (;;) {
    const result = await retry(async () => {
      const { id, labels, item } = await loadIssue(graphql, project, number)
      const current = item?.fieldValueByName?.name ?? (item ? '(unset)' : '(no card)')
      const status = labels.length === 1 ? statusNames.get(labels[0].toLowerCase()) : undefined
      const report = { number, current, labels, status }
      if (!status || item?.isArchived) {
        const action = item?.isArchived
          ? 'archived card'
          : labels.length > 1
            ? 'conflicting labels'
            : labels.length
              ? 'unknown status label'
              : 'no status label'
        return { ...report, action, warning: item?.isArchived || labels.length > 0 }
      }
      const option = project.options.get(status)
      if (item?.fieldValueByName?.optionId === option) {
        return { ...report, action: updated ? 'updated' : added ? 'added' : 'unchanged' }
      }
      if (!apply) return { ...report, action: item ? 'would update' : 'would add' }
      if (writes >= 3)
        throw new Error('Status for #' + number + ' did not stabilize. Reconcile again.')

      if (!item) {
        if (added) throw new RetryableError('Project card for #' + number + ' is not visible yet.')
        try {
          // GitHub returns the existing card if the Project has already added this issue.
          const data = await graphql(addItem, { project: project.id, issue: id })
          if (!data.addProjectV2ItemById?.item?.id) throw new Error('GitHub did not return a card.')
          added = true
        } catch (error) {
          if (!/already (?:exists|added|in the project)/i.test(error.message)) throw error
          added = true
        }
        return null
      }

      const data = await graphql(setStatus, {
        project: project.id,
        item: item.id,
        field: project.fieldId,
        option,
      })
      if (data.updateProjectV2ItemFieldValue?.projectV2Item?.id !== item.id) {
        throw new Error('GitHub did not confirm the Status update for #' + number + '.')
      }
      updated = true
      return null
    }, pause)
    if (result) return result
    writes++
    await pause(defaultPause)
  }
}

function parseNumbers(value) {
  if (!value) return []
  const numbers = value.split(',').map((part) => part.trim())
  if (numbers.some((part) => !/^[1-9]\d{0,9}$/.test(part) || Number(part) > 2_147_483_647)) {
    throw new Error('Provide comma-separated GitHub Issue numbers, for example 41,42,65.')
  }
  return [...new Set(numbers.map(Number))].sort((a, b) => a - b)
}

async function main() {
  let apply
  let numbers
  if (process.argv[2] === 'event') {
    const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'))
    const number = eventIssue(event)
    if (!number) return
    apply = true
    numbers = [number]
  } else if (process.argv[2] === 'reconcile') {
    const mode = process.argv[3] || 'dry-run'
    if (!['dry-run', 'apply'].includes(mode))
      throw new Error('Use reconcile dry-run or reconcile apply.')
    apply = mode === 'apply'
    numbers = parseNumbers(process.argv[4])
  } else {
    throw new Error('Use event or reconcile [dry-run|apply] [issue numbers].')
  }

  const graphql = createGraphql(process.env.PROJECT_STATUS_TOKEN)
  const project = await loadProject(graphql, { apply })
  if (!numbers.length) numbers = await boardIssueNumbers(graphql, project)
  console.log(
    '%s · %s · Project #%d · %d issues',
    apply ? 'APPLY' : 'DRY RUN',
    repository,
    projectNumber,
    numbers.length,
  )
  for (const number of numbers) {
    const { current, labels, status, action, warning } = await syncIssue(graphql, project, number, {
      apply,
    })
    const line =
      '#' +
      number +
      ' | ' +
      current +
      ' | ' +
      JSON.stringify(labels) +
      ' | ' +
      action +
      (status ? ' → ' + status : '')
    console.log((warning && process.env.GITHUB_ACTIONS === 'true' ? '::warning::' : '') + line)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('Project status sync failed: ' + JSON.stringify(error.message))
    process.exitCode = 1
  })
}
