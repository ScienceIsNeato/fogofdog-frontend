import { Image, ImageSourcePropType } from 'react-native';
import { TileCoordinate, getTileKey } from '../utils/tileUtils';
import { logger } from '../utils/logger';

/**
 * Tile image data with metadata
 */
export interface TileImage {
  source: ImageSourcePropType;
  width: number;
  height: number;
  key: string;
}

/**
 * TileCacheService
 *
 * Manages loading and caching of skinned map tiles
 * For MVP: loads tiles from bundled assets
 * Future: will support remote tile loading and caching
 */
class TileCacheServiceClass {
  private cache: Map<string, TileImage>;
  private maxCacheSize: number;
  private loadingPromises: Map<string, Promise<TileImage | null>>;

  constructor() {
    this.cache = new Map();
    this.maxCacheSize = 100; // Limit cache to 100 tiles (about 6.4MB for 256x256 RGBA)
    this.loadingPromises = new Map();
  }

  /**
   * Get a tile from cache or load it from assets
   *
   * @param skinId - ID of the skin
   * @param coord - Tile coordinate
   * @returns Tile image or null if not found
   */
  async getTile(skinId: string, coord: TileCoordinate): Promise<TileImage | null> {
    const key = `${skinId}/${getTileKey(coord)}`;

    // Check memory cache first
    const cached = this.cache.get(key);
    if (cached) {
      logger.debug(`Tile cache hit: ${key}`, {
        component: 'TileCacheService',
        action: 'getTile',
        key,
      });
      return cached;
    }

    // Check if already loading
    const existingPromise = this.loadingPromises.get(key);
    if (existingPromise) {
      logger.debug(`Tile already loading: ${key}`, {
        component: 'TileCacheService',
        action: 'getTile',
        key,
      });
      return existingPromise;
    }

    // Load from assets
    const loadPromise = this.loadFromAssets(skinId, coord, key);
    this.loadingPromises.set(key, loadPromise);

    try {
      return await loadPromise;
    } finally {
      this.loadingPromises.delete(key);
    }
  }

