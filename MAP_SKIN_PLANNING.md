# Map Skin System Planning

## ⚠️ Status: ARCHIVED (Historical Design Document)

> **This document is preserved for historical reference only.**
>
> It describes a map skinning architecture based on `react-native-maps` + Google Maps + raster tiles via `UrlTile`.
> This design has been **superseded** by the current MapLibre GL implementation, which uses **vector tiles + Style JSON** for map styling.
>
> **Do NOT use this document as the basis for new work.** See the actual implementation in:
>
> - `src/screens/Map/index.tsx` — MapLibre GL MapView
> - `src/services/SkinStyleService.ts` — Style JSON loading
> - `assets/skins/*.json` — MapLibre Style Spec skin definitions

---

## Original Executive Summary (Historical)

This document outlines the architecture and implementation plan for adding a procedural map skinning overlay system to FogOfDog. The system allows users to apply visual "skins" (e.g., cartoon, vintage, neon) to the underlying Google Maps layer as they explore and reveal areas through fog-of-war gameplay.

**Critical Challenge**: The current app uses `react-native-maps` with a single, non-tiled map view. Implementing a tile-based skinning system requires reconciling `react-native-maps`' native tile support (`UrlTile`) with the existing coordinate/region-based rendering pipeline.

---

## Current Architecture Analysis

### Map Rendering System

**Current Implementation** (`src/screens/Map/index.tsx`):

- Uses `react-native-maps` (Google Maps SDK wrapper)
- Renders a single, continuous MapView component
- NO tile-based system — just coordinates and zoom levels
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

- `src/screens/Map/index.tsx` — Main map screen with MapView
- `src/components/OptimizedFogOverlay.tsx` — Skia-based fog rendering
- `src/utils/mapUtils.ts` — Coordinate conversion utilities
- `src/store/slices/explorationSlice.ts` — GPS path tracking
- `src/components/UnifiedSettingsModal.tsx` — Settings UI pattern

### Identified Collisions and Challenges

#### 1. **No Tiling Concept**

- `react-native-maps` abstracts tiles completely — we only work with regions and coordinates
- No access to individual map tiles for per-tile processing
- No hooks into tile loading pipeline
- **Resolution**: `react-native-maps` exposes `UrlTile` component for custom tile overlays. This is the native-level tile rendering API, avoiding the need for JavaScript-level tile positioning.

#### 2. **Coordinate Conversion is Per-Point**

- `geoPointToPixel()` converts lat/lon → screen pixels for each GPS point
- Works for point-based fog rendering but not tile-based systems
- **Resolution**: Added `tileUtils.ts` with standard Web Mercator tile math (`latLonToTile`, `tileToLatLon`, `getVisibleTiles`, `regionToZoom`)

#### 3. **Single MapView Component**

- MapView renders entire world at once (at current zoom)
- No component boundaries aligned with tiles
- **Resolution**: `UrlTile` renders _inside_ MapView as a child component, delegating tile management to the native maps SDK. No absolute positioning needed.

#### 4. **Skia Canvas Absolute Positioning**

- Fog overlay uses absolute positioning over entire screen
- Works because it's independent of MapView internals
- **Impact**: The skin tile overlay sits _inside_ MapView (as `UrlTile`), while fog stays _outside_ (as Skia canvas). This layering naturally produces the correct visual: skinned tiles visible through fog holes.

#### 5. **Performance Constraints**

- Already optimizing for 5000 GPS points per frame
- Adding tile rendering + skinning could compound performance issues
- **Resolution**: `UrlTile` is rendered by the native maps SDK (not React), so tile rendering cost is negligible from the JS thread perspective. Asset initialization is a one-time filesystem copy on first skin activation.

---

## Architecture Decision: UrlTile vs Absolute Positioning

Two approaches were evaluated for rendering skinned tiles:

### Option A: Absolute-Positioned Image Components (Rejected)

```
MapView (react-native-maps)
  └─ Markers, etc.
SkinnedTileOverlay (absolute positioned over MapView)
  └─ Image components positioned via JS coordinate math
OptimizedFogOverlay (Skia canvas, absolute positioned)
```

**Problems**:

