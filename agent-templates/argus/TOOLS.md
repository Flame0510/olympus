# TOOLS.md — Note Setup Argus

## Infrastruttura

### Olympus
- **URL:** http://187.77.156.41:3700/
- **Auth:** Bearer `olympus2026`
- **DB:** `/data/olympus/events.db`
- **Log daemon:** `/data/olympus/daemon.log`
- **Log server:** `/data/olympus/server.log`

### VPS
- **SSH:** `ssh root@187.77.156.41`
- **Container path:** `/data/olympus/` (stesso inode di `/docker/openclaw-glxx/data/olympus/` sul VPS)

### PM2
```bash
pm2 list                          # status
pm2 restart olympus-daemon        # riavvio
pm2 logs olympus-daemon           # log live
```

### Avvio completo
```bash
bash /data/olympus/start-daemon.sh
```

### Verifica DB freshness
```bash
sqlite3 /data/olympus/events.db "SELECT MAX(ts) FROM sessions" | awk '{print strftime("%Y-%m-%d %H:%M:%S", $1/1000)}'
```

### ⚠️ PORT obbligatoria
```bash
# SEMPRE specificare PORT=3700 — il container ha PORT=48138 come globale
cd /data/olympus && PORT=3700 node server.js
```

### ⚠️ Permessi openclaw.json
```bash
# Se daemon non legge sessioni → verificare permessi
ls -la /data/.openclaw/openclaw.json
# Deve essere 644, non 600
sudo chmod 644 /data/.openclaw/openclaw.json
```

## Trello
- API Key: `d3c4a0fee1535d810461edde2af9ab5e`
- Token: vedi USER.md
- Board Olympus: `69bc61d6956c9c318102e4af`

## Repo GitHub
- **Olympus dashboard:** https://github.com/Flame0510/olympus-dashboard (privata — Michele la renderà pubblica)
- **MiroFish (Proteo):** https://github.com/amadad/mirofish
- git email obbligatorio: `micheletornello5@gmail.com`

## Olympus lineage scripts
```bash
# Script skill globale (preferito)
node /data/.openclaw/shared-skills/olympus/scripts/lineage.js "<child>" "<parent>" "<Nome>"

# Script locale Olympus (alternativa)
node /data/olympus/lineage.js "<child>" "<parent>" "<Nome>"
```

## Override costo reale GitHub
```python
import sqlite3, time
db = sqlite3.connect('/data/olympus/events.db')
db.execute('INSERT OR REPLACE INTO cost_override VALUES (?,?,?,?)',
  ('2026-03', 124.10, 'nota', int(time.time()*1000)))
db.commit(); db.close()
```

## Verifica JSON parse daemon (workaround bug stdout)
```js
// openclaw sessions --json emette a volte riga di log extra
const json = output.substring(0, output.lastIndexOf('}') + 1);
const data = JSON.parse(json);
```
