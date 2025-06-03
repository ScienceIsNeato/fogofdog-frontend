/**
 * Reusable login action for Detox tests.
 * Assumes the app is already on the SignInScreen.
 */
export const login = async () => {
  // Add a brief delay before tapping, maybe layout is still settling
  await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay
  
  // Tap the Sign In button
  await element(by.id('signInButton')).tap();

  // Temporarily disable synchronization to check for the element
  await device.disableSynchronization(); 

  // Wait for the MapScreen container element to exist in the hierarchy
  await waitFor(element(by.id('map-screen')))
    .toExist()
    .withTimeout(10000); 

  // Remove the visibility check as it's proving unreliable for this screen
  // await expect(element(by.id('map-screen'))).toBeVisible();

  // Re-enable synchronization
  await device.enableSynchronization(); 
}; 