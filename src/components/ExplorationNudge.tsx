import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { findClosestStreets, computeExploredIds } from '../services/StreetDataService';
import { markSegmentsExplored, markIntersectionsExplored } from '../store/slices/streetSlice';

const DIRECTION_ARROWS: Record<string, string> = {
  N: '↑',
  NE: '↗',
  E: '→',
  SE: '↘',
  S: '↓',
  SW: '↙',
  W: '←',
  NW: '↖',
};

/**
 * Floating map overlay that shows the nearest unexplored street.
 *
 * Two responsibilities:
 *   1. On every GPS tick, call computeExploredIds for the current point and
 *      dispatch markSegmentsExplored / markIntersectionsExplored so that
 *      exploration state stays in sync with the live path.
 *   2. Query findClosestStreets with filter 'unexplored' and render the result
 *      as a small card the player can glance at while exploring.
 *
 * Returns null when streets aren't loaded or every street is already explored.
 */
export const ExplorationNudge: React.FC = () => {
  const dispatch = useAppDispatch();
  const currentLocation = useAppSelector((s) => s.exploration.currentLocation);
  const segments = useAppSelector((s) => s.street.segments);
  const intersections = useAppSelector((s) => s.street.intersections);
  const exploredSegmentIds = useAppSelector((s) => s.street.exploredSegmentIds);
  // When the ScentTrail is visible it serves as the graphical replacement for this card.
  // Keep the exploration-marking effect running but suppress the UI.
  const isScentVisible = useAppSelector((s) => s.graphics.isScentVisible);

  const segmentArray = useMemo(() => Object.values(segments), [segments]);
  const intersectionArray = useMemo(() => Object.values(intersections), [intersections]);
  const hasStreets = segmentArray.length > 0;

  // --- real-time exploration marking -------------------------------------------
  useEffect(() => {
    if (!currentLocation || !hasStreets) return;
    const point = { latitude: currentLocation.latitude, longitude: currentLocation.longitude };
    const { segmentIds, intersectionIds } = computeExploredIds(
      [point],
      segmentArray,
      intersectionArray
    );
    if (segmentIds.length > 0) dispatch(markSegmentsExplored(segmentIds));
    if (intersectionIds.length > 0) dispatch(markIntersectionsExplored(intersectionIds));
  }, [currentLocation, segmentArray, intersectionArray, hasStreets, dispatch]);

  // --- nearest unexplored street -----------------------------------------------
  const nearest = useMemo(() => {
    if (!currentLocation || !hasStreets) return null;
    const results = findClosestStreets({
      segments: segmentArray,
      exploredIds: exploredSegmentIds,
      comparisonPoint: { latitude: currentLocation.latitude, longitude: currentLocation.longitude },
      numResults: 1,
      filter: 'unexplored',
    });
    return results[0] ?? null;
  }, [currentLocation, segmentArray, exploredSegmentIds, hasStreets]);

  if (!nearest || isScentVisible) return null;

  const arrow = DIRECTION_ARROWS[nearest.direction] ?? '→';
  const distanceText =
    nearest.distance < 1000
      ? `${Math.round(nearest.distance)}m`
      : `${(nearest.distance / 1000).toFixed(1)}km`;
  const exploredCount = exploredSegmentIds.length;
  const totalCount = segmentArray.length;

  return (
    <View style={styles.container} testID="exploration-nudge">
      <View style={styles.card}>
        <Text style={styles.label}>UNEXPLORED</Text>
        <Text style={styles.streetName} testID="nudge-street-name">
          {nearest.streetName}
        </Text>
        <Text style={styles.detail} testID="nudge-distance-direction">
          {arrow} {distanceText} {nearest.direction}
        </Text>
        <Text style={styles.progress} testID="nudge-progress">
          {exploredCount} / {totalCount} streets explored
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    left: 16,
    zIndex: 999,
  },
  card: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  label: {
    color: '#5AC8FA',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  streetName: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },
  detail: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 13,
    marginTop: 2,
  },
  progress: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 11,
    marginTop: 4,
  },
});
