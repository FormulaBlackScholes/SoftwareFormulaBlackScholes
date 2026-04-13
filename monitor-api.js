// monitor-api.js
// Secure version: Uses API instead of direct database access

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import fs from 'fs';
import os from 'os';

dotenv.config();

const execAsync = promisify(exec);

// API configuration
const API_URL = process.env.TRADING_API_URL || 'https://formulablackandscholes.com/wp-json/trading/v1';
const API_KEY = process.env.TRADING_API_KEY;
const USER_EMAIL = process.env.CUSTOMER_EMAIL; // Optional: filter signals by user

// Log API configuration (separate from signals API)
const LOG_API_URL = 'https://formulablackandscholes.com/wp-json/ava/v1/log';
const LOG_API_KEY = process.env.LOG_API_KEY || API_KEY; // Use same key or separate LOG_API_KEY

// Tracking processed signals to avoid duplicate execution
const processedSignals = new Set();

// Poll interval in milliseconds (default: 5 seconds)
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL) || 5000;

const APP_NAME = 'Nobel Trading';

function getAppDataDir() {
  if (process.env.NOBEL_DATA_DIR) {
    return process.env.NOBEL_DATA_DIR;
  }

  if (process.platform === 'win32') {
    return path.join(os.homedir(), 'AppData', 'Local', APP_NAME);
  }

  if (process.env.XDG_STATE_HOME) {
    return path.join(process.env.XDG_STATE_HOME, 'nobel-trading');
  }

  return path.join(os.homedir(), '.local', 'state', 'nobel-trading');
}

const APP_DATA_DIR = getAppDataDir();

function resolvePlaywrightCli() {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, 'node_modules', '@playwright', 'test', 'cli.js'),
    path.join(os.homedir(), '.avaauto', 'node_modules', '@playwright', 'test', 'cli.js')
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

// System state tracking
let currentSystemState = 'ATTESA'; // ATTESA | APERTURA | OPERANDO | CHIUSURA

// State persistence file path
const STATE_FILE_PATH = path.join(APP_DATA_DIR, 'system-state.json');

// Global variable to store open trade details
let openTradeDetails = null;

/**
 * Save current system state to file for persistence across restarts
 */
function saveSystemState() {
  try {
    const stateDir = path.dirname(STATE_FILE_PATH);
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
    }
    
    const stateData = {
      state: currentSystemState,
      timestamp: new Date().toISOString(),
      lastUpdate: Date.now(),
      openTrade: openTradeDetails // Include trade details if any
    };
    
    fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(stateData, null, 2), 'utf8');
    console.log(`   💾 Stato salvato: ${currentSystemState}`);
    if (openTradeDetails) {
      console.log(`   📊 Trade salvato: Strike ${openTradeDetails.strike}, ${openTradeDetails.contracts} contratti`);
    }
  } catch (error) {
    console.error('   ⚠️  Errore salvataggio stato:', error.message);
  }
}

/**
 * Load system state from file
 */
function loadSystemState() {
  try {
    if (fs.existsSync(STATE_FILE_PATH)) {
      const data = fs.readFileSync(STATE_FILE_PATH, 'utf8');
      const stateData = JSON.parse(data);
      
      // Check if state is recent (less than 24 hours old)
      const age = Date.now() - stateData.lastUpdate;
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      
      if (age < maxAge) {
        console.log(`📂 Stato caricato da file: ${stateData.state} (${new Date(stateData.timestamp).toLocaleString()})`);
        
        // Restore open trade details if present
        if (stateData.openTrade) {
          openTradeDetails = stateData.openTrade;
          console.log(`📊 Trade caricato: Strike ${openTradeDetails.strike}, ${openTradeDetails.contracts} contratti`);
        }
        
        return stateData.state;
      } else {
        console.log('📂 Stato in file troppo vecchio, ignorato');
      }
    }
  } catch (error) {
    console.error('⚠️  Errore caricamento stato:', error.message);
  }
  
  return 'ATTESA'; // Default state
}

// Load state at startup
currentSystemState = loadSystemState();

// Browser display mode from environment (loaded from .env file)
// HEADLESS=true (default) = hidden, HEADLESS=false = fullscreen visible
const HEADLESS = process.env.HEADLESS !== 'false';

console.log('🤖 Trading Signal Monitor Started (API Mode)');
console.log(`📊 API URL: ${API_URL}`);
console.log(`👤 User Email: ${USER_EMAIL || 'All users'}`);
console.log(`⏱️  Poll Interval: ${POLL_INTERVAL}ms`);
console.log(`� HEADLESS env var: "${process.env.HEADLESS}"`);
console.log(`�🖥️  Browser Mode: ${HEADLESS ? 'Hidden (window off-screen)' : 'Fullscreen Visible (non-interactive)'}\n`);
/**
 * Filter levels mapping
 * Level 1 (Severo): Accepts only "severo" technical level
 * Level 2 (Bilanciato): Accepts "severo" and "bilanciato" 
 * Level 3 (Flessibile): Accepts all levels ("severo", "bilanciato", "flessibile")
 */
const FILTER_LEVEL_MAPPING = {
  1: ['severo'],                           // Only most conservative
  2: ['severo', 'bilanciato'],            // Conservative + balanced
  3: ['severo', 'bilanciato', 'flessibile'] // All levels
};

/**
 * Determine current system state based on:
 * - Trade in progress (Margine Richiesto > 0)
 * - Signal present in database
 * 
 * States:
 * - ATTESA: No trade + No signal
 * - APERTURA: No trade + Signal present  
 * - OPERANDO: Trade in progress + No signal
 * - CHIUSURA: Trade in progress + Signal present
 */
