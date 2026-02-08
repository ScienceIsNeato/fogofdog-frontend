# Map Skin System Planning

## Executive Summary

This document outlines the architecture and implementation plan for adding a procedural map skinning overlay system to FogOfDog. The system will allow users to apply visual "skins" (e.g., cartoon, vintage, neon) to the underlying Google Maps layer as they explore and reveal areas through fog-of-war gameplay.

**Critical Challenge**: The current app uses `react-native-maps` with a single, non-tiled map view. Implementing a tile-based skinning system requires significant architectural changes to enable tile-by-tile rendering and skin application.

---

## Current Architecture Analysis

### Map Rendering System

**Current Implementation** (`src/screens/Map/index.tsx`):
- Uses `react-native-maps` (Google Maps SDK wrapper)
- Renders a single, continuous MapView component
- NO tile-based system - just coordinates and zoom levels
- Map state managed via Redux (`explorationSlice`)
- Location tracking with GPS updates at ~100ms intervals

**Fog Overlay System** (`src/components/OptimizedFogOverlay.tsx`):
- Uses `@shopify/react-native-skia` for Canvas rendering
- Positioned absolutely over MapView with `pointerEvents="none"`
- Converts GPS coordinates to pixel coordinates via `mapUtils.ts`
- Creates "fog holes" by rendering black mask with transparent circles at explored locations
- Performance optimized:
  - Viewport culling (only render visible + 50% buffer)
  - Visual density reduction (skip points < 5px apart)
  - Maximum 5000 points per frame
  - Batch circle rendering with single Skia Path

**Key Files**:
- `src/screens/Map/index.tsx` - Main map screen with MapView
- `src/components/OptimizedFogOverlay.tsx` - Skia-based fog rendering
- `src/utils/mapUtils.ts` - Coordinate conversion utilities
- `src/store/slices/explorationSlice.ts` - GPS path tracking
- `src/components/UnifiedSettingsModal.tsx` - Settings UI pattern

### Identified Collisions and Challenges

#### 1. **No Tiling Concept**
- `react-native-maps` abstracts tiles completely - we only work with regions and coordinates
- No access to individual map tiles for per-tile processing
- No hooks into tile loading pipeline
- **Impact**: Major architectural change required

#### 2. **Coordinate Conversion is Per-Point**
- `geoPointToPixel()` converts lat/lon → screen pixels for each GPS point
- Works for point-based fog rendering but not tile-based systems
- **Impact**: Need new coordinate system for tiles (zoom/x/y like TMS/XYZ)

#### 3. **Single MapView Component**
- MapView renders entire world at once (at current zoom)
- No component boundaries aligned with tiles
- **Impact**: Need to either overlay tiles or replace MapView entirely

#### 4. **Skia Canvas Absolute Positioning**
- Fog overlay uses absolute positioning over entire screen
- Works because it's independent of MapView internals
- **Impact**: Tile overlays could follow similar pattern (good news!)

#### 5. **Performance Constraints**
- Already optimizing for 5000 GPS points per frame
- Adding tile rendering + skinning could compound performance issues
- **Impact**: Need efficient tile caching and lazy loading

---

## Proposed Architecture

### High-Level Approach: Hybrid Tile Overlay System

**Strategy**: Keep `react-native-maps` as base layer, add skinned tile overlay on top

**Rationale**:
1. Minimal disruption to existing fog system
2. Preserves GPS tracking and location services
3. Allows progressive enhancement - default map works, skins are optional
4. Follows same absolute positioning pattern as fog overlay

### Component Architecture

```
MapView (react-native-maps - unchanged)
  ↓
SkinnedTileOverlay (new - custom component)
  ├─ TileGrid (manages visible tiles)
  ├─ TileCache (stores skinned tiles)
  └─ TileRenderer (renders tiles to Canvas or Image components)
  ↓
OptimizedFogOverlay (minimal changes)
  └─ (continues to render fog holes based on GPS points)
```

### Tile System Design

#### Tile Coordinate System
- Use standard Web Mercator (EPSG:3857)
- Tile coordinates: `{z, x, y}` where:
  - `z` = zoom level (0-20)
  - `x` = tile column (0 to 2^z - 1)
  - `y` = tile row (0 to 2^z - 1)
- Standard tile size: 256×256 pixels

#### Tile Source Strategy

