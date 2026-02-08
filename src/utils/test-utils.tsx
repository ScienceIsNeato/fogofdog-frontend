import React from 'react';
import { render } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import userReducer from '../store/slices/userSlice';
import explorationReducer from '../store/slices/explorationSlice';
import statsReducer from '../store/slices/statsSlice';
import streetReducer from '../store/slices/streetSlice';
import skinReducer from '../store/slices/skinSlice';
import { NavigationContainer } from '@react-navigation/native';

const createTestStore = (initialState = {}) => {
  return configureStore({
    reducer: {
      user: userReducer,
      exploration: explorationReducer,
      stats: statsReducer,
      street: streetReducer,
      skin: skinReducer,
    },
    preloadedState: initialState,
  });
};

export const renderWithProviders = (
  ui: React.ReactElement,
  { preloadedState = {}, store = createTestStore(preloadedState), ...renderOptions } = {}
) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => {
    return (
      <Provider store={store}>
        <NavigationContainer>{children}</NavigationContainer>
      </Provider>
    );
  };

  return {
    store,
    ...render(ui, {
      wrapper: Wrapper,
      ...renderOptions,
    }),
  };
};
