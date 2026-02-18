/**
 * Mock for @maplibre/maplibre-react-native
 *
 * Provides stub components and types used by the map screen and tests.
 * Mirrors the real module's named exports so jest.mock auto-resolves.
 */
import React from 'react';
import type { ViewProps } from 'react-native';

// ── Camera ref methods ──────────────────────────────────────────────────
export interface CameraRef {
  setCamera: jest.Mock;
  moveTo: jest.Mock;
  zoomTo: jest.Mock;
  flyTo: jest.Mock;
}

// ── RegionPayload (subset of GeoJSON Feature properties) ────────────────
export interface RegionPayload {
  zoomLevel: number;
  heading: number;
  animated: boolean;
  isUserInteraction: boolean;
  visibleBounds: [[number, number], [number, number]];
  pitch: number;
}

// ── MapView ─────────────────────────────────────────────────────────────
const MapView = React.forwardRef<unknown, ViewProps & Record<string, unknown>>((props, ref) => {
  const { children, testID, ...rest } = props;
  return React.createElement('MapView', { ...rest, testID, ref }, children as React.ReactNode);
});
MapView.displayName = 'MapView';

// ── Camera ──────────────────────────────────────────────────────────────
const Camera = React.forwardRef<CameraRef, ViewProps & Record<string, unknown>>((props, ref) => {
  // Provide a mock ref with stub methods
  React.useImperativeHandle(ref, () => ({
    setCamera: jest.fn(),
    moveTo: jest.fn(),
    zoomTo: jest.fn(),
    flyTo: jest.fn(),
  }));
  return React.createElement('Camera', props);
});
Camera.displayName = 'Camera';

// ── MarkerView ──────────────────────────────────────────────────────────
const MarkerView = (props: ViewProps & Record<string, unknown>) =>
  React.createElement('MarkerView', props, props.children);

// ── Other components that may be referenced ─────────────────────────────
const PointAnnotation = (props: ViewProps & Record<string, unknown>) =>
  React.createElement('PointAnnotation', props, props.children);
const ShapeSource = (props: ViewProps & Record<string, unknown>) =>
  React.createElement('ShapeSource', props, props.children);
const ImageSource = (props: ViewProps & Record<string, unknown>) =>
  React.createElement('ImageSource', props, props.children);
const RasterLayer = (props: ViewProps & Record<string, unknown>) =>
  React.createElement('RasterLayer', props);
const SymbolLayer = (props: ViewProps & Record<string, unknown>) =>
  React.createElement('SymbolLayer', props);
const LineLayer = (props: ViewProps & Record<string, unknown>) =>
  React.createElement('LineLayer', props);
const FillLayer = (props: ViewProps & Record<string, unknown>) =>
  React.createElement('FillLayer', props);

// ── Named and default exports (match library's export shape) ───────────
export {
  MapView,
  Camera,
  MarkerView,
  PointAnnotation,
  ShapeSource,
  ImageSource,
  RasterLayer,
  SymbolLayer,
  LineLayer,
  FillLayer,
};
export default MapView;
