#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/../.."

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "HATA: Node.js 24.17+ ve npm kurulu olmalı." >&2
  exit 1
fi
node -e 'const [major,minor] = process.versions.node.split(".").map(Number); if (major < 24 || (major === 24 && minor < 17)) { console.error("Node.js 24.17.0+ gerekli."); process.exit(1); }'

if [[ ! -e .env ]]; then
  cp .env.example .env
  chmod 600 .env
  echo "Örnek .env oluşturuldu; token ve uygulama ID'sini girin."
fi
npm install
npm run check
npm run test
npm run build
printf '\nKurulum hazır. Şimdi: nano .env; npm run doctor; npm run commands:register; npm start\n'
