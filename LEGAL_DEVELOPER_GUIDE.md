# LINEE GUIDA LEGALI PER SVILUPPATORI
## Nobel Trading - Formula Black & Scholes

**⚠️ QUESTO DOCUMENTO È PER USO INTERNO DELLO SVILUPPATORE**
**NON DEVE COMPARIRE NELL'INTERFACCIA UTENTE**

---

## 1. PRINCIPI LEGALI FONDAMENTALI

### Self-Directed Automation
Il software **NON** fornisce consigli finanziari o segnali operativi.
- I segnali sono **informativi generali**, identici per tutti
- L'utente configura **personalmente** la strategia
- L'utente abilita **volontariamente** l'automazione
- L'utente rimane **responsabile** delle operazioni

### Segnali Informativi vs Operativi

#### ❌ VIETATO (richiede licenza finanziaria):
- "COMPRA a 6050" 
- "VENDI ORA"
- "APRI posizione PUT a 6050"
- "Chiudi la tua posizione"
- "Questo è il momento giusto per entrare"

#### ✅ CONSENTITO (informativo generale):
- "Condizione strategica rilevata: Strike 6050"
- "Parametro tecnico: 6050"
- "Notifica: Condizione X soddisfatta"
- "Segnale informativo - l'esecuzione dipende dalle tue impostazioni"

---

## 2. IMPLEMENTAZIONE NEL CODICE

### File: `monitor-api.js`

#### Messaggi Console (già implementati):
```javascript
// ✅ CORRETTO
console.log(`📊 NOTIFICA | Condizione strategica rilevata`);
console.log(`ℹ️  Questo segnale è informativo. L'esecuzione dipende dalle tue impostazioni.`);

// ❌ EVITARE
console.log(`🚀 OPENING TRADE`); // Suona come istruzione
console.log(`Executing BUY order`); // Comando operativo
```

### File: `electron-app/src/consent-dialog.html`

Schermata di consenso OBBLIGATORIA prima di attivare l'automazione:
- Testo legale completo
- 4 checkbox obbligatorie
- Pulsante "Attiva AUTOMAZIONE" disabilitato fino all'accettazione
- Disclaimer persistente

### File: `electron-app/src/renderer/index.html`

Footer legale persistente sempre visibile:
```html
<footer class="legal-footer">
    <!-- Disclaimer completo sempre presente -->
</footer>
```

---

## 3. WORKFLOW UTENTE

### Primo Avvio:
1. Utente apre software
2. Vede schermata di consenso (`consent-dialog.html`)
3. Legge disclaimer completo
4. Spunta 4 checkbox obbligatorie
5. Clicca "Attiva AUTOMAZIONE"
6. → Solo ora l'automazione è attiva

### Durante Utilizzo:
- Footer legale sempre visibile in basso
- Notifiche segnali usano linguaggio informativo
- Nessun messaggio imperativo ("compra", "vendi", "apri", "chiudi")

---

## 4. CHECKLIST DI CONFORMITÀ

Prima di rilasciare una nuova versione, verificare:

### ✅ GUI Utente:
- [ ] Schermata consenso presente e obbligatoria
- [ ] 4 checkbox obbligatorie tutte presenti
- [ ] Footer disclaimer sempre visibile
- [ ] Nessun messaggio operativo nei log visibili all'utente
- [ ] Notifiche usano linguaggio "informativo"

### ❌ GUI Utente NON DEVE contenere:
- [ ] "Guida a un software legale" (materiale interno)
- [ ] Esempi di segnali vietati/consentiti (documentazione interna)
- [ ] Riferimenti a "licenze" o "regolamenti" (confonde l'utente)

### ✅ Codice Interno:
- [ ] `monitor-api.js` usa notifiche informative
- [ ] `trade.spec.js` esegue solo in base a parametri utente
- [ ] Variabili ambiente configurate da utente (`TRADE_*`)

---

## 5. TERMINOLOGIA CORRETTA

### Nel codice e console:
```
✅ Notifica
✅ Condizione strategica rilevata
✅ Segnale informativo
✅ Strike riferimento
✅ L'esecuzione dipende dalle tue impostazioni

❌ Ordine
❌ Compra/Vendi
❌ Apri/Chiudi trade
❌ Esegui operazione
❌ Raccomandazione
```

### Nelle variabili:
```javascript
// ✅ CORRETTO
TRADE_STRIKE // parametro tecnico
TRADE_ACCOUNT_TYPE // configurazione utente
USER_STRATEGY // strategia configurata dall'utente

// ❌ EVITARE
BUY_SIGNAL // suona come istruzione
SELL_RECOMMENDATION // raccomandazione
TRADE_ADVICE // consiglio operativo
```

---

## 6. RISPOSTE A DOMANDE COMUNI

**Q: Posso dire "il software esegue automaticamente trades"?**
A: Sì, ma aggiungi sempre "basati sulle impostazioni dell'utente" o "self-directed automation"

**Q: Posso mostrare lo strike price nei log?**
A: Sì, ma chiamalo "strike riferimento" o "parametro tecnico", non "target price to buy"

**Q: Devo mostrare disclaimer ogni volta?**
A: No, solo al primo avvio. Poi basta il footer persistente.

**Q: Cosa succede se l'utente non accetta i consensi?**
A: L'automazione rimane disabilitata. Non può procedere.

**Q: Posso dire "segnale di acquisto"?**
A: No. Usa "condizione strategica rilevata" o "notifica informativa"

---

## 7. MODIFICHE FUTURE

Quando aggiungi nuove funzionalità:

### DO:
- Usa linguaggio neutro e informativo
- Enfatizza il controllo dell'utente
- Ricorda che i segnali sono informativi generali
- Mantieni disclaimer visibile

### DON'T:
- Aggiungere messaggi imperativi
- Suggerire timing di mercato
- Personalizzare segnali per singoli utenti (devono essere generali)
- Rimuovere o nascondere disclaimer

---

## 8. CONTATTI LEGALI

Per dubbi su conformità:
- Consulta sempre il documento originale delle linee guida
- In caso di modifiche sostanziali, richiedi revisione legale
- Mantieni questo documento aggiornato con le policy

---

**ULTIMA REVISIONE**: 3 Dicembre 2025
**VERSIONE**: 1.0.17
**STATUS**: Implementato ✅
