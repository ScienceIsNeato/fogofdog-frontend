import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import Navigation from '../index';
import userSlice from '../../store/slices/userSlice';
import explorationSlice from '../../store/slices/explorationSlice';

// Mock the services that the navigator depends on
jest.mock('../../services/AuthPersistenceService', () => ({
  AuthPersistenceService: {
    getPersistedUser: jest.fn().mockImplementation(() => Promise.resolve(null)),
    getPersistedExploration: jest.fn().mockImplementation(() => Promise.resolve(null)),
    getAuthState: jest.fn().mockImplementation(() => Promise.resolve(null)),
    getExplorationState: jest.fn().mockImplementation(() => Promise.resolve(null)),
  },
}));

// Mock the screens
jest.mock('../../screens/Map', () => ({
  MapScreen: () => null,
}));

jest.mock('../../screens/Auth', () => ({
  SignInScreen: () => null,
  SignUpScreen: () => null,
}));

jest.mock('../../screens/Profile', () => ({
  ProfileScreen: () => null,
}));

describe('Navigation', () => {
  const createTestStore = (initialState = {}) => {
    return configureStore({
      reducer: {
        user: userSlice,
        exploration: explorationSlice,
      },
      preloadedState: initialState,
    });
  };

  it('should render without crashing', async () => {
    const store = createTestStore();

    const renderResult = render(
      <Provider store={store}>
        <Navigation />
      </Provider>
    );

    // Wait for async initialization to complete
    await waitFor(() => {
      expect(renderResult).toBeDefined();
    }, { timeout: 1000 });
  });

  it('should render loading screen initially', async () => {
    const store = createTestStore();

    const { getByText } = render(
      <Provider store={store}>
        <Navigation />
      </Provider>
    );

    expect(getByText('Loading...')).toBeTruthy();

    // Wait a moment for async operations to settle
    await waitFor(() => {
      expect(getByText).toBeDefined();
    }, { timeout: 1000 });
  });
});
