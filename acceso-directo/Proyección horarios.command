#!/bin/zsh
set -euo pipefail

ROOT="/Users/sena/CHENAO/horarios-sena"
PORT=3000
URL="http://127.0.0.1:${PORT}"

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"
if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  source "$HOME/.nvm/nvm.sh"
fi

cd "$ROOT" || {
  osascript -e 'display dialog "No se encontró el proyecto de Proyección horarios." buttons {"OK"} default button 1 with icon stop' >/dev/null
  exit 1
}

if curl -sf "$URL" >/dev/null 2>&1; then
  open "$URL"
  exit 0
fi

if ! command -v npm >/dev/null 2>&1; then
  osascript -e 'display dialog "No se encontró Node.js / npm. Instálalo para abrir Proyección horarios." buttons {"OK"} default button 1 with icon stop' >/dev/null
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "Instalando dependencias…"
  npm install
fi

(
  for _ in {1..90}; do
    if curl -sf "$URL" >/dev/null 2>&1; then
      open "$URL"
      exit 0
    fi
    sleep 0.4
  done
) &

echo "Iniciando Proyección horarios (Area Soft)…"
echo "No cierre esta ventana mientras use el sistema. Ctrl+C para salir."
exec npm run dev -- --hostname 127.0.0.1 --port "$PORT"
