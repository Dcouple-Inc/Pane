#!/bin/bash
# foozol Cloud VM Setup Script
# Installs all dependencies and configures the noVNC display stack
# Run on a fresh Ubuntu 24.04 VM as root
#
# Usage: sudo bash setup-vm.sh [--foozol-version VERSION]

set -eo pipefail

# Ensure full PATH — GCP startup scripts run with minimal PATH
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

FOOZOL_VERSION="${1:-latest}"
DISPLAY_NUM=99
RESOLUTION="1920x1080x24"
VNC_PORT=5900
NOVNC_PORT=6080
FOOZOL_USER="foozol"

echo "=== foozol Cloud VM Setup ==="
echo "Display: :${DISPLAY_NUM} @ ${RESOLUTION}"
echo "VNC port: ${VNC_PORT}"
echo "noVNC port: ${NOVNC_PORT}"
echo ""

# ============================================================
# 1. System packages
# ============================================================
echo "[1/8] Installing system packages..."
export DEBIAN_FRONTEND=noninteractive

apt-get update -qq
apt-get install -y -qq \
  xvfb \
  x11vnc \
  novnc \
  websockify \
  fluxbox \
  supervisor \
  nginx \
  certbot \
  python3-certbot-nginx \
  git \
  tmux \
  curl \
  wget \
  unzip \
  jq \
  htop \
  dbus-x11 \
  xdg-utils \
  fonts-liberation \
  fonts-noto-color-emoji \
  > /dev/null

# Electron / Chromium dependencies
apt-get install -y -qq \
  libnss3 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libgtk-3-0 \
  libgbm1 \
  libasound2t64 \
  libxss1 \
  libxtst6 \
  libcups2 \
  libdrm2 \
  libxkbcommon0 \
  libgdk-pixbuf-2.0-0 \
  libx11-xcb1 \
  libnotify4 \
  > /dev/null

echo "  Done."

# Rehash so newly installed binaries (curl, wget, etc.) are found
hash -r

# ============================================================
# 2. Node.js 20 LTS
# ============================================================
echo "[2/8] Installing Node.js 20 LTS..."

# Always ensure we have Node 20+ (Ubuntu 24.04 ships with Node 18)
NODE_MAJOR=$(node --version 2>/dev/null | sed 's/v\([0-9]*\).*/\1/' || echo "0")
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "  Current Node version: $(node --version 2>/dev/null || echo 'none'). Upgrading to Node 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs > /dev/null
fi

# Rehash to pick up new node/npm paths
hash -r

# pnpm - use full path to npm since we're running as root
if ! command -v pnpm &> /dev/null; then
  echo "  Installing pnpm..."
  /usr/bin/npm install -g pnpm > /dev/null 2>&1 || npm install -g pnpm > /dev/null 2>&1
fi

echo "  Node $(node --version), pnpm $(pnpm --version 2>/dev/null || echo 'not installed')"

# ============================================================
# 3. GitHub CLI
# ============================================================
echo "[3/8] Installing GitHub CLI..."
if ! command -v gh &> /dev/null; then
  (type -p wget >/dev/null || apt-get install wget -y -qq) \
    && mkdir -p -m 755 /etc/apt/keyrings \
    && wget -qO- https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      | tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null \
    && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update -qq > /dev/null \
    && apt-get install gh -y -qq > /dev/null
fi
echo "  Done."

# ============================================================
# 4. Claude Code CLI
# ============================================================
echo "[4/8] Installing Claude Code CLI..."
if ! command -v claude &> /dev/null; then
  npm install -g @anthropic-ai/claude-code > /dev/null 2>&1 || true
fi
echo "  Done."

