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

/**
 * Fetch pending signals from API
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
    return signals;
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
    const appName = 'Nobel Trading';
    const userDataPath = path.join(os.homedir(), 'AppData', 'Local', appName);
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
    
    const expiryDate = new Date(expiryDateStr);
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
  // Use giorni_a_scadenza if provided, otherwise calculate from giorno_scadenza
  let daysToExpiry;
  if (signal.giorni_a_scadenza) {
    // Already provided in database
    daysToExpiry = parseInt(signal.giorni_a_scadenza);
  } else if (signal.giorno_scadenza && signal.giorno_scadenza !== '0000-00-00') {
    // Calculate from date
    daysToExpiry = calculateDaysToExpiry(signal.giorno_scadenza);
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
    const cwd = process.cwd();
    const playwrightCli = path.join(cwd, 'node_modules', '@playwright', 'test', 'cli.js');
    // Use relative path from testDir for Playwright to find the test
    const baseCommand = `"${nodeExe}" "${playwrightCli}" test tests/trade.spec.js`;
    
    // Use xvfb only if not in debug mode and on Linux
    const command = (isWindows || debugMode)
      ? baseCommand
      : `xvfb-run --auto-servernum --server-args="-screen 0 1920x1080x24" ${baseCommand}`;
    
    console.log(`   Executing: ${command}`);
    
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
    
    // Case 1: Trade already open BEFORE execution (detected in pre-check)
    // Pattern: "🛑 TRADE ABORTED" or "Trade già aperto rilevato"
    const isTradeAlreadyOpen = (errorText.includes('🛑 TRADE ABORTED') || 
                                errorText.includes('Trade già aperto rilevato')) &&
                               !errorText.includes('TRADE EXECUTION FAILED');
    
    // Case 2: Trade execution failed AFTER clicking Esegui (Margine still 0)
    // Pattern: "TRADE EXECUTION FAILED" and "Margine Richiesto is still 0.0"
    const isExecutionFailed = errorText.includes('TRADE EXECUTION FAILED') &&
                             errorText.includes('Margine Richiesto is still 0.0');
    
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
    const cwd = process.cwd();
    const playwrightCli = path.join(cwd, 'node_modules', '@playwright', 'test', 'cli.js');
    // Use relative path from testDir for Playwright to find the test
    const baseCommand = `"${nodeExe}" "${playwrightCli}" test tests/close_trade.spec.js`;
    
    // Use xvfb only if not in debug mode and on Linux
    const command = (isWindows || debugMode)
      ? baseCommand
      : `xvfb-run --auto-servernum --server-args="-screen 0 1920x1080x24" ${baseCommand}`;
    
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
    
    if (signals.length === 0) {
      return; // No new signals
    }
    
    console.log(`\n📬 Found ${signals.length} new signal(s)`);
    
    for (const signal of signals) {
      // Create a unique key that includes timestamp to allow multiple APRI/CHIUDI cycles
      // Use data_creazione or current timestamp to differentiate between different signals
      const timestamp = signal.data_creazione || signal.data_modifica || new Date().toISOString();
      const signalKey = `${signal.id}-${signal.segnale}-${timestamp}`;
      
      // Skip if already processed in this session
      if (processedSignals.has(signalKey)) {
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

// Start the monitor
startMonitoring().catch(error => {
  console.error('❌ Failed to start monitoring:', error);
  process.exit(1);
});
