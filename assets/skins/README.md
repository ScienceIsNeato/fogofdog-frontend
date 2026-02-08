# Map Skins Assets

This directory contains skinned map tiles for the FogOfDog app.

## Directory Structure

```
assets/skins/
├── metadata.json           # List of available skins
├── cartoon/
│   ├── metadata.json       # Cartoon skin metadata
│   ├── preview.png         # Preview thumbnail (optional)
│   ├── 14/                 # Zoom level 14
│   │   ├── 2621/           # Tile X coordinate
│   │   │   ├── 6333.png    # Tile Y coordinate
│   │   │   └── 6334.png
│   │   └── 2622/
│   │       ├── 6333.png
│   │       └── 6334.png
│   ├── 15/                 # Zoom level 15
│   └── 16/                 # Zoom level 16
└── vintage/                # Future skin
    └── ...
```

## Generating Tiles

### Method 1: Placeholder Tiles (for testing)

Generate colored placeholder tiles for quick testing:

```bash
# Install canvas (required for image generation)
npm install canvas

# Generate placeholder tiles
node scripts/generate-placeholder-tiles.js --output=./assets/skins/cartoon
```

### Method 2: Real Map Tiles with Skin Filter

1. **Capture base map tiles**:
   - Use Google Maps Static API
   - Or download from OpenStreetMap tile servers
   - Or capture screenshots and split into 256×256 tiles

2. **Apply skin filter**:
```bash
# Place base tiles in ./tiles/base/
node scripts/generate-skin-tiles.js --skin=cartoon --input=./tiles/base --output=./assets/skins/cartoon
```

### Method 3: Manual Testing

For development, you can manually create a few test tiles:
1. Create directories: `assets/skins/cartoon/14/2621/`
2. Place any 256×256 PNG images named `6333.png`, `6334.png`, etc.
3. The app will load and display these tiles

## Test Area Coverage

The default test area is Dolores Park, San Francisco:
- **Location**: 37.7599°N, 122.4271°W
- **Zoom levels**: 14-16
- **Tile count**: ~20-50 tiles depending on coverage

## Tile Specifications

- **Size**: 256×256 pixels
- **Format**: PNG
- **Coordinate System**: Web Mercator (EPSG:3857)
- **Naming**: `{z}/{x}/{y}.png`

## Enabling Skins

After generating tiles, update `src/services/SkinMetadataService.ts` to list the skin:

```typescript
const skins: Skin[] = [
  {
    id: 'cartoon',
    name: 'Cartoon',
    description: 'Bold outlines and simplified flat colors',
    previewImage: '',
    isDownloaded: true,
    coverage: 'local',
  },
];
```

## Current Status

- ✅ Directory structure created
- ⏳ Placeholder tiles: Run `generate-placeholder-tiles.js` (requires `npm install canvas`)
- ⏳ Real tiles: Requires base map tiles and skin generation
- ⏳ Metadata: Update after tiles are generated
