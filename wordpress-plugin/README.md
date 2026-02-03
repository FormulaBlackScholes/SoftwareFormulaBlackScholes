# Trading Signals API - WordPress Plugin

Secure REST API for automated trading signal distribution to customer VPS systems.

---

## 📦 What's Included

- `trading-signals-api.php` - Main plugin file with REST API endpoints

---

## 🚀 Installation

### Method 1: WordPress Admin (Recommended)

1. **Zip the plugin**:
   ```bash
   cd wordpress-plugin
   zip -r trading-signals-api.zip .
   ```

2. **Upload to WordPress**:
   - Go to: **Plugins → Add New → Upload Plugin**
   - Select `trading-signals-api.zip`
   - Click **Install Now** → **Activate**

3. **Copy your API key** from the activation notice!

### Method 2: FTP/File Manager

1. **Upload via FTP**:
   - Connect to your WordPress site via FTP
   - Navigate to `/wp-content/plugins/`
   - Create folder: `trading-signals-api`
   - Upload `trading-signals-api.php` to this folder

2. **Activate**:
   - Go to WordPress Admin → Plugins
   - Find "Trading Signals API"
   - Click **Activate**
   - Copy your API key!

### Method 3: SiteGround File Manager

1. Go to: **Site Tools → Site → File Manager**
2. Navigate to: `/public_html/wp-content/plugins/`
3. Create folder: `trading-signals-api`
4. Upload `trading-signals-api.php`
5. Go to WordPress Admin → Plugins → Activate

---

## 🔑 Managing API Keys

### View Your API Key

1. Go to: **WordPress Admin → Settings → Trading API**
2. Copy your API key
3. Keep it secure!

### Regenerate API Key

1. Go to: **Settings → Trading API**
2. Click **Regenerate API Key**
3. Confirm the action
4. Copy the new key
5. Update all VPS systems with the new key

⚠️ **Warning**: Regenerating will invalidate the old key immediately!

---

## 📡 API Endpoints

### Base URL
```
https://your-domain.com/wp-json/trading/v1
```

### 1. Get Pending Signals

**Endpoint**: `GET /signals/pending`

**Headers**:
```
X-API-Key: your_api_key_here
```

**Query Parameters**:
- `email` (optional) - Filter signals by customer email

**Response** (200 OK):
```json
[
  {
    "id": "1",
    "nome_completo": "Mario Rossi",
    "email": "mario@example.com",
    "tipo_account": "Real",
    "livello_cliente": "Pro",
    "segnale": "APRI",
    "strike": "5450.00",
    "margine_per_contratto": "100.00",
    "orario_scadenza": "17:00:00",
    "giorno_scadenza": "2024-01-15",
    "created_at": "2024-01-14 10:30:00",
    "processed": "0"
  }
]
```

**Response** (401 Unauthorized):
```json
{
  "code": "unauthorized",
  "message": "Invalid API key",
  "data": {"status": 401}
}
```

### 2. Mark Signal as Processed

**Endpoint**: `POST /signals/{id}/complete`

**Headers**:
```
X-API-Key: your_api_key_here
Content-Type: application/json
```

**Body**:
```json
{
  "success": true
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Signal marked as processed"
}
```

---

## 🧪 Testing

### Quick Test with curl

```bash
# Get pending signals
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://your-domain.com/wp-json/trading/v1/signals/pending"

# Get signals for specific customer
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://your-domain.com/wp-json/trading/v1/signals/pending?email=customer@example.com"

# Mark signal as processed
curl -X POST \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"success": true}' \
  "https://your-domain.com/wp-json/trading/v1/signals/1/complete"
```

### Automated Testing

From the project root:

```bash
# Interactive test suite
./test-wordpress-plugin.sh

# Simple test
./simple-api-test.sh YOUR_API_KEY
```

---

## 🛡️ Security Features

### API Key Authentication
- Every request requires valid API key in `X-API-Key` header
- Keys are 64-character random hex strings
- Stored securely in WordPress options table

### Email Filtering
- Customers can only access their own signals via email parameter
- Query injection protection via WordPress prepared statements

### HTTPS Only
- API should only be accessed over HTTPS
- Ensure SSL certificate is valid

### WordPress Security
- Uses WordPress's built-in REST API framework
- Nonces for admin actions
- Capability checks for admin pages

