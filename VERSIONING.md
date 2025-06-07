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
- **Minor**: New screens, features, major UI improvements
- **Major**: Breaking API changes, major refactors, new authentication

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

## Migration Notes

**Before**: All builds were `1.0.0` with auto-incrementing build numbers
**After**: Semantic versions increment with each PR merge

The first PR merge after implementing this system will bump from `1.0.0` to `1.0.1`. 