  /**
   * Load a tile from bundled assets
   *
   * @param skinId - ID of the skin
   * @param coord - Tile coordinate
   * @param key - Cache key
   * @returns Tile image or null if not found
   */
  private async loadFromAssets(
    skinId: string,
    coord: TileCoordinate,
    key: string
  ): Promise<TileImage | null> {
    try {
      logger.debug(`Loading tile from assets: ${key}`, {
        component: 'TileCacheService',
        action: 'loadFromAssets',
        key,
        skinId,
        coord,
      });

      // Construct asset path
      // Expected format: assets/skins/{skinId}/{z}/{x}/{y}.png
      const assetPath = `../assets/skins/${skinId}/${coord.z}/${coord.x}/${coord.y}.png`;

      // In React Native, we need to use require() for local assets
      // But we can't use dynamic require() paths, so we'll need to preload the manifest
      // For MVP, we'll use a hardcoded mapping for the cartoon skin

      const source = this.getAssetSource(skinId, coord);
      if (!source) {
        logger.warn(`Tile not found in assets: ${key}`, {
          component: 'TileCacheService',
          action: 'loadFromAssets',
          key,
          assetPath,
        });
        return null;
      }

      // Validate image can be loaded
      const size = await this.getImageSize(source);
      if (!size) {
        logger.warn(`Failed to load tile image: ${key}`, {
          component: 'TileCacheService',
          action: 'loadFromAssets',
          key,
        });
        return null;
      }

      const tile: TileImage = {
        source,
        width: size.width,
        height: size.height,
        key,
      };

      // Add to cache (with LRU eviction if needed)
      this.addToCache(key, tile);

      logger.info(`Tile loaded successfully: ${key}`, {
        component: 'TileCacheService',
        action: 'loadFromAssets',
        key,
        width: size.width,
        height: size.height,
      });

      return tile;
    } catch (error) {
      logger.error(`Error loading tile: ${key}`, {
        component: 'TileCacheService',
        action: 'loadFromAssets',
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Get image size asynchronously
   *
   * @param source - Image source
   * @returns Image dimensions or null if failed
   */
  private async getImageSize(source: ImageSourcePropType): Promise<{ width: number; height: number } | null> {
    return new Promise((resolve) => {
      Image.getSize(
        typeof source === 'number' ? Image.resolveAssetSource(source).uri : (source as { uri: string }).uri,
        (width, height) => resolve({ width, height }),
        () => resolve(null)
      );
    });
  }

  /**
   * Get asset source for a tile
   * Loads tile images from bundled assets
   *
   * @param skinId - Skin ID
   * @param coord - Tile coordinate
   * @returns Image source or null if not available
   */
  private getAssetSource(skinId: string, coord: TileCoordinate): ImageSourcePropType | null {
    if (skinId !== 'cartoon') {
      return null;
    }

    // Load cartoon skin tiles
    // Generated tiles cover Dolores Park at zoom 14-16
    const tileKey = `${coord.z}/${coord.x}/${coord.y}`;

    try {
      // Attempt to require the tile
      // React Native bundler will only include tiles that exist
      const tileMap: { [key: string]: ImageSourcePropType } = {
        '14/2621/6333': require('../../assets/skins/cartoon/14/2621/6333.png'),
        '14/2621/6334': require('../../assets/skins/cartoon/14/2621/6334.png'),
        '14/2622/6333': require('../../assets/skins/cartoon/14/2622/6333.png'),
        '14/2622/6334': require('../../assets/skins/cartoon/14/2622/6334.png'),
        '15/5242/12666': require('../../assets/skins/cartoon/15/5242/12666.png'),
        '15/5242/12667': require('../../assets/skins/cartoon/15/5242/12667.png'),
        '15/5243/12666': require('../../assets/skins/cartoon/15/5243/12666.png'),
        '15/5243/12667': require('../../assets/skins/cartoon/15/5243/12667.png'),
        '15/5244/12666': require('../../assets/skins/cartoon/15/5244/12666.png'),
        '15/5244/12667': require('../../assets/skins/cartoon/15/5244/12667.png'),
        '16/10484/25332': require('../../assets/skins/cartoon/16/10484/25332.png'),
        '16/10484/25333': require('../../assets/skins/cartoon/16/10484/25333.png'),
        '16/10485/25332': require('../../assets/skins/cartoon/16/10485/25332.png'),
        '16/10485/25333': require('../../assets/skins/cartoon/16/10485/25333.png'),
      };

      const source = tileMap[tileKey];
      if (source) {
        logger.debug(`Found tile in asset map: ${tileKey}`, {
          component: 'TileCacheService',
          action: 'getAssetSource',
          tileKey,
        });
        return source;
      }

      logger.debug(`Tile not found in asset map: ${tileKey}`, {
        component: 'TileCacheService',
        action: 'getAssetSource',
        tileKey,
      });
      return null;
    } catch (error) {
      logger.warn(`Failed to load tile: ${tileKey}`, {
        component: 'TileCacheService',
        action: 'getAssetSource',
        tileKey,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Add tile to cache with LRU eviction
   *
   * @param key - Cache key
   * @param tile - Tile image
   */
  private addToCache(key: string, tile: TileImage): void {
    // If cache is full, remove oldest entry (first in Map)
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value as string;
      this.cache.delete(firstKey);
      logger.debug(`Evicted tile from cache: ${firstKey}`, {
        component: 'TileCacheService',
        action: 'addToCache',
        evictedKey: firstKey,
      });
    }

    this.cache.set(key, tile);
  }

  /**
   * Clear cache for a specific skin or all skins
   *
   * @param skinId - Optional skin ID to clear (clears all if not specified)
   */
  async clearCache(skinId?: string): Promise<void> {
    if (skinId) {
      // Clear only tiles for this skin
      const keysToDelete: string[] = [];
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${skinId}/`)) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach((key) => this.cache.delete(key));
      logger.info(`Cleared cache for skin: ${skinId}`, {
        component: 'TileCacheService',
        action: 'clearCache',
        skinId,
        clearedCount: keysToDelete.length,
      });
    } else {
      // Clear all tiles
      const size = this.cache.size;
      this.cache.clear();
      logger.info('Cleared entire tile cache', {
        component: 'TileCacheService',
        action: 'clearCache',
        clearedCount: size,
      });
    }
  }

  /**
   * Get cache statistics
   *
   * @returns Cache stats
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
    };
  }

  /**
   * Preload tiles for a list of coordinates
   * Useful for preloading visible tiles before they're needed
   *
   * @param skinId - Skin ID
   * @param coords - Array of tile coordinates
   * @returns Promise that resolves when all tiles are loaded or failed
   */
  async preloadTiles(skinId: string, coords: TileCoordinate[]): Promise<void> {
    logger.info(`Preloading ${coords.length} tiles for skin: ${skinId}`, {
      component: 'TileCacheService',
      action: 'preloadTiles',
      skinId,
      tileCount: coords.length,
    });

    const promises = coords.map((coord) => this.getTile(skinId, coord));
    await Promise.all(promises);

    logger.info(`Preloaded tiles complete`, {
      component: 'TileCacheService',
      action: 'preloadTiles',
      skinId,
      tileCount: coords.length,
    });
  }
}

// Export singleton instance
export const TileCacheService = new TileCacheServiceClass();
