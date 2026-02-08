/**
 * Skin style validation tests
 *
 * Validates that:
 * 1. MapLibre style JSON files exist and are parseable
 * 2. Style JSON files conform to the MapLibre Style Spec basics
 * 3. SkinStyleService returns valid styles for known skin IDs
 */

import * as fs from 'fs';
import * as path from 'path';
import { getSkinStyle, getAvailableSkinIds } from '../../services/SkinStyleService';

const SKINS_DIR = path.resolve(__dirname, '../../../assets/skins');

describe('Skin style validation', () => {
  describe('style JSON files', () => {
    const expectedStyles = ['cartoon.json', 'standard.json'];

    it.each(expectedStyles)('%s exists and is valid JSON', (filename) => {
      const filePath = path.join(SKINS_DIR, filename);
      expect(fs.existsSync(filePath)).toBe(true);

      const raw = fs.readFileSync(filePath, 'utf-8');
      const style = JSON.parse(raw);
      expect(style).toBeDefined();
    });

    it.each(expectedStyles)('%s has required MapLibre style spec fields', (filename) => {
      const filePath = path.join(SKINS_DIR, filename);
      const style = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      // Required top-level fields per MapLibre Style Spec
      expect(style).toHaveProperty('version', 8);
      expect(style).toHaveProperty('sources');
      expect(style).toHaveProperty('layers');
      expect(Array.isArray(style.layers)).toBe(true);
      expect(style.layers.length).toBeGreaterThan(0);
    });

    it.each(expectedStyles)('%s defines at least one tile source', (filename) => {
      const filePath = path.join(SKINS_DIR, filename);
      const style = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      const sourceKeys = Object.keys(style.sources);
      expect(sourceKeys.length).toBeGreaterThan(0);

      // Each source should have a type
      for (const key of sourceKeys) {
        expect(style.sources[key]).toHaveProperty('type');
      }
    });

    it('cartoon style is visually distinct from standard style', () => {
      const cartoon = JSON.parse(fs.readFileSync(path.join(SKINS_DIR, 'cartoon.json'), 'utf-8'));
      const standard = JSON.parse(fs.readFileSync(path.join(SKINS_DIR, 'standard.json'), 'utf-8'));

      // Styles should have different layer paint properties
      const cartoonStr = JSON.stringify(cartoon.layers);
      const standardStr = JSON.stringify(standard.layers);
      expect(cartoonStr).not.toEqual(standardStr);
    });
  });

  describe('SkinStyleService', () => {
    it('returns available skin IDs', () => {
      const ids = getAvailableSkinIds();
      expect(ids.length).toBeGreaterThan(0);
      expect(ids).toContain('cartoon');
      expect(ids).toContain('none'); // 'none' maps to standard style
    });

    it('returns a style object for each available skin', () => {
      const ids = getAvailableSkinIds();

      for (const id of ids) {
        const style = getSkinStyle(id);
        expect(style).toBeDefined();
        expect(style).toHaveProperty('version', 8);
        expect(style).toHaveProperty('sources');
        expect(style).toHaveProperty('layers');
      }
    });

    it('returns a fallback style for unknown skin IDs', () => {
      const style = getSkinStyle('nonexistent-skin' as any);
      expect(style).toBeDefined();
      expect(style).toHaveProperty('version', 8);
    });
  });
});
