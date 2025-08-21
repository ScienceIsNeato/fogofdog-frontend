/**
 * Helper utilities for console spies in tests
 * This reduces duplication across test files that need to mock console methods
 */

export interface ConsoleSpy {
  spy: jest.SpyInstance;
  restore: () => void;
}

/**
 * Create a console.error spy that can be automatically restored
 */
export const createConsoleErrorSpy = (): ConsoleSpy => {
  const spy = jest.spyOn(console, 'error').mockImplementation();

  return {
    spy,
    restore: () => spy.mockRestore(),
  };
};

/**
 * Create a console.warn spy that can be automatically restored
 */
export const createConsoleWarnSpy = (): ConsoleSpy => {
  const spy = jest.spyOn(console, 'warn').mockImplementation();

  return {
    spy,
    restore: () => spy.mockRestore(),
  };
};

/**
 * Create a console.log spy that can be automatically restored
 */
export const createConsoleLogSpy = (): ConsoleSpy => {
  const spy = jest.spyOn(console, 'log').mockImplementation();

  return {
    spy,
    restore: () => spy.mockRestore(),
  };
};

/**
 * Helper function to run a test with console error mocking
 */
export const withConsoleErrorSpy = async (
  testFn: (spy: jest.SpyInstance) => Promise<void> | void
): Promise<void> => {
  const consoleSpy = createConsoleErrorSpy();
  try {
    await testFn(consoleSpy.spy);
  } finally {
    consoleSpy.restore();
  }
};

/**
 * Helper function to run a test with console warn mocking
 */
export const withConsoleWarnSpy = async (
  testFn: (spy: jest.SpyInstance) => Promise<void> | void
): Promise<void> => {
  const consoleSpy = createConsoleWarnSpy();
  try {
    await testFn(consoleSpy.spy);
  } finally {
    consoleSpy.restore();
  }
};
