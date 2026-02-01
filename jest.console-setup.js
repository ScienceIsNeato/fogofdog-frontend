/* eslint-env jest */
/* global beforeEach, afterEach */
/**
 * Jest Console Error Capture Setup
 *
 * This setup captures console.error and console.warn during test execution
 * and fails tests if any unexpected console messages are detected.
 *
 * Philosophy: All console errors need either fixing or graceful handling.
 * No whitelisting - fail fast on any console issues.
 *
 * Tests can opt-out by setting global.expectConsoleErrors = true
 */

let consoleErrors = [];
let consoleWarnings = [];
let originalConsoleError;
let originalConsoleWarn;

beforeEach(() => {
  // Reset captured messages for each test
  consoleErrors = [];
  consoleWarnings = [];

  // Reset expectation flag
  global.expectConsoleErrors = false;

  // Store original console methods
  originalConsoleError = console.error;
  originalConsoleWarn = console.warn;

  // Override console.error to capture messages
  console.error = (...args) => {
    consoleErrors.push(args.join(' '));
    // Still output to console for debugging
    originalConsoleError.apply(console, args);
  };

  // Override console.warn to capture messages
  console.warn = (...args) => {
    consoleWarnings.push(args.join(' '));
    // Still output to console for debugging
    originalConsoleWarn.apply(console, args);
  };
});

afterEach(() => {
  // Restore original console methods
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;

  // Skip console error/warning checking if test expects them
  if (global.expectConsoleErrors || global.expectConsoleWarnings) {
    // Reset arrays for next test
    consoleErrors.length = 0;
    consoleWarnings.length = 0;
    return;
  }

  // Check for console errors and fail test if any found
  if (consoleErrors.length > 0) {
    throw new Error(
      `Test failed due to console.error messages:\n${consoleErrors.map((msg) => `  • ${msg}`).join('\n')}`
    );
  }

  // Check for console warnings and fail test if any found
  if (consoleWarnings.length > 0) {
    throw new Error(
      `Test failed due to console.warn messages:\n${consoleWarnings.map((msg) => `  • ${msg}`).join('\n')}`
    );
  }

  // Reset arrays for next test
  consoleErrors.length = 0;
  consoleWarnings.length = 0;
});
