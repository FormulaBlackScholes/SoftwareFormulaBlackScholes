# Auto-start Configuration Guide

## Overview
The AVA Trading Monitor can be configured to start automatically when Windows boots, running silently in the background even when no user is logged in.

## Features
- ✅ Starts automatically at system startup
- ✅ Runs as SYSTEM user (background service)
- ✅ Works even if no user is logged in
- ✅ Automatically restarts on failure (up to 3 times)
- ✅ Runs on battery power (laptops)
- ✅ Hidden PowerShell window (no visible UI)
- ✅ Browser window positioned off-screen

## Quick Start

### Enable Auto-start
1. Open PowerShell **as Administrator**
   - Right-click PowerShell → "Run as Administrator"
2. Navigate to the application directory:
   ```powershell
   cd "c:\avaauto\avaauto_working_stable_linux (copia 3)"
   ```
3. Run the setup script:
   ```powershell
   .\setup-autostart.ps1
   ```
4. Confirm if you want to start the monitor immediately (optional)

### Disable Auto-start
1. Open PowerShell **as Administrator**
2. Navigate to the application directory
3. Run the removal script:
   ```powershell
   .\remove-autostart.ps1
   ```

## Requirements

### Administrator Privileges
Both setup and removal scripts **MUST** be run as Administrator. The scripts will check and display an error if not run with proper privileges.

### Environment Variables
Ensure the following environment variables are set (system-wide for SYSTEM user):
- `AVA_USERNAME` - Trading account username
- `AVA_PASSWORD` - Trading account password
- `AVA_ACCOUNT_TYPE` - Account type (demo/live)
- `API_BASE_URL` - Trading signals API URL

To set system-wide environment variables:
1. Open System Properties → Advanced → Environment Variables
2. Add variables in the "System variables" section (not "User variables")
3. Restart the computer for changes to take effect

## How It Works

### Task Scheduler Configuration
The setup script creates a Windows Scheduled Task with these settings:

| Setting | Value | Purpose |
|---------|-------|---------|
| **Trigger** | At system startup | Runs when Windows boots |
| **User** | SYSTEM | Runs in background without user login |
| **Privileges** | Highest | Full system access |
| **Battery** | Allow | Continues on laptops |
| **Restart** | 3 times, 1 min interval | Auto-recovery on crash |
| **Time limit** | None | Runs indefinitely |

### Execution Flow
1. Windows boots
2. Task Scheduler launches PowerShell (hidden window)
3. PowerShell executes `start-monitor-simple.ps1`
4. Monitor script starts Node.js with `monitor-api.js`
5. Monitor polls trading API and executes trades
6. Browser runs headed but positioned off-screen (5000,5000)

## Monitoring & Troubleshooting

### Check Task Status
1. Open **Task Scheduler** (taskschd.msc)
2. Navigate to "Task Scheduler Library"
3. Find "AVA Trading Monitor"
4. Check:
   - **Status**: Should be "Running" or "Ready"
   - **Last Run Result**: Should be "0x0" (success)
   - **History** tab: View execution logs

### View Monitor Logs
Monitor output is saved to:
```
logs/monitor-background.log
```

View recent logs:
```powershell
Get-Content logs/monitor-background.log -Tail 50
```

Monitor logs in real-time:
```powershell
Get-Content logs/monitor-background.log -Wait
```

### Manual Task Control
Start the task manually:
```powershell
Start-ScheduledTask -TaskName "AVA Trading Monitor"
```

Stop the task:
```powershell
Stop-ScheduledTask -TaskName "AVA Trading Monitor"
```

Check task state:
```powershell
Get-ScheduledTask -TaskName "AVA Trading Monitor" | Select-Object Name, State
```

### Common Issues

#### Task shows "Ready" but not "Running"
- Check logs for errors
- Verify environment variables are set system-wide
- Ensure `start-monitor-simple.ps1` exists
- Try starting manually: `Start-ScheduledTask -TaskName "AVA Trading Monitor"`

#### Browser visible on screen
- Check `playwright.config.js` has `--window-position=5000,5000`
- Verify `headless: false` is set (required for Cloudflare)

#### Credentials not working
- Environment variables must be in "System variables" not "User variables"
- Restart required after setting system variables
- SYSTEM user needs access to these variables

#### Task fails to start
- Open Task Scheduler and check "History" tab
- Look for error codes
- Verify PowerShell execution policy allows scripts
- Check file paths in task configuration

## Production Deployment

### For Customers
Provide these instructions:

1. **Installation**:
   - Install the AVA Trading application
   - Set up environment variables (credentials, API URL)

2. **Enable Auto-start**:
   - Open PowerShell as Administrator
   - Navigate to installation directory
   - Run: `.\setup-autostart.ps1`

3. **Verification**:
   - Restart computer
   - Open Task Scheduler
   - Verify "AVA Trading Monitor" is running
   - Check logs: `logs/monitor-background.log`

### Security Considerations
- Task runs as SYSTEM user with highest privileges
- Credentials stored in system environment variables
- Logs may contain sensitive information
- Browser runs off-screen but not headless (Cloudflare requirement)