function determineSystemState(hasActiveTrade, hasActiveSignal) {
  let newState;
  
  if (!hasActiveTrade && !hasActiveSignal) {
    newState = 'ATTESA';
  } else if (!hasActiveTrade && hasActiveSignal) {
    newState = 'APERTURA';
  } else if (hasActiveTrade && !hasActiveSignal) {
    newState = 'OPERANDO';
  } else { // hasActiveTrade && hasActiveSignal
    newState = 'CHIUSURA';
  }
  
  // Update global state if changed
  if (newState !== currentSystemState) {
    const oldState = currentSystemState;
    currentSystemState = newState;
    console.log(`\n📊 CAMBIO STATO: ${oldState} → ${newState}`);
    console.log(`   Trade attivo: ${hasActiveTrade ? 'Sì' : 'No'}`);
    console.log(`   Segnale presente: ${hasActiveSignal ? 'Sì' : 'No'}\n`);
    
    // Save state to file
    saveSystemState();
  }
  
  return newState;
}

/**
 * Apply filter based on user's selected filter level
 * Returns true if signal should be executed, false if filtered out
 */
function applyFilter(signal, filterLevel) {
  const acceptedLevels = FILTER_LEVEL_MAPPING[filterLevel] || FILTER_LEVEL_MAPPING[2];
  
  // If signal doesn't have livello_tecnico, skip it (not suitable)
  if (!signal.livello_tecnico) {
    console.log(`   ⚠️  Segnale senza livello_tecnico - non idoneo per l'esecuzione`);
    return false;
  }
  
  const technicalLevel = signal.livello_tecnico.toLowerCase().trim();
  
  console.log(`   📊 Livello tecnico segnale: "${technicalLevel}"`);
  console.log(`   ⚙️  Livelli accettati (filtro ${filterLevel}): ${acceptedLevels.join(', ')}`);
  
  // Check if signal's technical level is accepted by user's filter
  if (!acceptedLevels.includes(technicalLevel)) {
    console.log(`   ⛔ Livello tecnico "${technicalLevel}" non accettato dal filtro selezionato`);
    return false;
  }
  
  console.log(`   ✅ Livello tecnico "${technicalLevel}" accettato`);
  return true;
}

// Bug Report API configuration
const BUG_REPORT_API_URL = 'https://formulablackandscholes.com/wp-json/bugreport/v1/submit';
const BUG_REPORT_API_KEY = '6h0Wa7dLKekUUS4GOigFWvYbampz1piG';

// --- Bug report helpers ---

/**
 * Replace financial amounts in a string with "X" (privacy compliance).
 * Handles: €1,234.56 / 1,234 CHF / CHF 1,234.56
 */
function anonymizeFinancialString(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/[€$£¥][\d,\.]+/g, '€X')
    .replace(/\b[\d,]+\.?\d*\s*(CHF|EUR|USD|GBP|JPY)\b/gi, 'X $1')
    .replace(/\b(CHF|EUR|USD|GBP|JPY)\s*[\d,]+\.?\d*\b/gi, '$1 X')
    .replace(/\b\d{1,}(,\d{3})+(\.\d{1,2})?\b/g, 'X');
}

/**
 * Recursively replace sensitive financial fields in an object with "X".
 */
function anonymizeFinancialObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const SENSITIVE_FIELDS = new Set([
    'strike', 'contracts', 'margin', 'profitLoss', 'profitLossCurrency',
    'balance', 'amount', 'price', 'livello_cliente_reale'
  ]);
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.has(key)) {
      result[key] = 'X';
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = anonymizeFinancialObject(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Extract the most meaningful error line from Playwright test output.
 * Playwright prints the actual Error: message near the end of stdout.
 */
function extractPlaywrightError(text) {
  if (!text) return null;
  const match = text.match(/\n\s*((?:Error|TimeoutError|AssertionError):[^\n]+)/);
  if (match) return match[1].trim();
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/❌/.test(lines[i]) && lines[i].trim()) return lines[i].trim();
  }
  return null;
}

/**
 * Collect all lines that look like errors/failures from combined output.
 */
function extractErrorLines(text) {
  if (typeof text !== 'string') return '';
  const relevant = text.split('\n').filter(line =>
    /❌|Error:|FAILED|failed|TIMEOUT|TimeoutError|✗|× /.test(line) && line.trim()
  );
  return relevant.slice(0, 25).join('\n');
}

/**
 * Send automatic bug report when trade operations fail
 * @param {string} operationType - 'OPEN' or 'CLOSE'
 * @param {Object} signal - The signal that was being processed
 * @param {Error} error - The error that occurred
 * @param {Object} additionalInfo - Extra context (optional)
 */
