# 🚀 AVA Trading Monitor - Guida Rapida per Utenti

## 📦 INSTALLAZIONE (Prima Volta)

### Passo 1: Installa Node.js
1. Apri il browser e vai su: **https://nodejs.org/**
2. Clicca sul bottone verde **"Download Node.js (LTS)"**
3. Apri il file scaricato e segui l'installazione
4. ⚠️ **RIAVVIA IL COMPUTER** dopo l'installazione

### Passo 2: Installa l'Applicazione
1. Trova il file **`INSTALLA.bat`** nella cartella dell'applicazione
2. **Tasto DESTRO** sul file → **"Esegui come amministratore"**
3. Clicca **"Sì"** quando Windows chiede conferma
4. Segui le istruzioni a video:
   - Inserisci il tuo **username di trading**
   - Inserisci la tua **password**
   - Inserisci il tipo di account (**demo** o **live**)
   - Inserisci l'**URL dell'API**
5. Aspetta che scarichi tutto (~5-10 minuti)
6. Quando finisce, **RIAVVIA IL COMPUTER**

✅ **FATTO!** L'applicazione è installata e si avvierà automaticamente!

---

## 🎮 UTILIZZO QUOTIDIANO

### Il Monitor si Avvia Automaticamente
Dopo l'installazione, **NON DEVI FARE NULLA**:
- ✅ Il monitor si avvia automaticamente quando accendi Windows
- ✅ Funziona in background (non vedi finestre)
- ✅ Monitora i segnali e apre/chiude operazioni automaticamente

### Controllare se il Monitor è Attivo
1. Premi `Ctrl + Alt + Canc`
2. Clicca su **"Gestione attività"**
3. Cerca **"node.exe"** o **"chrome.exe"** nei processi
4. Se li vedi = il monitor sta funzionando ✅

---

## 📂 FILE UTILI

Nella cartella dell'applicazione trovi:

### 🔧 Per Installazione
- **`INSTALLA.bat`** ← Doppio-click per installare (solo prima volta)

### ▶️ Per Avvio Manuale
- **`AVVIA-MONITOR.bat`** ← Doppio-click per avviare il monitor manualmente

### 📋 Per Controllo
- **`logs\monitor-background.log`** ← File di log (cosa sta facendo il monitor)

---

## ❓ DOMANDE FREQUENTI

### Come faccio a sapere se sta funzionando?
Apri il file `logs\monitor-background.log` e guarda le ultime righe:
- Se vedi messaggi recenti = sta funzionando
- Se non vedi messaggi nuovi = c'è un problema

### Come fermo il monitor?
**Opzione 1 - Ferma temporaneamente:**
1. Apri **Gestione attività** (`Ctrl + Alt + Canc`)
2. Trova il processo **"node.exe"**
3. Tasto destro → **"Termina attività"**

**Opzione 2 - Disabilita l'auto-start:**
1. Tasto DESTRO su **`DISINSTALLA-AUTOSTART.bat`**
2. Scegli **"Esegui come amministratore"**

### Come riavvio il monitor?
**Se hai fermato il monitor:**
- Tasto DESTRO su **`AVVIA-MONITOR.bat`** → **"Esegui come amministratore"**

**Oppure semplicemente:**
- Riavvia il computer (si riavvia automaticamente)

### Il browser si vede sullo schermo
Non dovrebbe succedere. Il browser è posizionato "fuori schermo" invisibile.
Se lo vedi, significa che c'è un problema di configurazione.

### Non funzionano le credenziali
1. Le hai inserite correttamente durante l'installazione?
2. Hai riavviato il computer dopo l'installazione?
3. Se no, devi reinstallare con `INSTALLA.bat`

---

## 🆘 RISOLUZIONE PROBLEMI

### "Node.js non trovato"
- Hai installato Node.js da https://nodejs.org/?
- Hai riavviato il computer dopo l'installazione?
- Se sì, reinstalla Node.js

### "Privilegi amministratore necessari"
- NON fare doppio-click normale!
- Fai **TASTO DESTRO** → **"Esegui come amministratore"**

### "Esecuzione script disabilitata"
Succede raramente. Se vedi questo errore:
1. Apri PowerShell come amministratore
2. Esegui: `Set-ExecutionPolicy RemoteSigned`
3. Riprova

### Il monitor non parte automaticamente
1. Apri **Utilità di pianificazione** (cerca nel menu Start)
2. Cerca **"AVA Trading Monitor"**
3. Se non c'è = devi reinstallare con `INSTALLA.bat`
4. Se c'è ma dice "Disabilitato" = clicca destro → "Abilita"

### Voglio vedere il browser per debug
1. Apri il file `playwright.config.js` con un editor
2. Commenta la riga `'--window-position=5000,5000',`
3. Riavvia il monitor

---

## 📞 SUPPORTO

### Prima di chiedere aiuto, invia:
1. Il file **`logs\monitor-background.log`** (ultime 100 righe)
2. Screenshot dell'errore (se c'è)
3. Cosa stavi facendo quando è successo

### Come prendere il file di log:
1. Vai nella cartella `logs\`
2. Trova il file `monitor-background.log`
3. Tasto destro → Invia via email

---

## 🎯 RIEPILOGO COMANDI RAPIDI

| Cosa Vuoi Fare | File da Usare | Come |
|----------------|---------------|------|
| **Installare** (prima volta) | `INSTALLA.bat` | Tasto destro → "Esegui come amministratore" |
| **Avviare manualmente** | `AVVIA-MONITOR.bat` | Tasto destro → "Esegui come amministratore" |
| **Vedere log** | `logs\monitor-background.log` | Doppio-click (si apre con Notepad) |
| **Fermare** | Gestione Attività | `Ctrl+Alt+Canc` → Termina processo "node.exe" |
| **Disinstallare auto-start** | `DISINSTALLA-AUTOSTART.bat` | Tasto destro → "Esegui come amministratore" |

---

## ✅ CHECKLIST POST-INSTALLAZIONE

Dopo aver installato, verifica:
- [ ] Node.js installato (controlla: apri CMD e scrivi `node --version`)
- [ ] Computer riavviato
- [ ] `INSTALLA.bat` eseguito come amministratore
- [ ] Credenziali inserite correttamente
- [ ] Computer riavviato di nuovo
- [ ] File `logs\monitor-background.log` esiste e ha contenuto recente
- [ ] In Gestione Attività vedi processi "node.exe" o "chrome.exe"

Se tutti i punti sono OK = **TUTTO FUNZIONA!** 🎉

---

**Buon Trading Automatico! 🚀📈**
