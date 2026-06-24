#!/bin/bash
# Agent Container Entrypoint
#
# Genera config e avvia OpenClaw gateway in foreground.

set -e

AGENT_ID="${AGENT_ID:-unknown}"
echo "[entrypoint] Avvio agente: $AGENT_ID"

# Genera config OpenClaw
mkdir -p /root/.openclaw
CONFIG_FILE="/root/.openclaw/openclaw.json"
if [ ! -f "$CONFIG_FILE" ]; then
  echo "[entrypoint] Generazione config OpenClaw..."
  cat > "$CONFIG_FILE" << JSONEOF
{
  "gateway": {
    "mode": "local"
  },
  "update": { "channel": "stable", "checkOnStart": false },
  "browser": { "headless": true, "noSandbox": true },
  "commands": { "bash": true, "native": "auto", "restart": true },
  "tools": {
    "profile": "full",
    "skillRepository": "/shared-skills"
  },
  "agents": {
    "list": [
      {
        "id": "main",
        "name": "${AGENT_NAME:-$AGENT_ID}",
        "model": {
          "primary": "${MODEL_PRIMARY:-deepseek/deepseek-v4-flash}",
          "fallbacks": ["${MODEL_FALLBACK:-openrouter/deepseek/deepseek-v4-flash}"]
        }
      }
    ],
    "defaults": {
      "model": {
        "primary": "${MODEL_PRIMARY:-deepseek/deepseek-v4-flash}",
        "fallbacks": ["${MODEL_FALLBACK:-openrouter/deepseek/deepseek-v4-flash}"]
      },
      "userTimezone": "Europe/Rome"
    }
  }
}
JSONEOF
  echo "[entrypoint] Config generata"
fi

# Avvia il comando passato (default: openclaw gateway --bind lan)
echo "[entrypoint] Esecuzione: $@"
exec "$@"
