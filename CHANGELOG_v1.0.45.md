# Changelog v1.0.45

**Data rilascio**: 29 Gennaio 2026

## 🐛 Bug Fix Critici

### Risolto errore "Cannot find module browserHelper.js"
- **Problema**: `close_trade.spec.js` importava `utils/browserHelper.js` mancante
- **Impatto**: Chiusura trade falliva con "no tests found" quando ricevuto segnale CHIUDI
- **Soluzione**: Creato `utils/browserHelper.js` con funzioni di gestione browser

## ✨ Nuove Funzionalità

### Browser Background Mode
- Browser ora funziona in **modalità invisibile** per impostazione predefinita
- Posizione off-screen: `--window-position=-2000,-2000`
- Mantiene bypass Cloudflare (headless: false)
- **Debug mode**: Imposta `DEBUG_BROWSER=true` per vedere il browser

### browserHelper.js
Nuovo file utility con funzioni:
- `maximizeBrowserWindow(page)` - Massimizza browser se in debug mode
- `isVisibleMode()` - Verifica se browser è visibile
- `logBrowserInfo(page)` - Log informazioni browser per debugging

## 🔧 Modifiche Tecniche

### playwright.config.js
```javascript
launchOptions: {
  args: process.env.DEBUG_BROWSER === 'true' ? [
    '--window-position=0,0',
    '--start-maximized',
    // ... altre opzioni
  ] : [
    '--window-position=-2000,-2000', // Off-screen (invisible)
    // ... altre opzioni
  ]
}
```

### utils/browserHelper.js (nuovo)
```javascript
export async function maximizeBrowserWindow(page) {
  if (process.env.DEBUG_BROWSER === 'true') {
    await page.evaluate(() => {
      window.moveTo(0, 0);
      window.resizeTo(screen.availWidth, screen.availHeight);
    });
  }
}
```

## 🎯 Workflow Completo

### Apertura Trade (v1.0.44 + v1.0.45)
1. ✅ Calcolatore si apre con strategia "calc class"
2. ✅ Campo input trovato e verificato
3. ✅ Valore inserito correttamente (es. 48)
4. ✅ Pulsante "Applica" cliccato
5. ✅ Browser invisibile in background

### Chiusura Trade (v1.0.45)
1. ✅ Importa `browserHelper.js` correttamente
2. ✅ Massimizza browser se DEBUG_BROWSER=true
3. ✅ Chiude posizioni esistenti
4. ✅ Browser invisibile in background

## 📊 Test Validazione

### Test Close Trade
```powershell
$env:DEBUG_BROWSER="false"
npx playwright test tests/close_trade.spec.js
```

**Risultato atteso**: 
- ✅ Nessun errore "Cannot find module"
- ✅ Browser invisibile in background
- ✅ Test eseguito con successo

### Test Open Trade
```powershell
$env:TRADE_STRIKE="6500"
$env:TRADE_EXPIRY_DAYS="30D"
$env:TRADE_EXPIRY_TIME="21:00:00"
$env:TRADE_MARGIN="92"
npx playwright test tests/trade.spec.js
```

**Risultato atteso**:
- ✅ 48 contratti impostati correttamente
- ✅ Browser invisibile in background
- ✅ Trade eseguito con successo

## 🚀 Deployment

### Build Windows Installer
```powershell
cd electron-app
npm run build:win
```

### Pubblica su GitHub Releases
```powershell
npm run publish
```

Questo caricherà automaticamente:
- `Nobel-Trading-Setup-1.0.45.exe` (installer)
- `latest.yml` (auto-update config)

## 🔒 Ambiente Produzione

```powershell
# Monitor invisibile in background
.\start-monitor-simple.ps1

# Electron app con browser invisibile
"C:\Users\...\Nobel Trading\Nobel Trading.exe"
```

## 🐞 Debug Mode

```powershell
# Vedere browser durante testing
$env:DEBUG_BROWSER="true"
npx playwright test tests/trade.spec.js --headed

# Monitor visibile
$env:DEBUG_BROWSER="true"
.\start-monitor-simple.ps1
```

## 📝 Note per Utenti

### Aggiornamento Automatico
Gli utenti con v1.0.43 o v1.0.44 riceveranno automaticamente v1.0.45 al prossimo avvio dell'app.

### Cosa Cambia
- Browser non più visibile durante trading (funziona in background)
- Chiusura trade ora funziona senza errori
- Performance migliorate (ridotto uso GPU/memoria)

### Requisiti
- Windows 10/11
- Node.js 18+ (per monitor standalone)
- Nessuna modifica alle credenziali o configurazione

## ✅ Checklist Pre-Release

- [x] Versione aggiornata a 1.0.45
- [x] browserHelper.js creato e testato
- [x] Browser background funzionante
- [x] Close trade risolto
- [x] Build completato con successo
- [ ] Test su macchina pulita
- [ ] Pubblicazione su GitHub Releases
