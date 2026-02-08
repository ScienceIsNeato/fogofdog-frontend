import * as FileSystem from 'expo-file-system';
import { Asset } from 'expo-asset';
import { logger } from '../utils/logger';

/**
 * TileAssetManager
 *
 * Manages extraction of bundled tile assets to the filesystem
 * so they can be loaded by UrlTile with file:// URLs.
 *
 * For MVP: Extracts cartoon skin tiles to DocumentDirectory
 * Future: Support downloading tiles from remote servers
 */
class TileAssetManagerClass {
  private initialized: boolean = false;
  private readonly tilesDirectory: string;

  // Map of bundled tile assets (z/x/y -> require() asset)
  private readonly bundledTiles: Record<string, number> = {
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

  constructor() {
    this.tilesDirectory = `${FileSystem.documentDirectory}skins/`;
  }

  /**
   * Initialize tile assets by extracting them to the filesystem
   * Should be called once on app startup
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.debug('TileAssetManager already initialized', {
        component: 'TileAssetManager',
        action: 'initialize',
      });
      return;
    }

    logger.info('Initializing TileAssetManager - extracting tiles', {
      component: 'TileAssetManager',
      action: 'initialize',
      tileCount: Object.keys(this.bundledTiles).length,
    });

    try {
      // Ensure tiles directory exists
      await FileSystem.makeDirectoryAsync(this.tilesDirectory, { intermediates: true });

      // Extract each tile to filesystem
      const extractPromises = Object.entries(this.bundledTiles).map(([path, asset]) =>
        this.extractTile('cartoon', path, asset)
      );

      await Promise.all(extractPromises);

      this.initialized = true;
      logger.info('TileAssetManager initialization complete', {
        component: 'TileAssetManager',
        action: 'initialize',
        extractedCount: Object.keys(this.bundledTiles).length,
      });
    } catch (error) {
      logger.error('Failed to initialize TileAssetManager', {
        component: 'TileAssetManager',
        action: 'initialize',
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw - app should continue without tiles
    }
  }

  /**
   * Extract a single tile from bundled assets to filesystem
   */
  private async extractTile(skinId: string, tilePath: string, asset: number): Promise<void> {
    const destinationPath = `${this.tilesDirectory}${skinId}/${tilePath}.png`;

    // Check if tile already exists
    const fileInfo = await FileSystem.getInfoAsync(destinationPath);
    if (fileInfo.exists) {
      logger.debug(`Tile already exists: ${tilePath}`, {
        component: 'TileAssetManager',
        action: 'extractTile',
        path: tilePath,
      });
      return;
    }

    try {
      // Load asset to get its local URI
      const assetModule = Asset.fromModule(asset);
      await assetModule.downloadAsync();

      if (!assetModule.localUri) {
        throw new Error('Asset local URI not available');
      }

      // Create directory structure
      const directory = destinationPath.substring(0, destinationPath.lastIndexOf('/'));
      await FileSystem.makeDirectoryAsync(directory, { intermediates: true });

      // Copy file
      await FileSystem.copyAsync({
        from: assetModule.localUri,
        to: destinationPath,
      });

      logger.debug(`Extracted tile: ${tilePath}`, {
        component: 'TileAssetManager',
        action: 'extractTile',
        path: tilePath,
        destination: destinationPath,
      });
    } catch (error) {
      logger.warn(`Failed to extract tile: ${tilePath}`, {
        component: 'TileAssetManager',
        action: 'extractTile',
        path: tilePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get the URL template for a skin's tiles
   * Returns a file:// URL template compatible with UrlTile
   *
   * @param skinId - ID of the skin
   * @returns URL template with {z}, {x}, {y} placeholders
   */
  getUrlTemplate(skinId: string): string {
    return `file://${this.tilesDirectory}${skinId}/{z}/{x}/{y}.png`;
  }

  /**
   * Check if tiles are initialized and available
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Reset initialization (for testing)
   */
  reset(): void {
    this.initialized = false;
  }
}

// Export singleton instance
export const TileAssetManager = new TileAssetManagerClass();
