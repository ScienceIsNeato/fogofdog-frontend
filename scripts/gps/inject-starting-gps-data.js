#!/usr/bin/env node

/**
 * GPS Starting Data Injection Helper
 *
 * This script injects starting GPS data from JSON files into AsyncStorage
 * for testing purposes. It can be used to simulate a user having existing
 * path data before running tests.
 *
 * Usage:
 *   node scripts/gps/inject-starting-gps-data.js [data-file] [options]
 *
 * Examples:
 *   # Use default starting data
 *   node scripts/gps/inject-starting-gps-data.js
 *
 *   # Use specific data file
 *   node scripts/gps/inject-starting-gps-data.js test_data/custom-path.json
 *
 *   # Update timestamps to be relative to now
 *   node scripts/gps/inject-starting-gps-data.js --update-timestamps
 *
 *   # Clear existing data first
 *   node scripts/gps/inject-starting-gps-data.js --clear-first
 */

const fs = require('fs');
const path = require('path');

// AsyncStorage key used by GPS injection system
const GPS_INJECTION_KEY = '@fogofdog:gps_injection_data';

// Default data file
const DEFAULT_DATA_FILE = 'test_data/starting-gps-data.json';

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dataFile: DEFAULT_DATA_FILE,
    updateTimestamps: false,
    clearFirst: false,
    hoursBack: 2, // Default: simulate data from 2 hours ago
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--update-timestamps') {
      options.updateTimestamps = true;
    } else if (arg === '--clear-first') {
      options.clearFirst = true;
    } else if (arg === '--hours-back') {
      options.hoursBack = parseInt(args[i + 1]);
      i++; // Skip next argument
    } else if (!arg.startsWith('--') && !options.dataFile !== DEFAULT_DATA_FILE) {
      // First non-flag argument is the data file
      options.dataFile = arg;
    }
  }

  return options;
}

/**
 * Show help message
 */
function showHelp() {
  console.log(`
GPS Starting Data Injection Helper

This script injects starting GPS data from JSON files into AsyncStorage
for testing purposes. Simulates a user having existing path data.

Usage:
  node scripts/gps/inject-starting-gps-data.js [data-file] [options]

Arguments:
  data-file                Path to JSON file with GPS data (default: ${DEFAULT_DATA_FILE})

Options:
  --update-timestamps      Update timestamps to be relative to current time
  --clear-first           Clear existing GPS injection data first
  --hours-back <hours>    Hours back from now for updated timestamps (default: 2)
  --help, -h              Show this help message

Examples:
  # Use default starting data with updated timestamps
  node scripts/gps/inject-starting-gps-data.js --update-timestamps

  # Use custom data file
  node scripts/gps/inject-starting-gps-data.js test_data/custom-path.json

  # Clear and inject data from 4 hours ago
  node scripts/gps/inject-starting-gps-data.js --clear-first --update-timestamps --hours-back 4

Data Format:
  JSON array of objects with: latitude, longitude, timestamp, accuracy (optional)
  
  Example:
  [
    {
      "latitude": 37.7849,
      "longitude": -122.4194,
      "timestamp": 1647888000000,
      "accuracy": 5
    }
  ]
`);
}

/**
 * Update timestamps to be relative to current time
 */
function updateTimestamps(data, hoursBack) {
  const now = Date.now();
  const startTime = now - hoursBack * 60 * 60 * 1000; // hoursBack hours ago

  // Calculate the original time span
  const originalTimestamps = data.map((point) => point.timestamp);
  const originalStart = Math.min(...originalTimestamps);
  const originalEnd = Math.max(...originalTimestamps);
  const originalSpan = originalEnd - originalStart;

  // Map original timestamps to new time range
  return data.map((point) => {
    const originalOffset = point.timestamp - originalStart;
    const offsetRatio = originalSpan > 0 ? originalOffset / originalSpan : 0;
    const newTimestamp = startTime + offsetRatio * originalSpan;

    return {
      ...point,
      timestamp: Math.round(newTimestamp),
    };
  });
}

/**
 * Validate GPS data format
 */
