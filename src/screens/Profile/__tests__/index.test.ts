import { ProfileScreen } from '../index';
import * as ProfileModule from '../index';

describe('Profile Module Exports', () => {
  it('should export ProfileScreen', () => {
    expect(ProfileScreen).toBeDefined();
    expect(typeof ProfileScreen).toBe('function');
  });

  it('should export all expected components', () => {
    expect(Object.keys(ProfileModule)).toEqual(['ProfileScreen']);
  });
});
