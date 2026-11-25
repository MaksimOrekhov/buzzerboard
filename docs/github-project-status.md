# GitHub Project status synchronization

The `status:*` label on a BuzzerBoard Issue controls its Status on [Project #1](https://github.com/users/MaksimOrekhov/projects/1/views/1).

| Issue label              | Project Status  |
| ------------------------ | --------------- |
| `status:backlog`         | Backlog         |
| `status:ready`           | Ready           |
| `status:in-progress`     | In Progress     |
| `status:in-review`       | In Review       |
| `status:ready-to-deploy` | Ready to Deploy |
| `status:done`            | Done            |

Open or reopen an Issue with one status label, or replace its current status label. Keep a single status label per Issue. An absent status leaves the card as it is. An unknown status or multiple status labels produces a warning and preserves the card. Remove the extra label or replace the unknown label to trigger a fresh sync. Archived cards stay archived.

The workflow fetches the current labels from GitHub, so a queued event uses the latest Issue state. It compares option IDs and only writes a different Status. If a labeled Issue needs a card, it uses GitHub's idempotent add mutation and then reads the card back. Automatic runs are serialized for each Issue, and both event and manual runs re-read after writes. Project access errors stop the run. Temporary failures are retried with a bounded backoff that respects rate-limit delays. A fresh dry-run can identify any remaining differences.

## Owner setup

1. In [Project #1 → Workflows](https://github.com/users/MaksimOrekhov/projects/1/workflows), turn off **Auto-close issue** and the built-in rules **Item added to project**, **Item closed**, and **Pull request linked to issue**. These rules can close Issues or overwrite their label-driven Status. The script checks them before writing.
2. As the Project owner, go to **Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token (classic)**. Give the token an expiry and select only `project` for this public repository and personal Project. The Actions `GITHUB_TOKEN` is scoped to the repository. The [Projects API authentication docs](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects#authentication) describe the `project` and `read:project` scopes.
3. In **BuzzerBoard → Settings → Secrets and variables → Actions → Repository secrets**, create `PROJECT_STATUS_TOKEN`. To rotate it, replace the repository secret with a fresh token, verify a dry-run, and revoke the previous token under **Tokens (classic)**. To revoke access, delete the token there and remove the repository secret.

## Dry-run and apply

In **Actions → Sync Issue status to Project → Run workflow**, select `main` and run `dry-run` first. The log lists each Issue number, Project status, status labels, and proposed action. With `issues` blank, reconciliation scans existing BuzzerBoard cards on this Project. Supply comma-separated Issue numbers to include imports that may not have cards yet. After reviewing the log, run again with `mode=apply` only if appropriate.

The same read-only check runs locally from a checkout with Node.js 22 and an authenticated GitHub CLI token with `read:project` or `project`.

```sh
PROJECT_STATUS_TOKEN="$(gh auth token --hostname github.com)" node scripts/project-status-sync.mjs reconcile dry-run
node --test scripts/project-status-sync.test.mjs
```

Once enabled, verify with an owner-approved Issue. Start with `status:backlog`, replace it with `status:ready`, then verify that the same card moved. An unrelated label should leave the card in Ready. Review workflow warnings if two status labels were temporarily present. Issue #41 is covered by mock tests.

A successful CI run on `main` triggers the existing production deployment workflow, including after a merge of workflow-only changes.
