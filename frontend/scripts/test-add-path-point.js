// Import required modules
const { store } = require('../src/store');
const { addPathPoint } = require('../src/store/slices/explorationSlice');

// Helper to print the current state of the path
const printPathState = () => {
  const state = store.getState();
  console.log('\nCurrent Path State:');
  console.log('-------------------');
  console.log(`Total Points: ${state.exploration.path.length}`);
  
  if (state.exploration.path.length > 0) {
    console.log('\nPoints:');
    state.exploration.path.forEach((point, index) => {
      console.log(`  ${index + 1}: ${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}`);
    });
  } else {
    console.log('No points in path yet.');
  }
  console.log('-------------------\n');
};

// Function to add a test point to the path
const addTestPoint = (latitude, longitude) => {
  console.log(`Dispatching action to add point: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
  
  store.dispatch(addPathPoint({
    latitude,
    longitude
  }));
  
  // Print updated state after dispatch
  printPathState();
};

// Main test function
const runTest = () => {
  console.log('Starting test script for addPathPoint action\n');
  
  // Print initial state
  console.log('Initial state:');
  printPathState();
  
  // Add a sequence of test points
  console.log('Adding test points...\n');
  
  // San Francisco coordinates
  addTestPoint(37.7749, -122.4194);
  
  // About 100 meters away (to ensure it passes the MIN_DISTANCE check)
  addTestPoint(37.7758, -122.4191);
  
  // Invalid point (should be rejected)
  addTestPoint(200, 400);
  
  // Another valid point
  addTestPoint(37.7762, -122.4180);
  
  console.log('Test completed.');
};

// Run the test
runTest();