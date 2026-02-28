# Remote Feature Workflow Instructions

Use this workflow loop for remote feature work and bug-fix work.

## Prerequisites

Before any work begins, verify the following CLI tools are available and authenticated:

- **GitHub CLI (`gh`):** Confirm it is installed and authenticated. If not, stop and inform the user that the GitHub CLI must be installed and logged in before proceeding.
- **Vercel CLI (`vercel`):** Confirm it is installed and authenticated. If not, stop and inform the user that the Vercel CLI must be installed and logged in before proceeding.

Do not proceed with any task until both are confirmed.

## Deployment model

The application is deployed automatically via CI/CD. Pushing a branch and opening a pull request triggers a preview deployment. There is no local dev server to manage.

## Starting a new application

When bootstrapping a brand new application, follow these steps before any feature work begins.

### Infrastructure assumptions

- **Source control:** GitHub
- **Deployment & CI/CD:** Vercel — every new application gets its own Vercel project
- **Database / Auth / Storage:** Supabase — only applicable if the application requires a database, authentication, or file storage; do not set it up by default

### Setup steps

1. **GitHub:** Create a new GitHub repository for the project. Initialize it with a `README.md` and appropriate `.gitignore`. Clone it locally.
2. **Vercel:** Create a new Vercel project and link it to the GitHub repository. Confirm that the CI/CD pipeline is active — pushes to `main` deploy to production, and pull requests generate preview deployments.
3. **Supabase (if needed):** If the application requires a database, authentication, or storage, ask the user to:
   - Create a new Supabase project.
   - Install the Supabase MCP for that project so the agent can interact with it.
   - Provide the project URL and anon key for local configuration.
   Do not proceed with any Supabase-dependent work until the MCP is installed and confirmed.
4. Once infrastructure is in place, follow the **Starting a new feature** workflow for all implementation work.

---

## Starting a new feature

Before beginning any new feature or bug fix, ensure the local repo is in a clean and current state:

1. Check the current branch.
   - If it is **not** `main`, ask the user: "You're currently on `<branch-name>`. Do you want to continue work on this branch, or switch to `main` and start a fresh branch?"
   - Wait for the user's answer before proceeding.
2. If starting fresh: switch to `main` and pull the latest changes.
3. Verify there are no uncommitted changes.
4. Create and switch to a new feature branch with a descriptive name.

Only proceed with implementation once these steps are complete.

## Workflow loop

1. Receive the request from the user.
2. Ask any clarifying questions needed to verify expected behavior and acceptance criteria.
3. Create a feature branch, implement the requested change, commit, and push.
4. Open a GitHub pull request — this triggers the preview deployment.
5. Share the preview URL with the user and wait for feedback from the deployed result.
6. Use that feedback as input for the next iteration (commit and push to the same branch to redeploy).
7. When the user approves, merge the pull request.

## Environment verification for this workflow

Before starting work, confirm:
- The current branch and repo state are clean and ready for a new feature branch.

## Runtime handling constraints

- Do not start, stop, restart, or otherwise manage any application runtime.
- Deployments are triggered automatically by pushes to the remote branch.

## Completion handoff

- When the feature is approved and ready to merge, ask the user: "Would you like me to merge the pull request, or do you want to review and merge it yourself?"
- If the user wants the agent to merge: merge the PR, then switch to `main` and pull latest changes so the repo is ready for the next feature.
- If the user wants to merge themselves: wait for confirmation that the PR has been merged, then switch to `main` and pull latest changes.
- The user may also ask the agent to check the PR; if requested, verify branch/repo state and perform the same switch-to-`main` + pull preparation.
