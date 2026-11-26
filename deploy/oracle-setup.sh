#!/usr/bin/env bash
set -euo pipefail

echo "=== 1. Cap nhat he thong & cai Node.js 22 LTS + PM2 ==="
sudo apt-get update -y
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

if ! command -v pm2 >/dev/null 2>&1; then
  sudo npm install -g pm2
fi

echo "=== 2. Cai dat thu vien & build Web Dashboard ==="
npm ci
npm run build

if [ ! -f .env ]; then
  cp .env.example .env
  echo ""
  echo "[LUU Y] Da tao file .env tu .env.example."
  echo "Hay mo file .env dien DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID roi chay:"
  echo "  npm run bot:register && pm2 start ecosystem.config.cjs && pm2 save"
  exit 0
fi

echo "=== 3. Dang ky Slash Commands & khoi chay 24/7 bang PM2 ==="
npm run bot:register
pm2 delete pokemeow-web pokemeow-bot >/dev/null 2>&1 || true
pm2 start ecosystem.config.cjs
pm2 save

echo "=== Hoan tat! Kiem tra trang thai bang: pm2 status ==="