- Requires JavaScript-level coordinate conversion for every tile on every frame
- Synchronizing tile positions with native map panning/zooming is fragile
- Performance degrades with many visible tiles (JS thread bottleneck)
- Tile alignment drift at different zoom levels
- Self-described as "architecturally a hack" during prototyping

### Option B: UrlTile Inside MapView (Chosen) ✅

```
MapView (react-native-maps)
  ├─ SkinTileOverlay (UrlTile — native tile rendering)
  └─ Markers, etc.
OptimizedFogOverlay (Skia canvas, absolute positioned — unchanged)
```

**Advantages**:

- Native tile rendering — zero JS thread cost for tile positioning
- Automatic tile loading, caching, and recycling by the maps SDK
- Perfect alignment with base map at all zoom levels
- Standard `{z}/{x}/{y}` URL template — trivial to swap from local `file://` to remote API
- Minimal code — `SkinTileOverlay` is ~80 lines

**How it works**:

1. Pre-generated skin tiles are bundled in `assets/skins/{skinId}/{z}/{x}/{y}.png`
2. On first activation, `SkinAssetService` copies tiles from the app bundle to `FileSystem.documentDirectory` (required because `UrlTile` needs a URL template, not bundled asset references)
3. `SkinTileOverlay` renders a `UrlTile` with a `file://` URL template pointing to the copied tiles
4. The native maps SDK handles all tile loading, positioning, and recycling
5. Future migration: change `file://` URL to `https://api.fogofdog.com/tiles/...`

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

**Verdict**: ❌ **Not feasible for MVP** — too slow, requires backend infrastructure

#### Option 2: Edge-Preserving Filters + Color Quantization (PIL/Pillow)

**Approach**: Use image processing filters that preserve edges while stylizing

**Pipeline**:

1. **SMOOTH**: Apply bilateral filter to tile (preserves edges, smooths textures)
2. **QUANTIZE**: Reduce color palette to 8-12 colors (posterization)
3. **VIBE_SHIFT**: Apply color influence from a "vibe" reference image
4. **BRIGHTEN**: Boost saturation and brightness for cartoon feel

**Pros**:

- Fast processing (< 1 second per tile)
- Preserves street/label structure (critical for a map app)
- Runs locally without a trained model
- Produces visually distinct output (validates "different from original" requirement)
- Pure Python — no native bindings needed

**Cons**:

- Less artistic than neural style transfer
- Requires tuning per skin style
- Current implementation doesn't include edge detection/outline overlay (future enhancement)

**Verdict**: ✅ **Chosen for MVP** — fast, preserves detail, produces good results

#### Option 3: Procedural Color Mapping (JavaScript)

**Approach**: Replace colors based on HSV/luminance mapping rules

**Pros**:

- Extremely fast (< 100ms per tile)
- Can run in JavaScript (canvas manipulation)
- Full control over color mapping

**Cons**:

- Requires node-canvas native dependency (problematic for React Native bundling)
- Fragile color detection (roads, water, parks depend on exact pixel colors)
- Initial prototype produced black rectangles due to canvas rendering issues

**Verdict**: ❌ **Rejected for MVP** — native dependency issues, unreliable output

### Chosen Approach: Python PIL Pipeline

**Script**: `scripts/apply_skin.py`

The skin generation pipeline:

1. **Download OSM tiles** for the target area at specified zoom levels
2. **Apply cartoon filter** to each tile:
   - Gaussian blur for smoothing
   - Color posterization (reduce to flat color bands)
   - Vibe color influence from reference image
   - Brightness/saturation boost
3. **Save styled tiles** to `assets/skins/cartoon/{z}/{x}/{y}.png`

**Tile Coverage (MVP)**:

- **Center**: San Francisco GPS injection point (37.78825°N, 122.4324°W)
- **Zoom levels**: 13, 14, 15
- **Tile count**: 43 pre-generated tiles
- **Bundle size impact**: ~2MB (compressed PNGs)

---

## Implementation Details

### Component Architecture

```
MapView (react-native-maps)
  ├─ SkinTileOverlay          # UrlTile for custom skin tiles
  └─ Markers, LocationDot
OptimizedFogOverlay           # Skia canvas (unchanged)
```

