#!/usr/bin/env node

/**
 * Manual Version Bump Script
 * 
 * Usage:
 *   npm run version:patch   (1.0.0 → 1.0.1) - Auto-handled by GitHub Actions
 *   npm run version:minor   (1.0.0 → 1.1.0) - New features
 *   npm run version:major   (1.0.0 → 2.0.0) - Breaking changes
 * 
 * This script updates both package.json and app.json versions and creates a git tag.
 * Build numbers are reset to 1 with each version bump for clean versioning.
 */

const fs = require('fs');
const { execSync } = require('child_process');

const versionType = process.argv[2];

if (!['major', 'minor', 'patch'].includes(versionType)) {
  console.error('❌ Invalid version type. Use: major, minor, or patch');
  console.log('');
  console.log('Usage:');
  console.log('  node scripts/version-bump.js major   # 1.0.0 → 2.0.0');
  console.log('  node scripts/version-bump.js minor   # 1.0.0 → 1.1.0');
  console.log('  node scripts/version-bump.js patch   # 1.0.0 → 1.0.1');
  console.log('');
  console.log('💡 Note: Patch versions are auto-handled by GitHub Actions on PR merge');
  process.exit(1);
}

try {
  // Get current version
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const currentVersion = packageJson.version;
  
  console.log(`📦 Current version: ${currentVersion}`);
  
  // Increment version using npm
  const newVersionOutput = execSync(`npm version ${versionType} --no-git-tag-version`, { encoding: 'utf8' });
  const newVersion = newVersionOutput.trim().replace('v', '');
  
  console.log(`🚀 New version: ${newVersion}`);
  
  // Update app.json
  const appJson = JSON.parse(fs.readFileSync('app.json', 'utf8'));
  appJson.expo.version = newVersion;
  
  // Reset build numbers to 1 for new version
  appJson.expo.ios.buildNumber = "1";
  
  if (!appJson.expo.android) appJson.expo.android = {};
  appJson.expo.android.versionCode = 1;
  
  fs.writeFileSync('app.json', JSON.stringify(appJson, null, 2));
  
  console.log(`📱 Updated app.json:`);
  console.log(`   Version: ${newVersion}`);
  console.log(`   iOS build: ${appJson.expo.ios.buildNumber} (reset to 1)`);
  console.log(`   Android version code: ${appJson.expo.android.versionCode} (reset to 1)`);
  
  // Stage changes
  execSync('git add package.json app.json');
  
  // Commit changes
  const commitMessage = `🔖 ${versionType.charAt(0).toUpperCase() + versionType.slice(1)} version bump to ${newVersion}

Manual ${versionType} version bump with build number reset.

Changes:
- package.json: ${currentVersion} → ${newVersion}
- app.json: Updated version and reset build numbers to 1`;

  execSync(`git commit -m "${commitMessage}"`);
  
  // Create git tag
  execSync(`git tag -a "v${newVersion}" -m "Release version ${newVersion}"`);
  
  console.log('');
  console.log('✅ Version bump completed!');
  console.log('');
  console.log('Next steps:');
  console.log('1. Push changes: git push origin main');
  console.log('2. Push tags: git push origin --tags');
  console.log('3. Create a GitHub release if desired');
  
  if (versionType === 'major') {
    console.log('');
    console.log('🚨 MAJOR VERSION BUMP DETECTED!');
    console.log('   Remember to update documentation for breaking changes');
  }
  
} catch (error) {
  console.error('❌ Error during version bump:', error.message);
  process.exit(1);
} 