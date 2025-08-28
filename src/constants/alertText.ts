/**
 * Alert Text Constants
 *
 * Centralized alert messages for consistent UI text and easier testing.
 * Tests can reference these constants instead of hardcoded strings.
 */

export const ALERT_TEXT = {
  // Data Export/Import
  EXPORT: {
    SUCCESS_TITLE: 'Export Successful',
    SUCCESS_MESSAGE: 'Your exploration data has been saved and can be shared or backed up.',
    FAILED_TITLE: 'Export Failed',
    ERROR_TITLE: 'Export Error',
    ERROR_MESSAGE: 'An unexpected error occurred while exporting your data.',
  },

  IMPORT: {
    SUCCESS_TITLE: 'Import Successful',
    FAILED_TITLE: 'Import Failed',
    ERROR_TITLE: 'Import Error',
    ERROR_MESSAGE: 'An unexpected error occurred while importing your data.',
    MODE_SELECTION_TITLE: 'Import Exploration Data',
    MODE_SELECTION_MESSAGE: 'Choose how to import the data:',
    CONFIRM_REPLACE_TITLE: 'Confirm Replace',
    CONFIRM_REPLACE_MESSAGE:
      'This will completely replace your current exploration data. Your existing data will be lost. Are you sure?',
  },

  // Data Clearing
  CLEAR: {
    SUCCESS_TITLE: 'Success',
    SUCCESS_MESSAGE: 'Exploration data has been cleared.',
    ERROR_TITLE: 'Error',
    ERROR_MESSAGE: 'Failed to clear exploration data.',
  },

  // Developer Settings
  DEVELOPER: {
    ONBOARDING_TITLE: 'Onboarding Updated',
    ONBOARDING_ERROR_TITLE: 'Error',
    ONBOARDING_ERROR_MESSAGE: 'Failed to update onboarding setting. Please try again.',
  },

  // Performance Testing
  PERFORMANCE: {
    CLEAR_DATA_TITLE: 'Clear Data',
    CLEAR_DATA_MESSAGE: 'Remove all GPS points?',
    INJECTION_ERROR_TITLE: 'Error',
    REAL_TIME_INJECTION_TITLE: 'Real-Time GPS Injection',
    HISTORICAL_INJECTION_TITLE: 'Historical GPS Data',
  },

  // Session Management
  SESSION: {
    RESET_TITLE: 'Reset Session',
    RESET_MESSAGE:
      'Are you sure you want to reset the current session? This will clear all current session stats and cannot be undone.',
  },

  // Common Button Text
  BUTTONS: {
    OK: 'OK',
    CANCEL: 'Cancel',
    CLEAR: 'Clear',
    START_REAL_TIME: 'Start Real-Time',
    MERGE_WITH_CURRENT: 'Merge with Current Data',
    REPLACE_ALL_DATA: 'Replace All Data',
  },
} as const;
