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
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setInitializing } from '../store/slices/skinSlice';
import { initializeSkin, getUrlTemplate } from '../services/SkinAssetService';
import { logger } from '../utils/logger';
import type { SkinId } from '../store/slices/skinSlice';

const SkinTileOverlay: React.FC = () => {
  const dispatch = useAppDispatch();
  const activeSkin = useAppSelector((state) => state.skin.activeSkin);
  const [urlTemplate, setUrlTemplate] = useState<string | null>(null);
  const initializedSkins = useRef<Set<SkinId>>(new Set());
  /** Tracks the skin that triggered the current async initialization to prevent stale updates */
  const initRequestId = useRef(0);

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

    // Capture the skin for this initialization request so we can
    // detect stale completions if the user toggles skins quickly.
    const requestedSkin = activeSkin;
    const currentRequest = ++initRequestId.current;

    dispatch(setInitializing(true));
    logger.info(`Initializing skin assets: ${requestedSkin}`, {
      component: 'SkinTileOverlay',
      action: 'initializeSkin',
    });

    initializeSkin(requestedSkin)
      .then(() => {
        // Guard: discard if a newer activation superseded this one
        if (currentRequest !== initRequestId.current) {
          logger.debug(`Discarding stale skin init for: ${requestedSkin}`, {
            component: 'SkinTileOverlay',
            action: 'initializeSkin',
          });
          return;
        }
        initializedSkins.current.add(requestedSkin);
        setUrlTemplate(getUrlTemplate(requestedSkin));
        dispatch(setInitializing(false));
        logger.info(`Skin ready: ${requestedSkin}`, {
          component: 'SkinTileOverlay',
          action: 'initializeSkin',
        });
      })
      .catch((err) => {
        if (currentRequest !== initRequestId.current) return;
        logger.warn(`Skin initialization failed: ${err}`, {
          component: 'SkinTileOverlay',
          action: 'initializeSkin',
          skin: requestedSkin,
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
