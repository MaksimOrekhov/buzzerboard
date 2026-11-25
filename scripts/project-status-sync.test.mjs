import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  boardIssueNumbers,
  createGraphql,
  eventIssue,
  loadProject,
  statusNames,
  syncIssue,
} from './project-status-sync.mjs'

const options = new Map([...statusNames.values()].map((name) => [name, 'id-' + name]))
const project = { id: 'project-id', fieldId: 'status-field', options }
const pause = async () => {}
const apply = { apply: true, pause }
const page = (nodes, endCursor = null) => ({
  nodes,
  pageInfo: { hasNextPage: !!endCursor, endCursor },
})
const card = (name, id = 'card-41') => ({
  id,
  project: { id: project.id },
  isArchived: false,
  fieldValueByName: name ? { name, optionId: options.get(name) } : null,
})

function fixture(labels, item, onAdd = () => card('Backlog', 'new-card')) {
  const writes = []
  const data = { labels, item, onAdd }
  const graphql = async (query, variables) => {
    if (query.includes('query IssueForStatusSync')) {
      assert.deepEqual([variables.owner, variables.repo], ['MaksimOrekhov', 'buzzerboard'])
      return {
        repository: {
          issue: {
            id: 'issue-41',
            labels: page(data.labels.map((name) => ({ name }))),
            projectItems: page(data.item ? [data.item] : []),
          },
        },
      }
    }
    writes.push(variables)
    if (query.includes('mutation AddIssueToStatusProject')) {
      data.item = data.onAdd()
      return { addProjectV2ItemById: { item: { id: data.item.id } } }
    }
    assert.match(query, /mutation SetProjectIssueStatus/)
    assert.deepEqual(Object.keys(variables).sort(), ['field', 'item', 'option', 'project'])
    assert.equal(variables.item, data.item.id)
    assert.equal(variables.field, project.fieldId)
    const [name] = [...options].find(([, id]) => id === variables.option)
    data.item = card(name, variables.item)
    return { updateProjectV2ItemFieldValue: { projectV2Item: { id: variables.item } } }
  }
  return { data, graphql, writes }
}

test('all six labels map to their actual option names in dry-run', async () => {
  const expected = {
    'status:backlog': 'Backlog',
    'status:ready': 'Ready',
    'status:in-progress': 'In Progress',
    'status:in-review': 'In Review',
    'status:ready-to-deploy': 'Ready to Deploy',
    'status:done': 'Done',
  }
  for (const [label, status] of Object.entries(expected)) {
    const { graphql, writes } = fixture([label, 'priority:high'], card('Backlog'))
    const result = await syncIssue(graphql, project, 41)
    assert.equal(result.current, 'Backlog')
    assert.equal(result.status, status)
    assert.equal(result.action, status === 'Backlog' ? 'unchanged' : 'would update')
    assert.deepEqual(writes, [])
  }
  const { graphql, writes } = fixture(['status:ready'])
  assert.equal((await syncIssue(graphql, project, 41)).action, 'would add')
  assert.deepEqual(writes, [])
})

test('mock #41 moves Ready → In Progress → In Review → Ready on its original card', async () => {
  const { data, graphql, writes } = fixture(['status:ready'], card('Ready'))
  assert.equal((await syncIssue(graphql, project, 41, apply)).action, 'unchanged')
  for (const label of ['status:in-progress', 'status:in-review', 'status:ready']) {
    data.labels = [label]
    assert.equal((await syncIssue(graphql, project, 41, apply)).action, 'updated')
    assert.equal((await syncIssue(graphql, project, 41, apply)).action, 'unchanged')
  }
  assert.deepEqual(
    writes.map(({ item }) => item),
    ['card-41', 'card-41', 'card-41'],
  )
  assert.equal(data.item.fieldValueByName.name, 'Ready')
})

test('no status, malformed status, conflicting labels and archive preserve the card', async () => {
  for (const [labels, action, warning] of [
    [['priority:low'], 'no status label', false],
    [['status:'], 'unknown status label', true],
    [['status:in-review', 'status:ready'], 'conflicting labels', true],
  ]) {
    const { graphql, writes } = fixture(labels, card('Ready'))
    const result = await syncIssue(graphql, project, 41, apply)
    assert.deepEqual([result.current, result.action, result.warning], ['Ready', action, warning])
    assert.deepEqual(writes, [])
  }
  const { graphql, writes } = fixture(['status:ready'], { ...card('Backlog'), isArchived: true })
  assert.equal((await syncIssue(graphql, project, 41, apply)).action, 'archived card')
  assert.deepEqual(writes, [])
})