async function sendAutomaticBugReport(operationType, signal, error, additionalInfo = {}) {
  try {
    // Get version from package.json
    let version = 'unknown';
    try {
      const packagePath = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), 'package.json');
      if (fs.existsSync(packagePath)) {
        const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        version = pkg.version || 'unknown';
      }
    } catch (e) {
      // Ignore version read errors
    }

    // Prefer the meaningful Playwright error over the generic exec wrapper message
    const playwrightError = extractPlaywrightError(error.stdout || '') || extractPlaywrightError(error.stderr || '');
    const errorMessage = `[AUTO] ${operationType} trade fallito: ${playwrightError || error.message}`;

    const logs = [
      {
        timestamp: new Date().toISOString(),
        level: 'ERROR',
        category: 'Trading',
        message: errorMessage
      },
      {
        timestamp: new Date().toISOString(),
        level: 'INFO',
        category: 'Context',
        // Strike is omitted for privacy compliance
        message: `Signal ID: ${signal?.id}, Segnale: ${signal?.segnale}, Strike: X, Account: ${signal?.tipo_account}`
      },
      {
        timestamp: new Date().toISOString(),
        level: 'DEBUG',
        category: 'Process',
        message: `Exit code: ${error.code ?? 'N/A'}, Killed: ${error.killed ?? false}, Signal: ${error.signal ?? 'N/A'}, OS: ${process.platform}`
      }
    ];

    // Dedicated entry with all error/failure lines for quick diagnosis
    const combined = (error.stdout || '') + '\n' + (error.stderr || '');
    const errLines = extractErrorLines(combined);
    if (errLines) {
      logs.push({
        timestamp: new Date().toISOString(),
        level: 'ERROR',
        category: 'TestErrors',
        message: anonymizeFinancialString(errLines)
      });
    }

    // stdout: first 300 chars (setup context) + last 2500 chars (where failures appear)
    if (error.stdout) {
      const stdout = error.stdout;
      const stdoutSummary = stdout.length > 3000
        ? stdout.slice(0, 300) + '\n...[middle omitted]...\n' + stdout.slice(-2500)
        : stdout;
      logs.push({
        timestamp: new Date().toISOString(),
        level: 'DEBUG',
        category: 'stdout',
        message: anonymizeFinancialString(stdoutSummary)
      });
    }
    if (error.stderr) {
      logs.push({
        timestamp: new Date().toISOString(),
        level: 'ERROR',
        category: 'stderr',
        message: anonymizeFinancialString(error.stderr.substring(0, 2000))
      });
    }

    // Additional info with financial fields anonymized
    if (Object.keys(additionalInfo).length > 0) {
      logs.push({
        timestamp: new Date().toISOString(),
        level: 'INFO',
        category: 'Extra',
        message: JSON.stringify(anonymizeFinancialObject(additionalInfo))
      });
    }

    const reportData = {
      version: version,
      userEmail: signal?.email || USER_EMAIL || 'monitor@nobeltrading.local',
      errorMessage: errorMessage,
      logs: logs
    };

    console.log('📤 Invio bug report automatico...');

    const response = await fetch(BUG_REPORT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': BUG_REPORT_API_KEY
      },
      body: JSON.stringify(reportData)
    });

    if (response.ok) {
      const result = await response.json();
      if (result.success) {
        console.log(`✅ Bug report inviato automaticamente (ID: ${result.id})`);
      } else {
        console.log(`⚠️  Bug report fallito: ${result.error || 'unknown error'}`);
      }
    } else {
      console.log(`⚠️  Bug report HTTP error: ${response.status}`);
    }
  } catch (reportError) {
    // Non-blocking: log error but don't crash
    console.log(`⚠️  Impossibile inviare bug report: ${reportError.message}`);
  }
}

/**
 * Fetch pending signals from API
 * CRITICAL: A signal is valid ONLY if the 'segnale' field contains "APRI" or "CHIUDI"
 * If 'segnale' is empty/NULL, even if other fields (strike, margin, etc.) are present,
 * it's NOT a valid signal.
 */
async function fetchPendingSignals() {
  try {
    const url = new URL(`${API_URL}/signals/pending`);
    if (USER_EMAIL) {
      url.searchParams.append('email', USER_EMAIL);
    }
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    const signals = await response.json();
    
    // Filter signals: ONLY valid if 'segnale' field is 'APRI' or 'CHIUDI'
    const validSignals = signals.filter(signal => {
      const hasValidSignalField = signal.segnale === 'APRI' || signal.segnale === 'CHIUDI';
      
      if (!hasValidSignalField) {
        console.log(`   ⏭️  Skipping record ${signal.id} - campo 'segnale' non valido: "${signal.segnale || '(vuoto)'}"`);
      }
      
      return hasValidSignalField;
    });
    
    return validSignals;
  } catch (error) {
    // CRITICAL: Return null (not empty array) on connection errors
    // This signals to caller that connection is lost, not just no signals
    console.error('❌ Error fetching signals:', error.message);
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.message.includes('fetch failed')) {
      console.error('⚠️  \x1b[31mCONNESSIONE PERSA\x1b[0m - impossibile raggiungere API');
      return null; // Signal connection loss
    }
    return []; // Other errors (auth, etc) - return empty to retry
  }
}

/**
 * Mark signal as processed via API (logs only, doesn't modify signals table)
 */
async function markSignalProcessed(signalId, success) {
  try {
    const response = await fetch(`${API_URL}/signals/${signalId}/complete`, {
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `success=${success ? 1 : 0}`
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('❌ Error marking signal as processed:', error.message);
    return null;
  }
}

/**
 * Sync client level from real wallet to database
 * Only syncs if livello_cliente_reale exists AND account is REAL
 */
async function syncClientLevel(signal) {
  // Only sync REAL accounts with a real wallet value
  if (signal.tipo_account !== 'REAL' || !signal.livello_cliente_reale) {
    return signal; // Return unchanged signal
  }

  try {
    console.log(`   🔄 Syncing real wallet level for ${signal.email}...`);
    
    const response = await fetch(`${API_URL}/sync-real-level`, {
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: signal.email
      })
    });

    if (!response.ok) {
      console.log(`   ⚠️  Could not sync client level: ${response.status}`);
      return signal; // Return unchanged signal on error
    }

    const result = await response.json();

    if (result.success && result.updated) {
      console.log(`   ✅ Client level updated: ${result.old_level} → ${result.new_level}`);
      // Update signal object with new level
      signal.livello_cliente = result.new_level;
    } else if (result.success && !result.updated) {
      console.log(`   ✅ Client level already correct: ${result.level}`);
    }

    return signal;
  } catch (error) {
    console.error(`   ❌ Error syncing client level: ${error.message}`);
    return signal; // Return unchanged signal on error
  }
}

/**
 * Log trade execution to avaopions_log table
 */
