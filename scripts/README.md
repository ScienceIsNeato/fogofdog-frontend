# Scripts Directory

Scripts in the **root** of this directory are intended to be run directly by developers.
Scripts in subdirectories are helpers, tests, or specialized tools.

## User-Facing Scripts

| Script                        | Purpose                                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| `deploy_app.sh`               | **THE** deployment script. Handles device boot, Metro, native builds, GPS setup for iOS and Android. |
| `run_integration_tests.sh`    | Maestro integration test runner (local + CI).                                                        |
| `run-ground-truth-test.sh`    | Visual regression test — foreground vs background GPS tracking comparison.                           |
| `setup.sh`                    | Project setup — git submodules, npm install, environment init.                                       |
| `setup-e2e-tests.sh`          | Prepares E2E test environment (release build on simulator).                                          |
| `reset-permissions.sh`        | Resets location permissions in iOS Simulator for permission flow testing.                            |
| `monitor-metro-logs.sh`       | Tail or show recent Metro server logs.                                                               |
| `debug-ci-tests.sh`           | CI-only — dumps environment info and runs Jest with max debug output.                                |
| `pr-comment-workflow.sh`      | PR comment resolution workflow (fetch, resolve, status). Prefer `sm validate -g pr:comments`.        |
| `inject-starting-gps-data.js` | Injects historical GPS path data into AsyncStorage for testing.                                      |
| `minify_repo.py`              | Collects and minifies all source files for LLM context feeding.                                      |
| `version-bump.js`             | Bumps version in package.json and app.json, creates git tag.                                         |
| `sm`                          | slop-mop CLI wrapper — delegates to `slop-mop/` submodule.                                           |

## Subdirectories

| Directory    | Contents                                                                             |
| ------------ | ------------------------------------------------------------------------------------ |
| `internal/`  | Helper scripts called by the user-facing scripts above. Not intended for direct use. |
| `gps/`       | GPS development tools — coordinate injection, relative movement. Has its own README. |
| `__tests__/` | Tests for the scripts themselves.                                                    |

## Data Files

| File                 | Purpose                                    |
| -------------------- | ------------------------------------------ |
| `gps-injection.json` | GPS coordinate data for injection testing. |
