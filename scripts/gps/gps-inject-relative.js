#!/usr/bin/env node
/* eslint-env node */

/**
 * Simple GPS Relative Movement Injector
 *
 * Wrapper around gps-injector-direct.js for relative movement commands
 * Uses the existing working GPS injection system
 *
 * Usage:
 *   node scripts/gps/gps-inject-relative.js --angle 90 --distance 30
 *   node scripts/gps/gps-inject-relative.js --angle 45 --distance 50
 */

const { execSync } = require('child_process');
const path = require('path');

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace('--', '');
    const value = args[i + 1];
    if (key && value) {
      parsed[key] = value;
    }
  }

  return parsed;
}

/**
 * Show usage information
 */
function showUsage() {
  console.log(`
🧭 GPS Relative Movement Injector

Usage:
  node scripts/gps/gps-inject-relative.js --angle <degrees> --distance <meters>

Parameters:
  --angle     Direction in degrees (0=East, 90=North, 180=West, 270=South)
  --distance  Distance in meters

Examples:
  node scripts/gps/gps-inject-relative.js --angle 90 --distance 30   # 30m North
  node scripts/gps/gps-inject-relative.js --angle 45 --distance 50   # 50m Northeast
  node scripts/gps/gps-inject-relative.js --angle 0 --distance 25    # 25m East

The app will:
  1. Read current location from existing GPS data
  2. Calculate new coordinates
  3. Inject GPS coordinates using the existing injection system
  4. Update map and fog overlay immediately
`);
}

/**
 * Inject relative movement via existing gps-injector-direct.js
 */
async function injectRelativeMovement(angle, distance) {
  try {
    console.log(`🧭 Injecting relative movement: ${distance}m at ${angle}°`);

    // Use the existing working GPS injection script
    // eslint-disable-next-line no-undef
    const scriptPath = path.join(__dirname, 'gps-injector-direct.js');
    const command = `node "${scriptPath}" --mode relative --angle ${angle} --distance ${distance}`;

    const result = execSync(command, { encoding: 'utf8', cwd: process.cwd() });
    console.log(`✅ GPS movement injected successfully: ${distance}m at ${angle}°`);
    console.log(result.trim());
  } catch (error) {
    console.error(`❌ Failed to inject relative movement: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Main function
 */
async function main() {
  const args = parseArgs();

  if (!args.angle || !args.distance) {
    console.error('❌ Missing required parameters: --angle and --distance');
    showUsage();
    process.exit(1);
  }

  const angle = parseFloat(args.angle);
  const distance = parseFloat(args.distance);

  if (isNaN(angle) || isNaN(distance)) {
    console.error('❌ Invalid parameters: angle and distance must be numbers');
    process.exit(1);
  }

  if (distance <= 0) {
    console.error('❌ Distance must be positive');
    process.exit(1);
  }

  await injectRelativeMovement(angle, distance);
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error(`❌ An error occurred: ${error.message}`);
    process.exit(1);
  });
}