**Phase 1 (MVP - Current PR)**: Static Tile Screenshots
- Manually capture map tiles at specific coordinates
- Apply skin filter offline
- Store skinned tiles in `assets/skins/{skinName}/{z}/{x}/{y}.png`
- Limited coverage (only test area, e.g., 1km radius)
- **Pros**: Simple, no API calls, testable immediately
- **Cons**: Limited coverage, manual process, large bundle size

**Phase 2 (Future - Backend)**: Dynamic Tile Server
- Backend service generates tiles on-demand
- API: `GET /tiles/{skinName}/{z}/{x}/{y}.png`
- Caches generated tiles server-side
- **Pros**: Unlimited coverage, centralized updates
- **Cons**: Requires backend, network dependency

#### Tile Loading and Caching

```typescript
interface TileCoordinate {
  z: number; // zoom level
  x: number; // tile column
  y: number; // tile row
}

interface TileCache {
  get(key: string): Promise<ImageSource | null>;
  set(key: string, tile: ImageSource): Promise<void>;
  clear(): Promise<void>;
}

class TileManager {
  // Convert MapView region to tile coordinates
  getTilesForRegion(region: Region, zoom: number): TileCoordinate[];

  // Load tile from cache or source
  loadTile(coord: TileCoordinate, skinName: string): Promise<ImageSource>;

  // Preload tiles around current viewport
  preloadTiles(center: TileCoordinate, radius: number): Promise<void>;
}
```

---

## Skin Generation Approach

### Evaluated Options

#### Option 1: Neural Style Transfer
**Approach**: Use deep learning models (e.g., fast-style-transfer) to apply artistic style to map tiles

**Pros**:
- High-quality artistic results
- Flexible style application
- Many pre-trained models available

**Cons**:
- Heavy computational requirements (requires GPU)
- Slow processing (~10-60 seconds per tile)
- Large model files (50-100MB)
- Can't run in React Native (needs Python/TensorFlow)
- May lose map details (streets, labels)

**Verdict**: ❌ **Not feasible for MVP** - too slow, requires backend infrastructure

#### Option 2: Edge-Preserving Filters (OpenCV)
**Approach**: Use computer vision filters that preserve edges while stylizing

**Examples**:
- Bilateral filter (smooths while preserving edges)
- Edge detection + colorization
- Cartoonization (edge detect + color quantization + bilateral filter)

**Pros**:
- Fast processing (< 1 second per tile)
- Preserves street/label structure
- Can run in Node.js (via opencv4nodejs)
- Lighter weight than neural networks

**Cons**:
- Requires native bindings or backend
- Limited artistic flexibility
- May need tuning per map style

**Verdict**: ✅ **Best for MVP** - fast, preserves detail, achievable

#### Option 3: Procedural Color Mapping
**Approach**: Replace colors based on HSV/luminance mapping rules

**Example**:
```javascript
function applyCartoonSkin(pixel: RGBA): RGBA {
  // Detect roads (dark gray)
  if (isGray(pixel) && luminance(pixel) < 0.3) {
    return BLACK_WITH_OUTLINE;
  }
  // Detect water (blue)
  if (isBlue(pixel)) {
    return BRIGHT_CARTOON_BLUE;
  }
  // Detect parks (green)
  if (isGreen(pixel)) {
    return SIMPLIFIED_GREEN;
  }
  // Simplify other colors
  return quantizeColor(pixel, levels: 4);
}
```

**Pros**:
- Extremely fast (< 100ms per tile)
- Can run in JavaScript (canvas manipulation)
- Full control over color mapping
- Minimal dependencies

**Cons**:
- Requires manual tuning per skin
- Less sophisticated than CV or ML approaches
- May not generalize to all map types

**Verdict**: ✅ **Excellent for MVP** - simple, fast, controllable

### Recommended Approach: Hybrid

**For MVP (this PR)**:
1. Use **Procedural Color Mapping** for cartoon skin
   - Implement in Node.js script
   - Process tiles offline before bundling
   - Simple, fast, controllable

**For Future**:
2. Add **Edge-Preserving Filters** (OpenCV backend)
   - More sophisticated skins (painterly, vintage, etc.)
   - Backend generates tiles on-demand
   - Caches results for reuse

### MVP Skin: "Cartoon"