### Uninstallation
To completely remove auto-start:
1. Run `.\remove-autostart.ps1` as Administrator
2. Delete environment variables from System settings
3. Remove application files

## Alternative Methods

### Windows Service (Advanced)
For enterprise deployment, consider converting to a Windows Service using:
- NSSM (Non-Sucking Service Manager)
- node-windows package
- Custom Windows Service wrapper

Benefits:
- More robust than Task Scheduler
- Better logging and monitoring
- Service recovery options
- Cleaner integration with Windows

### Startup Folder (Not Recommended)
Simple but unreliable:
- Only runs when user logs in
- User can easily disable
- No automatic restart on failure
- Not suitable for production

## Support

For issues or questions:
- Check logs: `logs/monitor-background.log`
- Review Task Scheduler history
- Verify environment variables
- Test manual execution: `.\start-monitor-simple.ps1`

## Version History
- v1.0 - Initial auto-start implementation with Task Scheduler
- Browser: Headed mode with off-screen positioning (Cloudflare requirement)
- Credentials: Environment variables with per-signal override support

---

## 🆕 v1.0.17 - ELECTRON APP BACKGROUND MODE

### Nuove Funzionalità

#### 1. **Prevenzione Standby Automatica** 🔋
Quando il monitor è attivo, il PC **NON andrà in sleep/standby**.

**Implementazione**: `powerSaveBlocker` di Electron
- Attivo SOLO quando monitor in esecuzione
- Si disattiva automaticamente quando fermi il monitor
- NON impedisce shutdown manuale

**Test**:
```
1. Avvia monitor
2. Imposta sleep dopo 1 minuto in Impostazioni Windows
3. Aspetta → PC rimane acceso
4. Ferma monitor → sleep si riattiva
```

#### 2. **System Tray Icon** 📌
L'app si minimizza nella barra di sistema invece di chiudersi.

**Comportamento**:
- **Clicca X con monitor attivo**: Minimizza in tray (continua in background)
- **Clicca X con monitor fermo**: Chiude normalmente
- **Doppio click icona tray**: Riapre finestra
- **Menu contestuale**:
  - Apri Dashboard
  - Stato Monitor
  - Avvia/Ferma Monitor
  - Esci

**Notifica Windows**: Quando minimizzi appare balloon notification

#### 3. **Parametri Linea di Comando**
```bash
Nobel Trading.exe --hidden --start-monitor
```

Opzioni:
- `--hidden`: Avvia minimizzato in tray
- `--start-monitor`: Avvia automaticamente il monitor
- `--dev`: Modalità sviluppo (DevTools)

#### 4. **Autostart per Electron App**

**Metodo Rapido** (Per utenti finali):
1. Premi `Win + R` → digita `shell:startup` → Invio
2. Copia collegamento di "Nobel Trading.exe" nella cartella
3. Tasto destro sul collegamento → Proprietà
4. Campo "Destinazione", aggiungi: ` --hidden --start-monitor`
5. "Esegui": Ridotto a icona
6. OK

**Metodo PowerShell** (Automatico):
```powershell
cd electron-app
npm run setup-autostart  # Se configurato in package.json
```

O manualmente:
```powershell
# Trova eseguibile
$exePath = "C:\Users\$env:USERNAME\AppData\Local\Programs\Nobel Trading\Nobel Trading.exe"

# Crea shortcut in startup
$WshShell = New-Object -comObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\Nobel Trading.lnk")
$Shortcut.TargetPath = $exePath
$Shortcut.Arguments = "--hidden --start-monitor"
$Shortcut.WindowStyle = 7  # Minimized
$Shortcut.Save()
```

### Differenze Script vs Electron App

| Caratteristica | Script Task Scheduler | Electron App |
|----------------|----------------------|--------------|
| Interfaccia | ❌ Nessuna | ✅ Dashboard completa |
| System Tray | ❌ No | ✅ Sì |
| Prevenzione Sleep | ❌ No | ✅ Sì |
| Gestione Consenso | ❌ No | ✅ Sì (legale) |
| Configurazione | File .env | ✅ GUI |
| Facilità Setup | ⚠️ Richiede admin | ✅ Installazione standard |
| Autostart | Task Scheduler | Startup folder |

### Raccomandazioni

**Per utenti finali** → Usa Electron App
- Più semplice
- Interfaccia grafica
- Conformità legale (disclaimer + consenso)
- System tray conveniente

**Per deployment server/VPS** → Usa Task Scheduler/Service
- Nessuna interfaccia necessaria
- Avvio come SYSTEM
- Più robusto per background 24/7

### Limitazioni

**Sleep/Standby**:
- ✅ Previene sleep automatico
- ✅ Previene hibernate automatico
- ❌ NON previene shutdown manuale
- ❌ NON previene shutdown da Windows Update

**Raccomandazioni**:
1. Disabilita sleep completamente per trading 24/7
2. Configura "Orario di attività" in Windows Update
3. Usa UPS per protezione blackout
