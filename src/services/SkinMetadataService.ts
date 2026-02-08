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
   * For MVP: returns a hardcoded list
   * Future: will read from assets/skins/metadata.json or API
   */
  private async loadAvailableSkins(): Promise<Skin[]> {
    // For MVP, return an empty list since we haven't generated tiles yet
    // This will be populated after we generate the cartoon skin tiles
    //
    // Future structure:
    // const skins: Skin[] = [
    //   {
    //     id: 'cartoon',
    //     name: 'Cartoon',
    //     description: 'Bold outlines and simplified flat colors',
    //     previewImage: '', // Will be populated with actual preview
    //     isDownloaded: true,
    //     coverage: 'local',
    //   },
    // ];

    const skins: Skin[] = [];

    logger.debug('Loaded available skins', {
      component: 'SkinMetadataService',
      action: 'loadAvailableSkins',
      skinCount: skins.length,
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
