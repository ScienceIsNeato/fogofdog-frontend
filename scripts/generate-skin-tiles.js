#!/usr/bin/env node

/**
 * Generate Skin Tiles Script
 *
 * This script processes base map tiles and applies a skin (visual style) to them.
 * For MVP: implements a cartoon skin with procedural color mapping.
 *
 * Usage:
 *   node scripts/generate-skin-tiles.js --skin=cartoon --input=./tiles/base --output=./assets/skins/cartoon
 *
 * Requirements:
 *   npm install canvas
 */

const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

// Configuration
const TILE_SIZE = 256;

/**
 * Cartoon Skin Configuration
 * Applies bold edges and simplified colors for a cartoon aesthetic
 */
const CARTOON_CONFIG = {
  name: 'cartoon',
  description: 'Bold outlines and simplified flat colors',

  colorMapper: ({ r, g, b, a }) => {
    // Detect dark colors (roads, buildings)
    if (r < 80 && g < 80 && b < 80) {
      return { r: 0, g: 0, b: 0, a: 255 }; // Pure black
    }

    // Detect water (blue-ish)
    if (b > r + 20 && b > g + 20) {
      return { r: 0, g: 150, b: 255, a: 255 }; // Bright blue
    }

    // Detect parks/vegetation (green-ish)
    if (g > r + 20 && g > b + 20) {
      return { r: 50, g: 200, b: 50, a: 255 }; // Bright green
    }

    // Detect white/light colors (buildings, background)
    if (r > 200 && g > 200 && b > 200) {
      return { r: 255, g: 255, b: 240, a: 255 }; // Cream white
    }

    // Quantize other colors to 4 levels
    return quantizeColor({ r, g, b, a }, 4);
  },

  edgeEnhancement: true,
  edgeColor: { r: 0, g: 0, b: 0, a: 255 },
  edgeThreshold: 30, // Brightness difference for edge detection
};

/**
 * Quantize a color to N levels
 * Reduces color palette for cartoon effect
 */
function quantizeColor({ r, g, b, a }, levels) {
  const step = 256 / levels;
  return {
    r: Math.floor(r / step) * step,
    g: Math.floor(g / step) * step,
    b: Math.floor(b / step) * step,
    a,
  };
}

/**
 * Detect edges using simple brightness difference
 * Returns true if pixel is on an edge
 */
function isEdgePixel(imageData, x, y, width, height, threshold) {
  if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
    return false; // Skip borders
  }

  const getPixelIndex = (px, py) => (py * width + px) * 4;
  const getBrightness = (idx) => {
    const r = imageData.data[idx];
    const g = imageData.data[idx + 1];
    const b = imageData.data[idx + 2];
    return (r + g + b) / 3;
  };

  const centerIdx = getPixelIndex(x, y);
  const centerBrightness = getBrightness(centerIdx);

  // Check 4-connected neighbors
  const neighbors = [
    getBrightness(getPixelIndex(x - 1, y)), // Left
    getBrightness(getPixelIndex(x + 1, y)), // Right
    getBrightness(getPixelIndex(x, y - 1)), // Top
    getBrightness(getPixelIndex(x, y + 1)), // Bottom
  ];

  // If any neighbor differs significantly, it's an edge
  for (const neighborBrightness of neighbors) {
    if (Math.abs(centerBrightness - neighborBrightness) > threshold) {
      return true;
    }
  }

  return false;
}

/**
 * Apply cartoon skin to a tile image
 */
