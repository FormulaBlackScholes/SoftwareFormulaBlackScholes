// utils/paths.js
// Provides writable paths for screenshots, logs, and test results
// Works in both development and packaged AppImage environments

import path from 'path';
import os from 'os';
import fs from 'fs';

// Determine if we're running from a read-only location (like AppImage)
const isReadOnly = process.cwd().includes('/.mount_') || process.cwd().includes('/tmp/');

// Base directory for writable data
const DATA_DIR = isReadOnly 
  ? path.join(os.homedir(), '.avaauto')
  : process.cwd();

// Ensure directories exist
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// Export writable paths
export const SCREENSHOTS_DIR = ensureDir(path.join(DATA_DIR, 'screenshots'));
export const LOGS_DIR = ensureDir(path.join(DATA_DIR, 'logs'));
export const TEST_RESULTS_DIR = ensureDir(path.join(DATA_DIR, 'test-results'));

// Helper to get a screenshot path
export function getScreenshotPath(filename) {
  return path.join(SCREENSHOTS_DIR, filename);
}

// Helper to get a log path
export function getLogPath(filename) {
  return path.join(LOGS_DIR, filename);
}

console.log(`📁 Data directory: ${DATA_DIR}`);
console.log(`📸 Screenshots: ${SCREENSHOTS_DIR}`);
console.log(`📋 Logs: ${LOGS_DIR}`);
console.log(`🧪 Test results: ${TEST_RESULTS_DIR}`);