**Visual Characteristics**:
- Bold black outlines on roads (3-5px wide)
- Simplified, flat colors (4-6 color levels)
- High saturation for parks (bright green) and water (bright blue)
- White/cream for buildings
- Reduced texture and noise

**Implementation Plan**:
1. Create Node.js script: `scripts/generate-skin-tiles.js`
2. Input: Google Maps tiles (screenshots)
3. Process:
   - Load tile image
   - Apply edge detection (roads/boundaries)
   - Quantize colors to 4-6 levels
   - Boost saturation for parks/water
   - Overlay bold black edges
   - Save as PNG
4. Output: `assets/skins/cartoon/{z}/{x}/{y}.png`

---

## Implementation Plan

### Phase 1: Core Infrastructure

#### 1. Redux State Management
**File**: `src/store/slices/skinSlice.ts`

```typescript
interface SkinState {
  activeSkin: string | null; // "cartoon", "vintage", etc.
  availableSkins: Skin[];
  isLoading: boolean;
  error: string | null;
}

interface Skin {
  id: string;
  name: string;
  description: string;
  previewImage: string;
  isDownloaded: boolean;
  coverage: 'local' | 'global'; // for MVP, only local
}

// Actions:
// - setActiveSkin(skinId)
// - clearActiveSkin()
// - loadSkinMetadata()
```

**Tests**: `src/store/slices/__tests__/skinSlice.test.ts`

#### 2. Tile Utilities
**File**: `src/utils/tileUtils.ts`

```typescript
// Convert lat/lon to tile coordinates at zoom level
function latLonToTile(lat: number, lon: number, zoom: number): TileCoordinate;

// Convert tile coordinates back to lat/lon
function tileToLatLon(x: number, y: number, zoom: number): LatLon;

// Get list of tiles covering a map region
function getTilesInRegion(region: Region, zoom: number): TileCoordinate[];

// Calculate tile bounds in lat/lon
function getTileBounds(tile: TileCoordinate): Bounds;
```

**Tests**: `src/utils/__tests__/tileUtils.test.ts`

#### 3. Tile Cache Service
**File**: `src/services/TileCacheService.ts`

```typescript
class TileCacheService {
  private cache: Map<string, ImageSource>;

  // Get tile from memory cache or load from storage
  async getTile(skinId: string, coord: TileCoordinate): Promise<ImageSource | null>;

  // Load tile from bundled assets
  private async loadFromAssets(skinId: string, coord: TileCoordinate): Promise<ImageSource>;

  // Clear cache (when skin changes)
  async clearCache(skinId?: string): Promise<void>;
}
```

**Tests**: `src/services/__tests__/TileCacheService.test.ts`

### Phase 2: Skinned Tile Overlay Component

#### 4. SkinnedTileOverlay Component
**File**: `src/components/SkinnedTileOverlay.tsx`

```typescript
interface SkinnedTileOverlayProps {
  mapRegion: MapRegion & { width: number; height: number };
  activeSkin: string | null;
  safeAreaInsets?: SafeAreaInsets;
}

// Renders skinned tiles over the base map
// - Calculates visible tiles based on mapRegion
// - Loads tiles from TileCacheService
// - Positions tiles using absolute positioning
// - Only renders when activeSkin is set
```

**Key Challenges**:
- Synchronize tile positions with MapView panning/zooming
- Handle tile loading states (loading, error, missing)
- Optimize for performance (viewport culling, lazy loading)
- Match tile coordinates to screen pixels accurately

**Tests**: `src/components/__tests__/SkinnedTileOverlay.test.tsx`

#### 5. Integration with MapScreen
**File**: `src/screens/Map/index.tsx`

```typescript
// Add SkinnedTileOverlay between MapView and OptimizedFogOverlay
<MapView ...>
  <Marker ... />
</MapView>

{activeSkin && currentFogRegion && (
  <SkinnedTileOverlay
    mapRegion={currentFogRegion}
    activeSkin={activeSkin}
    safeAreaInsets={insets}
  />
)}

<OptimizedFogOverlay mapRegion={currentFogRegion} safeAreaInsets={insets} />
```

### Phase 3: Skin Generation and Assets

#### 6. Skin Generation Script
**File**: `scripts/generate-skin-tiles.js`

