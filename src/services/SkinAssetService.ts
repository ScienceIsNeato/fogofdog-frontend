/**
 * SkinAssetService
 *
 * Manages pre-generated skin tile assets. Bundles cartoon tile images are copied
 * from the app asset bundle to the local file system on first use, then served
 * to react-native-maps UrlTile via file:// URLs.
 *
 * Why file://?
 * UrlTile requires a URL template. In Expo, bundled assets are not directly
 * addressable as files. We use expo-file-system to copy assets to
 * FileSystem.documentDirectory, which provides a stable file:// path.
 *
 * Future migration path: Replace the file:// URL template with a remote API URL
 * (e.g. https://api.fogofdog.com/tiles/{skin}/{z}/{x}/{y}.png) when server-side
 * tile generation is available. Only the getUrlTemplate() return value changes.
 */

import * as FileSystem from 'expo-file-system';
import { Asset } from 'expo-asset';
import { logger } from '../utils/logger';
import type { SkinId } from '../store/slices/skinSlice';

// Pre-generated cartoon tile coordinates for San Francisco test area
// These tiles cover GPS injection location (37.78825, -122.4324) and surroundings
const CARTOON_TILE_ASSETS: Record<string, ReturnType<typeof require>> = {
  // Zoom 13
  '13/1308/3164': require('../../assets/skins/cartoon/13/1308/3164.png'),
  '13/1308/3165': require('../../assets/skins/cartoon/13/1308/3165.png'),
  '13/1308/3166': require('../../assets/skins/cartoon/13/1308/3166.png'),
  '13/1309/3164': require('../../assets/skins/cartoon/13/1309/3164.png'),
  '13/1309/3165': require('../../assets/skins/cartoon/13/1309/3165.png'),
  '13/1309/3166': require('../../assets/skins/cartoon/13/1309/3166.png'),
  '13/1310/3164': require('../../assets/skins/cartoon/13/1310/3164.png'),
  '13/1310/3165': require('../../assets/skins/cartoon/13/1310/3165.png'),
  '13/1310/3166': require('../../assets/skins/cartoon/13/1310/3166.png'),
  // Zoom 14
  '14/2618/6330': require('../../assets/skins/cartoon/14/2618/6330.png'),
  '14/2618/6331': require('../../assets/skins/cartoon/14/2618/6331.png'),
  '14/2618/6332': require('../../assets/skins/cartoon/14/2618/6332.png'),
  '14/2619/6330': require('../../assets/skins/cartoon/14/2619/6330.png'),
  '14/2619/6331': require('../../assets/skins/cartoon/14/2619/6331.png'),
  '14/2619/6332': require('../../assets/skins/cartoon/14/2619/6332.png'),
  '14/2620/6330': require('../../assets/skins/cartoon/14/2620/6330.png'),
  '14/2620/6331': require('../../assets/skins/cartoon/14/2620/6331.png'),
  '14/2620/6332': require('../../assets/skins/cartoon/14/2620/6332.png'),
  // Zoom 15
  '15/5237/12661': require('../../assets/skins/cartoon/15/5237/12661.png'),
  '15/5237/12662': require('../../assets/skins/cartoon/15/5237/12662.png'),
  '15/5237/12663': require('../../assets/skins/cartoon/15/5237/12663.png'),
  '15/5237/12664': require('../../assets/skins/cartoon/15/5237/12664.png'),
  '15/5237/12665': require('../../assets/skins/cartoon/15/5237/12665.png'),
  '15/5238/12661': require('../../assets/skins/cartoon/15/5238/12661.png'),
  '15/5238/12662': require('../../assets/skins/cartoon/15/5238/12662.png'),
  '15/5238/12663': require('../../assets/skins/cartoon/15/5238/12663.png'),
  '15/5238/12664': require('../../assets/skins/cartoon/15/5238/12664.png'),
  '15/5238/12665': require('../../assets/skins/cartoon/15/5238/12665.png'),
  '15/5239/12661': require('../../assets/skins/cartoon/15/5239/12661.png'),
  '15/5239/12662': require('../../assets/skins/cartoon/15/5239/12662.png'),
  '15/5239/12663': require('../../assets/skins/cartoon/15/5239/12663.png'),
  '15/5239/12664': require('../../assets/skins/cartoon/15/5239/12664.png'),
  '15/5239/12665': require('../../assets/skins/cartoon/15/5239/12665.png'),
  '15/5240/12661': require('../../assets/skins/cartoon/15/5240/12661.png'),
  '15/5240/12662': require('../../assets/skins/cartoon/15/5240/12662.png'),
  '15/5240/12663': require('../../assets/skins/cartoon/15/5240/12663.png'),
  '15/5240/12664': require('../../assets/skins/cartoon/15/5240/12664.png'),
  '15/5240/12665': require('../../assets/skins/cartoon/15/5240/12665.png'),
  '15/5241/12661': require('../../assets/skins/cartoon/15/5241/12661.png'),
  '15/5241/12662': require('../../assets/skins/cartoon/15/5241/12662.png'),
  '15/5241/12663': require('../../assets/skins/cartoon/15/5241/12663.png'),
  '15/5241/12664': require('../../assets/skins/cartoon/15/5241/12664.png'),
  '15/5241/12665': require('../../assets/skins/cartoon/15/5241/12665.png'),
};