---

## 🗄️ Database Requirements

The plugin requires the `wp_user_signals` table:

```sql
CREATE TABLE wp_user_signals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome_completo VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  tipo_account VARCHAR(50),
  livello_cliente VARCHAR(50),
  segnale VARCHAR(50) NOT NULL,
  strike DECIMAL(10,2),
  margine_per_contratto DECIMAL(10,2),
  orario_scadenza TIME,
  giorno_scadenza DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  processed TINYINT DEFAULT 0,
  processed_at TIMESTAMP NULL,
  execution_success TINYINT NULL,
  INDEX idx_processed (processed),
  INDEX idx_email (email),
  INDEX idx_segnale (segnale)
);
```

**Note**: Table name uses your WordPress prefix (usually `wp_`)

---

## 👥 Multi-Customer Setup

### For Each Customer:

1. **Customer activates monitor script** on their VPS
2. **Configure with their email**:
   ```env
   CUSTOMER_EMAIL=customer@example.com
   ```
3. **Use same API key** (or regenerate per-customer for better tracking)
4. **API automatically filters** by email

### Benefits:
- Each customer only sees their signals
- Centralized signal management
- Easy to add/remove customers
- Track usage per customer

---

## 🔧 Troubleshooting

### Plugin Not Appearing After Upload

**Check**:
- File is in correct location: `/wp-content/plugins/trading-signals-api/trading-signals-api.php`
- PHP syntax errors: Check WordPress debug log
- File permissions: Should be 644

### "Unauthorized" Error

**Check**:
- API key is correct (no spaces/line breaks)
- Key hasn't been regenerated recently
- `X-API-Key` header is set correctly

### No Signals Returned

**Check**:
- Database table exists: `SHOW TABLES LIKE '%user_signals';`
- Signals exist: `SELECT * FROM wp_user_signals WHERE processed = 0;`
- Signal types are valid: `segnale IN ('APRI', 'CHIUDI')`
- Email filter is correct

### CORS Errors (Browser Only)

If testing from browser console:

```php
// Add to wp-config.php if needed
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: X-API-Key');
```

⚠️ **Note**: Not needed for server-to-server (VPS) requests

---

## 📊 Performance

### Expected Performance:
- Response time: < 500ms
- Concurrent requests: Handles typical WordPress traffic
- Database: Indexed queries for fast lookups

### Optimization Tips:
- Enable WordPress object caching (Redis/Memcached)
- Use SiteGround's Dynamic Caching
- Add `LIMIT` to queries if many signals
- Archive old processed signals

---

## 🔄 Updates and Maintenance

### Version Updates

When updating the plugin:
1. Deactivate old version
2. Replace `trading-signals-api.php`
3. Reactivate plugin
4. API key is preserved

### Database Migrations

If schema changes are needed:
```sql
-- Add new column
ALTER TABLE wp_user_signals 
ADD COLUMN new_field VARCHAR(255) AFTER existing_field;

-- Add index
CREATE INDEX idx_new_field ON wp_user_signals(new_field);
```

---

## 📝 Changelog

### Version 1.0
- Initial release
- REST API endpoints for pending signals
- Mark signals as processed
- Email filtering
- API key authentication
- Admin settings page

---

## 🆘 Support

For setup help, see:
- `QUICK_START_PLUGIN_TEST.md` - 5-minute quick start
- `WORDPRESS_PLUGIN_TEST_GUIDE.md` - Detailed testing guide
- `API_SETUP_GUIDE.md` - Architecture and setup
- `test-data-setup.sql` - Test data and troubleshooting

---

## 📄 License

Proprietary - For internal use only

---

## ✅ Production Checklist

Before going live:

- [ ] Plugin activated on WordPress
- [ ] API key saved securely
- [ ] Database table created with indexes
- [ ] Test data cleaned up
- [ ] API tested with curl
- [ ] HTTPS working (SSL certificate valid)
- [ ] Customer VPS configured
- [ ] Monitor script tested
- [ ] Process management setup (PM2)
- [ ] Logs configured
- [ ] Backup procedures in place

---

**Plugin Version**: 1.0  
**WordPress Compatibility**: 5.0+  
**PHP Version**: 7.4+  
**Tested With**: SiteGround hosting