# ============================================================
# 5. Install foozol
# ============================================================
echo "[5/9] Installing foozol..."
ARCH=$(dpkg --print-architecture)
if [ ! -f /usr/bin/foozol ]; then
  # Download the latest foozol AppImage from GitHub Releases
  RELEASE_URL=$(curl -fsSL https://api.github.com/repos/parsakhaz/foozol/releases/latest \
    | jq -r ".assets[] | select(.name | test(\"foozol.*${ARCH}.*\\\\.AppImage$\")) | .browser_download_url" \
    | head -1)

  if [ -n "${RELEASE_URL}" ] && [ "${RELEASE_URL}" != "null" ]; then
    echo "  Downloading from ${RELEASE_URL}..."
    curl -fsSL -o /usr/bin/foozol "${RELEASE_URL}"
    chmod +x /usr/bin/foozol
  else
    # Fallback: try .deb package
    DEB_URL=$(curl -fsSL https://api.github.com/repos/parsakhaz/foozol/releases/latest \
      | jq -r ".assets[] | select(.name | test(\"foozol.*${ARCH}.*\\\\.deb$\")) | .browser_download_url" \
      | head -1)

    if [ -n "${DEB_URL}" ] && [ "${DEB_URL}" != "null" ]; then
      echo "  Downloading .deb from ${DEB_URL}..."
      curl -fsSL -o /tmp/foozol.deb "${DEB_URL}"
      dpkg -i /tmp/foozol.deb || apt-get install -f -y -qq > /dev/null
      rm -f /tmp/foozol.deb
    else
      echo "  WARNING: No foozol release found for ${ARCH}. The foozol supervisor process will not start."
      echo "  Install foozol manually and place the binary at /usr/bin/foozol"
    fi
  fi
fi
echo "  Done."

# ============================================================
# 6. Create foozol user
# ============================================================
echo "[6/9] Setting up foozol user..."
if ! id "${FOOZOL_USER}" &>/dev/null; then
  useradd -m -s /bin/bash "${FOOZOL_USER}"
fi

# Create standard directories
sudo -u "${FOOZOL_USER}" mkdir -p \
  "/home/${FOOZOL_USER}/.foozol" \
  "/home/${FOOZOL_USER}/.claude" \
  "/home/${FOOZOL_USER}/.config/gh" \
  "/home/${FOOZOL_USER}/.ssh" \
  "/home/${FOOZOL_USER}/projects"

echo "  User: ${FOOZOL_USER}"

# Configure fluxbox for clean kiosk-like experience
FLUXBOX_DIR="/home/${FOOZOL_USER}/.fluxbox"
sudo -u "${FOOZOL_USER}" mkdir -p "${FLUXBOX_DIR}"

# Remove title bar from foozol/Electron windows
# Match on both name and class since Electron apps may vary
cat > "${FLUXBOX_DIR}/apps" << 'FLUXBOX_APPS_EOF'
[app] (name=foozol)
  [Deco] {NONE}
  [Maximized] {yes}
[end]
[app] (class=foozol)
  [Deco] {NONE}
  [Maximized] {yes}
[end]
[app] (class=Electron)
  [Deco] {NONE}
  [Maximized] {yes}
[end]
FLUXBOX_APPS_EOF
chown "${FOOZOL_USER}:${FOOZOL_USER}" "${FLUXBOX_DIR}/apps"

# Hide the toolbar completely - must clear tools and set visible false
# See: https://forums.linuxmint.com/viewtopic.php?t=40637
cat > "${FLUXBOX_DIR}/init" << 'FLUXBOX_INIT_EOF'
session.screen0.toolbar.visible: false
session.screen0.toolbar.tools:
session.screen0.workspaces: 1
session.screen0.workspacewarping: false
FLUXBOX_INIT_EOF
chown "${FOOZOL_USER}:${FOOZOL_USER}" "${FLUXBOX_DIR}/init"

echo "  Fluxbox configured (no title bar, no toolbar)"

# ============================================================
# 7. Get or generate VNC password
# ============================================================
echo "[7/9] Setting up VNC password..."
VNC_PASSWORD_FILE="/home/${FOOZOL_USER}/.vnc_password"

# Try to get VNC password from instance metadata (set by Terraform)
VNC_PASSWORD=$(curl -sf -H "Metadata-Flavor: Google" \
  "http://metadata.google.internal/computeMetadata/v1/instance/attributes/vnc-password" 2>/dev/null || echo "")

if [ -z "$VNC_PASSWORD" ]; then
  # Fallback: generate a random password
  echo "  No password in metadata, generating random password..."
  VNC_PASSWORD=$(openssl rand -base64 12)
else
  echo "  Using password from instance metadata."
fi

echo "${VNC_PASSWORD}" > "${VNC_PASSWORD_FILE}"
chmod 600 "${VNC_PASSWORD_FILE}"
chown "${FOOZOL_USER}:${FOOZOL_USER}" "${VNC_PASSWORD_FILE}"
echo "  VNC password saved to ${VNC_PASSWORD_FILE}"

# ============================================================
# 8. Configure supervisord
# ============================================================
echo "[8/9] Configuring supervisord..."

