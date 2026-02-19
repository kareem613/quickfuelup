# Remote Feature Workflow Instructions

Use this workflow loop for remote feature work and bug-fix work.

## Workflow loop

1. Receive the request from the user.
2. Ask any clarifying questions needed to verify expected behavior and acceptance criteria.
3. Implement the requested change.
4. Verify the change based on the agreed expectations.
5. Commit and push.
6. Wait for user feedback from the deployed result.
7. Use that feedback as input for the next iteration.

## Environment verification for this workflow

Before implementation/verification, confirm the environment is ready by checking:
- Chrome DevTools integration is working.
- The site is loaded.

These checks verify the application is running.

## Runtime handling constraints

- The application is always on hot reload.
- Do not start, stop, restart, or otherwise manage application runtime.
- Assume setup is already in place; execute only the workflow loop above.

## Completion handoff

- When the user indicates the feature/change is complete, prompt to confirm whether a GitHub pull request should be created.
- When the user indicates the pull request is complete, switch to `main` and pull latest changes so the repo is ready for the next feature.
- The user may also ask the agent to check the PR; if requested, verify branch/repo state and perform the same switch-to-`main` + pull preparation.
