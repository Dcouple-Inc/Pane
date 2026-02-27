/**
 * Git attribution environment variables.
 *
 * These are injected into ALL spawned processes (terminals, CLI tools, scripts)
 * so that any git commit made through Pane shows "committed by Pane" on GitHub.
 *
 * To get a clickable GitHub profile, create a GitHub user account (e.g. "pane-app")
 * and use its noreply email: pane-app@users.noreply.github.com
 */
export const GIT_ATTRIBUTION_ENV = {
  GIT_COMMITTER_NAME: 'Pane',
  GIT_COMMITTER_EMAIL: 'runpane@users.noreply.github.com',
};