async function logTradeToDatabase(signal) {
  try {
    const logData = {
      nome_comleto: signal.nome_completo || '',
      email: signal.email || '',
      tipo_account: signal.tipo_account || '',
      livello_cliente: signal.livello_cliente || '',
      segnale: signal.segnale || '',
      strike: signal.strike ? parseFloat(signal.strike) : null,
      margine_per_contratto: signal.margine_per_contratto ? parseFloat(signal.margine_per_contratto) : null,
      orario_scadenza: signal.orario_scadenza || null,
      giorni_a_scadenza: signal.giorni_a_scadenza ? parseInt(signal.giorni_a_scadenza) : null
    };

    const response = await fetch(LOG_API_URL, {
      method: 'POST',
      headers: {
        'X-API-Key': LOG_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(logData)
    });

    if (response.status === 204) {
      console.log('   ✅ Trade logged to database successfully');
      return true;
    } else {
      const errorText = await response.text();
      console.error(`   ❌ Failed to log trade: HTTP ${response.status} - ${errorText}`);
      return false;
    }
  } catch (error) {
    console.error('   ❌ Error logging trade to database:', error.message);
    return false;
  }
}

/**
 * Log operation to financial history file
 */
async function logToHistory(operation, signal, success, balance = null) {
  try {
    // Determine history file location (same as Electron app userData)
    const userDataPath = APP_DATA_DIR;
    const historyFile = path.join(userDataPath, 'trading-history.json');
    
    // Ensure directory exists
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    
    // Initialize file if doesn't exist
    if (!fs.existsSync(historyFile)) {
      fs.writeFileSync(historyFile, JSON.stringify({ operations: [] }, null, 2), 'utf8');
    }
    
    // Read existing history
    const data = fs.readFileSync(historyFile, 'utf8');
    const history = JSON.parse(data);
    
    // Create history entry
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      accountType: signal.tipo_account || 'DEMO',
      operation: operation, // 'OPEN' or 'CLOSE'
      strike: signal.strike || null,
      contracts: signal.contracts || null,
      expiry: signal.orario_scadenza ? `${signal.giorni_a_scadenza || 0}D - ${signal.orario_scadenza}` : null,
      status: success ? 'completed' : 'failed',
      balance: balance || null,
      email: signal.email || null,
      name: signal.nome_completo || null
    };
    
    // Add to beginning
    history.operations.unshift(entry);
    
    // Keep only last 1000 operations
    if (history.operations.length > 1000) {
      history.operations = history.operations.slice(0, 1000);
    }
    
    // Save back to file
    fs.writeFileSync(historyFile, JSON.stringify(history, null, 2), 'utf8');
    
    console.log(`   📊 Operation logged to history: ${operation} - ${signal.tipo_account}`);
    return true;
  } catch (error) {
    console.error('   ⚠️  Error logging to history:', error.message);
    return false;
  }
}

/**
 * Reset segnale field to NULL (clears the signal)
 */