test('labeled new issue is added once, then the same card moves to Ready', async () => {
  const { data, graphql, writes } = fixture(['status:backlog'], undefined, () =>
    card(null, 'new-card'),
  )
  await syncIssue(graphql, project, 70, apply)
  assert.equal(data.item.fieldValueByName.name, 'Backlog')
  data.labels = ['status:ready']
  await syncIssue(graphql, project, 70, apply)
  await syncIssue(graphql, project, 70, apply)
  assert.deepEqual(
    writes.map(({ issue, item }) => issue ?? item),
    ['issue-41', 'new-card', 'new-card'],
  )
  assert.equal(data.item.fieldValueByName.name, 'Ready')
})

test('uses the auto-added card when auto-add wins the race and re-reads concurrent label changes', async () => {
  const { data, graphql, writes } = fixture(['status:backlog'], null, () => {
    data.labels = ['status:ready']
    return card('Backlog', 'auto-added')
  })
  const result = await syncIssue(graphql, project, 70, apply)
  assert.equal(result.status, 'Ready')
  assert.deepEqual(
    writes.map(({ issue, item }) => issue ?? item),
    ['issue-41', 'auto-added'],
  )
})

test('refetches before retrying an ambiguous mutation instead of writing twice', async () => {
  const { data, graphql, writes } = fixture(['status:ready'], card('Backlog'))
  const outage = createGraphql('fake', async () => new Response('', { status: 502 }))
  const unreliable = async (query, variables) => {
    const result = await graphql(query, variables)
    if (query.startsWith('mutation')) await outage(query, variables)
    return result
  }
  await syncIssue(unreliable, project, 41, apply)
  assert.equal(writes.length, 1)
  assert.equal(data.item.fieldValueByName.name, 'Ready')
})

test('events use only BuzzerBoard issues and relevant status-label changes', () => {
  const event = {
    repository: { full_name: 'MaksimOrekhov/buzzerboard' },
    issue: { number: 41 },
    label: { name: 'status:ready' },
  }
  for (const action of ['opened', 'reopened', 'labeled', 'unlabeled']) {
    assert.equal(eventIssue({ ...event, action }), 41)
  }
  assert.equal(eventIssue({ ...event, action: 'edited' }), null)
  assert.equal(eventIssue({ ...event, action: 'labeled', label: { name: 'type:design' } }), null)
  assert.equal(
    eventIssue({ ...event, action: 'opened', issue: { number: 41, pull_request: {} } }),
    null,
  )
  assert.equal(eventIssue({ ...event, action: 'opened', repository: { full_name: 'a/b' } }), null)
})

test('board reconciliation paginates and includes only Issues from BuzzerBoard', async () => {
  const issue = (number, nameWithOwner) => ({ content: { number, repository: { nameWithOwner } } })
  const repository = 'MaksimOrekhov/buzzerboard'
  const graphql = async (_, { after }) => ({
    node: {
      items: after
        ? page([issue(41, repository), issue(49, repository), issue(1, 'other/repo')])
        : page([issue(49, repository), { content: {} }, { content: null }], 'next'),
    },
  })
  assert.deepEqual(await boardIssueNumbers(graphql, project), [41, 49])
})

test('GraphQL permission and partial-data errors stop the operation', async () => {
  const forbidden = createGraphql('fake', async () =>
    Response.json({ data: { user: null }, errors: [{ type: 'FORBIDDEN', message: 'denied' }] }),
  )
  await assert.rejects(loadProject(forbidden), /PROJECT_STATUS_TOKEN.*project scope/)
  const invalid = createGraphql('fake', async () =>
    Response.json({ data: {}, errors: [{ message: 'Invalid selection' }] }),
  )
  await assert.rejects(loadProject(invalid), /Invalid selection/)
  await assert.rejects(
    loadProject(async () => ({ user: { projectV2: null } })),
    /Project #1/,
  )
})

test('rate limits honor Retry-After and exhaust a bounded number of attempts', async () => {
  let requests = 0
  const delays = []
  const graphql = createGraphql('fake', async () => {
    requests++
    return new Response(null, { status: 429, headers: { 'Retry-After': '3' } })
  })
  await assert.rejects(
    loadProject(graphql, { pause: async (delay) => delays.push(delay) }),
    /rate limit/,
  )
  assert.equal(requests, 4)
  assert.deepEqual(delays, [3000, 3000, 4000])
})

test('dry-run is read-only and apply checks actual write access and conflicting workflows', async () => {
  const value = {
    id: project.id,
    viewerCanUpdate: false,
    field: { id: project.fieldId, options: [...options].map(([name, id]) => ({ name, id })) },
    workflows: { nodes: [{ name: 'Auto-close issue', enabled: true }] },
  }
  const graphql = async () => ({ user: { projectV2: value } })
  assert.deepEqual(await loadProject(graphql), project)
  await assert.rejects(loadProject(graphql, apply), /needs write access/)
  value.viewerCanUpdate = true
  await assert.rejects(loadProject(graphql, apply), /Disable.*Auto-close issue/)
  value.workflows.nodes[0].enabled = false
  assert.deepEqual(await loadProject(graphql, apply), project)
})
