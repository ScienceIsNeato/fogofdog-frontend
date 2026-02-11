/**
 * MapEffectOverlay
 *
 * Lightweight Skia Canvas drawn between the map tiles and the fog layer.
 * Renders the active map graphics effect (colour tint, animated pulse,
 * or radar sweep).
 *
 * Performance notes:
 * - When the active effect is 'map-none' (MapRenderConfig.overlayOpacity === 0
 *   and no animation), the component returns null immediately (zero cost).
 * - All animations use Reanimated SharedValues on the UI thread — no JS
 *   frame-budget impact during animation playback.
 * - This Canvas is separate from the fog Canvas so their render pipelines
 *   are independent; a slow fog rebuild does not stall the map tint.
 */
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas, Rect, Group, Paint, Circle } from '@shopify/react-native-skia';
import {
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
  useDerivedValue,
} from 'react-native-reanimated';
import type { MapRenderConfig } from '../types/graphics';

interface MapEffectOverlayProps {
  /** Pixel dimensions of the canvas (matches mapRegion width/height). */
  width: number;
  height: number;
  /** Pixel position of the user's marker (centre of radar sweeps). */
  userX: number;
  userY: number;
  /** Active map effect render config from GraphicsService. */
  renderConfig: MapRenderConfig;
}

/**
 * Pulse overlay: a solid colour Rect whose opacity oscillates.
 */
const PulseOverlay: React.FC<{
  width: number;
  height: number;
  color: string;
  baseOpacity: number;
  duration: number;
}> = ({ width, height, color, baseOpacity, duration }) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
  }, [duration, progress]);

  const opacity = useDerivedValue(() => baseOpacity + progress.value * baseOpacity, [baseOpacity]);

  return <Rect x={0} y={0} width={width} height={height} color={color} opacity={opacity} />;
};

/**
 * Radar sweep: a circle that rotates around the user's position.
 * Implemented as a Group with an animated rotation transform.
 */
const RadarSweepOverlay: React.FC<{
  width: number;
  height: number;
  userX: number;
  userY: number;
  color: string;
  opacity: number;
  duration: number;
}> = ({ width, height, userX, userY, color, opacity, duration }) => {
  const angle = useSharedValue(0);

  useEffect(() => {
    angle.value = withRepeat(withTiming(Math.PI * 2, { duration, easing: Easing.linear }), -1);
  }, [duration, angle]);

  // Compute the sweep arc as a Group rotated around the user's position.
  // We use a large radius that covers the canvas diagonal so no corner is missed.
  const diagonal = Math.sqrt(width * width + height * height);
  const sweepAngle = Math.PI / 5; // 36° arc width

  const transform = useDerivedValue(
    () => [{ translateX: userX }, { translateY: userY }, { rotate: angle.value }],
    [userX, userY]
  );

  const trailTransform = useDerivedValue(
    () => [
      { translateX: userX },
      { translateY: userY },
      { rotate: angle.value - sweepAngle * 0.8 },
    ],
    [userX, userY, sweepAngle]
  );

  return (
    <>
      {/* Main sweep arc */}
      <Group transform={transform}>
        <Paint color={color} opacity={opacity} />
        {/* Sweep rendered as a rotated circle — simplified from arc geometry */}
        <Circle cx={0} cy={-diagonal / 4} r={diagonal / 2.5} color={color} opacity={opacity} />
      </Group>
      {/* Trailing fade — slightly behind the main sweep */}
      <Group transform={trailTransform}>
        <Circle cx={0} cy={-diagonal / 4} r={diagonal / 3} color={color} opacity={opacity * 0.4} />
      </Group>
    </>
  );
};

/**
 * MapEffectOverlay — main component
 */
const MapEffectOverlay: React.FC<MapEffectOverlayProps> = ({
  width,
  height,
  userX,
  userY,
  renderConfig,
}) => {
  // Fast-path: if there's no overlay colour and no animation, skip rendering entirely.
  if (
    (!renderConfig.overlayColor || renderConfig.overlayOpacity <= 0) &&
    renderConfig.animationType === 'none'
  ) {
    return null;
  }

  // Guard against zero-size canvas (before layout fires)
  if (!width || !height) return null;

  const { overlayColor, overlayOpacity, animationType, animationDuration } = renderConfig;

  return (
    <View style={styles.container} pointerEvents="none">
      <Canvas style={{ width, height }} testID="map-effect-overlay-canvas">
        {/* Static tint layer (also present under animated effects as a base) */}
        {overlayColor && overlayOpacity > 0 && animationType === 'none' && (
          <Rect
            x={0}
            y={0}
            width={width}
            height={height}
            color={overlayColor}
            opacity={overlayOpacity}
          />
        )}

        {/* Animated pulse overlay */}
        {animationType === 'pulse' && overlayColor && (
          <PulseOverlay
            width={width}
            height={height}
            color={overlayColor}
            baseOpacity={overlayOpacity}
            duration={animationDuration}
          />
        )}

        {/* Radar sweep overlay */}
        {animationType === 'radar' && overlayColor && (
          <RadarSweepOverlay
            width={width}
            height={height}
            userX={userX}
            userY={userY}
            color={overlayColor}
            opacity={overlayOpacity}
            duration={animationDuration}
          />
        )}
      </Canvas>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
});

export default MapEffectOverlay;
