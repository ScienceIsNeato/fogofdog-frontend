import { store } from '../index';
import type { RootState, AppDispatch } from '../index';

describe('Store Configuration', () => {
  it('should export a configured store', () => {
    expect(store).toBeDefined();
    expect(typeof store.getState).toBe('function');
    expect(typeof store.dispatch).toBe('function');
  });

  it('should have the correct reducer structure', () => {
    const state = store.getState();
    expect(state).toHaveProperty('user');
    expect(state).toHaveProperty('exploration');
  });

  it('should export RootState type correctly', () => {
    const state: RootState = store.getState();
    expect(state.user).toBeDefined();
    expect(state.exploration).toBeDefined();
  });

  it('should export AppDispatch type correctly', () => {
    const dispatch: AppDispatch = store.dispatch;
    expect(typeof dispatch).toBe('function');
  });

  it('should have initial state for user slice', () => {
    const state = store.getState();
    expect(state.user.user).toBeNull();
    expect(state.user.isLoading).toBe(false);
    expect(state.user.error).toBeNull();
  });

  it('should have initial state for exploration slice', () => {
    const state = store.getState();
    expect(state.exploration.path).toEqual([]);
    expect(state.exploration.currentLocation).toBeNull();
    expect(state.exploration.zoomLevel).toBe(14);
    expect(state.exploration.exploredAreas).toEqual([]);
    expect(state.exploration.isMapCenteredOnUser).toBe(false);
    expect(state.exploration.backgroundLocationStatus).toEqual({
      isRunning: false,
      hasPermission: false,
      storedLocationCount: 0,
    });
  });
});
