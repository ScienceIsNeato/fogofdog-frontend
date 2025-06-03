import React from 'react';
import { render } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import FogOverlay from '../FogOverlay';
import type { ViewProps } from 'react-native';

// Mock Skia components
jest.mock('@shopify/react-native-skia', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');

  return {
    Canvas: (props: ViewProps) =>
      React.createElement(View, { testID: 'mock-skia-canvas', ...props }),
    Mask: (props: ViewProps) => React.createElement(View, { testID: 'mock-skia-mask', ...props }),
    Group: (props: ViewProps) => React.createElement(View, { testID: 'mock-skia-group', ...props }),
    Fill: (props: ViewProps) => React.createElement(View, { testID: 'mock-skia-fill', ...props }),
    Path: (props: ViewProps) => React.createElement(View, { testID: 'mock-skia-path', ...props }),
    Rect: (props: ViewProps) => React.createElement(View, { testID: 'mock-skia-rect', ...props }),
    Circle: (props: ViewProps) =>
      React.createElement(View, { testID: 'mock-skia-circle', ...props }),
    Skia: {
      Path: {
        Make: jest.fn().mockReturnValue({
          moveTo: jest.fn(),
          lineTo: jest.fn(),
        }),
      },
    },
  };
});

// Setup mock Redux store with exploration slice
const createMockStore = (initialPath?: { latitude: number; longitude: number }[]) => {
  return configureStore({
    reducer: {
      exploration: (state, _action) => state ?? { path: initialPath ?? [] },
    },
  });
};

describe('FogOverlay', () => {
  it('renders correctly with empty path', () => {
    const store = createMockStore([]);

    const mapRegion = {
      latitude: 41.6867,
      longitude: -91.5802,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
      width: 400,
      height: 800,
    };

    const result = render(
      <Provider store={store}>
        <FogOverlay mapRegion={mapRegion} />
      </Provider>
    );

    expect(result.getByTestId('mock-skia-canvas')).toBeDefined();
  });

  it('renders correctly with a path', () => {
    const testPath = [
      { latitude: 41.6867, longitude: -91.5802 },
      { latitude: 41.6877, longitude: -91.5812 },
    ];

    const store = createMockStore(testPath);

    const mapRegion = {
      latitude: 41.6867,
      longitude: -91.5802,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
      width: 400,
      height: 800,
    };

    const result = render(
      <Provider store={store}>
        <FogOverlay mapRegion={mapRegion} />
      </Provider>
    );

    expect(result.getByTestId('mock-skia-canvas')).toBeDefined();
  });
});
