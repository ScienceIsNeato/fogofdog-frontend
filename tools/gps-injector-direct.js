#!/usr/bin/env node
/* eslint-env node */
/* global __dirname */

/**
 * Direct GPS Coordinate Injector for iOS Simulator
 * 
 * This tool directly injects GPS coordinates into the iOS Simulator
 * using simulator commands, triggering the app's location services.
 * 
 * Usage:
 *   Absolute mode: node tools/gps-injector-direct.js --mode absolute --lat 37.7749 --lon -122.4194
 *   Relative mode: node tools/gps-injector-direct.js --mode relative --angle 45 --distance 100
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Constants for coordinate calculations
const METERS_PER_DEGREE_LAT = 111320;
const DEFAULT_LOCATION = { latitude: 37.78825, longitude: -122.4324 };

// File paths
const CURRENT_LOCATION_FILE = path.join(__dirname, '..', 'current-location.json');

/**
 * Calculate new coordinates based on angle and distance from current position
 */
function calculateRelativeCoordinates(currentLat, currentLon, angleDegrees, distanceMeters) {
  const angleRad = (angleDegrees * Math.PI) / 180;
  
  // Calculate latitude delta
  const deltaLat = (distanceMeters * Math.sin(angleRad)) / METERS_PER_DEGREE_LAT;
  
  // Calculate longitude delta (adjust for latitude)
  const metersPerDegreeLon = METERS_PER_DEGREE_LAT * Math.cos(currentLat * Math.PI / 180);
  const deltaLon = (distanceMeters * Math.cos(angleRad)) / metersPerDegreeLon;
  
  return {
    latitude: currentLat + deltaLat,
    longitude: currentLon + deltaLon
  };
}

/**
 * Validate coordinate values
 */
function validateCoordinates(lat, lon) {
  if (lat < -90 || lat > 90) {
    throw new Error(`Invalid latitude: ${lat}. Must be between -90 and 90.`);
  }
  if (lon < -180 || lon > 180) {
    throw new Error(`Invalid longitude: ${lon}. Must be between -180 and 180.`);
  }
}

/**
 * Get current location from stored file or use default
 */
function getCurrentLocation() {
  try {
    if (fs.existsSync(CURRENT_LOCATION_FILE)) {
      const data = fs.readFileSync(CURRENT_LOCATION_FILE, 'utf8');
      const location = JSON.parse(data);
      console.log(`📍 Using stored current location: ${location.latitude}, ${location.longitude}`);
      return location;
    }
  } catch (error) {
    console.warn(`⚠️  Could not read current location file: ${error.message}`);
  }
  
  console.log(`📍 Using default location: ${DEFAULT_LOCATION.latitude}, ${DEFAULT_LOCATION.longitude}`);
  return DEFAULT_LOCATION;
}

/**
 * Save current location for future relative calculations
 */
function saveCurrentLocation(lat, lon) {
  const location = { latitude: lat, longitude: lon };
  try {
    fs.writeFileSync(CURRENT_LOCATION_FILE, JSON.stringify(location, null, 2));
    console.log(`💾 Saved current location: ${lat}, ${lon}`);
  } catch (error) {
    console.error(`❌ Failed to save current location: ${error.message}`);
  }
}

/**
 * Set simulator location using xcrun simctl
 */
async function setSimulatorLocation(lat, lon, timeDeltaHours = 0) {
  try {
    // Get the current simulator device UDID
    const devices = execSync('xcrun simctl list devices booted --json', { encoding: 'utf8' });
    const deviceData = JSON.parse(devices);
    
    let deviceUDID = null;
    for (const runtime in deviceData.devices) {
      const bootedDevices = deviceData.devices[runtime].filter(device => device.state === 'Booted');
      if (bootedDevices.length > 0) {
        deviceUDID = bootedDevices[0].udid;
        console.log(`📱 Found booted simulator: ${bootedDevices[0].name} (${deviceUDID})`);
        break;
      }
    }
    
    if (!deviceUDID) {
      throw new Error('No booted iOS simulator found. Please start the simulator first.');
    }
    
    // Set the location on the simulator
    const locationCommand = `xcrun simctl location ${deviceUDID} set ${lat},${lon}`;
    console.log(`🌍 Setting simulator location: ${lat}, ${lon}`);
    
    execSync(locationCommand, { stdio: 'inherit' });
    
    console.log(`✅ Successfully set simulator location to: ${lat}, ${lon}`);
    console.log(`🎯 The app should now receive this new location through its location services`);
    
    // Store coordinates in a file that React Native can read
    try {
      console.log(`💾 Storing GPS injection data for React Native...`);

      // Calculate timestamp with optional delta
      const now = new Date();
      const timestamp = new Date(now.getTime() + timeDeltaHours * 60 * 60 * 1000);

      console.log(`🕒 Injecting with timestamp: ${timestamp.toISOString()} (${timeDeltaHours} hours delta)`);

      const injectionData = {
        coordinates: [{
          latitude: lat,
          longitude: lon,
          timestamp: timestamp.toISOString(), // Use calculated timestamp
          accuracy: 5.0,
          altitude: 0,
          altitudeAccuracy: -1,
          heading: -1,
          speed: -1,
        }],
        processed: false,
        injectedAt: new Date().toISOString(),
      };
      
      // Write to project directory where React Native can easily read it
      const gpsInjectionFile = path.join(__dirname, '..', 'gps-injection.json');
      
      fs.writeFileSync(gpsInjectionFile, JSON.stringify(injectionData, null, 2));
      
      console.log(`✅ Stored GPS injection data in file: ${gpsInjectionFile}`);
      console.log(`🎯 App polling will detect this file immediately`);
    } catch (storageError) {
      console.log(`⚠️ Could not store injection data: ${storageError.message}`);
    }
    
    console.log(`🎯 GPS injection complete! App should update automatically.`);
    
    return true;
  } catch (error) {
    console.error(`❌ Failed to set simulator location: ${error.message}`);
    return false;
  }
}

