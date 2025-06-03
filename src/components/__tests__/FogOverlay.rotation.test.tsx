import React from 'react';
import { render } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import FogOverlay from '../FogOverlay';
import { GeoPoint } from '../../types/user';

// Mock Skia components using the same working pattern
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

// Mock redux state with exploration slice
const createMockStore = (currentLocation: GeoPoint | null = null, path: GeoPoint[] = []) => {
  return configureStore({
    reducer: {
      exploration: (state = { currentLocation, path }, action) => state,
    },
  });
};

// Test data
const TEST_MAP_REGION = {
  latitude: 41.6867,
  longitude: -91.5802,
  latitudeDelta: 0.01,
  longitudeDelta: 0.01,
  width: 400,
  height: 800,
};

const TEST_LOCATION: GeoPoint = {
  latitude: 41.6880,
  longitude: -91.5790,
};

describe('FogOverlay - Rotation', () => {
  it('transforms the canvas around the current GPS location when rotation is applied', () => {
    // Create a store with a current location
    const store = createMockStore(TEST_LOCATION, [TEST_LOCATION]);
    
    // Render with a non-zero rotation
    const TEST_ROTATION = 45; // 45 degrees rotation
    const { getByTestId } = render(
      <Provider store={store}>
        <FogOverlay mapRegion={TEST_MAP_REGION} rotation={TEST_ROTATION} />
      </Provider>
    );
    
    // Get the Mask component which should have a transform applied
    const mask = getByTestId('mock-skia-mask');
    expect(mask.props.transform).toBeDefined();
    
    // Extract the transform array
    const transform = mask.props.transform;
    
    // The transform should be an array with 5 operations:
    // 1. Translate to GPS position (x)
    // 2. Translate to GPS position (y)
    // 3. Rotate
    // 4. Translate back (-x)
    // 5. Translate back (-y)
    expect(transform).toHaveLength(5);
    
    // Check that all transform values are numbers and the rotation is correct
    expect(typeof transform[0].translateX).toBe('number');
    expect(typeof transform[1].translateY).toBe('number');
    expect(transform[2]).toEqual({ rotate: (TEST_ROTATION * Math.PI) / 180 });
    expect(typeof transform[3].translateX).toBe('number');
    expect(typeof transform[4].translateY).toBe('number');
    
    // The translate values should be opposites
    expect(transform[3].translateX).toBe(-transform[0].translateX);
    expect(transform[4].translateY).toBe(-transform[1].translateY);
  });
  
  it('uses screen center as fallback when no current location is available', () => {
    // Create a store without a current location
    const store = createMockStore(null, []);
    
    // Render with a non-zero rotation
    const TEST_ROTATION = 90; // 90 degrees rotation
    const { getByTestId } = render(
      <Provider store={store}>
        <FogOverlay mapRegion={TEST_MAP_REGION} rotation={TEST_ROTATION} />
      </Provider>
    );
    
    // Get the Mask component which should have a transform applied
    const mask = getByTestId('mock-skia-mask');
    expect(mask.props.transform).toBeDefined();
    
    // Extract the transform array
    const transform = mask.props.transform;
    
    // The transform should be an array with 5 operations
    expect(transform).toHaveLength(5);
    
    // Screen center should be used
    const screenCenterX = TEST_MAP_REGION.width / 2;
    const screenCenterY = TEST_MAP_REGION.height / 2;
    
    // Check that the transform centers on the screen center
    expect(transform[0]).toEqual({ translateX: screenCenterX });
    expect(transform[1]).toEqual({ translateY: screenCenterY });
    expect(transform[2]).toEqual({ rotate: (TEST_ROTATION * Math.PI) / 180 });
    expect(transform[3]).toEqual({ translateX: -screenCenterX });
    expect(transform[4]).toEqual({ translateY: -screenCenterY });
  });

  it('correctly handles a zero rotation value', () => {
    // Create a store with a current location
    const store = createMockStore(TEST_LOCATION, [TEST_LOCATION]);
    
    // Render with a zero rotation
    const { getByTestId } = render(
      <Provider store={store}>
        <FogOverlay mapRegion={TEST_MAP_REGION} rotation={0} />
      </Provider>
    );
    
    // Get the Mask component
    const mask = getByTestId('mock-skia-mask');
    
    // With zero rotation, transform should be undefined
    expect(mask.props.transform).toBeUndefined();
  });

  it('handles different rotation values correctly', () => {
    // Create a store with a current location
    const store = createMockStore(TEST_LOCATION, [TEST_LOCATION]);
    
    // Test multiple rotation values
    const testRotations = [30, 60, 90, 180, 270, 360];
    
    testRotations.forEach(rotation => {
      const { getByTestId, unmount } = render(
        <Provider store={store}>
          <FogOverlay mapRegion={TEST_MAP_REGION} rotation={rotation} />
        </Provider>
      );
      
      const mask = getByTestId('mock-skia-mask');
      expect(mask.props.transform).toBeDefined();
      
      const transform = mask.props.transform;
      expect(transform).toHaveLength(5);
      
      // Check the rotation value is correctly converted to radians
      expect(transform[2]).toEqual({ rotate: (rotation * Math.PI) / 180 });
      
      // Clean up before next render
      unmount();
    });
  });
});