function validateGPSData(data) {
  if (!Array.isArray(data)) {
    throw new Error('GPS data must be an array');
  }

  if (data.length === 0) {
    throw new Error('GPS data array cannot be empty');
  }

  for (let i = 0; i < data.length; i++) {
    const point = data[i];

    if (
      typeof point.latitude !== 'number' ||
      typeof point.longitude !== 'number' ||
      typeof point.timestamp !== 'number'
    ) {
      throw new Error(
        `Invalid GPS point at index ${i}: requires latitude, longitude, and timestamp as numbers`
      );
    }

    if (point.latitude < -90 || point.latitude > 90) {
      throw new Error(
        `Invalid latitude at index ${i}: ${point.latitude} (must be between -90 and 90)`
      );
    }

    if (point.longitude < -180 || point.longitude > 180) {
      throw new Error(
        `Invalid longitude at index ${i}: ${point.longitude} (must be between -180 and 180)`
      );
    }

    if (point.timestamp <= 0) {
      throw new Error(`Invalid timestamp at index ${i}: ${point.timestamp} (must be positive)`);
    }
  }

  console.log(`✅ Validated ${data.length} GPS points`);
}

/**
 * Simulate AsyncStorage injection by creating the data structure
 * that would be stored and logging it for use in tests
 */
async function injectGPSData(data, options) {
  try {
    let processedData = [...data];

    if (options.updateTimestamps) {
      console.log(`📅 Updating timestamps to ${options.hoursBack} hours ago...`);
      processedData = updateTimestamps(processedData, options.hoursBack);
    }

    // Validate the processed data
    validateGPSData(processedData);

    // In a real app, this would write to AsyncStorage
    // For testing, we output the data in a format that can be used
    const jsonData = JSON.stringify(processedData, null, 2);

    console.log(`\n🔧 GPS Injection Data Ready (${processedData.length} points):`);
    console.log(
      `📊 Time span: ${new Date(Math.min(...processedData.map((p) => p.timestamp))).toISOString()} to ${new Date(Math.max(...processedData.map((p) => p.timestamp))).toISOString()}`
    );
    console.log(`🗝️  AsyncStorage Key: ${GPS_INJECTION_KEY}`);

    // Write to a temporary file that can be read by other tools
    const outputFile = 'test_artifacts/injected-gps-data.json';
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, jsonData);

    console.log(`\n📁 Data written to: ${outputFile}`);
    console.log(
      `\n🎯 To use in tests, copy this data to AsyncStorage with key: ${GPS_INJECTION_KEY}`
    );

    // Generate command for direct AsyncStorage injection (for React Native debugging tools)
    console.log(`\n📱 React Native AsyncStorage Command:`);
    console.log(
      `AsyncStorage.setItem('${GPS_INJECTION_KEY}', '${jsonData.replace(/'/g, "\\'")}');`
    );

    return processedData;
  } catch (error) {
    console.error(`❌ Error injecting GPS data: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Load GPS data from file
 */
function loadGPSData(filePath) {
  try {
    const fullPath = path.resolve(filePath);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${fullPath}`);
    }

    console.log(`📂 Loading GPS data from: ${fullPath}`);

    const fileContent = fs.readFileSync(fullPath, 'utf8');
    const data = JSON.parse(fileContent);

    console.log(`📍 Loaded ${data.length} GPS points`);

    return data;
  } catch (error) {
    console.error(`❌ Error loading GPS data: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Main function
 */
async function main() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    return;
  }

  console.log('🚀 GPS Starting Data Injection Helper');
  console.log('=====================================');

  // Load GPS data
  const data = loadGPSData(options.dataFile);

  // Inject the data
  await injectGPSData(data, options);

  console.log('\n✅ GPS starting data injection complete!');
  console.log('\n💡 Tip: Use this data in Maestro tests or other testing scenarios');
  console.log('     to simulate users with existing path history.');
}

// Run the script
if (require.main === module) {
  main().catch((error) => {
    console.error(`❌ Fatal error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  loadGPSData,
  injectGPSData,
  updateTimestamps,
  validateGPSData,
};
