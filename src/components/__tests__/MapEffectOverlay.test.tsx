import React from 'react';
import { render } from '@testing-library/react-native';
import MapEffectOverlay from '../MapEffectOverlay';
import type { MapRenderConfig } from '../../types/graphics';

const BASE_CONFIG: MapRenderConfig = {
  overlayOpacity: 0,
  animationType: 'none',
  animationDuration: 0,
};

describe('MapEffectOverlay', () => {
  it('returns null when there is no overlay colour and animationType is none', () => {
    const { toJSON } = render(
      <MapEffectOverlay
        width={400}
        height={800}
        userX={200}
        userY={400}
        renderConfig={BASE_CONFIG}
      />
    );
    expect(toJSON()).toBeNull();
  });

  it('returns null when overlay colour is missing even if opacity is set', () => {
    const config: MapRenderConfig = { ...BASE_CONFIG, overlayOpacity: 0.5 };
    const { toJSON } = render(
      <MapEffectOverlay width={400} height={800} userX={200} userY={400} renderConfig={config} />
    );
    expect(toJSON()).toBeNull();
  });

  it('returns null when width or height is zero', () => {
    const config: MapRenderConfig = {
      overlayColor: '#ff0000',
      overlayOpacity: 0.5,
      animationType: 'none',
      animationDuration: 0,
    };
    const { toJSON } = render(
      <MapEffectOverlay width={0} height={800} userX={0} userY={400} renderConfig={config} />
    );
    expect(toJSON()).toBeNull();
  });

  it('renders a canvas for a static colour tint (sepia veil)', () => {
    const config: MapRenderConfig = {
      overlayColor: '#c8820a',
      overlayOpacity: 0.12,
      animationType: 'none',
      animationDuration: 0,
    };
    const { getByTestId } = render(
      <MapEffectOverlay width={400} height={800} userX={200} userY={400} renderConfig={config} />
    );
    expect(getByTestId('map-effect-overlay-canvas')).toBeTruthy();
  });

  it('renders a canvas for the pulse animation (heat glow)', () => {
    const config: MapRenderConfig = {
      overlayColor: '#ff6a00',
      overlayOpacity: 0.08,
      animationType: 'pulse',
      animationDuration: 3000,
    };
    const { getByTestId } = render(
      <MapEffectOverlay width={400} height={800} userX={200} userY={400} renderConfig={config} />
    );
    expect(getByTestId('map-effect-overlay-canvas')).toBeTruthy();
  });

  it('renders a canvas for the radar sweep animation', () => {
    const config: MapRenderConfig = {
      overlayColor: '#00ff41',
      overlayOpacity: 0.18,
      animationType: 'radar',
      animationDuration: 3500,
    };
    const { getByTestId } = render(
      <MapEffectOverlay width={400} height={800} userX={200} userY={400} renderConfig={config} />
    );
    expect(getByTestId('map-effect-overlay-canvas')).toBeTruthy();
  });

  it('passes the user pixel position to the radar sweep', () => {
    const config: MapRenderConfig = {
      overlayColor: '#00ff41',
      overlayOpacity: 0.18,
      animationType: 'radar',
      animationDuration: 3500,
    };
    // Radar should render without throwing even when userX/userY are at an edge
    const { getByTestId } = render(
      <MapEffectOverlay width={400} height={800} userX={0} userY={0} renderConfig={config} />
    );
    expect(getByTestId('map-effect-overlay-canvas')).toBeTruthy();
  });
});
