import { ProfileScreen } from '../index';

describe('Profile Module Exports', () => {
  it('should export ProfileScreen', () => {
    expect(ProfileScreen).toBeDefined();
    expect(typeof ProfileScreen).toBe('function');
  });

  it('should export all expected components', () => {
    const exports = require('../index');
    expect(Object.keys(exports)).toEqual(['ProfileScreen']);
  });
}); 