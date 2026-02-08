# MAP_SKIN_PLANNING.md

## Background

FogOfDog is a fog-of-war neighborhood exploration app. When fog is cleared by walking, it reveals
Google Maps beneath. This document plans a "skinning" system allowing users to replace the Google
Maps view with custom visual styles (skins), similar to switching map themes.

---

## Codebase Survey Findings

### Current Architecture

The map rendering stack is:

1. **`MapView`** (react-native-maps) — full-screen Google Maps base layer
2. **`OptimizedFogOverlay`** (Skia canvas) — black rectangle with transparent holes where the user
   has walked

The fog system uses a luminance mask: the Skia canvas renders a full-screen black rectangle, then
"cuts holes" using GPS path data converted to pixel coordinates via `geoPointToPixel()` in
`mapUtils.ts`. The holes reveal the Google Maps layer below.

### Critical Absence: No Tiling Concepts

There are **zero tile-based rendering concepts** in the codebase today:

- No tile coordinates (z/x/y)
- No `UrlTile` component usage (though react-native-maps 1.18.0 supports it)
- No web mercator projection math
- No tile cache or tile asset management
- The map is rendered as a single `MapView` with no concept of individual tiles

This means the skinning system must introduce the entire tiling infrastructure from scratch.

### Potential Collisions / Concerns

1. **Coordinate system impedance mismatch**: The fog overlay uses screen pixels (`geoPointToPixel`)
   while tile rendering uses web mercator tile coordinates (z/x/y). These are different coordinate
   spaces. A `tileUtils.ts` module must bridge them.

2. **Performance**: Adding a skin layer between the map and fog adds rendering cost. With the
   existing Skia canvas overhead plus the skin layer, performance budgets are tighter. The MVP
   limits pre-rendered tiles to a small geographic area to cap scope.

3. **UrlTile vs Skia rendering**: `react-native-maps` has built-in `UrlTile` support, but it
   requires serving tiles via URL (including `file://`). In Expo, `file://` requires copying assets
   from the bundle to the local file system. This is the chosen approach.

4. **No theme system**: Colors are hardcoded throughout. The skin system introduces the first
   dynamic visual layer but does NOT refactor the entire theme system (out of scope).

5. **MapView component coupling**: `MapView` in `src/screens/Map/index.tsx` is deeply embedded
   (2485 lines). The skin layer is injected as a child of `MapView` using `UrlTile`, which is the
   cleanest approach requiring minimal changes to the MapScreen file.

6. **GPS test location**: The default GPS injection location is (37.78825, -122.4324), San
   Francisco. All pre-generated skin tiles target this area to ensure the Maestro tests work.

---

## Architecture Decision: UrlTile Approach

### Options Considered

| Option                               | Description                                                  | Verdict                        |
| ------------------------------------ | ------------------------------------------------------------ | ------------------------------ |
| Neural style transfer                | Apply trained ML model to real-time tiles                    | Too heavy, requires server     |
| Skia post-processing                 | Apply filters to captured MapView pixels                     | Can't read MapView pixels      |
| Full custom map renderer             | Replace MapView with custom tile renderer                    | Massive refactor, out of scope |
| **UrlTile with pre-generated tiles** | Use react-native-maps UrlTile with pre-processed local tiles | **CHOSEN**                     |
| Skia tile rendering                  | Load tile PNGs via Skia Image in a separate canvas           | More complex, same result      |

### Chosen Approach: UrlTile with Pre-Generated Local Tiles

**Why `UrlTile`:**

- Native to react-native-maps — no extra dependencies
- Handles tile rendering, positioning, zoom transitions, and caching natively
- Only requires specifying a URL template `{z}/{x}/{y}.png`
- Minimal invasiveness to existing code — add one component inside `<MapView>`

**Why pre-generated tiles (not real-time):**

- Real-time tile generation requires server infrastructure (deferred to future)
- Pre-generating a small set of tiles for the demo area is viable
- Matches spec requirement: "output is stored locally and consumed by the app"

**Local tile serving with `file://`:**

- Tiles are bundled as Expo assets (`require('../assets/skins/cartoon/z/x/y.png')`)
- On first skin activation, tiles are copied to `FileSystem.documentDirectory`
- `UrlTile` uses the `file://` path as its URL template
- This is a one-time copy operation per skin

**Graceful fallback:**

- Outside the pre-generated area, `UrlTile` will simply not find tiles and render nothing
- The Google Maps base layer remains visible for uncovered areas
- This is acceptable for the MVP

---

## apply_skin Algorithm

### Chosen Approach: Edge-Preserving Cartoon Filter

A cartoon filter is used because it:

- Preserves road/street structure (critical for a map)
- Produces visually distinct output (validates "different from original" requirement)
- Runs entirely locally without a trained model
- Simple to implement with PIL/OpenCV
- Matches the "bold outlines on roads, simplified/flat colors" cartoon spec

### Algorithm Steps

