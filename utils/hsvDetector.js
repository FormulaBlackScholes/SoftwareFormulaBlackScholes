// utils/hsvDetector.js
// Simple HSV color-based circle detection for PUT handle
// Reliable and fast - no AI/ML dependencies

import fs from 'fs';
import sharp from 'sharp';
import { getScreenshotPath } from './paths.js';

/**
 * Detect PUT handle using HSV color filtering
 * Looks for red/orange circular markers on the chart
 * 
 * @param {Page} page - Playwright page object
 * @param {Object} options - Detection options
 * @returns {Object|null} Detection result with x, y coordinates
 */
export async function detectPutHandle(page, options = {}) {
  const { debugSave = (process.env.DEBUG_BROWSER === 'true') } = options;
  
  console.log('🎯 Detecting PUT handle using HSV color filtering...');
  
  try {
    // Try every canvas on the page — the PUT circle may be inside a dialog canvas,
    // not in the first (main chart) canvas.
    const allCanvases = page.locator('canvas');
    const canvasCount = await allCanvases.count();
    console.log(`🖼  Found ${canvasCount} canvas element(s) on page`);

    for (let ci = 0; ci < canvasCount; ci++) {
      const canvas = allCanvases.nth(ci);
      const canvasBox = await canvas.boundingBox().catch(() => null);
      if (!canvasBox || canvasBox.width < 50 || canvasBox.height < 50) continue;

      console.log(`📐 Canvas[${ci}]: ${canvasBox.width}x${canvasBox.height} at (${canvasBox.x}, ${canvasBox.y})`);

      const result = await _detectOnCanvas(page, canvasBox, ci, debugSave);
      if (result) return result;
    }

    // Final fallback: scan the full page screenshot (use actual viewport size)
    console.log('🔁 Falling back to full-page scan...');
    const vp = page.viewportSize();
    const fullBox = { x: 0, y: 0, width: vp ? vp.width : 1920, height: vp ? vp.height : 1080 };
    const result = await _detectOnCanvas(page, fullBox, 'full', debugSave);
    if (result) return result;

    console.log('❌ No circular PUT handle detected on any canvas');
    return null;

  } catch (error) {
    console.error('❌ Detection error:', error.message);
    return null;
  }
}

