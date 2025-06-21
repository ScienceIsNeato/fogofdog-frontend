import { SignInScreen, SignUpScreen } from '../index';

describe('Auth Module Exports', () => {
  it('should export SignInScreen', () => {
    expect(SignInScreen).toBeDefined();
    expect(typeof SignInScreen).toBe('function');
  });

  it('should export SignUpScreen', () => {
    expect(SignUpScreen).toBeDefined();
    expect(typeof SignUpScreen).toBe('function');
  });

  it('should export all expected components', () => {
    const exports = require('../index');
    expect(Object.keys(exports)).toEqual(['SignInScreen', 'SignUpScreen']);
  });
}); 