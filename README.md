# 🩺 Cartella Salute

Archivio personale della salute: pressione, peso, visite (anche oculistiche), appuntamenti, esami con i valori nel tempo, problematiche, farmaci e documenti (PDF e foto).

App web installabile (PWA), funziona anche offline. **I dati restano sul telefono**: in questo repository c'è solo il codice, nessun dato personale.

## Come si usa
1. Apri `https://fedethe7-dot.github.io/Salute/` con Chrome sul telefono.
2. Menu ⋮ → **Aggiungi a schermata Home** (o "Installa app").
3. Al primo avvio: nome, anno di nascita, altezza, sesso → sequenza di sblocco → **scrivi il codice di recupero**.

## Backup (importante)
- Altro → **Backup e ripristino** → "Crea backup" → scegli **Drive**.
- L'app ti ricorda di farlo ogni 2 settimane.
- Se cambi telefono o cancelli i dati di Chrome: installa l'app e usa **Ripristina da un file**.
- Il file di backup non è cifrato: tienilo nel tuo Drive personale con la verifica in due passaggi attiva.

## Riferimenti medici
Tutte le soglie sono nel file `refs.js`, con la fonte:
- Pressione: linee guida ESC 2024 (soglie diverse per casa e ambulatorio).
- Peso: BMI con categorie OMS.
- Esami: solo l'intervallo scritto sul referto del laboratorio.

L'app non fa diagnosi e non sostituisce il medico. In caso di urgenza: 112.

## Aggiornare l'app
- Modifica i file e caricali nel repository.
- **Aumenta la versione** in `sw.js` (`cartella-salute-v1` → `v2`), altrimenti il telefono continua a vedere la versione vecchia.

## File
`index.html` · `style.css` · `app.js` (schermate e funzioni) · `db.js` (archivio sul telefono) · `refs.js` (riferimenti medici) · `manifest.json` · `sw.js` · icone.