cat > /etc/supervisor/conf.d/foozol-stack.conf << SUPERVISOR_EOF
; =============================================================
; foozol Cloud Display Stack
; =============================================================

[program:xvfb]
command=/usr/bin/Xvfb :99 -screen 0 1920x1080x24 -ac +extension GLX +render -noreset
priority=10
autorestart=true
stdout_logfile=/var/log/supervisor/xvfb.log
stderr_logfile=/var/log/supervisor/xvfb-error.log

[program:fluxbox]
command=/usr/bin/fluxbox
priority=20
autorestart=true
environment=DISPLAY=":99"
user=foozol
stdout_logfile=/var/log/supervisor/fluxbox.log
stderr_logfile=/var/log/supervisor/fluxbox-error.log

[program:foozol]
command=/usr/bin/foozol --no-sandbox --start-fullscreen
priority=30
autorestart=true
environment=DISPLAY=":99",HOME="/home/foozol",XDG_RUNTIME_DIR="/run/user/1000"
user=foozol
directory=/home/foozol
stdout_logfile=/var/log/supervisor/foozol.log
stderr_logfile=/var/log/supervisor/foozol-error.log
; Give foozol time to start before considering it failed
startsecs=5
; Restart up to 5 times if it crashes
startretries=5

[program:x11vnc]
command=/usr/bin/x11vnc -display :99 -passwd ${VNC_PASSWORD} -forever -shared -rfbport 5900 -localhost -noxdamage -cursor arrow -noxfixes
priority=40
autorestart=true
user=foozol
stdout_logfile=/var/log/supervisor/x11vnc.log
stderr_logfile=/var/log/supervisor/x11vnc-error.log

[program:websockify]
command=/usr/bin/websockify --web=/usr/share/novnc 6080 localhost:5900
priority=50
autorestart=true
stdout_logfile=/var/log/supervisor/websockify.log
stderr_logfile=/var/log/supervisor/websockify-error.log

[group:foozol-cloud]
programs=xvfb,fluxbox,foozol,x11vnc,websockify
priority=999
SUPERVISOR_EOF

echo "  Done."

# ============================================================
# 9. Configure NGINX
# ============================================================
echo "[9/9] Configuring NGINX..."

cat > /etc/nginx/sites-available/foozol-cloud << 'NGINX_EOF'
# foozol Cloud - NGINX reverse proxy for noVNC
# TLS will be configured by certbot after domain is set up

server {
    listen 80 default_server;
    server_name _;

    # Health check endpoint
    location /health {
        access_log off;
        return 200 'ok';
        add_header Content-Type text/plain;
    }

    # noVNC static files
    location /novnc/ {
        alias /usr/share/novnc/;
        index vnc.html;
    }

    # WebSocket proxy to websockify
    location /websockify {
        proxy_pass http://127.0.0.1:6080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
        proxy_buffering off;
    }

    # Default: redirect to noVNC
    location / {
        return 301 /novnc/vnc.html?autoconnect=true&resize=scale&reconnect=true&reconnect_delay=1000;
    }
}
NGINX_EOF

# Enable the site
ln -sf /etc/nginx/sites-available/foozol-cloud /etc/nginx/sites-enabled/foozol-cloud
rm -f /etc/nginx/sites-enabled/default

# Test NGINX config
nginx -t

echo "  Done."

# ============================================================
# Final setup
# ============================================================

# Create XDG runtime directory for foozol user
mkdir -p /run/user/1000
chown "${FOOZOL_USER}:${FOOZOL_USER}" /run/user/1000

# Enable and start services
systemctl enable supervisor
systemctl enable nginx
systemctl restart supervisor
systemctl restart nginx

echo ""
echo "=== Setup Complete ==="
echo ""
echo "VNC password: ${VNC_PASSWORD}"
echo ""
echo "Access via IAP tunnel:"
echo "  gcloud compute start-iap-tunnel <INSTANCE> 80 --local-host-port=localhost:8080 --zone=<ZONE> --project=<PROJECT>"
echo "  Then open: http://localhost:8080/novnc/vnc.html?autoconnect=true&resize=scale"
echo ""
echo "First-run auth (do this in the noVNC session):"
echo "  1. gh auth login    (GitHub)"
echo "  2. claude login     (Claude Code)"
echo "  3. Set API keys in foozol Settings"
echo ""