### Redux State (`src/store/slices/skinSlice.ts`)

```typescript
type SkinId = 'none' | 'cartoon';

interface SkinState {
  activeSkin: SkinId; // Currently active skin
  isInitializing: boolean; // True while copying assets to filesystem
}

// Actions: setSkin, clearSkin, setInitializing
```

### Key Files

| File                                                       | Purpose                                                   |
| ---------------------------------------------------------- | --------------------------------------------------------- |
| `src/store/slices/skinSlice.ts`                            | Redux state for active skin                               |
| `src/components/SkinTileOverlay.tsx`                       | UrlTile wrapper — renders skin tiles inside MapView       |
| `src/services/SkinAssetService.ts`                         | Copies bundled tiles to filesystem, provides URL template |
| `src/utils/tileUtils.ts`                                   | Web Mercator tile math utilities                          |
| `src/components/UnifiedSettingsModal/SettingsSkinView.tsx` | Skin selection UI                                         |
| `scripts/apply_skin.py`                                    | Offline tile generation script (PIL-based)                |
| `assets/skins/cartoon/{z}/{x}/{y}.png`                     | Pre-generated cartoon tiles                               |
| `assets/skins/_raw_tiles/{z}/{x}/{y}.png`                  | Source OSM tiles for reference                            |

### Settings UI Integration

Added "Map Style" option to `SettingsMainView` (following existing patterns):

- `SettingsSkinView` shows available skins with name + description
- Selecting a skin dispatches `setSkin()` and triggers asset initialization
- "Standard" option clears the skin back to default Google Maps

### Testing

| Test File                                            | Coverage                                       |
| ---------------------------------------------------- | ---------------------------------------------- |
| `src/store/slices/__tests__/skinSlice.test.ts`       | Redux state transitions                        |
| `src/components/__tests__/SkinTileOverlay.test.tsx`  | Component rendering with/without active skin   |
| `src/components/__tests__/SettingsSkinView.test.tsx` | UI interactions and dispatch                   |
| `src/utils/__tests__/tileUtils.test.ts`              | Tile coordinate math                           |
| `src/utils/__tests__/skinTileValidation.test.ts`     | Pre-generated tile asset integrity             |
| `scripts/test_apply_skin.py`                         | Python tile generator (19 tests, 95% coverage) |
| `.maestro/map-skin-test.yaml`                        | E2E: login → settings → apply skin → verify    |

---

## Technical Specifications

### Tile Format

- **Size**: 256×256 pixels (standard slippy map tiles)
- **Format**: PNG
- **Color depth**: 8-bit RGB (24-bit total)
- **Coordinate system**: Web Mercator (EPSG:3857)
- **Naming convention**: `{z}/{x}/{y}.png` (standard TMS/XYZ)

### File Storage Layout

```
assets/
  skins/
    _raw_tiles/              # Source OSM tiles (for regeneration)
      13/, 14/, 15/
    cartoon/                 # Styled tiles
      13/
        1308/
          3164.png
          3165.png
          ...
      14/
        2618/
          6330.png
          ...
      15/
        5237/
          12661.png
          ...
```

### Runtime File Storage

```
${FileSystem.documentDirectory}/
  skins/
    cartoon/                 # Copied from bundle on first activation
      {z}/{x}/{y}.png       # UrlTile reads these via file:// URL
```

### Performance Characteristics

- **Tile rendering**: Native (zero JS thread cost)
- **Asset initialization**: One-time ~2s copy on first skin activation
- **Skin switch time**: < 100ms (instant if already initialized)
- **Memory usage**: Managed by native maps SDK tile cache
- **Bundle size impact**: ~2MB for 43 cartoon tiles

---

## Future Enhancements

### Short-Term (Post-MVP)

1. **Multiple Skins**: Add vintage, neon, minimalist skins (extend `SkinId` type)
2. **Edge Detection Overlay**: Add Canny edge detection + dark outline overlay to cartoon filter
3. **Tile Downloader**: Allow users to download additional geographic coverage
4. **Backend Integration**: Replace `file://` URL template with remote API URL
5. **Skin Intensity Slider**: Blend skin tiles with base map at adjustable opacity

### Medium-Term

