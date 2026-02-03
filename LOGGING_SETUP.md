# Setup Logging Database

## Panoramica

Il sistema ora logga automaticamente tutti i trade (aperti e chiusi) nella tabella `avaopions_log` del database WordPress.

## Configurazione

### 1. Plugin WordPress installato

Assicurati che il plugin `AvaOptions Log API` sia installato e attivato su WordPress:
- File: Il codice PHP che hai fornito
- Location: `/wp-content/plugins/avaopions-log-api/`

### 2. Recupera l'API Key

1. Vai su WordPress Admin
2. Vai in **Impostazioni → AvaOptions Log API**
3. Copia l'**API Key** mostrata

### 3. Configurazione Environment

Aggiungi la chiave API al file `.env` dell'applicazione Electron:

```bash
# Existing configuration
TRADING_API_URL=https://formulablackandscholes.com/wp-json/trading/v1
TRADING_API_KEY=your_existing_key

# New: Logging API Key
LOG_API_KEY=your_log_api_key_here
```

**Nota**: Se non specifichi `LOG_API_KEY`, il sistema userà la stessa chiave di `TRADING_API_KEY`.

## Come Funziona

### Dati Loggati

Per ogni trade (APRI o CHIUDI), vengono salvati:

- `nome_comleto` - Nome completo dell'utente
- `email` - Email dell'utente
- `tipo_account` - Tipo account (real/demo)
- `livello_cliente` - Livello cliente (A/B/C)
- `segnale` - Tipo segnale (APRI/CHIUDI)
- `strike` - Strike price
- `margine_per_contratto` - Margine per contratto
- `orario_scadenza` - Orario scadenza
- `giorni_a_scadenza` - Giorni a scadenza
- `created_at` - Timestamp automatico (gestito da MySQL)

### Quando viene loggato

Il logging avviene **dopo** l'esecuzione con successo del trade:

1. ✅ Trade eseguito con successo → Log salvato
2. ❌ Trade fallito → Nessun log

### Endpoint API

```
POST https://formulablackandscholes.com/wp-json/ava/v1/log
Headers:
  - X-API-Key: your_log_api_key
  - Content-Type: application/json
```

### Esempio Request

```json
{
  "nome_comleto": "Tommaso Viterale",
  "email": "tommaso@example.com",
  "tipo_account": "real",
  "livello_cliente": "A",
  "segnale": "APRI",
  "strike": 1800,
  "margine_per_contratto": 700,
  "orario_scadenza": "2025-08-10 14:30:00",
  "giorni_a_scadenza": 30
}
```

### Risposta

- **Success**: HTTP 204 (No Content)
- **Error**: HTTP 400/401/500 con messaggio di errore

## Verifica Funzionamento

### 1. Test Manuale API

Usa cURL per testare l'API:

```bash
curl -s -o /dev/null -w "HTTP %{http_code}\n" \
  -X POST "https://formulablackandscholes.com/wp-json/ava/v1/log" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "nome_comleto":"Test User",
    "email":"test@example.com",
    "tipo_account":"demo",
    "livello_cliente":"A",
    "segnale":"APRI",
    "strike":1800,
    "margine_per_contratto":700,
    "orario_scadenza":"2025-08-10 14:30:00",
    "giorni_a_scadenza":30
  }'
```

Dovresti ricevere: `HTTP 204`

### 2. Controlla Database

Verifica nel database MySQL:

```sql
SELECT * FROM avaopions_log ORDER BY created_at DESC LIMIT 10;
```

### 3. Monitor Logs

Quando l'automazione esegue un trade, dovresti vedere nei log:

```
✅ Trade opened successfully
   ✅ Trade logged to database successfully
```

## Troubleshooting

### "Failed to log trade: HTTP 401"

- Controlla che l'API key sia corretta
- Verifica che il plugin sia attivato
- Rigenera l'API key se necessario

### "Failed to log trade: HTTP 400"

- Campi obbligatori mancanti (`email` e `segnale`)
- Dati JSON malformati

### "Error logging trade to database: fetch failed"

- Verifica connessione internet
- Controlla URL WordPress
- Verifica che WordPress sia raggiungibile

### Nessun log nel database

- Controlla che i trade vengano effettivamente eseguiti con successo
- Verifica i log dell'applicazione per errori
- Testa manualmente l'API con cURL

## Note di Sicurezza

1. **Mai committare** l'API key nel repository
2. Usa HTTPS per tutte le comunicazioni
3. L'API key ha accesso solo alla tabella `avaopions_log` (inserimento)
4. Rigenera periodicamente l'API key per sicurezza
