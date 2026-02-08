import reducer, {
  setActiveSkin,
  clearActiveSkin,
  loadSkinMetadata,
  setLoading,
  setError,
  markSkinDownloaded,
  reset,
  Skin,
} from '../skinSlice';

describe('skinSlice', () => {
  const mockSkin: Skin = {
    id: 'cartoon',
    name: 'Cartoon',
    description: 'Bold outlines and simplified colors',
    previewImage: 'preview.png',
    isDownloaded: true,
    coverage: 'local',
  };

  const mockSkin2: Skin = {
    id: 'vintage',
    name: 'Vintage',
    description: 'Nostalgic sepia tones',
    previewImage: 'preview2.png',
    isDownloaded: false,
    coverage: 'global',
  };

  const initialState = {
    activeSkin: null,
    availableSkins: [],
    isLoading: false,
    error: null,
  };

  describe('initial state', () => {
    it('should return correct initial state', () => {
      const state = reducer(undefined, { type: 'unknown' });
      expect(state).toEqual(initialState);
    });
  });

  describe('setActiveSkin', () => {
    it('should set active skin when skin exists and is downloaded', () => {
      const state = reducer(
        { ...initialState, availableSkins: [mockSkin] },
        setActiveSkin('cartoon')
      );
      expect(state.activeSkin).toBe('cartoon');
      expect(state.error).toBeNull();
    });

    it('should clear active skin when passed null', () => {
      const state = reducer(
        { ...initialState, activeSkin: 'cartoon' },
        setActiveSkin(null)
      );
      expect(state.activeSkin).toBeNull();
    });

    it('should set error when skin does not exist', () => {
      const state = reducer(
        { ...initialState, availableSkins: [mockSkin] },
        setActiveSkin('nonexistent')
      );
      expect(state.activeSkin).toBeNull();
      expect(state.error).toContain('not found');
    });

    it('should set error when skin is not downloaded', () => {
      const state = reducer(
        { ...initialState, availableSkins: [mockSkin2] },
        setActiveSkin('vintage')
      );
      expect(state.activeSkin).toBeNull();
      expect(state.error).toContain('not downloaded');
    });
  });

  describe('clearActiveSkin', () => {
    it('should clear active skin', () => {
      const state = reducer(
        { ...initialState, activeSkin: 'cartoon' },
        clearActiveSkin()
      );
      expect(state.activeSkin).toBeNull();
    });

    it('should work when no active skin is set', () => {
      const state = reducer(initialState, clearActiveSkin());
      expect(state.activeSkin).toBeNull();
    });
  });

  describe('loadSkinMetadata', () => {
    it('should load available skins', () => {
      const skins = [mockSkin, mockSkin2];
      const state = reducer(initialState, loadSkinMetadata(skins));
      expect(state.availableSkins).toEqual(skins);
      expect(state.error).toBeNull();
    });

    it('should replace existing skins', () => {
      const existingState = { ...initialState, availableSkins: [mockSkin] };
      const newSkins = [mockSkin2];
      const state = reducer(existingState, loadSkinMetadata(newSkins));
      expect(state.availableSkins).toEqual(newSkins);
    });

    it('should handle empty array', () => {
      const state = reducer(initialState, loadSkinMetadata([]));
      expect(state.availableSkins).toEqual([]);
    });
  });

  describe('setLoading', () => {
    it('should set loading to true', () => {
      const state = reducer(initialState, setLoading(true));
      expect(state.isLoading).toBe(true);
    });

    it('should set loading to false', () => {
      const existingState = { ...initialState, isLoading: true };
      const state = reducer(existingState, setLoading(false));
      expect(state.isLoading).toBe(false);
    });
  });

  describe('setError', () => {
    it('should set error message', () => {
      const errorMessage = 'Test error';
      const state = reducer(initialState, setError(errorMessage));
      expect(state.error).toBe(errorMessage);
    });

    it('should clear error when passed null', () => {
      const existingState = { ...initialState, error: 'Previous error' };
      const state = reducer(existingState, setError(null));
      expect(state.error).toBeNull();
    });
  });

  describe('markSkinDownloaded', () => {
    it('should mark skin as downloaded', () => {
      const state = reducer(
        { ...initialState, availableSkins: [mockSkin2] },
        markSkinDownloaded('vintage')
      );
      expect(state.availableSkins[0]?.isDownloaded).toBe(true);
    });

    it('should do nothing if skin does not exist', () => {
      const state = reducer(
        { ...initialState, availableSkins: [mockSkin] },
        markSkinDownloaded('nonexistent')
      );
      expect(state.availableSkins).toEqual([mockSkin]);
    });
  });

  describe('reset', () => {
    it('should reset to initial state', () => {
      const modifiedState = {
        activeSkin: 'cartoon',
        availableSkins: [mockSkin],
        isLoading: true,
        error: 'Some error',
      };
      const state = reducer(modifiedState, reset());
      expect(state).toEqual(initialState);
    });
  });

  describe('complex scenarios', () => {
    it('should handle setting active skin after loading metadata', () => {
      let state = reducer(initialState, loadSkinMetadata([mockSkin, mockSkin2]));
      state = reducer(state, setActiveSkin('cartoon'));
      expect(state.activeSkin).toBe('cartoon');
      expect(state.availableSkins.length).toBe(2);
    });

    it('should clear error when successfully setting active skin', () => {
      let state = reducer({ ...initialState, error: 'Previous error' }, loadSkinMetadata([mockSkin]));
      state = reducer(state, setActiveSkin('cartoon'));
      expect(state.error).toBeNull();
    });

    it('should handle downloading and activating a skin', () => {
      let state = reducer(initialState, loadSkinMetadata([mockSkin2]));
      state = reducer(state, markSkinDownloaded('vintage'));
      state = reducer(state, setActiveSkin('vintage'));
      expect(state.activeSkin).toBe('vintage');
      expect(state.availableSkins[0]?.isDownloaded).toBe(true);
    });
  });
});
