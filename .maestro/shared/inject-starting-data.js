/**
 * Maestro GPS Starting Data Injection Helper
 * 
 * This helper function injects starting GPS data into AsyncStorage
 * to simulate a user having existing path data before running tests.
 * 
 * Usage in Maestro YAML:
 *   - runScript: .maestro/shared/inject-starting-data.js
 */

// AsyncStorage key used by GPS injection system
const GPS_INJECTION_KEY = '@fogofdog:gps_injection_data';

/**
 * Load starting GPS data from JSON file
 */
async function loadStartingGPSData(dataFile = 'test_data/starting-gps-data.json') {
  try {
    // In Maestro, we need to read the file from the project root
    const fs = require('fs');
    const path = require('path');
    
    const fullPath = path.resolve(dataFile);
    
    if (!fs.existsSync(fullPath)) {
      console.log(`❌ Starting GPS data file not found: ${fullPath}`);
      return [];
    }
    
    const fileContent = fs.readFileSync(fullPath, 'utf8');
    const data = JSON.parse(fileContent);
    
    console.log(`📍 Loaded ${data.length} starting GPS points from ${dataFile}`);
    
    return data;
    
  } catch (error) {
    console.log(`❌ Error loading starting GPS data: ${error.message}`);
    return [];
  }
}

/**
 * Update timestamps to be relative to current time
 * This makes the data appear fresh for testing
 */
function updateTimestampsToRecent(data, hoursBack = 2) {
  const now = Date.now();
  const startTime = now - (hoursBack * 60 * 60 * 1000); // hoursBack hours ago
  
  if (data.length === 0) return data;
  
  // Calculate the original time span
  const originalTimestamps = data.map(point => point.timestamp);
  const originalStart = Math.min(...originalTimestamps);
  const originalEnd = Math.max(...originalTimestamps);
  const originalSpan = originalEnd - originalStart;
  
  // Map original timestamps to new time range
  return data.map(point => {
    const originalOffset = point.timestamp - originalStart;
    const offsetRatio = originalSpan > 0 ? originalOffset / originalSpan : 0;
    const newTimestamp = startTime + (offsetRatio * originalSpan);
    
    return {
      ...point,
      timestamp: Math.round(newTimestamp)
    };
  });
}

/**
 * Inject starting GPS data into AsyncStorage
 * This simulates a user having existing path data
 */
async function injectStartingGPSData(options = {}) {
  try {
    const {
      dataFile = 'test_data/starting-gps-data.json',
      updateTimestamps = true,
      hoursBack = 2,
      logLevel = 'info'
    } = options;
    
    // Load the GPS data
    let data = await loadStartingGPSData(dataFile);
    
    if (data.length === 0) {
      console.log('⚠️  No starting GPS data to inject');
      return false;
    }
    
    // Update timestamps to be recent if requested
    if (updateTimestamps) {
      data = updateTimestampsToRecent(data, hoursBack);
      
      if (logLevel === 'debug') {
        const timeRange = {
          start: new Date(Math.min(...data.map(p => p.timestamp))).toISOString(),
          end: new Date(Math.max(...data.map(p => p.timestamp))).toISOString()
        };
        console.log(`📅 Updated timestamps to span: ${timeRange.start} to ${timeRange.end}`);
      }
    }
    
    // Inject into AsyncStorage
    const jsonData = JSON.stringify(data);
    
    // This will be processed by the GPSInjectionService when the app starts
    await device.setAsyncStorageItem(GPS_INJECTION_KEY, jsonData);
    
    console.log(`✅ Injected ${data.length} starting GPS points into AsyncStorage`);
    console.log(`🗝️  Key: ${GPS_INJECTION_KEY}`);
    
    if (logLevel === 'debug') {
      console.log(`📊 Sample points:`);
      console.log(`   First: ${data[0].latitude}, ${data[0].longitude}`);
      console.log(`   Last: ${data[data.length - 1].latitude}, ${data[data.length - 1].longitude}`);
    }
    
    return true;
    
  } catch (error) {
    console.log(`❌ Error injecting starting GPS data: ${error.message}`);
    return false;
  }
}

/**
 * Clear any existing GPS injection data
 * Useful for ensuring clean test state
 */
async function clearGPSInjectionData() {
  try {
    await device.clearAsyncStorageItem(GPS_INJECTION_KEY);
    console.log('🧹 Cleared existing GPS injection data');
    return true;
  } catch (error) {
    console.log(`❌ Error clearing GPS injection data: ${error.message}`);
    return false;
  }
}

/**
 * Main execution for Maestro
 * This runs when the script is called from a Maestro test
 */
async function main() {
  console.log('🚀 Maestro GPS Starting Data Injection');
  console.log('======================================');
  
  // Clear existing data first to ensure clean state
  await clearGPSInjectionData();
  
  // Inject the starting data with recent timestamps
  const success = await injectStartingGPSData({
    updateTimestamps: true,
    hoursBack: 2,
    logLevel: 'info'
  });
  
  if (success) {
    console.log('🎯 Starting GPS data ready for test!');
    console.log('💡 The app will process this data when it starts');
  } else {
    console.log('❌ Failed to inject starting GPS data');
  }
  
  return success;
}

// Export functions for potential reuse in other Maestro scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    injectStartingGPSData,
    clearGPSInjectionData,
    loadStartingGPSData,
    updateTimestampsToRecent,
    GPS_INJECTION_KEY
  };
}

// Auto-execute when run directly in Maestro
if (typeof device !== 'undefined') {
  // We're in a Maestro context, execute main
  main().then(() => {
    console.log('🏁 GPS starting data injection complete');
  }).catch(error => {
    console.log(`💥 Fatal error: ${error.message}`);
  });
} 