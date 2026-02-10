/**
 * SkinStyleService
 *
 * Maps skin identifiers to MapLibre GL style JSON objects. Each "skin" is a
 * complete MapLibre Style Specification document that controls how vector tiles
 * are rendered — colors, line widths, fonts, fill patterns, etc.
 *
 * This replaces the old SkinAssetService which copied raster PNG tiles to disk.
 * With MapLibre, a skin is just a ~50KB JSON file, not thousands of PNG tiles.
 *
 * Vector tile data comes from OpenFreeMap (free, no API key required).
 *
 * Future: Style JSONs could be fetched from a remote API for user-created skins,
 * procedurally generated styles, or seasonal/event themes.
 */

import type { SkinId } from '../store/slices/skinSlice';

// Import bundled style JSON files
import cartoonStyle from '../../assets/skins/cartoon.json';
import standardStyle from '../../assets/skins/standard.json';

/**
 * Registry of available skin styles.
 * 'none' uses the standard OpenStreetMap-like style.
 */
const SKIN_STYLES: Record<SkinId, object> = {
  none: standardStyle,
  cartoon: cartoonStyle,
};

/**
 * Returns the MapLibre style JSON object for a given skin.
 * Pass this directly to MapView's `mapStyle` prop.
 */
export function getSkinStyle(skinId: SkinId): object {
  return SKIN_STYLES[skinId] ?? SKIN_STYLES.none;
}

/**
 * Returns all available skin IDs with loaded styles.
 * Useful for building a skin picker UI.
 */
export function getAvailableSkinIds(): SkinId[] {
  return Object.keys(SKIN_STYLES) as SkinId[];
}