1. **Dynamic Tile Server**: Backend generates tiles on-demand via `GET /tiles/{skinName}/{z}/{x}/{y}.png`
2. **Skin Metadata API**: Fetch available skins, coverage polygons, download progress
3. **On-Device Generation**: Port PIL pipeline to native (e.g., Core Image on iOS) for real-time generation
4. **Skin Persistence**: Save active skin to AsyncStorage for cross-session persistence

### Long-Term

1. **User-Created Skins**: Upload "vibe" reference images, generate custom skins
2. **Real-Time Skinning**: Apply filters on-device via GPU compute shaders
3. **3D Skins**: Apply skins to 3D buildings and terrain
4. **Animated Skins**: Skins with animated elements (e.g., water ripples)
5. **Collaborative Skins**: Share and discover community-created skins

---

## Open Questions and Risks

### Questions

1. **Bundle Size**: ~2MB for 43 tiles is fine. At scale (hundreds of tiles, multiple skins), may need to move to on-demand download.

2. **Tile Alignment**: `UrlTile` handles alignment natively — no coordinate conversion needed. ✅ Resolved.

3. **Performance**: `UrlTile` is rendered by the native maps SDK, not React. Measured impact is negligible. ✅ Resolved.

4. **Missing Tiles**: When user explores outside pre-generated coverage, base Google Maps shows through. This is acceptable for MVP — future backend will provide global coverage.

### Risks

1. **Antimeridian Handling**: `tileUtils.ts` `getVisibleTiles()` assumes `topLeft.x <= bottomRight.x`. Regions crossing the antimeridian could produce invalid tile ranges.

   - **Mitigation**: FogOfDog operates in continental US. Low priority but should be fixed for correctness.

2. **Concurrent Asset Initialization**: `initializeSkin()` fires all 43 file copies via `Promise.all()`. Could spike I/O on low-end devices.

   - **Mitigation**: Add concurrency limiter (e.g., process 5 tiles at a time). Low priority since initialization is one-time.

3. **Race Condition on Skin Toggle**: Rapidly toggling skins could cause stale `setUrlTemplate()` calls from a previous `initializeSkin()` promise.

   - **Mitigation**: Track activation ID and discard stale results.

4. **Fog Overlay Interaction**: Fog renders as a Skia canvas _above_ the MapView. Skin tiles render _inside_ the MapView. The visual layering is:
   - Base map → Skin tiles (UrlTile, inside MapView) → Fog (Skia, above MapView)
   - Fog holes reveal skin tiles where the user has explored. ✅ Works correctly.

---

## Success Criteria

### MVP Success Metrics

- ✅ User can select and apply cartoon skin from Settings → Map Style
- ✅ Skinned tiles render correctly inside MapView via UrlTile
- ✅ Fog overlay continues to work correctly (holes reveal skin tiles)
- ✅ No performance regression (native tile rendering, zero JS thread cost)
- ✅ All tests pass (unit, component, E2E)
- ✅ All slop-mop quality gates pass
- ✅ Skinned tiles are visually distinct from original map (automated validation)

### Quality Gates

- ✅ Test coverage maintained above threshold
- ✅ Zero ESLint warnings (strict mode)
- ✅ TypeScript strict mode passing
- ✅ Code duplication below threshold
- ✅ No high-severity security issues
- ✅ All slop-mop checks pass

---

## Conclusion

The `UrlTile`-based approach provides a clean, performant, and forward-compatible architecture for map skinning. By rendering tiles natively inside MapView (rather than JavaScript-level absolute positioning), we get:

1. **Zero JS thread cost** for tile rendering
2. **Perfect tile alignment** at all zoom levels
3. **Trivial migration path** from local `file://` tiles to remote API tiles
4. **Minimal code surface** (~80 lines for the overlay component)

The PIL-based cartoon filter preserves road structure while producing a visually distinct output — flat colors, posterized palette, simplified textures. This validates the skin pipeline concept without requiring ML infrastructure.

**Migration to backend**: When server-side tile generation is available, the only code change is replacing the `file://` URL template in `SkinAssetService.getUrlTemplate()` with the API URL. Everything else (Redux state, UI, overlay component) remains unchanged.