```javascript
// Node.js script to generate skinned tiles
// Input: base map tiles (screenshots or downloaded)
// Output: skinned tiles in assets/skins/{skinName}/{z}/{x}/{y}.png

async function applySkin(inputTile, skinConfig) {
  const canvas = createCanvas(256, 256);
  const ctx = canvas.getContext('2d');
  const img = await loadImage(inputTile);

  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, 256, 256);

  // Apply procedural color mapping based on skinConfig
  for (let i = 0; i < imageData.data.length; i += 4) {
    const [r, g, b, a] = [
      imageData.data[i],
      imageData.data[i+1],
      imageData.data[i+2],
      imageData.data[i+3]
    ];

    const newColor = skinConfig.colorMapper({ r, g, b, a });
    imageData.data[i] = newColor.r;
    imageData.data[i+1] = newColor.g;
    imageData.data[i+2] = newColor.b;
    imageData.data[i+3] = newColor.a;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toBuffer('image/png');
}
```

**Cartoon Skin Config**:
```javascript
const cartoonSkinConfig = {
  colorMapper: ({ r, g, b, a }) => {
    // Detect road (dark gray)
    if (r < 80 && g < 80 && b < 80) {
      return { r: 0, g: 0, b: 0, a: 255 }; // Black
    }
    // Detect water (blue)
    if (b > r && b > g) {
      return { r: 0, g: 150, b: 255, a: 255 }; // Bright blue
    }
    // Detect park (green)
    if (g > r && g > b) {
      return { r: 50, g: 200, b: 50, a: 255 }; // Bright green
    }
    // Quantize other colors
    return quantizeColor({ r, g, b, a }, 4);
  },
  edgeEnhancement: true,
  edgeColor: { r: 0, g: 0, b: 0, a: 255 },
  edgeWidth: 3
};
```

#### 7. Generate Sample Tiles
- Choose test area (e.g., Dolores Park, SF: 37.7599°N, 122.4271°W)
- Zoom levels: 14-17 (neighborhood to street level)
- Coverage: ~1km radius = ~50-200 tiles depending on zoom
- Capture base tiles:
  - Option A: Screenshot Google Maps and slice
  - Option B: Use Google Maps Static API
  - Option C: Use OpenStreetMap tiles
- Run script: `node scripts/generate-skin-tiles.js --skin=cartoon --area=dolores-park`
- Output to: `assets/skins/cartoon/`

### Phase 4: Settings UI

#### 8. Skin Selection UI
**File**: `src/components/UnifiedSettingsModal/SettingsSkinView.tsx`

```typescript
interface SettingsSkinViewProps {
  activeSkin: string | null;
  availableSkins: Skin[];
  onSelectSkin: (skinId: string | null) => void;
  onBackToMain: () => void;
  styles: any;
}

// UI Layout:
// - Header with back button
// - "Active Skin" section showing current skin (or "None")
// - List of available skins with preview thumbnails
// - Each skin: name, description, preview, "Apply" or "Remove" button
```

**Integration**:
- Add "Map Skins" menu item to SettingsMainView
- Update useSettingsHandlers to handle skin view navigation
- Wire up Redux actions (setActiveSkin, clearActiveSkin)

### Phase 5: Testing

#### 9. Unit Tests

**skinSlice.test.ts**:
- ✓ Initial state is correct (no active skin)
- ✓ setActiveSkin updates state
- ✓ clearActiveSkin resets to null
- ✓ loadSkinMetadata populates availableSkins

**tileUtils.test.ts**:
- ✓ latLonToTile converts correctly
- ✓ tileToLatLon inverse is accurate
- ✓ getTilesInRegion returns correct tiles
- ✓ Edge cases: poles, antimeridian, zoom limits

**TileCacheService.test.ts**:
- ✓ getTile returns cached tile on second call
- ✓ getTile loads from assets on first call
- ✓ clearCache removes all tiles
- ✓ Missing tiles return null gracefully

**SkinnedTileOverlay.test.ts**:
- ✓ Renders null when activeSkin is null
- ✓ Renders tiles when activeSkin is set
- ✓ Updates tiles when mapRegion changes
- ✓ Handles tile loading errors gracefully

#### 10. Integration Tests

**File**: `src/__tests__/integration/skin-application.test.ts`