/**
 * Parse command line arguments or environment variables (for Maestro)
 */
function parseArgs() {
  // Check if we're being called from Maestro (env vars) or command line
  if (process.env.MODE) {
    // Maestro passes env vars
    return {
      mode: process.env.MODE,
      lat: process.env.LAT,
      lon: process.env.LON,
      angle: process.env.ANGLE,
      distance: process.env.DISTANCE,
      timeDeltaHours: process.env.TIME_DELTA_HOURS, // New: time delta from Maestro
    };
  } else {
    // Command line arguments
    const args = process.argv.slice(2);
    const parsed = {};
    
    for (let i = 0; i < args.length; i += 2) {
      const key = args[i]?.replace('--', '');
      const value = args[i + 1];
      if (key && value !== undefined) {
        parsed[key] = value;
      }
    }
    
    return parsed;
  }
}

/**
 * Display usage information
 */
function showUsage() {
  console.log(`
🗺️  Direct GPS Coordinate Injector for iOS Simulator

This tool directly sets the GPS location in iOS Simulator, which will
trigger the app's location services and update the user's position.

Usage:
  Absolute mode:
    node tools/gps-injector-direct.js --mode absolute --lat 37.7749 --lon -122.4194

  Relative mode:
    node tools/gps-injector-direct.js --mode relative --angle 45 --distance 100

  With time delta:
    node tools/gps-injector-direct.js --mode absolute --lat 37.7749 --lon -122.4194 --time-delta-hours -24

Parameters:
  --mode              Mode: 'absolute' or 'relative'
  --lat               Latitude (absolute mode)
  --lon               Longitude (absolute mode)
  --angle             Angle in degrees (relative mode): 0=East, 90=North, 180=West, 270=South
  --distance          Distance in meters (relative mode)
  --time-delta-hours  (Optional) Hour offset for timestamp (e.g., -1 for 1 hour ago)

Examples:
  # Set specific coordinate
  node tools/gps-injector-direct.js --mode absolute --lat 37.7749 --lon -122.4194

  # Move 100m northeast from current position
  node tools/gps-injector-direct.js --mode relative --angle 45 --distance 100

  # Inject a coordinate from 24 hours ago
  node tools/gps-injector-direct.js --mode absolute --lat 37.7749 --lon -122.4194 --time-delta-hours -24

Requirements:
  - iOS Simulator must be running
  - App must be installed and have location permissions
`);
}

/**
 * Main function
 */
async function main() {
  const args = parseArgs();
  
  if (!args.mode || (args.mode !== 'absolute' && args.mode !== 'relative')) {
    showUsage();
    process.exit(1);
  }
  
  let targetLat, targetLon;
  const timeDeltaHours = parseFloat(args.timeDeltaHours || '0');
  
  try {
    if (args.mode === 'absolute') {
      // Absolute mode
      if (!args.lat || !args.lon) {
        console.error('❌ Absolute mode requires --lat and --lon parameters');
        showUsage();
        process.exit(1);
      }
      
      targetLat = parseFloat(args.lat);
      targetLon = parseFloat(args.lon);
      
      validateCoordinates(targetLat, targetLon);
      
      console.log(`📍 Target coordinate: ${targetLat}, ${targetLon}`);
      
    } else if (args.mode === 'relative') {
      // Relative mode
      if (!args.angle || !args.distance) {
        console.error('❌ Relative mode requires --angle and --distance parameters');
        showUsage();
        process.exit(1);
      }
      
      const { latitude, longitude } = getCurrentLocation();
      
      const angle = parseFloat(args.angle);
      const distance = parseFloat(args.distance);
      
      const newCoords = calculateRelativeCoordinates(latitude, longitude, angle, distance);
      targetLat = newCoords.latitude;
      targetLon = newCoords.longitude;
      
      console.log(`🏃 Moving from ${latitude.toFixed(6)}, ${longitude.toFixed(6)} by ${distance}m at ${angle}°`);
      console.log(`🎯 New target coordinate: ${targetLat.toFixed(6)}, ${targetLon.toFixed(6)}`);
    }
    
    // Set location and save for next relative calculation
    const success = await setSimulatorLocation(targetLat, targetLon, timeDeltaHours);
    if (success) {
      saveCurrentLocation(targetLat, targetLon);
    } else {
      process.exit(1);
    }
    
  } catch (error) {
    console.error(`❌ An error occurred: ${error.message}`);
    process.exit(1);
  }
}

main(); 