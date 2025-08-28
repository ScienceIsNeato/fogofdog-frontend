import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { Region } from 'react-native-maps';
import { MAP_DISPLAY_CONFIG } from '../constants/mapDisplay';
import { logger } from '../utils/logger';

interface MapDistanceScaleProps {
  region: Region;
  mapWidth: number;
}

// Scale configuration for different zoom levels
const SCALE_CONFIGS = [
  { threshold: 1, meters: 0.5, label: '0.5m' },
  { threshold: 2, meters: 1, label: '1m' },
  { threshold: 5, meters: 2, label: '2m' },
  { threshold: 10, meters: 5, label: '5m' },
  { threshold: 20, meters: 10, label: '10m' },
  { threshold: 50, meters: 20, label: '20m' },
  { threshold: 100, meters: 50, label: '50m' },
  { threshold: 200, meters: 100, label: '100m' },
  { threshold: 500, meters: 200, label: '200m' },
  { threshold: 1000, meters: 500, label: '500m' },
  { threshold: 2000, meters: 1000, label: '1km' },
  { threshold: 5000, meters: 2000, label: '2km' },
  { threshold: 10000, meters: 5000, label: '5km' },
  { threshold: 20000, meters: 10000, label: '10km' },
  { threshold: 50000, meters: 20000, label: '20km' },
  { threshold: Infinity, meters: 50000, label: '50km' },
];

// Helper function to calculate appropriate scale for the current zoom level
const calculateScaleInfo = (region: Region, mapWidth: number) => {
  if (!region || !mapWidth || mapWidth === 0) {
    return null;
  }

  // Calculate meters per pixel at this zoom level
  const metersPerDegree = MAP_DISPLAY_CONFIG.METERS_PER_DEGREE_LATITUDE;
  const mapWidthInDegrees = region.longitudeDelta;
  const totalMapWidthInMeters =
    mapWidthInDegrees * metersPerDegree * Math.cos((region.latitude * Math.PI) / 180);
  const metersPerPixel = totalMapWidthInMeters / mapWidth;

  // Choose appropriate scale bar length (aim for target width)
  const targetPixelWidth = MAP_DISPLAY_CONFIG.TARGET_SCALE_PIXEL_WIDTH;
  const targetMeters = metersPerPixel * targetPixelWidth;

  // Find the appropriate scale configuration
  const config =
    SCALE_CONFIGS.find((c) => targetMeters < c.threshold) ??
    SCALE_CONFIGS[SCALE_CONFIGS.length - 1];

  if (!config) {
    // Fallback if somehow no config is found
    logger.warn('No distance scale config found for target meters', {
      component: 'MapDistanceScale',
      targetMeters: targetMeters.toFixed(2),
      metersPerPixel: metersPerPixel.toFixed(6),
      region: {
        lat: region.latitude.toFixed(6),
        lng: region.longitude.toFixed(6),
        latDelta: region.latitudeDelta.toFixed(6),
        lngDelta: region.longitudeDelta.toFixed(6),
      },
      mapWidth,
    });

    return {
      pixelWidth: MAP_DISPLAY_CONFIG.FALLBACK_SCALE_PIXEL_WIDTH,
      label: MAP_DISPLAY_CONFIG.FALLBACK_SCALE_LABEL,
    };
  }

  // Calculate actual pixel width for this scale
  const actualPixelWidth = config.meters / metersPerPixel;

  return {
    pixelWidth: Math.round(actualPixelWidth),
    label: config.label,
  };
};

/**
 * Lightweight distance scale component that shows current map scale
 * Automatically adjusts based on zoom level and displays in meters/kilometers
 */
export const MapDistanceScale: React.FC<MapDistanceScaleProps> = ({ region, mapWidth }) => {
  const scaleInfo = useMemo(() => calculateScaleInfo(region, mapWidth), [region, mapWidth]);

  if (!scaleInfo) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={[styles.scaleLine, { width: scaleInfo.pixelWidth }]} />
      <Text style={styles.scaleLabel}>{scaleInfo.label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 180, // Higher above the stats panel to avoid text clipping
    right: 20, // Right side instead of left
    alignItems: 'flex-end', // Align to the right
    zIndex: 1000, // Above fog but below other UI elements
  },
  scaleLine: {
    height: 3,
    backgroundColor: 'white',
    borderRadius: 1.5,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3, // Android shadow
  },
  scaleLabel: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});

export default MapDistanceScale;