```typescript
describe('Skin Application Workflow', () => {
  it('should apply cartoon skin and render skinned tiles', async () => {
    // 1. Open settings
    // 2. Navigate to Map Skins
    // 3. Select "Cartoon" skin
    // 4. Close settings
    // 5. Verify SkinnedTileOverlay is rendered
    // 6. Verify tiles are loaded for current region
  });

  it('should remove skin and revert to base map', async () => {
    // Similar but for removal workflow
  });

  it('should persist active skin across app restarts', async () => {
    // Apply skin, restart app, verify skin still active
  });
});
```

#### 11. Maestro E2E Test

**File**: `.maestro/skin-workflow.yaml`

```yaml
appId: com.fogofdog.app
name: Map Skin Workflow

steps:
  # Login
  - tapOn: "Login"
  - inputText: "test@example.com"
  # ... existing login flow ...

  # Explore to reveal some fog
  # (Use GPS injection to simulate movement)
  - runScript: inject_gps_dolores_park.js
  - waitForAnimationToEnd

  # Open settings
  - tapOn: "Settings"
  - assertVisible: "Settings"

  # Navigate to Map Skins
  - tapOn: "Map Skins"
  - assertVisible: "Map Skins"

  # Select Cartoon skin
  - tapOn: "Cartoon"
  - tapOn: "Apply"
  - assertVisible: "Active Skin: Cartoon"

  # Close settings
  - tapOn: "Close"

  # Verify skinned tiles are visible
  # (Take screenshot and run visual comparison)
  - takeScreenshot: "skin-applied.png"
  - runScript: verify_cartoon_skin.js
  - assertCondition: "script.result.isCartoonSkin == true"

  # Explore more area
  - runScript: inject_gps_dolores_park_extended.js
  - waitForAnimationToEnd

  # Verify new areas also show cartoon skin
  - takeScreenshot: "skin-after-exploration.png"
  - runScript: verify_cartoon_skin.js
  - assertCondition: "script.result.isCartoonSkin == true"

  # Remove skin
  - tapOn: "Settings"
  - tapOn: "Map Skins"
  - tapOn: "Remove Skin"
  - tapOn: "Close"

  # Verify base map is shown
  - takeScreenshot: "skin-removed.png"
  - runScript: verify_base_map.js
  - assertCondition: "script.result.isBaseMap == true"
```

**Visual Verification Script** (`scripts/verify_cartoon_skin.js`):
```javascript
// Analyze screenshot to verify cartoon skin characteristics
// - Check for bold black lines (roads)
// - Check for bright, saturated colors
// - Compare color histogram to expected cartoon distribution
// - Return true if cartoon skin is detected
```

### Phase 6: Quality Assurance

#### 12. Run Slop-Mop Checks
```bash
python scripts/ship_it.py
```

**Expected Checks**:
- ✓ ESLint (zero warnings)
- ✓ TypeScript (strict mode)
- ✓ Unit tests (100% coverage for new files)
- ✓ Integration tests (all passing)
- ✓ Code duplication (< 3%)
- ✓ Security audit (no high-severity issues)

**Fix any issues before proceeding**

### Phase 7: Deployment

#### 13. Create Pull Request
- Branch name: `feature/map-skinning-system-model-a`
- Title: "Add map skinning overlay system with cartoon skin"
- Description: Reference this document
- Link to Maestro test results

#### 14. Deploy to iPhone
```bash
npx eas build --platform ios --profile device
# Install on iPhone via EAS or direct cable
```

#### 15. Manual Validation
- ✓ Login and explore area with GPS
- ✓ Open Settings → Map Skins
- ✓ Apply Cartoon skin
- ✓ Verify skinned tiles appear in explored areas
- ✓ Pan and zoom to verify tiles load correctly
- ✓ Explore new areas and verify skin persists
- ✓ Remove skin and verify base map returns
- ✓ Restart app and verify skin persistence

---

## Technical Specifications

### Tile Format
- **Size**: 256×256 pixels (standard)
- **Format**: PNG with transparency
- **Color depth**: 8-bit RGB (24-bit total)
- **Coordinate system**: Web Mercator (EPSG:3857)

### File Storage
```
assets/
  skins/
    metadata.json          # List of available skins
    cartoon/
      preview.png          # Thumbnail for UI
      metadata.json        # Coverage info, zoom levels, etc.
      14/                  # Zoom level 14
        2621/              # Tile X coordinate
          6333.png         # Tile Y coordinate
          6334.png
      15/
        5242/
          12666.png
```

