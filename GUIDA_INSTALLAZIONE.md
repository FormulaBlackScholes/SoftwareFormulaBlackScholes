# Guida Installazione AVA Trading Monitor

## 🚀 Installazione Rapida

### Prerequisiti
- **Windows 10/11**
- **PowerShell** (già incluso in Windows)
- **Connessione Internet** (per scaricare dipendenze)

### Passo 1: Installa Node.js
1. Vai su https://nodejs.org/
2. Scarica la versione **LTS** (consigliata: 20.x o superiore)
3. Esegui l'installer e segui le istruzioni
4. **Riavvia il computer** dopo l'installazione

### Passo 2: Esegui l'Installer
1. **Clicca destro su PowerShell** → **"Esegui come amministratore"**
2. Naviga nella cartella dell'applicazione:
   ```powershell
   cd "c:\avaauto\avaauto_working_stable_linux (copia 3)"
   ```
3. Esegui lo script di installazione:
   ```powershell
   .\install-complete.ps1
   ```

### Passo 3: Configura le Credenziali
Lo script ti chiederà di inserire:
- **AVA_USERNAME**: Il tuo username di trading
- **AVA_PASSWORD**: La tua password
- **AVA_ACCOUNT_TYPE**: Tipo account (`demo` o `live`)
- **API_BASE_URL**: URL dell'API dei segnali

### Passo 4: Riavvia e Testa
1. **Riavvia il computer** (necessario per le variabili ambiente)
2. Testa il monitor:
   ```powershell
   .\start-monitor-simple.ps1
   ```

---

## 📋 Cosa Fa lo Script di Installazione

Lo script `install-complete.ps1` esegue automaticamente:

### ✅ Verifica Node.js
- Controlla se Node.js è installato
- Verifica la versione
- Se mancante, ti guida all'installazione

### ✅ Installa Dipendenze npm
- Esegue `npm install` per installare tutti i pacchetti necessari
- Include Playwright, API clients, utilities, ecc.

### ✅ Installa Browser Playwright
- Scarica Chromium (~200MB) per l'automazione
- Necessario per l'accesso alla piattaforma di trading

### ✅ Crea Directory Richieste
- `logs/` - File di log del monitor
- `screenshots/` - Screenshot di debug
- `test-results/` - Risultati dei test
- `data/` - Dati cifrati

### ✅ Configura Variabili Ambiente
- Imposta le credenziali come variabili di sistema
- Accessibili al monitor in esecuzione

### ✅ (Opzionale) Auto-start
- Configura l'avvio automatico con Windows
- Usa il flag `-SetupAutostart`

---

## 🎯 Modalità di Installazione

### Installazione Completa (Consigliata)
Include auto-start automatico:
```powershell
.\install-complete.ps1 -SetupAutostart
```

### Installazione Standard
Senza auto-start (lo configuri dopo):
```powershell
.\install-complete.ps1
```

### Installazione Veloce
Salta controlli se già installato:
```powershell
.\install-complete.ps1 -SkipNodeCheck -SkipPlaywright
```

---

## 🔧 Risoluzione Problemi

### "Esecuzione script disabilitata"
Se vedi errore sui criteri di esecuzione:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### "Node.js non trovato" dopo installazione
1. Chiudi e riapri PowerShell
2. Se persiste, aggiungi Node.js al PATH manualmente
3. Riavvia il computer

### "npm install fallito"
1. Verifica connessione internet
2. Riprova con:
   ```powershell
   npm install --force
   ```
3. Pulisci cache npm:
   ```powershell
   npm cache clean --force
   npm install
   ```

### "Playwright install fallito"
```powershell
npx playwright install chromium --force
```

### Variabili ambiente non funzionano
1. Verifica siano in **"Variabili di sistema"** non "Utente"
2. **Riavvia il computer** (obbligatorio)
3. Verifica con:
   ```powershell
   [System.Environment]::GetEnvironmentVariable("AVA_USERNAME", "Machine")
   ```

---

## 📦 Installazione per Clienti

### Prepara un Pacchetto
1. Copia tutta la cartella dell'applicazione
2. Includi questi file essenziali:
   - `install-complete.ps1`
   - `setup-autostart.ps1`
   - `start-monitor-simple.ps1`
   - `package.json`
   - Tutti i file di configurazione

