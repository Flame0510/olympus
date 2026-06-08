# TOOLS.md — Tools Prometheus

## Workspace
- Path: `/docker/openclaw-glxx/data/.openclaw/workspace-website/`
- Area clienti: `teams/clients/`

## Comandi rapidi
```bash
# Lista clienti
ls teams/clients/

# Leggi brief
cat teams/clients/<cliente>/BRIEF.md

# Leggi memoria progetto
cat teams/clients/<cliente>/MEMORY.md

# Crea nuova cartella cliente (da template)
cp -r teams/clients/_template teams/clients/<nuovo-cliente>/
```

## Script disponibili
- Generazione PDF preventivi: Chromium headless
- Template: `teams/clients/_template/`

## Notifiche
- Forge: via Telegram (coordinamento)
- Michele: solo per escalation
