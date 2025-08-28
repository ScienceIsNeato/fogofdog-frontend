# 🔖 FogOfDog Versioning Strategy

## Overview

FogOfDog uses **semantic versioning** (SemVer) with automated patch version increments on every PR merge to main.

**Format**: `MAJOR.MINOR.PATCH` (e.g., `1.2.3`)

## Version Types

### 🔄 Patch Versions (1.0.0 → 1.0.1)
- **Automated** via GitHub Actions on PR merge
- Bug fixes, small improvements, internal changes
- **No manual action required**

### ✨ Minor Versions (1.0.0 → 1.1.0)
- **Manual** for new features
- New functionality that's backward compatible
- Use: `npm run version:minor`

### 💥 Major Versions (1.0.0 → 2.0.0)
- **Manual** for breaking changes
- API changes, major architectural shifts
- Use: `npm run version:major`

## How It Works

### Automatic (PR Merge)
1. PR is merged to `main`
2. GitHub Action triggers
3. Patch version increments automatically
4. Both `package.json` and `app.json` updated
5. Git tag created (e.g., `v1.0.1`)
6. GitHub Release created
7. Build numbers incremented for App Store

### Manual (Major/Minor)
```bash
# For new features (backward compatible)
npm run version:minor

# For breaking changes
npm run version:major

# Check current version
npm run version:check
```

## File Updates

Each version bump automatically updates:

### `package.json`
```json
{
  "version": "1.0.1"
}
```

### `app.json`
```json
{
  "expo": {
    "version": "1.0.1",
    "ios": {
      "buildNumber": "3"
    },
    "android": {
      "versionCode": 3
    }
  }
}
```

## EAS Build Integration

- **Version**: Uses semantic version from `package.json`/`app.json`
- **Build Numbers**: Auto-increment per platform for App Store requirements
- **Configuration**: `autoIncrement: "buildNumber"` in `eas.json`

## Git Tags & Releases

- **Tags**: `v1.0.1`, `v1.1.0`, `v2.0.0`
- **Releases**: Auto-created with changelog and PR details
- **Branches**: All version commits go to `main`

## Examples

### Typical Development Flow
```
1.0.0  ← Initial release
1.0.1  ← PR: Fix map rendering bug
1.0.2  ← PR: Update dependencies  
1.0.3  ← PR: Improve error handling
1.1.0  ← Manual: Add dark mode feature
1.1.1  ← PR: Fix dark mode edge case
2.0.0  ← Manual: New authentication system
```

### Build Numbers vs Versions
- **Version**: `1.1.0` (user-facing, semantic)
- **iOS Build**: `15` (App Store requirement)
- **Android Version Code**: `15` (Play Store requirement)

## Best Practices

### When to Use Manual Bumps

#### 🔄 Patch (Automatic - 1.0.0 → 1.0.1)
- Bug fixes and hotfixes
- Performance optimizations
- Internal refactoring with no user-visible changes
- Dependency updates with no breaking changes
- Test improvements
- Documentation updates

#### ✨ Minor (Manual - 1.0.0 → 1.1.0)
- **New user-facing features**:
  - New screens or major UI components
  - New functionality (GPS features, data export, etc.)
  - Settings or configuration options
  - Integration with new services
- **Significant enhancements**:
  - Major UI/UX improvements
  - New navigation flows
  - Performance improvements visible to users

#### 💥 Major (Manual - 1.0.0 → 2.0.0)
- **Breaking changes**:
  - API changes that affect data format
  - Removed features or screens
  - Changed user workflows
  - Authentication system changes
  - Database schema changes requiring migration

### Version Decision Tree
```
Did you add new user-facing functionality?
├─ Yes → Is it a breaking change?
│  ├─ Yes → MAJOR version bump
│  └─ No → MINOR version bump
└─ No → Is it a bug fix or internal improvement?
   └─ Yes → PATCH version (automatic on PR merge)
```

### Version Commit Messages
Automatic commits include:
- PR number and author
- Change summary
- Version transition (1.0.0 → 1.0.1)

### Release Notes
GitHub releases automatically include:
- PR title and author
- Direct link to merged PR
- Version bump details

## Troubleshooting

### Version Out of Sync
```bash
# Check current versions
npm run version:check
cat app.json | grep -A 2 '"version"'

# Manual fix if needed
node scripts/version-bump.js patch
```

### GitHub Action Failed
1. Check workflow logs in GitHub Actions
2. Ensure `GITHUB_TOKEN` has write permissions
3. Verify no merge conflicts in version files

### Build Number Issues
EAS builds use:
- `expo.version` for user-facing version
- `expo.ios.buildNumber` for App Store
- `expo.android.versionCode` for Play Store

All three are managed automatically by the versioning system.

## Current Version Recommendation

**Current State**: `v1.0.13` (13 patch releases since initial 1.0.0)

**Recommendation**: Consider bumping to `v1.1.0` if your recent work includes:
- New GPS features or enhancements
- New UI components or screens  
- Data export/import functionality
- Significant user-facing improvements

**Why Consider Minor Bump**:
- 13 patch releases suggest accumulated feature work
- Minor versions better communicate significant progress to users
- Provides clean slate for future patch releases
- Better aligns with semantic versioning principles

**To Bump to v1.1.0**:
```bash
npm run version:minor
```

This will:
- Update `package.json` and `app.json` to `1.1.0`
- Reset build numbers appropriately
- Create `v1.1.0` git tag
- Prepare for future automatic patch increments (1.1.1, 1.1.2, etc.)

## Migration Notes

**Before**: All builds were `1.0.0` with auto-incrementing build numbers
**After**: Semantic versions increment with each PR merge

The first PR merge after implementing this system will bump from `1.0.0` to `1.0.1`. 