import React, { useEffect } from 'react';
import { UrlTile } from 'react-native-maps';
import type { Region } from 'react-native-maps';
import { TileAssetManager } from '../services/TileAssetManager';
import { logger } from '../utils/logger';

interface SkinnedTileOverlayProps {
  mapRegion: Region & { width: number; height: number };
  activeSkin: string | null;
  safeAreaInsets?: { top: number; bottom: number; left: number; right: number };
}

/**
 * SkinnedTileOverlay Component
 *
 * Renders skinned map tiles using native UrlTile overlay.
 * Uses TileAssetManager to get file:// URLs for bundled tiles.
 *
 * This replaces the previous Image-based approach with proper native tile loading,
 * giving correct positioning and better performance.
 *
 * For MVP: Loads tiles from filesystem (extracted from bundled assets)
 * Future: Can easily switch to remote tile server by changing URL template
 */
const SkinnedTileOverlay: React.FC<SkinnedTileOverlayProps> = ({ activeSkin }) => {
  // Ensure TileAssetManager is initialized
  useEffect(() => {
    if (activeSkin && !TileAssetManager.isInitialized()) {
      logger.warn('TileAssetManager not initialized when skin activated', {
        component: 'SkinnedTileOverlay',
        action: 'useEffect',
        activeSkin,
      });
    }
  }, [activeSkin]);

  // Don't render anything if no active skin
  if (!activeSkin) {
    return null;
  }

  // Get URL template for this skin
  const urlTemplate = TileAssetManager.getUrlTemplate(activeSkin);

  logger.throttledDebug(
    'SkinnedTileOverlay:render',
    `Rendering native tile overlay for skin: ${activeSkin}`,
    {
      component: 'SkinnedTileOverlay',
      action: 'render',
      activeSkin,
      urlTemplate,
    },
    5000 // 5 second throttle
  );

  return (
    <UrlTile
      urlTemplate={urlTemplate}
      maximumZ={16}
      minimumZ={14}
      tileSize={256}
      opacity={0.9}
      zIndex={1} // Above base map, below markers/fog
    />
  );
};

export default React.memo(SkinnedTileOverlay);
