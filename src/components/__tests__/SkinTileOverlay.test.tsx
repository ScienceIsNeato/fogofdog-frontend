import React from 'react';
import { render, act } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import skinReducer, { setSkin, AVAILABLE_SKINS } from '../../store/slices/skinSlice';

import SkinTileOverlay from '../SkinTileOverlay';

// Mock dependencies
jest.mock('../../utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../services/SkinAssetService', () => ({
  initializeSkin: jest.fn().mockResolvedValue(undefined),
  getUrlTemplate: jest.fn((skinId: string) => `file://skins/${skinId}/{z}/{x}/{y}.png`),
}));

jest.mock('react-native-maps', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  return {
    UrlTile: ({ testID }: { testID?: string }) =>
      React.createElement('UrlTile', { testID: testID ?? 'url-tile' }),
  };
});

const createStore = (initialSkin = 'none') =>
  configureStore({
    reducer: { skin: skinReducer },
    preloadedState: {
      skin: {
        activeSkin: initialSkin as any,
        isInitializing: false,
        availableSkins: AVAILABLE_SKINS,
        error: null,
      },
    },
  });

describe('SkinTileOverlay', () => {
  it('renders nothing when no skin is active', () => {
    const store = createStore('none');
    const { queryByTestId } = render(
      <Provider store={store}>
        <SkinTileOverlay />
      </Provider>
    );
    expect(queryByTestId('skin-tile-overlay')).toBeNull();
  });

  it('tracks skin state when cartoon skin is activated', async () => {
    const store = createStore('none');
    render(
      <Provider store={store}>
        <SkinTileOverlay />
      </Provider>
    );

    // Activate skin with act to flush React updates
    await act(async () => {
      store.dispatch(setSkin('cartoon'));
    });

    expect(store.getState().skin.activeSkin).toBe('cartoon');
  });

  it('calls initializeSkin when cartoon skin is first activated', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { initializeSkin } = require('../../services/SkinAssetService');
    const store = createStore('cartoon');

    render(
      <Provider store={store}>
        <SkinTileOverlay />
      </Provider>
    );

    // Flush async effects (initializeSkin mock resolves as microtask)
    await act(async () => {});

    expect(initializeSkin).toHaveBeenCalledWith('cartoon');
  });
});
