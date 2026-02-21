/**
 * Mock for react-native-maps (v1.27.1+)
 *
 * react-native-maps 1.27.1 uses TurboModules (RNMapsAirModule) which
 * require native binaries at import time. This mock prevents the
 * TurboModuleRegistry.getEnforcing() call from throwing in Jest.
 */
import React from 'react';
import type { ViewProps } from 'react-native';

// Mock MapView component
const MapView = React.forwardRef<unknown, ViewProps & Record<string, unknown>>((props, ref) => {
  const { children, testID, ...rest } = props;
  return React.createElement('MapView', { ...rest, testID, ref }, children as React.ReactNode);
});
MapView.displayName = 'MapView';

// Add static methods that tests may call
(MapView as unknown as Record<string, unknown>).Animated = MapView;

// Mock Marker component
const Marker = (props: ViewProps & Record<string, unknown>) =>
  React.createElement('Marker', props, props.children);

// Mock other commonly used components
const Polyline = (props: ViewProps & Record<string, unknown>) =>
  React.createElement('Polyline', props);
const Polygon = (props: ViewProps & Record<string, unknown>) =>
  React.createElement('Polygon', props);
const Circle = (props: ViewProps & Record<string, unknown>) => React.createElement('Circle', props);
const Callout = (props: ViewProps & Record<string, unknown>) =>
  React.createElement('Callout', props, props.children);

// Export types as empty interfaces (real types come from TS declarations)
export type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export type LatLng = {
  latitude: number;
  longitude: number;
};

export { Marker, Polyline, Polygon, Circle, Callout };
export default MapView;
