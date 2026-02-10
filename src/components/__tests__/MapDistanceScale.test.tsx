import React from 'react';
import { render } from '@testing-library/react-native';
import { MapDistanceScale } from '../MapDistanceScale';
import type { MapRegion } from '../../types/map';

describe('MapDistanceScale', () => {
  const mockRegion: MapRegion = {
    latitude: 37.7749,
    longitude: -122.4194,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  };

  it('should render distance scale with valid region and map width', () => {
    const { getByText } = render(<MapDistanceScale region={mockRegion} mapWidth={400} />);

    // Should render some scale label (exact value depends on calculation)
    const scaleText = getByText(/\d+[mk]m?/);
    expect(scaleText).toBeTruthy();
  });

  it('should not render when region is invalid', () => {
    const { queryByText } = render(<MapDistanceScale region={null as any} mapWidth={400} />);

    // Should not render any scale text
    expect(queryByText(/\d+[mk]m?/)).toBeNull();
  });

  it('should not render when mapWidth is zero', () => {
    const { queryByText } = render(<MapDistanceScale region={mockRegion} mapWidth={0} />);

    // Should not render any scale text
    expect(queryByText(/\d+[mk]m?/)).toBeNull();
  });

  it('should show appropriate scale for different zoom levels', () => {
    // Very zoomed in (small delta)
    const zoomedInRegion: MapRegion = {
      ...mockRegion,
      latitudeDelta: 0.001,
      longitudeDelta: 0.001,
    };

    const { getByText: getZoomedInText } = render(
      <MapDistanceScale region={zoomedInRegion} mapWidth={400} />
    );

    // Should show meters for zoomed in view
    const zoomedInScale = getZoomedInText(/\d+m/);
    expect(zoomedInScale).toBeTruthy();

    // Very zoomed out (large delta)
    const zoomedOutRegion: MapRegion = {
      ...mockRegion,
      latitudeDelta: 1.0,
      longitudeDelta: 1.0,
    };

    const { getByText: getZoomedOutText } = render(
      <MapDistanceScale region={zoomedOutRegion} mapWidth={400} />
    );

    // Should show kilometers for zoomed out view
    const zoomedOutScale = getZoomedOutText(/\d+km/);
    expect(zoomedOutScale).toBeTruthy();
  });

  it('should handle edge cases gracefully', () => {
    // Very small map width
    const { queryByText: querySmallMap } = render(
      <MapDistanceScale region={mockRegion} mapWidth={1} />
    );
    expect(querySmallMap(/\d+[mk]m?/)).toBeTruthy(); // Should still render something

    // Very large longitude delta
    const largeRegion: MapRegion = {
      ...mockRegion,
      longitudeDelta: 10.0,
    };

    const { queryByText: queryLargeRegion } = render(
      <MapDistanceScale region={largeRegion} mapWidth={400} />
    );
    expect(queryLargeRegion(/\d+km/)).toBeTruthy(); // Should show km scale
  });
});
