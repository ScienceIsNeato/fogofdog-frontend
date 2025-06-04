# CI/CD Workflow Documentation

## Overview

Our CI/CD pipeline ensures that only high-quality, production-ready code gets merged to main. The workflow consists of multiple stages that must all pass before a PR can be merged.

## Workflow Stages

### Stage 1: Quality Checks (Required - Fast)
**Triggers**: Every push and PR  
**Duration**: ~2-3 minutes  
**Requirements**:
- ✅ Security audit (high priority vulnerabilities)
- ✅ ESLint strict (zero warnings policy)
- ✅ TypeScript strict checking
- ✅ Test suite with coverage validation

### Stage 2: Build Verification (Required - Fast)
**Triggers**: After quality checks pass  
**Duration**: ~3-5 minutes  
**Requirements**:
- ✅ Expo export for iOS/Android
- ✅ EAS build dry run validation
- ✅ Bundle analysis

### Stage 3: PR Build Verification (Required for PRs to main)
**Triggers**: PRs to main, after stages 1-2 pass  
**Duration**: ~15-20 minutes  
**Requirements**:
- ✅ **Full production build verification with EAS**
- ✅ **Actual TestFlight profile build (not just dry run)**
- ✅ **Build must complete successfully**

### Stage 4: Advanced Code Quality (Optional)
**Triggers**: In parallel with other stages  
**Duration**: ~3-5 minutes  
**Features**:
- 🔍 Code formatting validation
- 🔍 Dead code detection
- 🔍 Dependency analysis

### Stage 5: Post-Merge Deployment
**Triggers**: After successful merge to main  
**Duration**: ~15-20 minutes  
**Actions**:
- 🚀 Builds and submits to TestFlight
- 📱 Ready for testing/distribution

## Key Benefits

### ✅ No Wasted Resources
- Production builds only run after quality gates pass
- Expensive operations (EAS builds) happen last
- Fast feedback on common issues (linting, tests)

### ✅ Merge Confidence
- PRs cannot be merged unless production builds work
- No more "it passed CI but won't build" scenarios
- TestFlight deployment guaranteed to work

### ✅ Developer Experience
- Fast feedback on quality issues (~2 min)
- Clear separation of concerns
- Optional advanced checks don't block workflow

## GitHub Branch Protection

To enforce this workflow, set up branch protection rules for `main`:

```yaml
Require status checks:
  - quality-checks
  - build-check  
  - pr-build-verification  # Key: Required for merge!
  
Require branches to be up to date: ✅
Restrict pushes that create merge conflicts: ✅
```

## Manual Override

For emergency situations, the workflow can be bypassed using:

```bash
# Skip PR build verification (admin only)
git push --force-with-lease origin main
```

**Warning**: Only use in genuine emergencies where build verification is blocking critical fixes.

## Troubleshooting

### PR Build Verification Fails
1. Check EAS build logs in GitHub Actions
2. Verify EXPO_TOKEN secret is configured
3. Test build locally: `eas build --platform ios --profile testflight`
4. Common issues: dependency conflicts, native module changes

### Quality Checks Fail
1. Run locally: `npm run pre-commit:strict`
2. Fix linting: `npm run lint:fix`
3. Fix TypeScript: Check `npm run type-check`
4. Fix tests: `npm run test:coverage`

### Build Check Fails
1. Test exports: `npx expo export --platform ios`
2. Check bundle size and dependencies
3. Verify metro.config.js and app.config.js

## Development Commands

```bash
# Run full quality check locally (same as CI)
npm run pre-commit:strict

# Test production build locally
eas build --platform ios --profile testflight

# Quick quality validation
npm run quality:check
```

This workflow ensures that every merge to main is guaranteed to build successfully in production! 🚀 