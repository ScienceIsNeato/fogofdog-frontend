# Scripts Directory

Scripts in the **root** of this directory are intended to be run directly by developers.
Scripts in subdirectories are helpers, tests, or specialized tools.

## User-Facing Scripts

| Script                     | Purpose                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------- |
| `deploy_app.sh`            | **THE** deployment script. Handles device boot, Metro, native builds, GPS setup for iOS and Android. |
| `run_integration_tests.sh` | Maestro integration test runner (local + CI).                                                        |
| `run-ground-truth-test.sh` | Visual regression test — foreground vs background GPS tracking comparison.                           |
| `setup.sh`                 | Project setup — git submodules, npm install, environment init.                                       |
| `monitor-metro-logs.sh`    | Tail or show recent Metro server logs.                                                               |
| `version-bump.js`          | Bumps version in package.json and app.json, creates git tag.                                         |
| `sm`                       | slop-mop CLI wrapper — delegates to `slop-mop/` submodule.                                           |

## Subdirectories

| Directory    | Contents                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------- |
| `internal/`  | Helper scripts called by user-facing scripts. Includes permission resets, crashpad cleanup, build helpers.    |
| `gps/`       | GPS development tools — coordinate injection, relative movement, historical path loading. Has its own README. |
| `__tests__/` | Tests for the scripts themselves.                                                                             |

## Data Files

| File                 | Purpose                                    |
| -------------------- | ------------------------------------------ |
| `gps-injection.json` | GPS coordinate data for injection testing. |