async function resetSegnaleField(signalId) {
  try {
    const response = await fetch(`${API_URL}/signals/${signalId}/status`, {
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'reset=1'
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const result = await response.json();
    console.log(`   ✓ Field 'segnale' cleared for signal ${signalId}`);
    return true;
  } catch (error) {
    console.error(`   ⚠️  Could not reset segnale field: ${error.message}`);
    return false;
  }
}

/**
 * Erase specific fields after closing a trade
 */
async function eraseSignalFields(signalId, fields) {
  try {
    const response = await fetch(`${API_URL}/signals/${signalId}/erase`, {
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `fields=${encodeURIComponent(fields.join(','))}`
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const result = await response.json();
    console.log(`   ✓ Erased fields: ${result.erased ? result.erased.join(', ') : fields.join(', ')}`);
    return true;
  } catch (error) {
    console.error(`   ⚠️  Could not erase fields: ${error.message}`);
    return false;
  }
}

/**
 * Calculate days until expiry date (fallback if giorni_a_scadenza not provided)
 */
function calculateDaysToExpiry(expiryDateStr) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset time to midnight

    // Parse YYYY-MM-DD in local time to avoid UTC timezone shifts.
    let expiryDate;
    const m = String(expiryDateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      expiryDate = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    } else {
      expiryDate = new Date(expiryDateStr);
    }
    expiryDate.setHours(0, 0, 0, 0);
    
    const diffTime = expiryDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays > 0 ? diffDays : 0;
  } catch (error) {
    console.error('Error calculating days to expiry:', error.message);
    return null;
  }
}

/**
 * Execute the trade opening script with parameters from signal
 */
async function executeOpenTrade(signal) {
  // Prefer explicit expiry date when present (more reliable than precomputed day count).
  // giorni_a_scadenza can become stale across day/timezone boundaries.
  let daysToExpiry;
  if (signal.giorno_scadenza && signal.giorno_scadenza !== '0000-00-00') {
    // Calculate from absolute expiry date (source of truth)
    daysToExpiry = calculateDaysToExpiry(signal.giorno_scadenza);
  } else if (signal.giorni_a_scadenza) {
    // Fallback to precomputed value when date is not available
    daysToExpiry = parseInt(signal.giorni_a_scadenza);
  } else {
    daysToExpiry = 26; // Default fallback
  }
  
  console.log(`\n📊 NOTIFICA | Condizione strategica rilevata`);
  console.log(`   👤 Utente: ${signal.nome_completo}`);
  console.log(`   📧 Email: ${signal.email}`);
  console.log(`   💼 Account: ${signal.tipo_account}`);
  console.log(`   🎯 Strike riferimento: ${signal.strike}`);
  console.log(`   ⏱️  Scadenza: ${daysToExpiry}D - ${signal.orario_scadenza}`);
  if (signal.giorno_scadenza && signal.giorno_scadenza !== '0000-00-00') {
    console.log(`   📅 Data: ${signal.giorno_scadenza}`);
  }
  console.log(`   ℹ️  Questo segnale è informativo. L'esecuzione dipende dalle tue impostazioni.`);
  
  // Apply filter based on user's selected level
  const filterLevel = parseInt(process.env.FILTER_LEVEL || '2'); // Default: Balanced
  const shouldExecute = applyFilter(signal, filterLevel);
  
  if (!shouldExecute) {
    console.log(`   ⚠️  Segnale filtrato in base alle tue preferenze (livello: ${filterLevel})`);
    console.log(`   ℹ️  Il segnale non soddisfa i criteri di selettività impostati.\n`);
    
    // Mark as processed but not executed
    await markSignalProcessed(signal.id, false);
    processedSignals.add(signal.id);
    return;
  }
  
  console.log(`   ✓ Segnale supera i filtri (livello: ${filterLevel}). Procedo con esecuzione.\n`);
  
  try {

    // Pass parameters to Playwright script via environment variables
    // Prefer credentials included in the signal (if the signal carries broker credentials
    // for multi-user deployments), otherwise fall back to environment credentials.
    const env = {
      ...process.env,
      TRADE_STRIKE: (signal.strike && signal.strike.toString()) || '',
      TRADE_ACCOUNT_TYPE: signal.tipo_account || '',
      TRADE_MARGIN: (signal.margine_per_contratto && signal.margine_per_contratto.toString()) || '',
      TRADE_CLIENT_LEVEL: signal.livello_cliente || '',
      TRADE_EXPIRY_DAYS: (daysToExpiry && daysToExpiry.toString()) || '',
      TRADE_EXPIRY_TIME: signal.orario_scadenza || '',
      TRADE_EXPIRY_DATE: signal.giorno_scadenza || '',
      USER_EMAIL: signal.email || '',
      USER_NAME: signal.nome_completo || '',
      // Allow per-signal broker credentials to override defaults when present
      TRADE_USER: signal.ava_username || signal.broker_username || signal.email || process.env.AVA_USERNAME || '',
      TRADE_PASSWORD: signal.ava_password || signal.broker_password || process.env.AVA_PASSWORD || ''
    };
    
    // Detect OS and use xvfb only on Linux
    const isWindows = process.platform === 'win32';
    const debugMode = process.env.DEBUG_BROWSER === 'true'; // Set to true to see browser
    
    console.log(`   Platform: ${process.platform}, isWindows: ${isWindows}, debugMode: ${debugMode}`);
    
    // Use current Node.js executable (Electron's bundled Node.js) with Playwright CLI
    // This ensures we use the correct Node.js version instead of system Node.js
    const nodeExe = process.execPath;
    const playwrightCli = resolvePlaywrightCli();
    if (!playwrightCli) {
      throw new Error('Playwright CLI non trovato. Esegui setup-nobel.sh per installare il runtime.');
    }
    // Use relative path from testDir for Playwright to find the test
    const baseCommand = `"${nodeExe}" "${playwrightCli}" test tests/trade.spec.js`;
    
    // On Linux: use xvfb only if no DISPLAY is already available.
    // If DISPLAY exists (xrdp session or systemd xvfb-run wrapper), reuse it.
    // This ensures CF cookies from warm-up work (same display environment).
    const hasDisplay = !!process.env.DISPLAY;
    const useXvfb = !isWindows && !debugMode && !hasDisplay;
    const command = useXvfb
      ? `xvfb-run --auto-servernum --server-args="-screen 0 1920x1080x24" ${baseCommand}`
      : baseCommand;
    
    console.log(`   Executing: ${command}`);
    console.log(`   DISPLAY: ${process.env.DISPLAY || '(not set)'}, useXvfb: ${useXvfb}, hasDisplay: ${hasDisplay}`);
    
    const { stdout, stderr } = await execAsync(command, {
      env,
      cwd: process.cwd(),
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      timeout: 300000 // 5 minutes timeout
    });
    
    if (stdout) console.log('   Output:', stdout);
    if (stderr) console.log('   Stderr:', stderr);
    
    console.log('✅ Trade opened successfully');
    
    // Extract balance from output
    let balance = null;
    if (stdout) {
      const balanceMatch = stdout.match(/💰 BALANCE_INFO: ([\d.]+)/);
      if (balanceMatch) {
        balance = parseFloat(balanceMatch[1]);
        console.log(`   📊 Extracted balance: ${balance} CHF`);
      }
    }
    
    // Extract P&L from output
    let profitLoss = 0;
    if (stdout) {
      const plMatch = stdout.match(/💰 PL_INFO: (-?[\d.]+)/);
      if (plMatch) {
        profitLoss = parseFloat(plMatch[1]);
        console.log(`   📊 Extracted P/L: ${profitLoss >= 0 ? '+' : ''}${profitLoss} CHF`);
      }
    }
    
    // Save trade details for dashboard display
    // Calculate actual expiry date using daysToExpiry already computed at top of function
    const expiryDateObj = new Date();
    expiryDateObj.setDate(expiryDateObj.getDate() + (daysToExpiry || 0));
    const expiryDateStr = expiryDateObj.toISOString().split('T')[0]; // "YYYY-MM-DD"

    openTradeDetails = {
      strike: signal.strike,
      instrument: 'US500CASH', // Could be extracted from signal if available
      type: 'PUT', // Could be extracted from signal if available
      contracts: Math.floor((0.5 * (balance || 10000)) / (signal.margine_per_contratto || 1000)),
      expiry: `${signal.orario_scadenza} (${signal.giorni_a_scadenza})`,
      expiryDate: expiryDateStr,
      expiryTime: signal.orario_scadenza,
      margin: signal.margine_per_contratto,
      openTime: new Date().toISOString(),
      accountType: signal.tipo_account || 'DEMO',
      profitLoss: profitLoss, // P&L iniziale
      profitLossCurrency: 'CHF'
    };
    
    console.log('');
    console.log('📊 TRADE APERTO:');
    console.log(`   Strumento: ${openTradeDetails.instrument}`);
    console.log(`   Tipo: ${openTradeDetails.type}`);
    console.log(`   Strike: ${openTradeDetails.strike}`);
    console.log(`   Contratti: ${openTradeDetails.contracts}`);
    console.log(`   Scadenza: ${openTradeDetails.expiry}`);
    console.log(`   Margine/contratto: ${openTradeDetails.margin} CHF`);
    console.log(`   P/L iniziale: ${openTradeDetails.profitLoss >= 0 ? '+' : ''}${openTradeDetails.profitLoss} CHF`);
    console.log(`   Account: ${openTradeDetails.accountType}`);
    console.log('');
    
    // Update state to OPERANDO (trade is now open)
    const _prevStateOpen = currentSystemState;
    currentSystemState = 'OPERANDO';
    saveSystemState();
    console.log(`\n📊 CAMBIO STATO: ${_prevStateOpen} → OPERANDO`);
    console.log(`   Trade attivo: Sì`);
    console.log(`   Segnale presente: No\n`);
    
    // Log trade to database
    await logTradeToDatabase(signal);
    
    // Log to financial history with balance
    await logToHistory('OPEN', signal, true, balance);
    
    return true;
  } catch (error) {
    console.error('❌ Error opening trade:', error.message);
    if (error.stdout) console.log('   Output:', error.stdout);
    if (error.stderr) console.log('   Error:', error.stderr);
    
    // Distinguish between different error types
    const errorText = error.message + (error.stdout || '') + (error.stderr || '');
    
    // Case 1: Safety validation failed (strike too far from target)
    // Pattern: "Safety validation failed" or "Trade aborted: Safety validation"
    const isSafetyValidationFailed = errorText.includes('Safety validation failed');
    
    // Case 2: Trade already open BEFORE execution (detected in pre-check)
    // Pattern: "Trade già aperto rilevato" ONLY (not safety validation)
    const isTradeAlreadyOpen = (errorText.includes('Trade già aperto rilevato') ||
                                (errorText.includes('🛑 TRADE ABORTED') && 
                                 errorText.includes('Margine Richiesto:') && 
                                 !errorText.includes('Safety validation'))) &&
                               !errorText.includes('TRADE EXECUTION FAILED');
    
    // Case 3: Trade execution failed AFTER clicking Esegui (Margine still 0)
    // Pattern: "TRADE EXECUTION FAILED" and "Margine Richiesto is still 0.0"
    const isExecutionFailed = errorText.includes('TRADE EXECUTION FAILED') &&
                             errorText.includes('Margine Richiesto is still 0.0');
    
    if (isSafetyValidationFailed) {
      console.log('');
      console.log('⚠️  SCENARIO: Safety validation fallita (strike deviato dal target)');
      console.log('   ℹ️  Il segnale NON verrà cancellato');
      console.log('   ℹ️  Il monitor riproverà automaticamente al prossimo ciclo');
      console.log('   ℹ️  Possibili cause: slider impreciso, cambio mercato, volatilità');
      console.log('');
      
      // Log failed operation to history
      await logToHistory('OPEN', signal, false);
      
      // DO NOT clear signal - leave it for retry
      return false;
    }
    
    if (isTradeAlreadyOpen) {
      console.log('');
      console.log('🛑 SCENARIO: Trade già aperto prima dell\'esecuzione');
      console.log('   ℹ️  Il segnale verrà cancellato per evitare tentativi ripetuti');
      console.log('   ℹ️  Chiudi il trade esistente prima di aprirne uno nuovo');
      console.log('');
      
      // Mark as processed (failed due to existing trade)
      await markSignalProcessed(signal.id, false);
      
      // Clear segnale field and trade-specific fields
      await resetSegnaleField(signal.id);
      const fieldsToErase = ['strike', 'margine_per_contratto', 'orario_scadenza', 'giorni_a_scadenza'];
      await eraseSignalFields(signal.id, fieldsToErase);
      
      return false;
    }
    
    if (isExecutionFailed) {
      console.log('');
      console.log('⚠️  SCENARIO: Esecuzione fallita (click Esegui ma nessun margine assegnato)');
      console.log('   ℹ️  Il segnale NON verrà cancellato');
      console.log('   ℹ️  Il monitor riproverà automaticamente al prossimo ciclo');
      console.log('   ℹ️  Possibili cause: timeout broker, errore temporaneo, saldo insufficiente');
      console.log('');
      
      // Log failed operation to history
      await logToHistory('OPEN', signal, false);
      
      // DO NOT clear signal - leave it for retry
      return false;
    }
    
    // Case 3: Generic technical error (network, timeout, etc.)
    await logToHistory('OPEN', signal, false);
    
    // Send automatic bug report for unexpected failures
    await sendAutomaticBugReport('OPEN', signal, error, {
      scenario: 'generic_error',
      currentState: currentSystemState
    });
    
    return false;
  }
}

/**
 * Execute the trade closing script
 */
async function executeCloseTrade(signal) {
  console.log(`\n📊 NOTIFICA | Condizione chiusura rilevata`);
  console.log(`   👤 Utente: ${signal.nome_completo}`);
  console.log(`   📧 Email: ${signal.email}`);
  console.log(`   💼 Account: ${signal.tipo_account}`);
  console.log(`   ℹ️  Questo segnale è informativo. L'esecuzione dipende dalle tue impostazioni.`);
  
  try {
    // Prefer credentials included in the signal (if the signal carries broker credentials
    // for multi-user deployments), otherwise fall back to environment credentials.
    const env = {
      ...process.env,
      TRADE_ACCOUNT_TYPE: signal.tipo_account,
      USER_EMAIL: signal.email,
      USER_NAME: signal.nome_completo,
      // Allow per-signal broker credentials to override defaults when present
      TRADE_USER: signal.ava_username || signal.broker_username || signal.email || process.env.AVA_USERNAME || '',
      TRADE_PASSWORD: signal.ava_password || signal.broker_password || process.env.AVA_PASSWORD || ''
    };
    
    // Detect OS and use xvfb only on Linux
    const isWindows = process.platform === 'win32';
    const debugMode = process.env.DEBUG_BROWSER === 'true'; // Set to true to see browser
    
    // Use current Node.js executable (Electron's bundled Node.js) with Playwright CLI
    // This ensures we use the correct Node.js version instead of system Node.js
    const nodeExe = process.execPath;
    const playwrightCli = resolvePlaywrightCli();
    if (!playwrightCli) {
      throw new Error('Playwright CLI non trovato. Esegui setup-nobel.sh per installare il runtime.');
    }
    // Use relative path from testDir for Playwright to find the test
    const baseCommand = `"${nodeExe}" "${playwrightCli}" test tests/close_trade.spec.js`;
    
    // On Linux: use xvfb only if no DISPLAY is already available.
    // If DISPLAY exists (xrdp session or systemd xvfb-run wrapper), reuse it.
    const hasDisplay = !!process.env.DISPLAY;
    const useXvfb = !isWindows && !debugMode && !hasDisplay;
    const command = useXvfb
      ? `xvfb-run --auto-servernum --server-args="-screen 0 1920x1080x24" ${baseCommand}`
      : baseCommand;
    
    console.log(`   Executing: ${command}`);
    
    const { stdout, stderr } = await execAsync(command, {
      env,
      cwd: process.cwd(),
      maxBuffer: 10 * 1024 * 1024,
      timeout: 300000 // 5 minutes timeout
    });
    
    if (stdout) console.log('   Output:', stdout);
    if (stderr) console.log('   Stderr:', stderr);
    
    console.log('✅ Trade closed successfully');
    
    // Extract balance from output
    let balance = null;
    if (stdout) {
      const balanceMatch = stdout.match(/💰 BALANCE_INFO: ([\d.]+)/);
      if (balanceMatch) {
        balance = parseFloat(balanceMatch[1]);
        console.log(`   📊 Extracted balance: ${balance} CHF`);
      }
    }
    
    // Extract final P&L from output
    let finalPL = 0;
    if (stdout) {
      const plMatch = stdout.match(/💰 PL_FINAL_INFO: (-?[\d.]+)/);
      if (plMatch) {
        finalPL = parseFloat(plMatch[1]);
        console.log(`   💰 P/L finale: ${finalPL >= 0 ? '+' : ''}${finalPL} CHF`);
      }
    }
    
    // Update trade details with final P&L before clearing
    if (openTradeDetails) {
      openTradeDetails.profitLoss = finalPL;
      console.log(`   📈 Trade chiuso con P/L: ${finalPL >= 0 ? '+' : ''}${finalPL} CHF`);
    }
    
    // Clear open trade details
    console.log('🧹 Pulizia dettagli trade chiuso...');
    openTradeDetails = null;
    
    // Update state back to ATTESA (no trade, no signal)
    const _prevStateClose = currentSystemState;
    currentSystemState = 'ATTESA';
    saveSystemState();
    console.log(`\n📊 CAMBIO STATO: ${_prevStateClose} → ATTESA`);
    console.log(`   Trade attivo: No`);
    console.log(`   Segnale presente: No\n`);
    
    // Log trade closure to database
    await logTradeToDatabase(signal);
    
    // Log to financial history with balance
    await logToHistory('CLOSE', signal, true, balance);
    
    return true;
  } catch (error) {
    console.error('❌ Error closing trade:', error.message);
    if (error.stdout) console.log('   Output:', error.stdout);
    if (error.stderr) console.log('   Error:', error.stderr);
    
    // Log failed operation to history
    await logToHistory('CLOSE', signal, false);
    
    // Send automatic bug report for close failures
    await sendAutomaticBugReport('CLOSE', signal, error, {
      scenario: 'close_failed',
      currentState: currentSystemState,
      openTradeDetails: openTradeDetails
    });
    
    // Reset state to OPERANDO (trade still active, signal consumed/failed)
    updateSystemState(true, false);
    console.log('⚠️  Chiusura fallita - stato resettato a OPERANDO');
    
    return false;
  }
}

/**
 * Poll the API for new signals
 */
async function pollAPI() {
  try {
    // CRITICAL SAFETY CHECK: Verify API connection before processing
    const signals = await fetchPendingSignals();
    
    // If API call failed (null or undefined), connection is lost
    if (signals === null || signals === undefined) {
      console.error('\u26A0\uFE0F  API connessione persa - sospensione operazioni');
      return; // Don't process anything if disconnected
    }
    
    // Determine current system state
    // hasActiveSignal = any pending signal in database
    // hasActiveTrade = determined by checking Margine Richiesto in browser (will be added later)
    const hasActiveSignal = signals.length > 0;
    
    // For now, we'll update state based on signals only
    if (signals.length === 0) {
      // No signals: if we have an active trade (OPERANDO/CHIUSURA), keep OPERANDO.
      // Only go to ATTESA if there was no active trade.
      if (currentSystemState === 'OPERANDO' || currentSystemState === 'CHIUSURA') {
        updateSystemState(true, false); // → OPERANDO
      } else {
        updateSystemState(false, false); // → ATTESA
      }
      return; // No new signals
    }
    
    console.log(`\n📬 Found ${signals.length} new signal(s)`);
    
    // Update state based on signal type and current state
    // Determine if we currently have an active trade by checking current state
    const hasActiveTrade = (currentSystemState === 'OPERANDO' || currentSystemState === 'CHIUSURA');
    
    // Check signal type to determine correct state transition
    const firstSignal = signals[0]; // Use first signal to determine state
    if (firstSignal.segnale === 'APRI') {
      // APRI signal: should be APERTURA (no trade yet, signal present)
      updateSystemState(false, true);
    } else if (firstSignal.segnale === 'CHIUDI') {
      // CHIUDI signal: ALWAYS means CHIUSURA (trade must be active to close it)
      // Even if margin check failed at startup, a CHIUDI signal implies a trade exists
      updateSystemState(true, true);
    }
    
    for (const signal of signals) {
      // Create a unique key that includes timestamp to allow multiple APRI/CHIUDI cycles
      // Use data_creazione or current timestamp to differentiate between different signals
      const timestamp = signal.data_creazione || signal.data_modifica || new Date().toISOString();
      const signalKey = `${signal.id}-${signal.segnale}-${timestamp}`;
      
      // Skip if already processed in this session
      // Check both signalKey and plain signal.id (filter path adds signal.id)
      if (processedSignals.has(signalKey) || processedSignals.has(signal.id)) {
        console.log(`   ⏭️  Skipping signal ${signal.id} (${signal.segnale}) - already processed in this session`);
        continue;
      }
      
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📋 Notifica ID: ${signal.id}`);
      console.log(`👤 Utente: ${signal.nome_completo} (${signal.email})`);
      console.log(`📊 Condizione: ${signal.segnale}`);
      console.log(`🎯 Strike riferimento: ${signal.strike || 'N/A'}`);
      console.log(`ℹ️  Segnale informativo - l'esecuzione dipende dalle impostazioni utente`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      
      // Sync client level if real wallet is available
      await syncClientLevel(signal);
      
      // SAFETY CHECK: Verify we're still connected before executing
      const connectionCheck = await fetchPendingSignals();
      if (connectionCheck === null || connectionCheck === undefined) {
        console.error('\u26A0\uFE0F  \u001b[31mABORTING TRADE\u001b[0m - API disconnessa durante processamento segnale');
        console.error('   \u001b[33mIl sistema non eseguir\u00E0 operazioni fino al ripristino della connessione\u001b[0m');
        return; // Abort processing this signal
      }
      
      let success = false;
      
      if (signal.segnale === 'APRI') {
        success = await executeOpenTrade(signal);
        
        // Log completion
        await markSignalProcessed(signal.id, success);
        
        // Clear segnale field only
        if (success) {
          await resetSegnaleField(signal.id);
          // After opening trade successfully, state should be OPERANDO (trade active, no signal)
          updateSystemState(true, false);
        } else {
          // Failed to open - back to ATTESA
          updateSystemState(false, false);
        }
        
      } else if (signal.segnale === 'CHIUDI') {
        success = await executeCloseTrade(signal);
        
        // Log completion
        await markSignalProcessed(signal.id, success);
        
        if (success) {
          // Clear segnale field
          await resetSegnaleField(signal.id);
          
          // Also erase trade-specific fields
          const fieldsToErase = ['strike', 'margine_per_contratto', 'orario_scadenza', 'giorni_a_scadenza'];
          await eraseSignalFields(signal.id, fieldsToErase);
          
          // After closing trade successfully, state should be ATTESA (no trade, no signal)
          updateSystemState(false, false);
        } else {
          // Failed to close - state is OPERANDO (trade still active, signal consumed)
          updateSystemState(true, false);
        }
      }
      
      // Add to in-memory tracking
      processedSignals.add(signalKey);
      
      // Wait a bit between signals
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } catch (error) {
    console.error('❌ Error polling API:', error.message);
  }
}

/**
 * Check current margin to restore system state at startup
 * This ensures state is always synchronized with actual broker state
 */
async function checkMarginAndRestoreState() {
  console.log('🔍 Verifica stato iniziale tramite Margine Richiesto...\n');
  
  try {
    // Detect OS and use xvfb only on Linux
    const isWindows = process.platform === 'win32';
    const debugMode = process.env.DEBUG_BROWSER === 'true';
    
    const nodeExe = process.execPath;
    const playwrightCli = resolvePlaywrightCli();
    if (!playwrightCli) {
      throw new Error('Playwright CLI non trovato. Esegui setup-nobel.sh per installare il runtime.');
    }
    const baseCommand = `"${nodeExe}" "${playwrightCli}" test tests/check-margin.spec.js`;
    
    // On Linux: use xvfb only if no DISPLAY is already available.
    const hasDisplay = !!process.env.DISPLAY;
    const useXvfb = !isWindows && !debugMode && !hasDisplay;
    const command = useXvfb
      ? `xvfb-run --auto-servernum --server-args="-screen 0 1920x1080x24" ${baseCommand}`
      : baseCommand;
    
    const { stdout, stderr } = await execAsync(command, {
      env: {
        ...process.env,
        TRADE_USER: process.env.AVA_USERNAME || process.env.TRADE_USER || '',
        TRADE_PASSWORD: process.env.AVA_PASSWORD || process.env.TRADE_PASSWORD || '',
        TRADE_ACCOUNT_TYPE: process.env.AVA_ACCOUNT_TYPE || 'DEMO'
      },
      cwd: process.cwd(),
      maxBuffer: 10 * 1024 * 1024,
      timeout: 150000 // 150 seconds timeout (cold-start Cloudflare needs more time)
    });
    
    if (stdout) {
      // Parse output to determine if trade is active
      const hasActiveTrade = stdout.includes('MARGIN_CHECK: TRADE_ACTIVE');
      const noTrade = stdout.includes('MARGIN_CHECK: NO_TRADE');
      
      if (hasActiveTrade) {
        console.log('✅ Trade attivo rilevato - stato: OPERANDO');
        // No signal at startup (we just checked), trade is active
        updateSystemState(true, false);
      } else if (noTrade) {
        console.log('✅ Nessun trade attivo - stato: ATTESA');
        // No trade, no signal at startup
        updateSystemState(false, false);
      } else {
        console.log('⚠️  Impossibile determinare stato - uso stato salvato');
      }
    }
    
    console.log('');
  } catch (error) {
    console.error('⚠️  Errore durante verifica margine:', error.message);
    console.error('   Continuo con stato salvato da file\n');
    // Continue with state loaded from file
  }
}

/**
 * Main monitoring loop
 */
async function startMonitoring() {
  // Validate configuration
  if (!API_KEY) {
    console.error('❌ API_KEY not configured in .env file');
    process.exit(1);
  }
  
  console.log('🔌 Testing API connection...');
  const testSignals = await fetchPendingSignals();
  if (testSignals === null || testSignals === undefined) {
    console.error('❌ Failed to connect to API. Check API_URL and API_KEY');
    process.exit(1);
  }
  console.log('✅ API connection successful\n');
  
  // Check margin and restore state at startup (optional, can be disabled)
  // Set SKIP_MARGIN_CHECK=true to skip this initial check
  const skipMarginCheck = process.env.SKIP_MARGIN_CHECK === 'true';
  
  if (!skipMarginCheck) {
    console.log('ℹ️  Verifica stato iniziale abilitata (imposta SKIP_MARGIN_CHECK=true per saltare)');
    await checkMarginAndRestoreState();
  } else {
    console.log('⏭️  Verifica stato iniziale saltata (SKIP_MARGIN_CHECK=true)');
    console.log('   Stato iniziale: ATTESA\n');
  }
  
  console.log('👀 Monitoring for signals...\n');
  
  // Main polling loop
  while (true) {
    await pollAPI();
    
    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n👋 Shutting down gracefully...');
  process.exit(0);
});

// Export functions for external use (e.g., Electron main process)
export function getCurrentSystemState() {
  return currentSystemState;
}

export function getOpenTradeDetails() {
  return openTradeDetails;
}

export function updateSystemState(hasActiveTrade, hasActiveSignal) {
  return determineSystemState(hasActiveTrade, hasActiveSignal);
}

// Start the monitor
startMonitoring().catch(error => {
  console.error('❌ Failed to start monitoring:', error);
  process.exit(1);
});