### Istruzioni per il Cliente
```
ISTRUZIONI INSTALLAZIONE - AVA Trading Monitor
==============================================

PRIMA DI INIZIARE:
1. Installa Node.js da: https://nodejs.org/
2. Riavvia il computer

INSTALLAZIONE:
1. Estrai il file ZIP in una cartella (es: C:\AVATrading)
2. Clicca destro su PowerShell → "Esegui come amministratore"
3. Naviga nella cartella:
   cd "C:\AVATrading"
4. Esegui:
   .\install-complete.ps1 -SetupAutostart
5. Inserisci le credenziali quando richiesto
6. Riavvia il computer

VERIFICA:
- Il monitor si avvierà automaticamente al boot
- Controlla i log in: logs\monitor-background.log

SUPPORTO:
- Per problemi, invia il file di log
```

---

## 🎛️ Comandi Utili

### Installazione
```powershell
# Installazione completa con auto-start
.\install-complete.ps1 -SetupAutostart

# Solo installazione dipendenze
.\install-complete.ps1
```

### Gestione Monitor
```powershell
# Avvia manualmente
.\start-monitor-simple.ps1

# Abilita auto-start
.\setup-autostart.ps1

# Disabilita auto-start
.\remove-autostart.ps1
```

### Verifica Installazione
```powershell
# Controlla Node.js
node --version
npm --version

# Controlla variabili ambiente
[System.Environment]::GetEnvironmentVariable("AVA_USERNAME", "Machine")

# Controlla Task Scheduler
Get-ScheduledTask -TaskName "AVA Trading Monitor"

# Vedi log
Get-Content logs\monitor-background.log -Tail 50
```

---

## 📚 Struttura Directory Dopo Installazione

```
avaauto/
├── install-complete.ps1          # Script installazione
├── setup-autostart.ps1           # Abilita auto-start
├── remove-autostart.ps1          # Disabilita auto-start
├── start-monitor-simple.ps1      # Avvio monitor
├── package.json                  # Dipendenze npm
├── playwright.config.js          # Config Playwright
├── monitor-api.js                # Core monitor
│
├── logs/                         # Log files
│   └── monitor-background.log    # Log principale
│
├── screenshots/                  # Screenshot debug
├── test-results/                 # Risultati test
├── data/                         # Dati applicazione
│
├── node_modules/                 # Dipendenze (auto)
└── tests/                        # Test Playwright
```

---

## ⚙️ Configurazione Avanzata

### Variabili Ambiente Aggiuntive
```powershell
# Debug browser visibile
[System.Environment]::SetEnvironmentVariable("DEBUG_BROWSER", "true", "Machine")

# Timeout custom (millisecondi)
[System.Environment]::SetEnvironmentVariable("TIMEOUT", "600000", "Machine")
```

### Modifica Task Scheduler
1. Apri Task Scheduler (taskschd.msc)
2. Trova "AVA Trading Monitor"
3. Modifica trigger, azioni, condizioni

### Log Rotation
Per evitare log troppo grandi:
```powershell
# Pulisci log vecchi (oltre 30 giorni)
Get-ChildItem logs\*.log | Where-Object {$_.LastWriteTime -lt (Get-Date).AddDays(-30)} | Remove-Item
```

---

## 🔐 Sicurezza

### Credenziali
- Memorizzate come variabili di sistema
- Non salvate in file testuali
- Accessibili solo ad amministratori

### Browser
- Gira off-screen ma non headless
- Necessario per superare Cloudflare
- Nessuna finestra visibile all'utente

### Task Scheduler
- Esegue come SYSTEM user
- Privilegi elevati
- Protetto da modifiche utente

---

## 📞 Supporto

### File di Log
Invia sempre questi file per supporto:
- `logs/monitor-background.log`
- Screenshot di eventuali errori
- Output di `Get-ScheduledTask`

### Comandi Diagnostici
```powershell
# Info sistema
node --version
npm --version
Get-ComputerInfo | Select-Object WindowsVersion

# Stato monitor
Get-ScheduledTask -TaskName "AVA Trading Monitor"
Get-Process node -ErrorAction SilentlyContinue

# Test connessione API
Test-NetConnection -ComputerName api.example.com -Port 443
```

---

## ✅ Checklist Pre-Distribuzione

Prima di distribuire ai clienti:

- [ ] Testato su Windows 10/11 pulito
- [ ] Documentazione aggiornata con URL API corretto
- [ ] Credenziali demo per test fornite
- [ ] Script testato con privilegi normali e admin
- [ ] Auto-start verificato dopo riavvio
- [ ] Log rotation configurato
- [ ] Screenshot e video guida preparati
- [ ] Supporto tecnico disponibile

---

## 📈 Versioni

- **v1.0.15** - Implementazione auto-start con Task Scheduler
- Browser off-screen per bypass Cloudflare
- Gestione credenziali per-signal
- Install script completo

---

**Buon Trading! 🚀📊**