async function _detectOnCanvas(page, canvasBox, label, debugSave) {
  try {
    
    // Take screenshot of canvas only
    const screenshotBuffer = await page.screenshot({
      clip: {
        x: Math.round(canvasBox.x),
        y: Math.round(canvasBox.y),
        width: Math.round(canvasBox.width),
        height: Math.round(canvasBox.height)
      }
    });
    
    if (debugSave) {
      const screenshotPath = getScreenshotPath(`canvas-screenshot-${label}.png`);
      fs.writeFileSync(screenshotPath, screenshotBuffer);
      console.log(`💾 Saved: ${screenshotPath}`);
    }
    
    // Use sharp to analyze the image and find red/orange circles
    const image = sharp(screenshotBuffer);
    const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
    
    // Compute device pixel ratio — page.screenshot returns device pixels but canvasBox is in CSS pixels
    const dpr = info.width / canvasBox.width;
    console.log(`📊 Canvas[${label}] image: ${info.width}x${info.height}, ${info.channels} channels (DPR: ${dpr.toFixed(2)})`);
    
    // Create a mask for visualization
    const width = info.width;
    const height = info.height;
    const maskData = Buffer.alloc(width * height);
    
    // Scan image for red/orange pixels (HSV filtering)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 3;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        
        // Convert RGB to HSV (simplified)
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const delta = max - min;
        
        let h = 0;
        const s = max === 0 ? 0 : (delta / max) * 255;
        const v = max;
        
        if (delta !== 0) {
          if (max === r) {
            h = ((g - b) / delta) % 6;
          } else if (max === g) {
            h = (b - r) / delta + 2;
          } else {
            h = (r - g) / delta + 4;
          }
          h = Math.round(h * 30); // Convert to 0-180 range
          if (h < 0) h += 180;
        }
        
        // Check if pixel is WHITE/LIGHT colored (for PUT circle)
        // White/Light: Low saturation (< 50), High value (> 200)
        // Also check for red/orange as fallback
        const isWhite = (s < 50 && v > 200);
        const isRed = ((h <= 10 || h >= 160) && s >= 80 && v >= 80);
        const isOrange = (h >= 10 && h <= 30 && s >= 80 && v >= 80);
        
        if (isWhite || isRed || isOrange) {
          maskData[y * width + x] = 255;
        }
      }
    }
    
    if (debugSave) {
      const maskPath = getScreenshotPath(`debug-mask-${label}.png`);
      await sharp(maskData, {
        raw: { width, height, channels: 1 }
      }).toFile(maskPath);
      console.log(`💾 Saved: ${maskPath}`);
    }
    
    // Find contours (connected regions)
    const visited = new Set();
    const contours = [];
    
    const floodFill = (startX, startY) => {
      const points = [];
      const stack = [[startX, startY]];
      
      while (stack.length > 0) {
        const [x, y] = stack.pop();
        const key = `${x},${y}`;
        
        if (visited.has(key)) continue;
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        if (maskData[y * width + x] === 0) continue;
        
        visited.add(key);
        points.push([x, y]);
        
        // Check 8 neighbors
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            stack.push([x + dx, y + dy]);
          }
        }
      }
      
      return points;
    };
    
    // Find all contours
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const key = `${x},${y}`;
        if (maskData[y * width + x] === 255 && !visited.has(key)) {
          const points = floodFill(x, y);
          if (points.length >= 50) { // Minimum area (device pixels)
            contours.push(points);
          }
        }
      }
    }
    
    console.log(`🔍 Canvas[${label}]: Found ${contours.length} red/orange/white regions`);
    
    // Analyze each contour to find circles
    const candidates = [];
    
    for (const points of contours) {
      if (points.length < 50) continue;
      
      // Calculate bounding box (device pixels)
      let minX = width, maxX = 0, minY = height, maxY = 0;
      for (const [x, y] of points) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      
      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      
      // Filter by size in CSS pixels (divide device pixels by DPR)
      const bw_css = bw / dpr;
      const bh_css = bh / dpr;
      if (bw_css < 10 || bh_css < 10 || bw_css > 150 || bh_css > 150) continue;
      
      // Check aspect ratio (circle-like)
      const aspectRatio = bw / bh;
      if (aspectRatio < 0.6 || aspectRatio > 1.4) continue;
      
      // Calculate circularity
      const area = points.length;
      const perimeter = Math.sqrt(bw * bw + bh * bh) * Math.PI;
      const circularity = (4 * Math.PI * area) / (perimeter * perimeter);
      
      if (circularity < 0.3) continue;
      
      // Calculate center — divide device-pixel offsets by DPR to get CSS coordinates
      const centerX = minX + bw / 2;
      const centerY = minY + bh / 2;
      
      candidates.push({
        x: Math.round(canvasBox.x + centerX / dpr),
        y: Math.round(canvasBox.y + centerY / dpr),
        bbox: {
          x: Math.round(canvasBox.x + minX / dpr),
          y: Math.round(canvasBox.y + minY / dpr),
          w: Math.round(bw / dpr),
          h: Math.round(bh / dpr)
        },
        confidence: Math.min(circularity, 1.0),
        area: area,
        method: 'hsv-color-filter'
      });
    }
    
    // Sort by confidence (best first)
    candidates.sort((a, b) => b.confidence - a.confidence);
    
    if (candidates.length === 0) {
      console.log(`   Canvas[${label}]: no circular PUT handle found (${contours.length} regions checked)`);
      // Always save the canvas screenshot when detection fails so the user can diagnose visually
      const failPath = getScreenshotPath(`canvas-screenshot-${label}.png`);
      if (!fs.existsSync(failPath)) {
        fs.writeFileSync(failPath, screenshotBuffer);
        console.log(`💾 Saved for diagnostics: ${failPath}`);
      }
      return null;
    }
    
    const best = candidates[0];
    console.log(`✅ PUT handle detected on canvas[${label}] at (${best.x}, ${best.y})`);
    console.log(`   • Confidence: ${(best.confidence * 100).toFixed(1)}%`);
    console.log(`   • Area: ${best.area} pixels`);
    console.log(`   • BBox: ${best.bbox.w}x${best.bbox.h}`);
    
    // Save annotated image
    if (debugSave) {
      // SVG is drawn over the device-pixel screenshot, so convert CSS offsets back to device pixels
      const dx = (best.x - canvasBox.x) * dpr;
      const dy = (best.y - canvasBox.y) * dpr;
      const annotated = await sharp(screenshotBuffer)
        .composite([{
          input: Buffer.from(`
            <svg width="${info.width}" height="${info.height}">
              <circle cx="${dx}" cy="${dy}" r="${best.bbox.w * dpr / 2}" 
                      stroke="lime" stroke-width="3" fill="none"/>
              <circle cx="${dx}" cy="${dy}" r="5" 
                      fill="red"/>
              <text x="${dx + 15}" y="${dy - 10}" 
                    fill="lime" font-size="14" font-weight="bold">
                HSV: ${(best.confidence * 100).toFixed(0)}%
              </text>
            </svg>
          `),
          top: 0,
          left: 0
        }])
        .toBuffer();
      
      const resultPath = getScreenshotPath(`detection-result-${label}.png`);
      fs.writeFileSync(resultPath, annotated);
      console.log(`💾 Saved: ${resultPath}`);
    }
    
    return best;
    
  } catch (error) {
    console.log(`   Canvas[${label}] error: ${error.message}`);
    return null;
  }
}
