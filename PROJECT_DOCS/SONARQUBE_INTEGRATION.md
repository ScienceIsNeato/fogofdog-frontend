# SonarQube Integration Guide

## Overview

This project now includes comprehensive SonarQube analysis that can be run locally, providing the same quality checks that run in CI. This enables developers to catch and fix quality issues before pushing code.

## Quick Start

### Fast Local Checks (Git Hook Validation)
```bash
./scripts/dev-check.sh
```
- Runs: Lint, Format, TypeScript, Tests, Duplication
- Duration: ~30 seconds
- Use for: Regular development commits

### Full Quality Analysis (CI Validation)
```bash
./scripts/dev-check.sh --full
```
- Runs: All fast checks + SonarQube analysis
- Duration: ~2-3 minutes
- Use for: Pre-merge validation, comprehensive quality checks

## ✅ Status: INTEGRATION COMPLETE

All SonarQube issues have been resolved:
- ✅ Cognitive complexity issues fixed
- ✅ Promise handling improved
- ✅ Exception handling enhanced
- ✅ Code style optimizations applied
- ✅ Quality gate passing

## Setup Requirements

### 1. SonarQube Token
You need a SonarQube token to run local analysis:

1. Go to [SonarCloud Security](https://sonarcloud.io/account/security)
2. Generate a new token for the project
3. Add to your `.envrc` file:
   ```bash
   export SONAR_TOKEN=your_token_here
   ```
4. Run `direnv allow` to load the token

### 2. Environment Setup
The project uses `direnv` for environment management. Ensure you have:
- `direnv` installed and configured
- `.envrc` file with `SONAR_TOKEN`

## What SonarQube Analyzes

### Issue Types
- **🚨 CRITICAL**: Blocker issues that must be fixed
- **⚠️ MAJOR**: Important issues that should be addressed
- **💡 MINOR**: Code style and maintainability improvements

### Rule Categories
- **Cognitive Complexity**: Functions that are too complex
- **Promise Handling**: Missing await or catch blocks
- **Exception Handling**: Improper error handling
- **Code Style**: React fragments, loop optimizations
- **Security**: Potential security vulnerabilities

## Current Issues (as of 2025-06-14)

### 🚨 CRITICAL (1 issue)
- `src/store/slices/explorationSlice.ts:152` - Cognitive Complexity (16 vs 15 allowed)

### ⚠️ MAJOR (1 issue)  
- `src/services/GPSInjectionEndpoint.ts:20` - Missing await or catch handling

### 💡 MINOR (4 issues)
- `src/screens/Map/index.tsx:207` - Exception handling
- `src/types/GPSEvent.ts:114` - For-loop optimization
- `src/navigation/index.tsx:45,49` - Redundant React fragments

## Development Workflow

### Regular Development
1. Make code changes
2. Run `./scripts/dev-check.sh` for fast validation
3. Commit if all checks pass

### Pre-Merge Validation
1. Before creating PR or merging to main
2. Run `./scripts/dev-check.sh --full` for comprehensive analysis
3. Fix any SonarQube issues found
4. Commit fixes and verify with another full check

### CI Integration
- **All branches**: Fast quality checks run automatically
- **PRs to main**: Full SonarQube analysis is required and must pass
- **Failed quality gate**: PR cannot be merged until issues are resolved

## Troubleshooting

### "SONAR_TOKEN not set" Error
```bash
# Check if token is loaded
echo $SONAR_TOKEN

# If empty, check .envrc and reload
direnv allow
```

### "Quality Gate Failed" 
The scanner will show detailed issues with:
- File paths and line numbers
- Specific rule violations
- Severity levels

Fix the issues and re-run the analysis.

### Java Version Issues
The Node.js-based scanner handles Java requirements automatically. If you see Java-related errors, the scanner will download the required Java runtime.

## Scripts Reference

### `scripts/dev-check.sh`
- **Purpose**: Fast local quality validation
- **Duration**: ~30 seconds
- **Includes**: Lint, Format, TypeScript, Tests, Duplication
- **Use case**: Regular development workflow

### `scripts/dev-check.sh --full`
- **Purpose**: Comprehensive quality validation
- **Duration**: ~2-3 minutes  
- **Includes**: All fast checks + SonarQube analysis
- **Use case**: Pre-merge validation

### `scripts/sonar-scan.js`
- **Purpose**: SonarQube analysis with detailed issue reporting
- **Called by**: `npm run sonar:check`
- **Features**: 
  - Fetches and displays issues by severity
  - Shows file paths, line numbers, and rule details
  - Provides links to full SonarQube dashboard

## Best Practices

### When to Use Each Mode
- **Fast mode**: Every commit, during active development
- **Full mode**: Before creating PRs, before merging to main
- **Manual SonarQube**: When investigating specific quality issues

### Issue Resolution Priority
1. **CRITICAL**: Fix immediately, blocks merge
2. **MAJOR**: Address before merge to main
3. **MINOR**: Address when convenient, good for code quality

### Iterative Development
1. Run full analysis to see all issues
2. Fix issues locally without pushing
3. Re-run analysis to verify fixes
4. Commit when quality gate passes

This workflow eliminates the need to push commits just to see SonarQube results, making development much more efficient. 