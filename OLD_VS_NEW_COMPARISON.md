# Old monitor-api.js vs New monitor-enhanced.js - Complete Comparison

## Feature-by-Feature Comparison

| Feature | Old (monitor-api.js) | New (monitor-enhanced.js) | Status |
|---------|---------------------|---------------------------|--------|
| **API Polling** | ✅ Every 5s (configurable) | ✅ Every 30s (configurable) | ✅ PRESENT |
| **Fetch Signals** | ✅ GET /signals/pending | ✅ GET /signals/pending | ✅ PRESENT |
| **API Authentication** | ✅ X-API-Key header | ✅ X-API-Key header | ✅ PRESENT |
| **User Email Filter** | ✅ Optional filter | ✅ Optional filter | ✅ PRESENT |
| **Signal Tracking** | ✅ processedSignals Set | ✅ processedSignals Set | ✅ PRESENT |
| **Execute APRI** | ✅ tests/trade.spec.js | ✅ tests/trade.spec.js | ✅ PRESENT |
| **Execute CHIUDI** | ✅ tests/close_trade.spec.js | ✅ tests/close_trade.spec.js | ✅ PRESENT |
| **Environment Variables** | ✅ Pass to Playwright | ✅ Pass to Playwright | ✅ PRESENT |
| **Mark as Processed** | ✅ POST /signals/{id}/complete | ❌ NOT IMPLEMENTED | ⚠️ MISSING |
| **Reset Segnale Field** | ✅ POST /signals/{id}/status | ❌ NOT IMPLEMENTED | ⚠️ MISSING |
| **Erase Fields** | ✅ POST /signals/{id}/erase | ❌ NOT IMPLEMENTED | ⚠️ MISSING |
| **Days Calculation** | ✅ calculateDaysToExpiry() | ❌ NOT IMPLEMENTED | ⚠️ MISSING |
| **Graceful Shutdown** | ✅ SIGINT/SIGTERM | ✅ SIGINT/SIGTERM | ✅ PRESENT |

## ⚠️ CRITICAL MISSING FEATURES

The new system is **missing** the API calls to mark signals as processed and clear fields. This means:
- ❌ Signals are never marked as "processed" in the database
- ❌ The `segnale` field is never cleared (will keep re-processing same signal)
- ❌ Trade fields are never erased after closing

## Let's Fix This!

I'll add the missing functionality to monitor-enhanced.js right now.
