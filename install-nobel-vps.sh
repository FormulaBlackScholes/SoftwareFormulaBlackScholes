#!/bin/bash
# ============================================================
# Nobel Trading — IONOS VPS Installer (Ubuntu 24.04)
# Usage: scp install-nobel-vps.sh root@<IP>:~ && ssh root@<IP> bash install-nobel-vps.sh
# ============================================================
set -e

INSTALL_DIR="/root/nobel-trading-app"
LAUNCHER="/usr/local/bin/nobel-trading"

echo "══════════════════════════════════════════════════"
echo "  Nobel Trading — VPS Installer"
echo "══════════════════════════════════════════════════"

# ── 1. System dependencies ────────────────────────────
echo "📦 Installing system dependencies..."
apt-get update
apt-get install -y \
  curl wget xvfb libfuse2 \
  libglib2.0-0 libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
  libcups2 libdrm2 libdbus-1-3 libxkbcommon0 libatspi2.0-0 \
  libx11-6 libxcomposite1 libxdamage1 libxext6 libxfixes3 \
  libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2t64 \
  libxshmfence1 libgtk-3-0 libgdk-pixbuf2.0-0 fonts-liberation \
  fonts-noto-color-emoji libfontconfig1 libfreetype6

# ── 2. XFCE + xrdp (remote desktop via Remmina) ──────
echo "🖥️  Installing XFCE desktop + xrdp..."
DEBIAN_FRONTEND=noninteractive apt-get install -y xfce4 xfce4-goodies xrdp
echo "xfce4-session" > /root/.xsession
chmod +x /root/.xsession
sed -i 's/^#\?AllowRootLogin=.*/AllowRootLogin=true/' /etc/xrdp/sesman.ini
systemctl enable --now xrdp
ufw allow 3389/tcp 2>/dev/null || true

# ── 3. Node.js 20 ────────────────────────────────────
echo "📦 Installing Node.js 20..."
if ! command -v node &>/dev/null || [[ "$(node -v)" != v20* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
echo "   Node.js $(node -v)"

# ── 4. Runtime dependencies + Playwright Chromium ─────
echo "📦 Installing runtime dependencies..."
mkdir -p /root/.avaauto && cd /root/.avaauto
cat > package.json << 'PKGJSON'
{
  "name": "nobel-runtime",
  "private": true,
  "dependencies": {
    "@playwright/test": "1.30.0",
    "dotenv": "^16.0.0",
    "node-fetch": "^3.3.0",
    "sharp": "^0.33.0"
  }
}
PKGJSON
npm install
npx playwright install chromium
npx playwright install-deps chromium || true

# ── 5. Download & extract AppImage ────────────────────
# Extract permanently — avoids FUSE mount issues on VPS
echo "⬇️  Downloading latest Nobel Trading AppImage..."
APPIMAGE_TMP="/tmp/nobel-trading.AppImage"
URL=$(curl -s https://api.github.com/repos/FormulaBlackScholes/SoftwareFormulaBlackScholes/releases/latest \
  | grep "browser_download_url.*AppImage" | head -1 | cut -d '"' -f 4)
echo "   URL: $URL"
curl -L "$URL" -o "$APPIMAGE_TMP"
chmod +x "$APPIMAGE_TMP"

echo "📦 Extracting AppImage to $INSTALL_DIR..."
rm -rf "$INSTALL_DIR" /tmp/squashfs-root
cd /tmp
"$APPIMAGE_TMP" --appimage-extract
mv /tmp/squashfs-root "$INSTALL_DIR"
rm -f "$APPIMAGE_TMP"

# Verify extraction succeeded
if [[ ! -x "$INSTALL_DIR/AppRun" ]]; then
  echo "❌ Extraction failed — $INSTALL_DIR/AppRun not found"
  exit 1
fi
echo "   ✅ Extracted successfully"

# ── 6. Link node_modules into the app ────────────────
# Ensures @playwright/test resolves from the bundled tests directory
echo "🔗 Linking runtime node_modules..."
rm -rf "$INSTALL_DIR/resources/trading-app/node_modules"
ln -sf /root/.avaauto/node_modules "$INSTALL_DIR/resources/trading-app/node_modules"
ln -sf /root/.avaauto/node_modules /root/node_modules

# ── 7. Create launcher script ────────────────────────
# Wrapper script sets APPDIR + NODE_PATH reliably (avoids .desktop parsing issues)
echo "🚀 Creating launcher script..."
cat > "$LAUNCHER" << 'LAUNCHSCRIPT'
#!/bin/bash
export APPDIR=/root/nobel-trading-app
export NODE_PATH=/root/.avaauto/node_modules
exec /root/nobel-trading-app/AppRun --no-sandbox "$@"
LAUNCHSCRIPT
chmod +x "$LAUNCHER"

# ── 8. Extract icon + create desktop shortcut ────────
echo "🎨 Creating desktop shortcut..."
mkdir -p /root/.local/share/icons
cp "$INSTALL_DIR/usr/share/icons/hicolor/0x0/apps/avaauto-dashboard.png" \
   /root/.local/share/icons/nobel-trading.png

mkdir -p /root/Desktop /root/.local/share/applications
cat > /root/Desktop/Nobel-Trading.desktop << DESKTOP
[Desktop Entry]
Name=Nobel Trading
Exec=$LAUNCHER
Icon=/root/.local/share/icons/nobel-trading.png
Type=Application
Terminal=false
Categories=Finance;
StartupNotify=false
DESKTOP
chmod +x /root/Desktop/Nobel-Trading.desktop
cp /root/Desktop/Nobel-Trading.desktop /root/.local/share/applications/

# Auto-trust the launcher (no "Launch anyway" prompt)
gio set /root/Desktop/Nobel-Trading.desktop "metadata::trusted" true 2>/dev/null || true

# ── 9. systemd service (headless mode) ───────────────
echo "⚙️  Creating systemd service..."
cat > /etc/systemd/system/nobel-trading.service << 'SERVICE'
[Unit]
Description=Nobel Trading Monitor
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/xvfb-run --auto-servernum --server-args="-screen 0 1920x1080x24" /usr/local/bin/nobel-trading
Restart=on-failure
RestartSec=10
Environment=DISPLAY=:99
Environment=HOME=/root
WorkingDirectory=/root

[Install]
WantedBy=multi-user.target
SERVICE
systemctl daemon-reload
# Don't enable yet — customer needs to log in visually first

# ── Done ──────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════"
echo "  ✅ Installation complete!"
echo "══════════════════════════════════════════════════"
echo ""
echo "  NEXT STEPS:"
echo "  1. Open IONOS panel → Firewall → allow port 3389 TCP"
echo "  2. Connect via Remmina (RDP) to $(hostname -I | awk '{print $1}')"
echo "     Username: root"
echo "     Password: (your SSH password)"
echo "  3. Double-click 'Nobel Trading' on the desktop"
echo "  4. Log in with your AvaTrade credentials"
echo "  5. Click 'Bypass Cloudflare' for the initial captcha"
echo "  6. Click 'Avvia Automazione' to start trading"
echo "  7. Once confirmed working, enable headless auto-start:"
echo "     systemctl enable --now nobel-trading.service"
echo ""
