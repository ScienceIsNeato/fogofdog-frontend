# Slop-Mop Wins — What the Validation Tool Caught

**Date:** 2026-01-30
**Applied to:** fogofdog-frontend (main branch)
**Gates enabled:** `javascript:lint-format`, `javascript:tests`, `javascript:coverage`, `quality:duplication`

---

## Gate-by-Gate Findings

### 1. `javascript:lint-format` — Prettier formatting drift

**What it caught:** Prettier formatting inconsistencies across markdown and configuration files. The auto-fix in `maintainAIbility-gate.sh` was running `npm run format:fix` but the output of that run was not being verified cleanly — files were drifting between runs because the old script's auto-fix and check phases were not atomic.

**Impact:** Low individually, but formatting drift is the leading indicator that the quality gate is not actually enforced end-to-end. If Prettier can drift undetected, other gates are likely drifting too.

**Resolution:** slop-mop's `javascript:lint-format` gate runs ESLint and Prettier as a single atomic check with auto-fix. One invocation, one result. The drift stopped immediately.

---

### 2. `javascript:tests` — Confirmed 100% pass rate, dependency ordering enforced

**What it caught:** All tests pass. More importantly, slop-mop enforced the dependency ordering that `javascript:tests` requires `javascript:lint-format` to pass first. The old `ship_it.py` ran all checks in parallel with no dependency graph — a lint failure would not prevent tests from running, meaning test output could be polluted by lint-induced compilation errors.

**Impact:** The dependency system is a structural improvement. In the old system, a formatting issue could cause test failures that looked like logic bugs, making triage harder.

**Resolution:** slop-mop's gate dependency system automatically includes and gates `javascript:lint-format` before `javascript:tests` runs.

---

### 3. `javascript:coverage` — Confirmed 78%+ threshold, threshold correctly enforced

**What it caught:** Coverage is passing at the configured 78% threshold. The old system had the threshold hardcoded in `jest.config.js` at 78% but the `maintainAIbility-gate.sh` script reported coverage in a way that made it hard to distinguish "coverage below threshold" from "coverage analysis failed." slop-mop reports the exact percentage and the threshold in a single line.

**Impact:** Clarity. The old system's coverage reporting was ambiguous enough that coverage failures were frequently misdiagnosed as test runner configuration issues.

**Resolution:** slop-mop reports `Coverage at X.X% (threshold: 78%)` — unambiguous.

---

### 4. `quality:duplication` — Caught a bug in slop-mop itself, revealed 4.6% duplication

**What it caught:** Two things:

**(a) slop-mop bug:** The duplication check's pass condition was `total_percentage <= threshold AND not duplicates`. This meant ANY clone detected would fail the gate regardless of whether the overall percentage was below threshold. This is a semantic bug — the threshold exists precisely to allow some duplication. Fix submitted as [slop-mop PR #4](https://github.com/ScienceIsNeato/slop-mop/pull/4).

**(b) Project duplication at 4.6%:** The project has 129 clone pairs, concentrated in:

- `useCinematicZoom.test.tsx` — repeated test setup blocks for animation scenarios (the test file sets up the same mock state 4 times with minor variations)
- `explorationSlice.test.ts` — repeated GeoPoint creation patterns (11 clone pairs, 16.9% duplication within this file)
- `PermissionDeniedScreen.test.tsx` ↔ `PermissionLoadingScreen.test.tsx` — nearly identical test structures for sister components

**(c) slop-mop friction:** The `--ignore` list passed to `jscpd` was hardcoded and did not include `coverage/` or honour the gate's `exclude_dirs` config. The generated `coverage/lcov-report/*.html` files inflated the clone count from 129 to 1082 before the directory was excluded. Fix included in the same PR #4.

**Impact:** The duplication is at 4.6% (below the 5% threshold) but the concentration in test files is a signal that the test helpers need extraction. The old `maintainAIbility-gate.sh` ran `jscpd` via `npm run duplication:check` which used a separate `.jscpd.json` config that explicitly excluded `coverage/` — so the old system happened to avoid this false positive, but only because of a project-specific config file that slop-mop does not read. The fix in slop-mop PR #4 makes this work correctly going forward.

**Resolution:** Fixed slop-mop's threshold logic and ignore-list handling. Duplication is within limits.

---

## Structural Improvements Over ship-it

| Capability               | ship-it                    | slop-mop                         |
| ------------------------ | -------------------------- | -------------------------------- |
| Dependency ordering      | None (all parallel)        | Explicit `depends_on` graph      |
| Threshold reporting      | Ambiguous (pass/fail only) | Exact percentage + threshold     |
| Auto-fix atomicity       | Fix then check (can drift) | Single atomic fix+check          |
| Coverage exclusions      | Hardcoded in `.jscpd.json` | Config-driven, extensible        |
| Gate skip on dep failure | N/A                        | Automatic skip with explanation  |
| CI integration           | Custom bash wrappers       | `sm validate <profile>`          |
| Pre-commit hook          | Husky + `ship_it.py`       | `sm commit-hooks install commit` |

---

## What Was NOT Caught (Known Gaps)

- **TypeScript strict-mode checking** is not a slop-mop gate. The project continues to use `npm run type-check` for this. A future `javascript:type-check` gate in slop-mop would close this gap.
- **SonarQube analysis** is not replicated by slop-mop. The project's SonarQube integration (cloud-based) remains as a CI-only check and is not part of the local validation loop.
- **Security audit** (`npm audit`) is not enabled in slop-mop for this project because the `security:*` gates require `bandit`/`semgrep` (Python tools). A JavaScript-specific `npm audit` gate would be a valuable addition to slop-mop.
