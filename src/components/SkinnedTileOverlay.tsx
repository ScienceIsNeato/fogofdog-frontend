import React, { useMemo, useEffect, useState } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import type { Region } from 'react-native-maps';
import { getTilesInRegion, getOptimalTileZoom, getTileBounds } from '../utils/tileUtils';
import { TileCacheService, TileImage } from '../services/TileCacheService';
import { logger } from '../utils/logger';

interface SkinnedTileOverlayProps {
  mapRegion: Region & { width: number; height: number };
  activeSkin: string | null;
  safeAreaInsets?: { top: number; bottom: number; left: number; right: number };
}

/**
 * Calculate pixel position for a tile on the screen
 * Converts geographic tile bounds to screen coordinates
 */
function tileToScreenPosition(
  tileBounds: { north: number; south: number; east: number; west: number },
  mapRegion: Region & { width: number; height: number }
): { x: number; y: number; width: number; height: number } {
  const { latitude: centerLat, longitude: centerLon, latitudeDelta, longitudeDelta, width, height } = mapRegion;

  // Calculate center of tile
  const tileCenterLat = (tileBounds.north + tileBounds.south) / 2;
  const tileCenterLon = (tileBounds.east + tileBounds.west) / 2;

  // Calculate offset from map center as fraction of visible region
  const latFraction = (centerLat - tileCenterLat) / latitudeDelta;
  const lonFraction = (tileCenterLon - centerLon) / longitudeDelta;

  // Convert to screen pixels
  const centerX = width / 2;
  const centerY = height / 2;
  const x = centerX + lonFraction * width;
  const y = centerY + latFraction * height;

  // Calculate tile size in pixels
  const tileLatDelta = tileBounds.north - tileBounds.south;
  const tileLonDelta = tileBounds.east - tileBounds.west;
  const tileWidth = (tileLonDelta / longitudeDelta) * width;
  const tileHeight = (tileLatDelta / latitudeDelta) * height;

  return {
    x: x - tileWidth / 2,
    y: y - tileHeight / 2,
    width: tileWidth,
    height: tileHeight,
  };
}

/**
 * Hook to load and manage tiles for current viewport
 */
function useTileLoading(
  activeSkin: string | null,
  mapRegion: Region & { width: number; height: number }
): { tiles: Map<string, { tile: TileImage; position: { x: number; y: number; width: number; height: number } }> } {
  const [tiles, setTiles] = useState<
    Map<string, { tile: TileImage; position: { x: number; y: number; width: number; height: number } }>
  >(new Map());

  // Calculate optimal zoom level
  const tileZoom = useMemo(
    () => getOptimalTileZoom(mapRegion.latitudeDelta, mapRegion.height),
    [mapRegion.latitudeDelta, mapRegion.height]
  );

  // Get tiles for current viewport
  const tileCoordinates = useMemo(() => {
    if (!activeSkin) return [];
    return getTilesInRegion(mapRegion, tileZoom);
  }, [activeSkin, mapRegion, tileZoom]);

  // Load tiles
  useEffect(() => {
    if (!activeSkin || tileCoordinates.length === 0) {
      setTiles(new Map());
      return;
    }

    logger.debug(`Loading ${tileCoordinates.length} tiles for skin: ${activeSkin}`, {
      component: 'SkinnedTileOverlay',
      action: 'useTileLoading',
      skinId: activeSkin,
      tileCount: tileCoordinates.length,
      zoom: tileZoom,
    });

    const newTiles = new Map<
      string,
      { tile: TileImage; position: { x: number; y: number; width: number; height: number } }
    >();

    // Load all tiles asynchronously
    const loadPromises = tileCoordinates.map(async (coord) => {
      try {
        const tileImage = await TileCacheService.getTile(activeSkin, coord);
        if (tileImage) {
          const bounds = getTileBounds(coord);
          const position = tileToScreenPosition(bounds, mapRegion);
          newTiles.set(tileImage.key, { tile: tileImage, position });
        }
      } catch (error) {
        logger.warn(`Failed to load tile: ${coord.z}/${coord.x}/${coord.y}`, {
          component: 'SkinnedTileOverlay',
          action: 'loadTile',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    Promise.all(loadPromises).then(() => {
      setTiles(newTiles);
      logger.info(`Loaded ${newTiles.size} tiles`, {
        component: 'SkinnedTileOverlay',
        action: 'useTileLoading',
        loadedCount: newTiles.size,
        requestedCount: tileCoordinates.length,
      });
    });
  }, [activeSkin, tileCoordinates, tileZoom, mapRegion]);

  return { tiles };
}

/**
 * Render a single tile
 */
const TileRenderer: React.FC<{
  tile: TileImage;
  position: { x: number; y: number; width: number; height: number };
}> = ({ tile, position }) => {
  return (
    <Image
      key={tile.key}
      source={tile.source}
      style={[
        styles.tile,
        {
          left: position.x,
          top: position.y,
          width: position.width,
          height: position.height,
        },
      ]}
      resizeMode="cover"
    />
  );
};

/**
 * SkinnedTileOverlay Component
 *
 * Renders skinned map tiles over the base MapView
 * - Calculates visible tiles based on viewport
 * - Loads tiles from TileCacheService
 * - Positions tiles accurately using geographic bounds
 * - Only renders when activeSkin is set
 */
const SkinnedTileOverlay: React.FC<SkinnedTileOverlayProps> = ({ mapRegion, activeSkin }) => {
  const { tiles } = useTileLoading(activeSkin, mapRegion);

  // Don't render anything if no active skin
  if (!activeSkin) {
    return null;
  }

  // Don't render if no tiles loaded
  if (tiles.size === 0) {
    logger.debug('No tiles loaded for rendering', {
      component: 'SkinnedTileOverlay',
      action: 'render',
      activeSkin,
    });
    return null;
  }

  logger.throttledDebug(
    'SkinnedTileOverlay:render',
    `Rendering ${tiles.size} skinned tiles`,
    {
      component: 'SkinnedTileOverlay',
      action: 'render',
      tileCount: tiles.size,
      activeSkin,
    },
    2000 // 2 second throttle
  );

  return (
    <View style={styles.container} pointerEvents="none" testID="skinned-tile-overlay">
      {Array.from(tiles.values()).map(({ tile, position }) => (
        <TileRenderer key={tile.key} tile={tile} position={position} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1, // Above map, below fog
  },
  tile: {
    position: 'absolute',
    opacity: 0.9, // Slight transparency to blend with base map
  },
});

export default React.memo(SkinnedTileOverlay);
