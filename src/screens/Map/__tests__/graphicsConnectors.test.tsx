import React from 'react';
import { renderWithProviders } from '../../../utils/test-utils';
import {
  FogOverlayConnected,
  MapEffectOverlayConnected,
  ScentTrailConnected,
} from '../graphicsConnectors';

jest.mock('../../../utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    throttledDebug: jest.fn(),
  },
}));

jest.mock('../../../services/StreetDataService', () => ({
  findClosestStreets: jest.fn(() => []),
  computeExploredIds: jest.fn(() => ({ segmentIds: [], intersectionIds: [] })),
}));

const MAP_REGION = {
  latitude: 37.7749,
  longitude: -122.4194,
  latitudeDelta: 0.01,
  longitudeDelta: 0.01,
  width: 400,
  height: 800,
};

const baseGraphicsState = {
  activeFogEffectId: 'fog-classic',
  activeMapEffectId: 'map-none',
  activeScentEffectId: 'scent-dotted',
  isScentVisible: true,
};

describe('graphicsConnectors', () => {
  describe('FogOverlayConnected', () => {
    it('renders the fog overlay canvas for the default fog-classic effect', () => {
      const { getByTestId } = renderWithProviders(<FogOverlayConnected mapRegion={MAP_REGION} />, {
        preloadedState: { graphics: baseGraphicsState },
      });
      expect(getByTestId('optimized-fog-overlay-canvas')).toBeTruthy();
    });

    it('passes fogEffectConfig from GraphicsService for fog-vignette, enabling edge blur', () => {
      const { getByTestId, queryAllByTestId } = renderWithProviders(
        <FogOverlayConnected mapRegion={MAP_REGION} />,
        {
          preloadedState: {
            graphics: { ...baseGraphicsState, activeFogEffectId: 'fog-vignette' },
          },
        }
      );
      expect(getByTestId('optimized-fog-overlay-canvas')).toBeTruthy();
      // fog-vignette has edgeBlurSigma > 0, which renders a BlurMask on the mask layer
      expect(queryAllByTestId('mock-skia-blur-mask').length).toBeGreaterThan(0);
    });

    it('renders fog overlay for all four fog effects without crashing', () => {
      for (const activeFogEffectId of ['fog-classic', 'fog-vignette', 'fog-pulse', 'fog-haunted']) {
        const { getByTestId } = renderWithProviders(
          <FogOverlayConnected mapRegion={MAP_REGION} />,
          { preloadedState: { graphics: { ...baseGraphicsState, activeFogEffectId } } }
        );
        expect(getByTestId('optimized-fog-overlay-canvas')).toBeTruthy();
      }
    });

    it('returns null when mapRegion dimensions are zero', () => {
      const { queryByTestId } = renderWithProviders(
        <FogOverlayConnected mapRegion={{ ...MAP_REGION, width: 0, height: 0 }} />,
        { preloadedState: { graphics: baseGraphicsState } }
      );
      expect(queryByTestId('optimized-fog-overlay-canvas')).toBeNull();
    });
  });

  describe('MapEffectOverlayConnected', () => {
    it('returns null for the map-none effect (zero GPU overhead)', () => {
      const { toJSON } = renderWithProviders(
        <MapEffectOverlayConnected fogRegion={MAP_REGION} currentLocation={null} />,
        { preloadedState: { graphics: { ...baseGraphicsState, activeMapEffectId: 'map-none' } } }
      );
      expect(toJSON()).toBeNull();
    });

    it('renders a canvas for map-sepia effect', () => {
      const { getByTestId } = renderWithProviders(
        <MapEffectOverlayConnected fogRegion={MAP_REGION} currentLocation={null} />,
        {
          preloadedState: {
            graphics: { ...baseGraphicsState, activeMapEffectId: 'map-sepia' },
          },
        }
      );
      expect(getByTestId('map-effect-overlay-canvas')).toBeTruthy();
    });

    it('renders a canvas for map-heat-glow animated effect', () => {
      const { getByTestId } = renderWithProviders(
        <MapEffectOverlayConnected fogRegion={MAP_REGION} currentLocation={null} />,
        {
          preloadedState: {
            graphics: { ...baseGraphicsState, activeMapEffectId: 'map-heat-glow' },
          },
        }
      );
      expect(getByTestId('map-effect-overlay-canvas')).toBeTruthy();
    });

    it('renders a canvas for map-radar animated effect', () => {
      const { getByTestId } = renderWithProviders(
        <MapEffectOverlayConnected fogRegion={MAP_REGION} currentLocation={null} />,
        {
          preloadedState: {
            graphics: { ...baseGraphicsState, activeMapEffectId: 'map-radar' },
          },
        }
      );
      expect(getByTestId('map-effect-overlay-canvas')).toBeTruthy();
    });

    it('uses center pixel as user position when currentLocation is null', () => {
      // Should still render without crashing even with no location
      const { getByTestId } = renderWithProviders(
        <MapEffectOverlayConnected fogRegion={MAP_REGION} currentLocation={null} />,
        {
          preloadedState: {
            graphics: { ...baseGraphicsState, activeMapEffectId: 'map-sepia' },
          },
        }
      );
      expect(getByTestId('map-effect-overlay-canvas')).toBeTruthy();
    });

    it('renders without crashing when currentLocation is provided', () => {
      const location = { latitude: 37.7749, longitude: -122.4194, timestamp: Date.now() };
      const { getByTestId } = renderWithProviders(
        <MapEffectOverlayConnected fogRegion={MAP_REGION} currentLocation={location} />,
        {
          preloadedState: {
            graphics: { ...baseGraphicsState, activeMapEffectId: 'map-sepia' },
          },
        }
      );
      expect(getByTestId('map-effect-overlay-canvas')).toBeTruthy();
    });
  });

  describe('ScentTrailConnected', () => {
    it('returns null when isScentVisible is false', () => {
      const { toJSON } = renderWithProviders(<ScentTrailConnected fogRegion={MAP_REGION} />, {
        preloadedState: {
          graphics: { ...baseGraphicsState, isScentVisible: false },
        },
      });
      expect(toJSON()).toBeNull();
    });

    it('returns null when isScentVisible is true but there is no current location', () => {
      // ScentTrail returns null internally when currentLocation is absent
      const { toJSON } = renderWithProviders(<ScentTrailConnected fogRegion={MAP_REGION} />, {
        preloadedState: {
          graphics: { ...baseGraphicsState, isScentVisible: true },
        },
      });
      expect(toJSON()).toBeNull();
    });

    it('returns null for all scent styles when isScentVisible is false', () => {
      const scentIds = ['scent-dotted', 'scent-arrows', 'scent-flowing', 'scent-pulse-wave'];
      for (const activeScentEffectId of scentIds) {
        const { toJSON } = renderWithProviders(<ScentTrailConnected fogRegion={MAP_REGION} />, {
          preloadedState: {
            graphics: { ...baseGraphicsState, isScentVisible: false, activeScentEffectId },
          },
        });
        expect(toJSON()).toBeNull();
      }
    });
  });
});