const SKIN_ASSETS: Record<Exclude<SkinId, 'none'>, Record<string, ReturnType<typeof require>>> = {
  cartoon: CARTOON_TILE_ASSETS,
};

const SKIN_DIR = FileSystem.documentDirectory + 'skins/';

/**
 * Initializes a skin by copying tile assets to the local file system.
 * Safe to call multiple times — skips tiles that already exist.
 */
export async function initializeSkin(skinId: Exclude<SkinId, 'none'>): Promise<void> {
  const assets = SKIN_ASSETS[skinId];
  if (!assets) {
    logger.warn(`Unknown skin: ${skinId}`, {
      component: 'SkinAssetService',
      action: 'initializeSkin',
    });
    return;
  }

  const skinDir = SKIN_DIR + skinId + '/';
  logger.info(`Initializing skin: ${skinId}`, {
    component: 'SkinAssetService',
    action: 'initializeSkin',
    tileCount: Object.keys(assets).length,
  });

  const tileKeys = Object.keys(assets);
  await Promise.all(
    tileKeys.map(async (key) => {
      const destPath = skinDir + key + '.png';
      try {
        const info = await FileSystem.getInfoAsync(destPath);
        if (info.exists) return; // Already copied

        // Ensure directory exists
        const dir = destPath.substring(0, destPath.lastIndexOf('/'));
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

        // Load asset and copy to file system
        const asset = Asset.fromModule(assets[key]);
        await asset.downloadAsync();
        if (asset.localUri) {
          await FileSystem.copyAsync({ from: asset.localUri, to: destPath });
        }
      } catch (err) {
        logger.warn(`Failed to initialize tile ${key}: ${err}`, {
          component: 'SkinAssetService',
          action: 'initializeSkin',
          tile: key,
        });
      }
    })
  );

  logger.info(`Skin initialized: ${skinId}`, {
    component: 'SkinAssetService',
    action: 'initializeSkin',
  });
}

/**
 * Returns the UrlTile URL template for a given skin.
 * The template uses {z}/{x}/{y} placeholders as required by react-native-maps UrlTile.
 *
 * Future: Replace with remote API URL when server-side generation is available.
 */
export function getUrlTemplate(skinId: Exclude<SkinId, 'none'>): string {
  return SKIN_DIR + skinId + '/{z}/{x}/{y}.png';
}

/**
 * Checks if a specific tile exists locally for the given skin.
 */
export async function tileExists(
  skinId: Exclude<SkinId, 'none'>,
  z: number,
  x: number,
  y: number
): Promise<boolean> {
  const path = SKIN_DIR + skinId + '/' + z + '/' + x + '/' + y + '.png';
  try {
    const info = await FileSystem.getInfoAsync(path);
    return info.exists;
  } catch {
    return false;
  }
}
