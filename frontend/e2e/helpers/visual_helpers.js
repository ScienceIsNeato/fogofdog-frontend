const path = require('path');
const fs = require('fs'); // Use synchronous fs for simplicity in helper
const { PNG } = require('pngjs');

// Define artifact directory relative to the project root
const ARTIFACT_DIR = path.join(__dirname, '../artifacts');

/**
 * Captures a screenshot and saves it to a structured location.
 * @param {string} testName - Name of the test suite or feature.
 * @param {string} stepName - Name describing the step/state being captured.
 * @returns {Promise<string>} Path to the saved screenshot.
 */
export const takeNamedScreenshot = async (testName, stepName) => {
  const fsPromises = require('fs').promises;
  const tempScreenshotPath = await device.takeScreenshot(stepName);
  const finalFileName = `${testName}_${stepName}.png`;
  const finalPath = path.join(ARTIFACT_DIR, finalFileName);

  try {
    // Ensure artifact directory exists
    await fsPromises.mkdir(ARTIFACT_DIR, { recursive: true });
    // Move the screenshot from the temporary Detox location to our artifact dir
    await fsPromises.rename(tempScreenshotPath, finalPath);
    console.log(`Screenshot saved to: ${finalPath}`);
    return finalPath;
  } catch (error) {
    console.error(`Failed to move screenshot from ${tempScreenshotPath} to ${finalPath}:`, error);
    // Return the original temp path if move failed, though it might get cleaned up by Detox
    return tempScreenshotPath; 
  }
};

/**
 * Loads and parses screenshot data using pngjs.
 * @param {string} screenshotPath - Path to the screenshot file.
 * @returns {Promise<{width: number, height: number, data: Buffer} | null>} Parsed image data or null on error.
 */
export const loadScreenshot = async (screenshotPath) => {
  console.log(`Loading screenshot: ${screenshotPath}`);
  try {
    return new Promise((resolve, reject) => {
      fs.createReadStream(screenshotPath)
        .pipe(new PNG())
        .on('parsed', function() {
          console.log(`Parsed screenshot: ${this.width}x${this.height}`);
          resolve({ width: this.width, height: this.height, data: this.data });
        })
        .on('error', (error) => {
          console.error(`Error parsing PNG: ${screenshotPath}`, error);
          reject(error);
        });
    });
  } catch (error) {
    console.error(`Error reading screenshot file: ${screenshotPath}`, error);
    return null;
  }
};

// Helper to get average brightness in a region
const getRegionAverageBrightness = (imageData, regionRect) => {
  if (!imageData) return 0;
  const { width, height, data } = imageData;
  const { x: startX, y: startY, width: regionWidth, height: regionHeight } = regionRect;

  let totalR = 0, totalG = 0, totalB = 0;
  let pixelCount = 0;

  // Clamp region to image bounds
  const endX = Math.min(startX + regionWidth, width);
  const endY = Math.min(startY + regionHeight, height);
  const clampedStartX = Math.max(0, startX);
  const clampedStartY = Math.max(0, startY);

  for (let y = clampedStartY; y < endY; y++) {
    for (let x = clampedStartX; x < endX; x++) {
      const idx = (width * y + x) << 2; // Index in the data buffer (RGBA)
      totalR += data[idx];
      totalG += data[idx + 1];
      totalB += data[idx + 2];
      // Ignore alpha data[idx + 3]
      pixelCount++;
    }
  }

  if (pixelCount === 0) return 0;

  const avgR = totalR / pixelCount;
  const avgG = totalG / pixelCount;
  const avgB = totalB / pixelCount;

  // Simple brightness approximation (average of RGB)
  const avgBrightness = (avgR + avgG + avgB) / 3;
  return avgBrightness;
};

/**
 * Analyzes a region of an image based on average brightness.
 * @param {{width: number, height: number, data: Buffer} | null} imageData - Parsed image data.
 * @param {{x: number, y: number, width: number, height: number}} regionRect - Region to analyze.
 * @param {'visible' | 'foggy'} expectedAppearance - Expected visual state ('visible' means not obscured by fog).
 * @returns {Promise<boolean>} True if brightness matches expectation.
 */
export const isRegionVisuallyMatching = async (imageData, regionRect, expectedAppearance) => {
  console.log(`Analyzing region ${JSON.stringify(regionRect)} for '${expectedAppearance}'`);
  if (!imageData) {
    console.warn('No image data provided for analysis.');
    return false;
  }
  
  const avgBrightness = getRegionAverageBrightness(imageData, regionRect);
  console.log(` - Average Brightness: ${avgBrightness.toFixed(2)}`);

  // Simple thresholds (adjust as needed)
  const foggyThreshold = 80; // Expect low brightness for fog
  const visibleThreshold = 100; // Expect higher brightness for visible areas (not fog)

  if (expectedAppearance === 'foggy') {
    const result = avgBrightness < foggyThreshold;
    console.log(` - Foggy check: ${result} (Threshold: < ${foggyThreshold})`);
    return result;
  } else { // expectedAppearance === 'visible'
    const result = avgBrightness > visibleThreshold;
    console.log(` - Visible check: ${result} (Threshold: > ${visibleThreshold})`);
    return result;
  }
};

/**
 * Analyzes a fog hole area using isRegionVisuallyMatching.
 * @param {{width: number, height: number, data: Buffer} | null} imageData - Parsed image data.
 * @param {{x: number, y: number}} center - Expected screen center of the hole.
 * @param {number} radius - Expected screen radius of the hole.
 * @returns {Promise<{centerVisible: boolean, insideVisible: boolean, outsideFoggy: boolean}>} Analysis results.
 */
export const analyzeFogHole = async (imageData, center, radius) => {
  console.log(`Analyzing fog hole at ${JSON.stringify(center)} with radius ${radius}`);
  if (!imageData) {
    return { centerVisible: false, insideVisible: false, outsideFoggy: false };
  }
  
  const checkSize = Math.max(10, Math.floor(radius * 0.2)); // Check a slightly larger area (20% of radius, min 10px)
  const insideOffset = radius * 0.5; // Check halfway inside the radius
  const outsideOffset = radius * 1.2; // Check just outside the radius

  // Ensure coordinates are integers for pixel indexing
  const ci = (val) => Math.floor(val);

  const centerRect = { x: ci(center.x - checkSize / 2), y: ci(center.y - checkSize / 2), width: ci(checkSize), height: ci(checkSize) };
  const insideRect = { x: ci(center.x - checkSize / 2), y: ci(center.y - insideOffset - checkSize / 2), width: ci(checkSize), height: ci(checkSize) }; 
  const outsideRect = { x: ci(center.x - checkSize / 2), y: ci(center.y - outsideOffset - checkSize / 2), width: ci(checkSize), height: ci(checkSize) };

  console.log('Checking Center Region...');
  const centerVisible = await isRegionVisuallyMatching(imageData, centerRect, 'visible');
  console.log('Checking Inside Region...');
  const insideVisible = await isRegionVisuallyMatching(imageData, insideRect, 'visible');
  console.log('Checking Outside Region...');
  const outsideFoggy = await isRegionVisuallyMatching(imageData, outsideRect, 'foggy');

  const results = { centerVisible, insideVisible, outsideFoggy };
  console.log(`Fog hole analysis results: ${JSON.stringify(results)}`);
  return results;
}; 