#!/usr/bin/env node

/**
 * Generate Placeholder Tiles Script
 *
 * Creates simple colored placeholder tiles for testing the skinning system
 * without needing actual map tiles.
 *
 * Usage:
 *   node scripts/generate-placeholder-tiles.js --output=./assets/skins/cartoon
 *
 * Requirements:
 *   npm install canvas
 */

const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

// Configuration
const TILE_SIZE = 256;

/**
 * Generate a placeholder tile with a distinct pattern
 * Each tile gets a unique color based on its coordinates
 */
function generatePlaceholderTile(z, x, y) {
  const canvas = createCanvas(TILE_SIZE, TILE_SIZE);
  const ctx = canvas.getContext('2d');

  // Generate a unique color based on tile coordinates
  const hue = ((x * 137 + y * 193) % 360); // Golden angle for good distribution
  const saturation = 70;
  const lightness = 50 + ((z * 5) % 30); // Vary lightness by zoom level

  // Fill background
  ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

  // Add grid pattern to make tiles distinguishable
  ctx.strokeStyle = `hsl(${hue}, ${saturation}%, ${Math.max(lightness - 20, 20)}%)`;
  ctx.lineWidth = 3;

  // Draw grid
  const gridSize = 32;
  for (let i = 0; i <= TILE_SIZE; i += gridSize) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, TILE_SIZE);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(TILE_SIZE, i);
    ctx.stroke();
  }

  // Add text label with coordinates
  ctx.fillStyle = 'white';
  ctx.font = 'bold 16px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${z}/${x}/${y}`, TILE_SIZE / 2, TILE_SIZE / 2);

  // Add subtle border
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, TILE_SIZE, TILE_SIZE);

  return canvas.toBuffer('image/png');
}

/**
 * Generate placeholder tiles for a test area
 * Center: Dolores Park, SF (37.7599°N, 122.4271°W)
 */
async function generateTestTiles(outputDir) {
  console.log('\n=== Generating Placeholder Tiles ===');
  console.log(`Output: ${outputDir}\n`);

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Define test area tiles
  // Dolores Park area at different zoom levels
  const tilesToGenerate = [
    // Zoom 14 - neighborhood level
    { z: 14, x: 2621, y: 6333 },
    { z: 14, x: 2621, y: 6334 },
    { z: 14, x: 2622, y: 6333 },
    { z: 14, x: 2622, y: 6334 },

    // Zoom 15 - street level
    { z: 15, x: 5242, y: 12666 },
    { z: 15, x: 5242, y: 12667 },
    { z: 15, x: 5243, y: 12666 },
    { z: 15, x: 5243, y: 12667 },
    { z: 15, x: 5244, y: 12666 },
    { z: 15, x: 5244, y: 12667 },

    // Zoom 16 - block level
    { z: 16, x: 10484, y: 25332 },
    { z: 16, x: 10484, y: 25333 },
    { z: 16, x: 10485, y: 25332 },
    { z: 16, x: 10485, y: 25333 },
  ];

  console.log(`Generating ${tilesToGenerate.length} placeholder tiles...\n`);

  let generatedCount = 0;
  for (const { z, x, y } of tilesToGenerate) {
    const tileDir = path.join(outputDir, String(z), String(x));
    if (!fs.existsSync(tileDir)) {
      fs.mkdirSync(tileDir, { recursive: true });
    }

    const tilePath = path.join(tileDir, `${y}.png`);
    const buffer = generatePlaceholderTile(z, x, y);
    fs.writeFileSync(tilePath, buffer);

    console.log(`✓ Generated: ${z}/${x}/${y}.png`);
    generatedCount++;
  }

  console.log(`\n✓ Generated ${generatedCount} placeholder tiles successfully!`);

  // Generate metadata
  const metadata = {
    skinId: 'cartoon',
    name: 'Cartoon (Placeholder)',
    description: 'Placeholder tiles for testing - replace with actual cartoon skin',
    tileCount: generatedCount,
    generatedAt: new Date().toISOString(),
    isPlaceholder: true,
    coverage: {
      zoomLevels: [14, 15, 16],
      area: 'Dolores Park, SF (37.7599°N, 122.4271°W)',
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

  const outputDir = params.output || './assets/skins/cartoon';

  await generateTestTiles(outputDir);

  console.log('Next steps:');
  console.log('1. Run tests to verify tile loading');
  console.log('2. Replace placeholder tiles with actual map tiles + skin filter');
  console.log('3. Update SkinMetadataService to list cartoon skin as available\n');
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { generatePlaceholderTile, generateTestTiles };
