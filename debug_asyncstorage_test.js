// Simple AsyncStorage Test Script
// Run this with: node debug_asyncstorage_test.js

import AsyncStorage from '@react-native-async-storage/async-storage';

const TEST_KEY = '@test_persistence_key';
const TEST_VALUE = { message: 'Hello from AsyncStorage', timestamp: Date.now() };

async function testAsyncStorage() {
  console.log('🧪 Testing AsyncStorage persistence...');
  
  try {
    // 1. Clear any existing test data
    await AsyncStorage.removeItem(TEST_KEY);
    console.log('✅ Cleared existing test data');
    
    // 2. Store test data
    await AsyncStorage.setItem(TEST_KEY, JSON.stringify(TEST_VALUE));
    console.log('✅ Stored test data:', TEST_VALUE);
    
    // 3. Retrieve test data immediately
    const retrievedData = await AsyncStorage.getItem(TEST_KEY);
    const parsedData = JSON.parse(retrievedData);
    console.log('✅ Retrieved test data:', parsedData);
    
    // 4. Verify data matches
    if (parsedData.message === TEST_VALUE.message) {
      console.log('✅ Data matches! AsyncStorage is working correctly.');
    } else {
      console.log('❌ Data mismatch! AsyncStorage may have issues.');
    }
    
    // 5. Instructions for manual testing
    console.log('\n📋 Manual Test Instructions:');
    console.log('1. Run this script');
    console.log('2. Kill the app completely (not just background)');
    console.log('3. Restart the app and run this script again');
    console.log('4. Check if the data persists across app restarts');
    
  } catch (error) {
    console.error('❌ AsyncStorage test failed:', error);
  }
}

// For checking if data persists across restarts
async function checkPersistedData() {
  console.log('🔍 Checking for persisted data...');
  
  try {
    const retrievedData = await AsyncStorage.getItem(TEST_KEY);
    
    if (retrievedData) {
      const parsedData = JSON.parse(retrievedData);
      console.log('✅ Found persisted data:', parsedData);
      console.log('🎉 AsyncStorage persistence is working!');
    } else {
      console.log('❌ No persisted data found');
      console.log('💡 This could mean:');
      console.log('   - AsyncStorage is being cleared on app restart');
      console.log('   - Development environment is resetting storage');
      console.log('   - This is the first run');
    }
  } catch (error) {
    console.error('❌ Error checking persisted data:', error);
  }
}

// Export functions for use in React Native components
export { testAsyncStorage, checkPersistedData };

// If running directly (for testing purposes)
if (require.main === module) {
  testAsyncStorage();
} 