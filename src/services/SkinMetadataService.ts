import { Skin, loadSkinMetadata } from '../store/slices/skinSlice';
import { logger } from '../utils/logger';
import type { AppDispatch } from '../store';

/**
 * SkinMetadataService
 *
 * Manages loading and initialization of skin metadata
 * For MVP: loads from a hardcoded list
 * Future: will load from bundled metadata.json or remote API
 */
class SkinMetadataServiceClass {
  private initialized: boolean;

  constructor() {
    this.initialized = false;
  }

  /**
   * Initialize skin metadata and load available skins
   * Should be called once on app startup
   *
   * @param dispatch - Redux dispatch function
   */
  async initialize(dispatch: AppDispatch): Promise<void> {
    if (this.initialized) {
      logger.warn('SkinMetadataService already initialized', {
        component: 'SkinMetadataService',
        action: 'initialize',
      });
      return;
    }

    logger.info('Initializing SkinMetadataService', {
      component: 'SkinMetadataService',
      action: 'initialize',
    });

    try {
      const availableSkins = await this.loadAvailableSkins();
      dispatch(loadSkinMetadata(availableSkins));
      this.initialized = true;

      logger.info(`Loaded ${availableSkins.length} available skins`, {
        component: 'SkinMetadataService',
        action: 'initialize',
        skinCount: availableSkins.length,
      });
    } catch (error) {
      logger.error('Failed to initialize SkinMetadataService', {
        component: 'SkinMetadataService',
        action: 'initialize',
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw - app should continue without skins
    }
  }

  /**
   * Load available skins
   * Loads cartoon skin from bundled metadata
   */
  private async loadAvailableSkins(): Promise<Skin[]> {
    // Load cartoon skin metadata from bundled JSON
    const cartoonMetadata = require('../../assets/skins/cartoon/metadata.json');

    const skins: Skin[] = [
      {
        id: cartoonMetadata.skinId,
        name: cartoonMetadata.name,
        description: cartoonMetadata.description,
        previewImage: '', // No preview image for MVP
        isDownloaded: true, // Tiles are bundled in assets
        coverage: 'local', // Local bundled tiles
      },
    ];

    logger.debug('Loaded available skins', {
      component: 'SkinMetadataService',
      action: 'loadAvailableSkins',
      skinCount: skins.length,
      skins: skins.map((s) => s.id),
    });

    return skins;
  }

  /**
   * Get a specific skin by ID
   *
   * @param skinId - ID of the skin
   * @returns Skin metadata or null if not found
   */
  async getSkin(skinId: string): Promise<Skin | null> {
    const skins = await this.loadAvailableSkins();
    return skins.find((s) => s.id === skinId) ?? null;
  }

  /**
   * Check if a skin is available and downloaded
   *
   * @param skinId - ID of the skin
   * @returns true if skin is available and downloaded
   */
  async isSkinAvailable(skinId: string): Promise<boolean> {
    const skin = await this.getSkin(skinId);
    return skin?.isDownloaded ?? false;
  }
}

// Export singleton instance
export const SkinMetadataService = new SkinMetadataServiceClass();
