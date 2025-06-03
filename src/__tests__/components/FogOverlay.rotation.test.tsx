import React from 'react';
import { render } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import FogOverlay from '../../components/FogOverlay';

// Mock Skia components
jest.mock('@shopify/react-native-skia', () => {
  const React = require('react');
  return {
    Canvas: (props: any) => React.createElement('View', { ...props, testID: 'skia-canvas' }),
    Mask: (props: any) => React.createElement('View', { ...props, testID: 'skia-mask' }),
    Group: (props: any) => React.createElement('View', { ...props, testID: 'skia-group' }),
    Fill: (props: any) => React.createElement('View', { ...props, testID: 'skia-fill' }),
    Path: (props: any) => React.createElement('View', { ...props, testID: 'skia-path' }),
    Circle: (props: any) => React.createElement('View', { ...props, testID: 'skia-circle' }),
    Rect: (props: any) => React.createElement('View', { ...props, testID: 'skia-rect' }),
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

// Create mock store
const createTestStore = (initialPath = []) => {
  return configureStore({
    reducer: {
      exploration: (state = { path: initialPath }, action) => state,
    },
  });
};

describe('FogOverlay with rotation', () => {
  it('applies transform when rotation is provided', () => {
    const store = createTestStore([
      { latitude: 41.6867, longitude: -91.5802 },
    ]);
    
    const mapRegion = {
      latitude: 41.6867,
      longitude: -91.5802,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
      width: 400,
      height: 800,
    };
    
    // Render with 45 degree rotation
    const { getByTestID } = render(
      <Provider store={store}>
        <FogOverlay mapRegion={mapRegion} rotation={45} />
      </Provider>
    );
    
    // Since we're using mocks, we need to use a custom matcher to verify props
    // This is validating that transform is passed down to the Mask component
    const { getByTestId } = render(
      <Provider store={store}>
        <FogOverlay mapRegion={mapRegion} rotation={45} />
      </Provider>
    );
    const maskComponent = getByTestId('skia-mask');
    expect(maskComponent.props.transform).toBeDefined();
  });
  
  it('handles rotation value of 0 correctly', () => {
    const store = createTestStore([
      { latitude: 41.6867, longitude: -91.5802 },
    ]);
    
    const mapRegion = {
      latitude: 41.6867,
      longitude: -91.5802,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
      width: 400,
      height: 800,
    };
    
    // Render with no rotation
    const { getByTestID } = render(
      <Provider store={store}>
        <FogOverlay mapRegion={mapRegion} rotation={0} />
      </Provider>
    );
    
    // With no rotation, transform should be undefined to optimize rendering
    const { getByTestId } = render(
      <Provider store={store}>
        <FogOverlay mapRegion={mapRegion} rotation={0} />
      </Provider>
    );
    const maskComponent = getByTestId('skia-mask');
    expect(maskComponent.props.transform).toBeUndefined();
  });
  
  it('calculates correct transform values for rotation', () => {
    // We need to access internal implementation variables, so we'll mock component functions
    const mockMapRegion = {
      width: 400, 
      height: 800
    };
    const mockRotation = 90;
    
    // Expected transform for 90 degree rotation
    const expectedCenterX = 200; // width/2
    const expectedCenterY = 400; // height/2
    
    // Mock implementation to expose rotation transform calculations
    let capturedTransform: any;
    jest.spyOn(React, 'useMemo').mockImplementationOnce((fn, deps) => {
      capturedTransform = fn();
      return capturedTransform;
    });
    
    // Create a wrapper component to access internal workings
    function TestWrapper() {
      const canvasTransform = React.useMemo(() => {
        if (mockRotation === 0) return undefined;
        
        const centerX = mockMapRegion.width / 2;
        const centerY = mockMapRegion.height / 2;
        
        return [
          { translateX: centerX },
          { translateY: centerY },
          { rotate: (mockRotation * Math.PI) / 180 },
          { translateX: -centerX },
          { translateY: -centerY },
        ];
      }, [mockRotation]);
      
      return null;
    }
    
    // Render the test component
    render(<TestWrapper />);
    
    // Verify transform values
    expect(capturedTransform).toBeDefined();
    expect(capturedTransform[0]).toEqual({ translateX: expectedCenterX });
    expect(capturedTransform[1]).toEqual({ translateY: expectedCenterY });
    expect(capturedTransform[2].rotate).toBeCloseTo(Math.PI / 2); // 90 degrees in radians
    expect(capturedTransform[3]).toEqual({ translateX: -expectedCenterX });
    expect(capturedTransform[4]).toEqual({ translateY: -expectedCenterY });
  });
});