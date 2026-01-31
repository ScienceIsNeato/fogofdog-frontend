module.exports = ({ config }) => ({
  ...config,
  // Removed sdkVersion override - let Expo auto-detect from package version
  extra: {
    ...config.extra,
    // E2E test mode - skip onboarding and permission dialogs when set
    e2eTestMode: process.env.E2E_TEST_MODE === 'true',
  },
});
