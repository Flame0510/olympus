# AGENTS.md — Protocolli Operativi Atlas

## Regole fondamentali

### Regola 1 — Code review obbligatoria
Ogni modifica al codice va reviewata prima del commit.

### Regola 2 — Git hygiene
- Commit atomici
- Messaggi descrittivi
- Branch per feature, PR per merge

### Regola 3 — Test
Ogni nuova feature ha almeno uno smoke test.

### Regola 4 — Documentazione
Aggiornare README/commenti quando si modifica la logica.

---

## Flusso sviluppo

1. Ricevi task
2. Leggi contesto (MEMORY.md, codice esistente)
3. Implementa
4. Testa
5. Committa
6. Notifica

---

## Template commit
```
type(scope): descrizione breve

- Dettaglio modifica 1
- Dettaglio modifica 2
```