```
Input: tile_image (256x256 PNG), vibe_image (reference style image)

1. SMOOTH: Apply bilateral filter to tile (preserves edges, smooths textures)
   - Applied 2-3 times for stronger cartoon effect

2. QUANTIZE: Reduce color palette to 8-12 colors (posterization)
   - Creates flat color regions characteristic of cartoons

3. VIBE_INFLUENCE: Extract dominant colors from vibe_image
   - Shift tile hue/saturation toward vibe palette (optional, subtle)

4. EDGE_DETECT: Run Canny edge detection on original tile
   - This captures road outlines, building edges, coastlines

5. DILATE_EDGES: Thicken detected edges slightly (cartoon bold lines)

6. OVERLAY_EDGES: Paint detected edges as dark outlines on quantized image
   - Result: flat colors with bold dark outlines = cartoon map

Output: cartoon_tile (256x256 PNG)
```

### Why not neural style transfer?

Neural style transfer (Gatys et al.) would produce a more sophisticated stylistic transform, but:

- Requires running a pretrained VGG network (50MB+ model)
- Takes seconds per tile even on GPU
- Impractical for generating the dozens of tiles needed at multiple zoom levels
- No benefit over the cartoon filter for preserving street structure

### Why not just a color remap?

Pure color remapping (e.g., make parks purple, roads orange) is simpler but:

- Doesn't give the distinctive "cartoon" visual quality
- Wouldn't be "visually distinct" enough for automated tests to reliably detect
- The bold outline + flat color is the quintessential cartoon look

---

## Implementation Plan

### Phase 1: Tile Infrastructure (tileUtils.ts)

New file `src/utils/tileUtils.ts`:

- `latLonToTile(lat, lon, zoom)` → `{x, y, z}` — standard web mercator math
- `tileToLatLonBounds(x, y, z)` → `{north, south, east, west}` — inverse
- `getVisibleTiles(mapRegion, zoom)` → `TileCoord[]` — enumerate visible tiles

### Phase 2: apply_skin Script (scripts/apply_skin.py)

New Python script:

- Takes `--tile path/to/tile.png` and `--vibe path/to/vibe.png`
- Outputs cartoon tile to `--output path/to/output.png`
- Uses PIL + NumPy (standard Python; no heavy ML dependencies)
- Generates tiles for the SF test area at zoom levels 13, 14, 15

### Phase 3: Asset Generation

Run `apply_skin.py` to generate cartoon tiles:

- Download reference tiles from OSM tile server
- Apply cartoon effect
- Store in `assets/skins/cartoon/{z}/{x}/{y}.png`

### Phase 4: Redux Skin Slice (skinSlice.ts)

New file `src/store/slices/skinSlice.ts`:

```typescript
interface SkinState {
  activeSkin: SkinId; // 'none' | 'cartoon'
  isInitializing: boolean;
}
```

Actions: `setSkin`, `clearSkin`, `setInitializing`

### Phase 5: Skin Settings UI

New files:

- `src/components/UnifiedSettingsModal/SettingsSkinView.tsx` — skin picker
- Update `SettingsMainView.tsx` — add "Map Style" menu item
- Update `UnifiedSettingsModal.tsx` — add 'skin' view type

### Phase 6: Skin Asset Manager (SkinAssetService.ts)

New file `src/services/SkinAssetService.ts`:

- `initializeSkin(skinId)` — copies bundled tiles to file system
- `getSkinTileUrl(skinId, z, x, y)` — returns file:// URL for tile
- `getTileUrlTemplate(skinId)` — returns `file://.../{z}/{x}/{y}.png` template

### Phase 7: SkinTileOverlay Component

New file `src/components/SkinTileOverlay.tsx`:

- Uses react-native-maps `UrlTile` component
- Only renders when skin is active
- Connects to Redux `skin.activeSkin`
- Initializes assets via `SkinAssetService`

### Phase 8: MapScreen Integration

Update `src/screens/Map/index.tsx`:

- Import and render `<SkinTileOverlay />` inside `<MapView>` (sits above base map)
- No other changes to fog system (it still renders on top)

### Phase 9: Tests

- Unit tests: `tileUtils.test.ts`, `skinSlice.test.ts`
- Component tests: `SkinTileOverlay.test.tsx`, `SettingsSkinView.test.tsx`
- Integration test: image comparison validates cartoon tile ≠ original
- Maestro E2E: login → explore → settings → skin → explore → verify

---

## Tile Coverage Plan

The GPS injection test sequence starts at (37.78825, -122.4324) and moves ~1km south.

Pre-generate tiles at zoom levels **14 and 15** covering:

- Lat range: 37.778 to 37.79
- Lon range: -122.440 to -122.425

At zoom 14, this is approximately 2×2 = 4 tiles.
At zoom 15, approximately 4×4 = 16 tiles.

Total: ~20 tiles × ~50KB each = ~1MB bundled size. Acceptable.

---

## Future: Server-Side Tile Generation

The `apply_skin` function is designed as a preview of future server infrastructure:

1. User selects a skin
2. App requests skinned tiles from API: `GET /tiles/{skin}/{z}/{x}/{y}.png`
3. Server generates tile on-demand (caches results)
4. App's `UrlTile` points to the API URL template

The frontend code already supports this because `UrlTile` accepts any URL template. Migrating from
local `file://` tiles to remote API tiles requires only changing the URL template string.

---

## Quality Gates

- All new code must pass `npm run lint:strict` (zero warnings)
- Test coverage maintained above 70%
- `python scripts/ship_it.py` passes before PR
- Maestro E2E test passes manually on device
- Automated image comparison confirms skin tiles differ from originals