async function applyCartoonSkin(inputPath, outputPath) {
  console.log(`Processing: ${inputPath} -> ${outputPath}`);

  try {
    // Load input image
    const img = await loadImage(inputPath);

    // Create canvas
    const canvas = createCanvas(TILE_SIZE, TILE_SIZE);
    const ctx = canvas.getContext('2d');

    // Draw original image
    ctx.drawImage(img, 0, 0, TILE_SIZE, TILE_SIZE);

    // Get image data
    const imageData = ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE);

    // First pass: Apply color mapping
    for (let i = 0; i < imageData.data.length; i += 4) {
      const r = imageData.data[i];
      const g = imageData.data[i + 1];
      const b = imageData.data[i + 2];
      const a = imageData.data[i + 3];

      const newColor = CARTOON_CONFIG.colorMapper({ r, g, b, a });
      imageData.data[i] = newColor.r;
      imageData.data[i + 1] = newColor.g;
      imageData.data[i + 2] = newColor.b;
      imageData.data[i + 3] = newColor.a;
    }

    // Put modified image data back
    ctx.putImageData(imageData, 0, 0);

    // Second pass: Edge enhancement (if enabled)
    if (CARTOON_CONFIG.edgeEnhancement) {
      const edgeData = ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE);

      for (let y = 0; y < TILE_SIZE; y++) {
        for (let x = 0; x < TILE_SIZE; x++) {
          if (isEdgePixel(imageData, x, y, TILE_SIZE, TILE_SIZE, CARTOON_CONFIG.edgeThreshold)) {
            const idx = (y * TILE_SIZE + x) * 4;
            edgeData.data[idx] = CARTOON_CONFIG.edgeColor.r;
            edgeData.data[idx + 1] = CARTOON_CONFIG.edgeColor.g;
            edgeData.data[idx + 2] = CARTOON_CONFIG.edgeColor.b;
            edgeData.data[idx + 3] = CARTOON_CONFIG.edgeColor.a;
          }
        }
      }

      ctx.putImageData(edgeData, 0, 0);
    }

    // Save output
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outputPath, buffer);
    console.log(`✓ Saved: ${outputPath}`);
  } catch (error) {
    console.error(`✗ Error processing ${inputPath}:`, error.message);
  }
}

/**
 * Process all tiles in input directory
 */
async function processAllTiles(inputDir, outputDir, skinId) {
  console.log(`\n=== Generating ${skinId} skin tiles ===`);
  console.log(`Input: ${inputDir}`);
  console.log(`Output: ${outputDir}\n`);

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Find all PNG files in input directory (recursively)
  const tilePaths = [];
  function findTiles(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        findTiles(filePath);
      } else if (file.endsWith('.png')) {
        tilePaths.push(filePath);
      }
    }
  }

  findTiles(inputDir);
  console.log(`Found ${tilePaths.length} tiles to process\n`);

  // Process each tile
  for (const inputPath of tilePaths) {
    // Calculate relative path
    const relativePath = path.relative(inputDir, inputPath);
    const outputPath = path.join(outputDir, relativePath);

    // Ensure output subdirectory exists
    const outputSubdir = path.dirname(outputPath);
    if (!fs.existsSync(outputSubdir)) {
      fs.mkdirSync(outputSubdir, { recursive: true });
    }

    await applyCartoonSkin(inputPath, outputPath);
  }

  console.log(`\n✓ Processed ${tilePaths.length} tiles successfully!`);

  // Generate metadata file
  const metadata = {
    skinId,
    name: CARTOON_CONFIG.name,
    description: CARTOON_CONFIG.description,
    tileCount: tilePaths.length,
    generatedAt: new Date().toISOString(),
    config: {
      edgeEnhancement: CARTOON_CONFIG.edgeEnhancement,
      edgeThreshold: CARTOON_CONFIG.edgeThreshold,
    },
  };

  const metadataPath = path.join(outputDir, 'metadata.json');
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  console.log(`✓ Generated metadata: ${metadataPath}\n`);
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const params = {};

  // Parse command line arguments
  for (const arg of args) {
    const [key, value] = arg.split('=');
    if (key && value) {
      params[key.replace('--', '')] = value;
    }
  }

  const skinId = params.skin || 'cartoon';
  const inputDir = params.input || './tiles/base';
  const outputDir = params.output || `./assets/skins/${skinId}`;

  // Validate input directory exists
  if (!fs.existsSync(inputDir)) {
    console.error(`Error: Input directory not found: ${inputDir}`);
    console.error('\nPlease provide base map tiles in the input directory.');
    console.error('You can download them from:');
    console.error('  - Google Maps Static API');
    console.error('  - OpenStreetMap tile servers');
    console.error('  - Or capture screenshots and split them into tiles');
    process.exit(1);
  }

  await processAllTiles(inputDir, outputDir, skinId);
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { applyCartoonSkin, processAllTiles };
