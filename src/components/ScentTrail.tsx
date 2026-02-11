/**
 * ScentTrail
 *
 * Renders a visual "scent" trail on a Skia Canvas, connecting the user's
 * current GPS position to the nearest unexplored street waypoint.
 *
 * This is the graphical evolution of ExplorationNudge — instead of a text card,
 * the player gets a spatial trail drawn directly on the map overlay.
 *
 * Supported trail styles (from ScentRenderConfig.trailStyle):
 *   'dotted'     — circles at regular intervals along the straight path
 *   'arrows'     — chevron triangles pointing toward the waypoint
 *   'flowing'    — circles with an animated dashPhase-like offset (Reanimated)
 *   'pulse-wave' — expanding rings at the waypoint (Reanimated)
 *
 * Performance:
 * - Canvas is null-rendered when the user has no current location or no
 *   unexplored streets nearby (zero Skia cost).
 * - Animated effects run on the UI thread via Reanimated SharedValues.
 * - Path geometry is computed in useMemo; only changes when user/waypoint
 *   positions change in screen-space (not on every map pan thanks to the
 *   stable compute region in the fog overlay sibling).
 */
import React, { useMemo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas, Path, Circle, Group, Skia } from '@shopify/react-native-skia';
import {
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
  useDerivedValue,
} from 'react-native-reanimated';
import { useAppSelector } from '../store/hooks';
import { geoPointToPixel } from '../utils/mapUtils';
import { findClosestStreets } from '../services/StreetDataService';
import type { MapRegion } from '../types/map';
import type { ScentRenderConfig } from '../types/graphics';

// Spacing between dots/arrows along the trail (pixels)
const TRAIL_SPACING_PX = 28;
// Arrow chevron half-size in pixels
const ARROW_HALF = 8;

interface ScentTrailProps {
  mapRegion: MapRegion & { width: number; height: number };
  safeAreaInsets?: { top: number; bottom: number; left: number; right: number };
  renderConfig: ScentRenderConfig;
}

/** Generate evenly-spaced pixel positions along a straight line. */
function interpolatePoints(
  from: { x: number; y: number },
  to: { x: number; y: number },
  spacing: number
): { x: number; y: number; angle: number }[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < spacing) return [];

  const angle = Math.atan2(dy, dx);
  const count = Math.floor(dist / spacing);
  const points: { x: number; y: number; angle: number }[] = [];

  for (let i = 1; i <= count; i++) {
    const t = (i * spacing) / dist;
    points.push({ x: from.x + dx * t, y: from.y + dy * t, angle });
  }
  return points;
}

/** Build a single Skia chevron path centred at origin, pointing right (angle 0). */
function makeChevronPath(halfSize: number): string {
  // Points: left-back-top → tip → left-back-bottom
  return `M ${-halfSize} ${-halfSize} L ${halfSize} 0 L ${-halfSize} ${halfSize}`;
}

// ─── Animated overlay: flowing particles ──────────────────────────────────────

interface FlowingParticlesProps {
  from: { x: number; y: number };
  to: { x: number; y: number };
  color: string;
  trailWidth: number;
  duration: number;
  particleCount: number;
}

const FlowingParticles: React.FC<FlowingParticlesProps> = ({
  from,
  to,
  color,
  trailWidth,
  duration,
  particleCount,
}) => {
  const offset = useSharedValue(0);

  useEffect(() => {
    offset.value = withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1);
  }, [duration, offset]);

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const radius = trailWidth * 1.2;

  // Build per-particle animated transforms
  const particles = Array.from({ length: particleCount }, (_, i) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const transform = useDerivedValue(() => {
      const t = (i / particleCount + offset.value) % 1;
      return [{ translateX: from.x + dx * t }, { translateY: from.y + dy * t }];
    }, []);

    // Fade out particles near the endpoint for a dissolve effect
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const opacity = useDerivedValue(() => {
      const t = (i / particleCount + offset.value) % 1;
      // Full opacity mid-trail, fade near start and end
      return Math.sin(t * Math.PI);
    }, []);

    return { transform, opacity, key: i };
  });

  return (
    <>
      {particles.map(({ transform, opacity, key }) => (
        <Group key={key} transform={transform}>
          <Circle cx={0} cy={0} r={radius} color={color} opacity={opacity} />
        </Group>
      ))}
      {/* Faint guide line */}
      <Path
        path={(() => {
          const p = Skia.Path.Make();
          p.moveTo(from.x, from.y);
          p.lineTo(to.x, to.y);
          return p;
        })()}
        color={color}
        style="stroke"
        strokeWidth={0.5}
        opacity={0.25}
      />
    </>
  );
};

