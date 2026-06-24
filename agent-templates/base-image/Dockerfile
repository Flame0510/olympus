# Nexus Agent Base Image
#
# Immagine base minimale per gli agent container dell'ecosistema Olympus.
# Contiene solo l'indispensabile: Node, OpenClaw, entrypoint.
# Tool aggiuntivi (git, gh, supabase, vercel, etc.) vengono installati
# on-demand da Olympus o direttamente dall'utente nella dashboard.
#
# Build:
#   docker build -t nexus-agent-base:latest -f Dockerfile.agent-base .
#
# Test:
#   docker run --rm nexus-agent-base:latest openclaw --version

FROM node:24-bookworm-slim

LABEL description="Nexus Agent Base — Olympus multicontainer ecosystem"
LABEL maintainer="Olympus Agency"

# Evita prompt interattivi
ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production

# Installazione strettamente minima
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Solo OpenClaw — niente PM2, niente gh, niente git
# L'agente userà il Provider Gateway per le credenziali
# e Olympus per installare tool extra via API
RUN npm install -g openclaw

# Configurazioni di default
RUN mkdir -p /data/.openclaw

# Entrypoint standard
COPY agent-entrypoint.sh /agent-entrypoint.sh
RUN chmod +x /agent-entrypoint.sh

WORKDIR /data
EXPOSE 3000

ENTRYPOINT ["/agent-entrypoint.sh"]
CMD ["openclaw", "gateway", "--bind", "lan"]
