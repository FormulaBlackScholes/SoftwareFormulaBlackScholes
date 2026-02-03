# 🔄 Signal Reprocessing Issue - Solution

**Date**: November 3, 2024, 14:35  
**Issue**: Monitor keeps finding the same signal but not processing it

---

## 🐛 The Problem

```
[14:29:52] 📬 Found 1 new signal(s)
[14:30:22] 📬 Found 1 new signal(s)
[14:30:53] 📬 Found 1 new signal(s)
```

The signal keeps being detected but never processed.

---

## 🔍 Root Cause

The signal is being **silently skipped** due to the in-memory tracking:

```javascript
// In monitor-api.js:
const processedSignals = new Set(); // Never cleared!

if (processedSignals.has(signalKey)) {
  continue; // Silent skip - no log output!
}
```

Once a signal with ID=1 and segnale="APRI" is processed, the key `"1-APRI"` stays in memory forever. When the same signal appears again (because the API still returns it as "pending"), it gets skipped.

---

## ✅ Solutions

### Solution 1: Restart the Monitor (Quick Fix)
The in-memory `processedSignals` Set is cleared when you restart:

1. Stop the AppImage
2. Restart it
3. The signal will be processed again

**When to use**: For testing with the same signal repeatedly.

---

### Solution 2: Use a Different Signal ID (Testing)
If testing, create a new signal in WordPress with a different ID.

---

### Solution 3: Fix the API (Proper Solution)
The real issue is that the WordPress API `/signals/pending` endpoint keeps returning signals that have already been processed.

**Check these in WordPress**:
1. Does the signal have `elaborata=1` set?
2. Does the signal have `segnale` cleared to empty string?
3. Is the API filtering correctly?

The API should NOT return signals where:
- `elaborata = 1` (already processed)
- `segnale IS NULL` or `segnale = ''` (no active signal)

---

### Solution 4: Add Debug Logging (Implemented)
I've added logging to show when signals are skipped:

```javascript
if (processedSignals.has(signalKey)) {
  console.log(`   ⏭️  Skipping signal ${signal.id} (${signal.segnale}) - already processed in this session`);
  continue;
}
```

**Rebuild required**: Run `npm run build` in electron-app directory.

---

### Solution 5: Clear In-Memory Cache Periodically
Add this to monitor-api.js to clear old entries:

```javascript
// Clear processed signals older than 1 hour
setInterval(() => {
  processedSignals.clear();
  console.log('🔄 Cleared processed signals cache');
}, 3600000); // 1 hour
```

This allows signals to be reprocessed after 1 hour, which is useful for:
- Testing
- Retry logic for failed trades
- Multiple signals per day

---

## 🎯 Recommended Action

### For Production:
**Fix the WordPress API** to properly mark signals as processed and exclude them from `/signals/pending`.

**Verify**:
```bash
# Check what API returns
curl "https://formulablackandscholes.com/wp-json/trading/v1/signals/pending?email=namsom94@yahoo.de" \
  -H "X-API-Key: YOUR_KEY"
```

Should return empty array `[]` after signal is processed.

### For Testing:
**Restart the monitor** between tests, or implement Solution 5 (periodic cache clear).

---

## 📋 Current Behavior

1. ✅ API returns signal as "pending"
2. ✅ Monitor detects it: "Found 1 new signal(s)"
3. ❌ Monitor skips it silently (already in processedSignals)
4. 🔄 Loop repeats every 30 seconds

---

## 🔧 Quick Test

To confirm this is the issue, add this temporary logging:

```javascript
// In monitor-api.js, in pollAPI():
console.log(`\n📬 Found ${signals.length} new signal(s)`);
console.log(`   In-memory cache has ${processedSignals.size} entries`);
console.log(`   Cache contents:`, Array.from(processedSignals));
```

This will show you exactly what's being cached.

---

## 💡 Best Practice

The monitor should:
1. ✅ Fetch pending signals from API
2. ✅ Process each signal
3. ✅ Mark as processed via API (`/signals/{id}/complete`)
4. ✅ Clear signal field via API (`/signals/{id}/reset`)
5. ✅ API should then STOP returning this signal

If step 5 doesn't happen, you get the infinite loop.

---

**Next Steps**:
1. Check WordPress API response
2. Verify `elaborata` field is being set correctly
3. Verify API endpoint filters by `elaborata` status
4. Or implement periodic cache clearing for testing

---

**Updated**: November 3, 2024, 14:35  
**Status**: Diagnosis complete, solutions provided