// ─── Animated overlay: pulse wave at waypoint ─────────────────────────────────

interface PulseRingProps {
  cx: number;
  cy: number;
  color: string;
  phase: number;
  duration: number;
  maxRadius: number;
}

const PulseRing: React.FC<PulseRingProps> = ({ cx, cy, color, phase, duration, maxRadius }) => {
  const progress = useSharedValue(phase);

  useEffect(() => {
    progress.value = phase;
    progress.value = withRepeat(
      withTiming(phase + 1, { duration, easing: Easing.out(Easing.quad) }),
      -1
    );
  }, [duration, phase, progress]);

  const radius = useDerivedValue(() => (progress.value % 1) * maxRadius, []);
  const opacity = useDerivedValue(() => 1 - (progress.value % 1), []);

  return (
    <Circle
      cx={cx}
      cy={cy}
      r={radius}
      color={color}
      opacity={opacity}
      style="stroke"
      strokeWidth={2}
    />
  );
};

interface PulseWaveProps {
  cx: number;
  cy: number;
  color: string;
  ringCount: number;
  duration: number;
  trailWidth: number;
}

const PulseWave: React.FC<PulseWaveProps> = ({
  cx,
  cy,
  color,
  ringCount,
  duration,
  trailWidth,
}) => {
  const maxRadius = 40 + trailWidth * 4;
  const phases = Array.from({ length: ringCount }, (_, i) => i / ringCount);

  return (
    <>
      {phases.map((phase) => (
        <PulseRing
          key={phase}
          cx={cx}
          cy={cy}
          color={color}
          phase={phase}
          duration={duration}
          maxRadius={maxRadius}
        />
      ))}
      {/* Static centre dot */}
      <Circle cx={cx} cy={cy} r={trailWidth * 1.5} color={color} opacity={0.9} />
    </>
  );
};

// ─── Rendering: pure presentational component ─────────────────────────────────

interface ScentTrailCanvasProps {
  width: number;
  height: number;
  pixelFrom: { x: number; y: number };
  pixelTo: { x: number; y: number };
  trailPoints: { x: number; y: number; angle: number }[];
  config: ScentRenderConfig;
}

