import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import FogOverlay from '../FogOverlay';

// Mock Skia components
jest.mock('@shopify/react-native-skia', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  
  return {
    Canvas: (props: any) => React.createElement(View, { testID: 'mock-skia-canvas', ...props }),
    Mask: (props: any) => React.createElement(View, { testID: 'mock-skia-mask', ...props }),
    Group: (props: any) => React.createElement(View, { testID: 'mock-skia-group', ...props }),
    Fill: (props: any) => React.createElement(View, { testID: 'mock-skia-fill', ...props }),
    Path: (props: any) => React.createElement(View, { testID: 'mock-skia-path', ...props }),
    Rect: (props: any) => React.createElement(View, { testID: 'mock-skia-rect', ...props }),
    Circle: (props: any) => React.createElement(View, { testID: 'mock-skia-circle', ...props }),
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
const createMockStore = (initialPath = []) => {
  return configureStore({
    reducer: {
      exploration: (state = { path: initialPath }, action) => state,
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
    
    let tree: any;
    act(() => {
      tree = renderer.create(
        <Provider store={store}>
          <FogOverlay mapRegion={mapRegion} />
        </Provider>
      ).toJSON();
    });
    
    expect(tree).toMatchSnapshot();
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
    
    let tree: any;
    act(() => {
      tree = renderer.create(
        <Provider store={store}>
          <FogOverlay mapRegion={mapRegion} />
        </Provider>
      ).toJSON();
    });
    
    expect(tree).toMatchSnapshot();
  });
});