### Performance Targets
- Tile load time: < 50ms from cache
- Skin switch time: < 500ms
- Memory usage: < 50MB for tile cache
- Max tiles in memory: 100 tiles (256×256×4 bytes = 6.4MB each)

### Tile Coverage (MVP)
- **Center**: Dolores Park, SF (37.7599°N, 122.4271°W)
- **Radius**: 1km
- **Zoom levels**: 14-17
- **Total tiles**: ~200 tiles
- **Bundle size**: ~10-20MB (compressed PNGs)

---

## Future Enhancements

### Short-Term (Post-MVP)
1. **Multiple Skins**: Add vintage, neon, minimalist skins
2. **Tile Downloader**: Allow users to download additional coverage
3. **Backend Integration**: Migrate to server-generated tiles
4. **Skin Intensity Slider**: Allow users to adjust skin strength (blend with base map)

### Long-Term
1. **User-Created Skins**: Allow users to upload vibe images and generate custom skins
2. **Real-Time Skinning**: Apply skin filters on-device in real-time (GPU compute shaders)
3. **3D Skins**: Apply skins to 3D buildings and terrain
4. **Animated Skins**: Skins with animated elements (e.g., water ripples)
5. **Collaborative Skins**: Share and discover skins from other users

---

## Open Questions and Risks

### Questions
1. **Bundle Size**: 10-20MB for tiles OK for App Store? (Max size is 200MB)
   - **Answer**: Yes, well within limits. Can optimize with JPEG or WebP if needed.

2. **Tile Alignment**: How accurate is coordinate conversion for tile positioning?
   - **Risk**: Tiles might not align perfectly with base map at all zoom levels
   - **Mitigation**: Test extensively, add alignment calibration if needed

3. **Performance**: Will tile rendering + fog rendering cause frame drops?
   - **Risk**: Dual Canvas rendering could be expensive
   - **Mitigation**: Measure FPS, optimize with React.memo, useMemo, reduce tile count

4. **Missing Tiles**: What happens when user explores outside coverage area?
   - **Answer**: Show base map (no skin) with a subtle indicator
   - **Future**: Download tiles on-demand from backend

### Risks
1. **Coordinate System Mismatch**: react-native-maps uses geographic coords, tiles use grid coords
   - **Mitigation**: Thorough testing of conversion functions, alignment verification

2. **Tile Loading Latency**: Network/storage delays could cause flickering
   - **Mitigation**: Preload tiles aggressively, show base map while loading

3. **Memory Pressure**: Large tile cache could cause OOM on older devices
   - **Mitigation**: Implement LRU cache with size limits, monitor memory usage

4. **Fog Overlay Interaction**: Fog might not clip correctly against skinned tiles
   - **Mitigation**: Fog is independent layer on top, should work as-is

---

## Success Criteria

### MVP Success Metrics
- ✅ User can select and apply cartoon skin from settings
- ✅ Skinned tiles render correctly in explored areas
- ✅ Skin persists across app restarts
- ✅ Fog overlay continues to work correctly
- ✅ No performance regression (< 5% FPS drop)
- ✅ All tests pass (unit, integration, E2E)
- ✅ No blocking issues in slop-mop checks
- ✅ App deploys successfully to TestFlight/iPhone

### Quality Gates
- ✅ 90%+ test coverage on new code
- ✅ Zero ESLint warnings
- ✅ TypeScript strict mode passing
- ✅ Code duplication < 3%
- ✅ No high-severity security issues

---

## Conclusion

The proposed hybrid tile overlay approach balances **feasibility** (can implement in MVP), **performance** (leverage existing optimizations), and **extensibility** (easy path to backend integration). The key innovation is treating skinned tiles like the fog overlay - as an independent layer positioned absolutely over the base map, avoiding the need to replace or deeply integrate with `react-native-maps`.

The MVP focuses on a **single cartoon skin** with **limited coverage** to validate the architecture and user experience. The procedural color mapping approach is simple, fast, and produces visually distinct results without requiring complex ML/CV infrastructure.

**Next Steps**:
1. Implement Redux skinSlice
2. Build tile utility functions
3. Create skin generation script
4. Generate cartoon skin tiles
5. Implement SkinnedTileOverlay component
6. Add settings UI
7. Write tests and validate

**Estimated Effort**: 3-5 days for MVP implementation, 1-2 days for testing and quality assurance.