const ScentTrailCanvas: React.FC<ScentTrailCanvasProps> = ({
  width,
  height,
  pixelFrom,
  pixelTo,
  trailPoints,
  config,
}) => {
  const {
    trailColor,
    trailWidth,
    trailStyle,
    showEndpoint,
    animationType,
    animationDuration,
    particleCount,
  } = config;
  const canvasStyle = { width, height };
  if (animationType === 'flow') {
    return (
      <View style={styles.container} pointerEvents="none">
        <Canvas style={canvasStyle} testID="scent-trail-canvas">
          <FlowingParticles
            from={pixelFrom}
            to={pixelTo}
            color={trailColor}
            trailWidth={trailWidth}
            duration={animationDuration}
            particleCount={particleCount}
          />
          {showEndpoint && (
            <Circle cx={pixelTo.x} cy={pixelTo.y} r={trailWidth * 2} color={trailColor} />
          )}
        </Canvas>
      </View>
    );
  }
  if (animationType === 'pulse') {
    return (
      <View style={styles.container} pointerEvents="none">
        <Canvas style={canvasStyle} testID="scent-trail-canvas">
          {trailPoints.map((pt) => (
            <Circle
              key={`${Math.round(pt.x)},${Math.round(pt.y)}`}
              cx={pt.x}
              cy={pt.y}
              r={trailWidth * 0.8}
              color={trailColor}
              opacity={0.4}
            />
          ))}
          <PulseWave
            cx={pixelTo.x}
            cy={pixelTo.y}
            color={trailColor}
            ringCount={particleCount}
            duration={animationDuration}
            trailWidth={trailWidth}
          />
        </Canvas>
      </View>
    );
  }
  if (trailStyle === 'arrows') {
    const chevronPath = makeChevronPath(ARROW_HALF);
    return (
      <View style={styles.container} pointerEvents="none">
        <Canvas style={canvasStyle} testID="scent-trail-canvas">
          {trailPoints.map((pt) => (
            <Group
              key={`${Math.round(pt.x)},${Math.round(pt.y)}`}
              transform={[{ translateX: pt.x }, { translateY: pt.y }, { rotate: pt.angle }]}
            >
              <Path
                path={Skia.Path.MakeFromSVGString(chevronPath) ?? Skia.Path.Make()}
                color={trailColor}
                style="stroke"
                strokeWidth={trailWidth}
                strokeCap="round"
                strokeJoin="round"
              />
            </Group>
          ))}
          {showEndpoint && (
            <Circle cx={pixelTo.x} cy={pixelTo.y} r={trailWidth * 2.5} color={trailColor} />
          )}
        </Canvas>
      </View>
    );
  }
  return (
    <View style={styles.container} pointerEvents="none">
      <Canvas style={canvasStyle} testID="scent-trail-canvas">
        {trailPoints.map((pt) => (
          <Circle
            key={`${Math.round(pt.x)},${Math.round(pt.y)}`}
            cx={pt.x}
            cy={pt.y}
            r={trailWidth}
            color={trailColor}
          />
        ))}
        {showEndpoint && (
          <Circle cx={pixelTo.x} cy={pixelTo.y} r={trailWidth * 2.5} color={trailColor} />
        )}
      </Canvas>
    </View>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const ScentTrail: React.FC<ScentTrailProps> = ({ mapRegion, safeAreaInsets, renderConfig }) => {
  const currentLocation = useAppSelector((s) => s.exploration.currentLocation);
  const segments = useAppSelector((s) => s.street.segments);
  const exploredSegmentIds = useAppSelector((s) => s.street.exploredSegmentIds);
  const segmentArray = useMemo(() => Object.values(segments), [segments]);

  const waypoint = useMemo(() => {
    if (!currentLocation || segmentArray.length === 0) return null;
    const results = findClosestStreets({
      segments: segmentArray,
      exploredIds: exploredSegmentIds,
      comparisonPoint: { latitude: currentLocation.latitude, longitude: currentLocation.longitude },
      numResults: 1,
      filter: 'unexplored',
    });
    return results[0]?.closestPoint ?? null;
  }, [currentLocation, segmentArray, exploredSegmentIds]);

  const pixelFrom = useMemo(() => {
    if (!currentLocation || !mapRegion.width) return null;
    return geoPointToPixel(currentLocation, mapRegion, safeAreaInsets);
  }, [currentLocation, mapRegion, safeAreaInsets]);

  const pixelTo = useMemo(() => {
    if (!waypoint || !mapRegion.width) return null;
    return geoPointToPixel(
      { latitude: waypoint.latitude, longitude: waypoint.longitude, timestamp: 0 },
      mapRegion,
      safeAreaInsets
    );
  }, [waypoint, mapRegion, safeAreaInsets]);

  const trailPoints = useMemo(() => {
    if (!pixelFrom || !pixelTo) return [];
    return interpolatePoints(pixelFrom, pixelTo, TRAIL_SPACING_PX);
  }, [pixelFrom, pixelTo]);

  if (!pixelFrom || !pixelTo || !mapRegion.width || !mapRegion.height) return null;

  return (
    <ScentTrailCanvas
      width={mapRegion.width}
      height={mapRegion.height}
      pixelFrom={pixelFrom}
      pixelTo={pixelTo}
      trailPoints={trailPoints}
      config={renderConfig}
    />
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
});

export default ScentTrail;
