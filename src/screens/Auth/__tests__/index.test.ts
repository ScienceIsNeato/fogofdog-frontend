import { SignInScreen, SignUpScreen } from '../index';
import * as AuthModule from '../index';

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
    expect(Object.keys(AuthModule)).toEqual(['SignInScreen', 'SignUpScreen']);
  });
});
