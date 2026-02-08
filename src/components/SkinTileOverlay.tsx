/**
 * SkinTileOverlay
 *
 * Renders custom skin tiles inside the MapView using react-native-maps UrlTile.
 * When a skin is active, this overlay sits between the Google Maps base layer
 * and the FogOverlay. The UrlTile covers the entire map viewport with styled tiles,
 * and the FogOverlay cuts holes to reveal them in explored areas.
 *
 * When no skin is active ('none'), this component renders nothing.
 *
 * Architecture:
 *   [MapView (Google Maps)]
 *     [SkinTileOverlay] ← this component (UrlTile inside MapView)
 *   [FogOverlay (Skia canvas, above MapView)]
 */

import React, { useEffect, useRef, useState } from 'react';
import { UrlTile } from 'react-native-maps';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../store';
import { setInitializing } from '../store/slices/skinSlice';
import { initializeSkin, getUrlTemplate } from '../services/SkinAssetService';
import { logger } from '../utils/logger';
import type { SkinId } from '../store/slices/skinSlice';

const SkinTileOverlay: React.FC = () => {
  const dispatch = useDispatch();
  const activeSkin = useSelector((state: RootState) => state.skin.activeSkin);
  const [urlTemplate, setUrlTemplate] = useState<string | null>(null);
  const initializedSkins = useRef<Set<SkinId>>(new Set());

  useEffect(() => {
    if (activeSkin === 'none') {
      setUrlTemplate(null);
      return;
    }

    // Already initialized — just update URL template
    if (initializedSkins.current.has(activeSkin)) {
      setUrlTemplate(getUrlTemplate(activeSkin));
      return;
    }

    // First time activating this skin — copy assets to file system
    dispatch(setInitializing(true));
    logger.info(`Initializing skin assets: ${activeSkin}`, {
      component: 'SkinTileOverlay',
      action: 'initializeSkin',
    });

    initializeSkin(activeSkin)
      .then(() => {
        initializedSkins.current.add(activeSkin);
        setUrlTemplate(getUrlTemplate(activeSkin));
        dispatch(setInitializing(false));
        logger.info(`Skin ready: ${activeSkin}`, {
          component: 'SkinTileOverlay',
          action: 'initializeSkin',
        });
      })
      .catch((err) => {
        logger.warn(`Skin initialization failed: ${err}`, {
          component: 'SkinTileOverlay',
          action: 'initializeSkin',
          skin: activeSkin,
        });
        dispatch(setInitializing(false));
      });
  }, [activeSkin, dispatch]);

  if (!urlTemplate || activeSkin === 'none') {
    return null;
  }

  return (
    <UrlTile
      testID="skin-tile-overlay"
      urlTemplate={urlTemplate}
      maximumZ={16}
      minimumZ={13}
      tileSize={256}
      shouldReplaceMapContent={false}
      zIndex={1}
    />
  );
};

export default SkinTileOverlay;
