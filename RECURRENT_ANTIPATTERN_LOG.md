# Recurrent Antipattern Log 🔁

## 2026-02-08: Manual `gh api` for PR comment fetching instead of slop-mop

### Violation

Used `gh api repos/.../pulls/.../comments` and `gh pr view --comments` to manually fetch PR comments instead of running `sm validate -g pr:comments`.

### Protocol Analysis

- **Awareness**: Partially aware — knew slop-mop is canonical, but treated PR comment _fetching_ as different from _validation_
- **Pressure**: Training bias toward general-purpose `gh` commands; perceived need for raw JSON payload
- **Root Cause**: Automatic behavior — pattern matching "address PR comments" → "fetch with gh api" without checking if a project tool handles this
- **Contributing factor**: The PR Closing Protocol instructions described `gh api graphql` as a manual fallback step, and didn't mention `sm validate pr` at all

### Solutions Implemented

1. Updated `project-fogofdog_frontend.instructions.md` — added explicit "PR Comment Resolution (MUST use slop-mop)" section with clear workflow
2. Updated `pr_closing_protocol.instructions.md` — Step 1 now references `sm validate -g pr:comments` as the primary approach, with `gh api` demoted to "last resort only"
3. Added `🔴 ABSOLUTE RULE` callout to both files prohibiting raw `gh api` for comment fetching

### Preventive Measures

- The `pr:comments` workflow is now documented alongside the commit validation workflow in the same file, reducing the chance of missing it
- The PR Closing Protocol no longer suggests manual `gh api` as a co-equal approach
- Pattern interrupt: When told "address PR comments," the instruction chain should now surface `sm validate -g pr:comments` before any `gh` command
