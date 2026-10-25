/* =========================================================
   Cartella Salute — Riferimenti medici e tipi di misura
   ---------------------------------------------------------
   Qui stanno TUTTE le soglie usate dall'app, con la fonte.
   Se una linea guida cambia, si aggiorna solo questo file.
   Regola: niente soglie inventate. Se non c'è un riferimento
   affidabile, l'app lo dice e mostra solo l'andamento.
   ========================================================= */

const FONTI = {
  esc2024: {
    nome: 'Linee guida ESC 2024 su pressione elevata e ipertensione',
    url: 'https://academic.oup.com/eurheartj/article/45/38/3912/7741010',
    anno: 2024
  },
  oms_bmi: {
    nome: 'OMS – classificazione del BMI negli adulti',
    url: 'https://www.who.int/europe/news-room/fact-sheets/item/a-healthy-lifestyle---who-recommendations',
    anno: 2010
  },
  referto: {
    nome: 'Intervallo riportato sul referto del laboratorio',
    url: '',
    anno: null
  }
};

/* Livelli comuni: colore + testo semplice */
const LIVELLI = {
  ok:      { cls: 'lv-ok',      icona: '🟢', testo: 'Generalmente nel range desiderato' },
  check:   { cls: 'lv-check',   icona: '🟡', testo: 'Da ricontrollare' },
  warn:    { cls: 'lv-warn',    icona: '🟠', testo: 'Merita attenzione' },
  alta:    { cls: 'lv-alta',    icona: '🔴', testo: 'Molto elevato: serve una valutazione tempestiva' },
  na:      { cls: 'lv-na',      icona: '⚪', testo: 'Nessun riferimento affidabile disponibile' }
};

/* ---------- PRESSIONE (ESC 2024) ----------
   Fasce per metodo di misura (Tabella ESC 2024):
   Ambulatorio: non elevata <120/70 · elevata 120/70–<140/90 · ipertensione ≥140/90
   Casa (HBPM): non elevata <120/70 · elevata 120/70–<135/85 · ipertensione ≥135/85
   Si usa la fascia più alta tra sistolica e diastolica.
   ≥180/110: va esclusa un'emergenza ipertensiva.
   Ambulatorio 160–179/100–109: confermare al più presto (entro 1 mese).
*/
function classificaPressione(sis, dia, contesto) {
  if (!isFinite(sis) || !isFinite(dia)) return { ...LIVELLI.na, spiega: 'Mancano sistolica o diastolica.' };
  const casa = contesto !== 'ambulatorio';
  const sogliaIper = casa ? [135, 85] : [140, 90];
  let livello, spiega;
  if (sis >= 180 || dia >= 110) {
    livello = 'alta';
    spiega = 'Valore ≥ 180/110. Riposa 5 minuti seduto e rimisura. Se resta così alto contatta subito il medico. ' +
             'Se hai dolore al petto, mal di testa forte, disturbi della vista o della parola, debolezza: chiama il 112.';
  } else if (sis >= sogliaIper[0] || dia >= sogliaIper[1]) {
    livello = 'warn';
    const forte = !casa && (sis >= 160 || dia >= 100);
    spiega = (casa
      ? 'A casa la soglia di ipertensione è 135/85.'
      : 'In ambulatorio la soglia di ipertensione è 140/90.') +
      (forte ? ' Con valori 160–179 / 100–109 le linee guida consigliano una conferma rapida (entro un mese).' : '') +
      ' Una misura singola non basta per una diagnosi: confronta la media di più giorni e parlane col medico.';
  } else if (sis >= 120 || dia >= 70) {
    livello = 'check';
    spiega = 'Fascia "pressione elevata" (sopra 120/70 ma sotto la soglia di ipertensione' +
             (casa ? ' a casa, 135/85).' : ' in ambulatorio, 140/90).') +
             ' Non è una diagnosi: tieni d\'occhio la media nel tempo.';
  } else {
    livello = 'ok';
    spiega = 'Sotto 120/70: fascia "non elevata" secondo le linee guida.';
  }
  return { ...LIVELLI[livello], livello, spiega, fonte: FONTI.esc2024 };
}

/* ---------- PESO / BMI (OMS) ---------- */
function classificaBMI(kg, altezzaCm) {
  if (!isFinite(kg) || !isFinite(altezzaCm) || altezzaCm < 100) {
    return { ...LIVELLI.na, bmi: null, spiega: 'Inserisci l\'altezza nel profilo per calcolare il BMI.' };
  }
  const bmi = kg / Math.pow(altezzaCm / 100, 2);
  let cat, livello;
  if (bmi < 18.5) { cat = 'Sottopeso'; livello = 'check'; }
  else if (bmi < 25) { cat = 'Normopeso'; livello = 'ok'; }
  else if (bmi < 30) { cat = 'Sovrappeso'; livello = 'check'; }
  else { cat = 'Obesità'; livello = 'warn'; }
  return {
    ...LIVELLI[livello], livello, bmi, testo: cat,
    spiega: `BMI ${bmi.toFixed(1)} → ${cat} (categorie OMS). Il BMI è un'indicazione generica: non distingue muscoli e grasso e non tiene conto della corporatura.`,
    fonte: FONTI.oms_bmi
  };
}

/* ---------- VALORE DI UN ESAME ----------
   Si confronta SOLO con l'intervallo del referto (o uno inserito da te).
*/
function classificaValoreEsame(v, min, max) {
  if (!isFinite(v)) return { ...LIVELLI.na, spiega: 'Valore non numerico.' };
  const hasMin = isFinite(min), hasMax = isFinite(max);
  if (!hasMin && !hasMax) return { ...LIVELLI.na, spiega: 'Nessun intervallo di riferimento inserito per questo valore.' };
  if ((hasMin && v < min) || (hasMax && v > max)) {
    return { ...LIVELLI.check, livello: 'check', testo: 'Fuori dall\'intervallo del laboratorio',
      spiega: 'Fuori dall\'intervallo indicato dal laboratorio. Un singolo valore fuori range non è una diagnosi: va valutato dal medico insieme al resto.' };
  }
  return { ...LIVELLI.ok, livello: 'ok', testo: 'Nell\'intervallo del laboratorio', spiega: 'Dentro l\'intervallo indicato dal laboratorio.' };
}

/* ---------- TIPI DI MISURA (modulari) ----------
   Per aggiungere un tipo nuovo basta aggiungere un oggetto qui,
   oppure crearlo dall'app (Impostazioni → Tipi di misura).
*/
const TIPI_BASE = [
  {
    id: 'pressione', nome: 'Pressione', icona: '❤️', colore: '#ff5d73',
    campi: [
      { k: 'sis', nome: 'Sistolica (max)', unita: 'mmHg', min: 50, max: 260, obbl: true },
      { k: 'dia', nome: 'Diastolica (min)', unita: 'mmHg', min: 30, max: 160, obbl: true },
      { k: 'fc',  nome: 'Frequenza cardiaca', unita: 'bpm', min: 25, max: 230 }
    ],
    contesto: true,
    principale: 'sis',
    classifica: (v, ctx) => classificaPressione(+v.sis, +v.dia, ctx),
    formato: v => `${v.sis}/${v.dia}` + (v.fc ? ` · ${v.fc} bpm` : '')
  },
  {
    id: 'peso', nome: 'Peso', icona: '⚖️', colore: '#4fd1c5',
    campi: [{ k: 'kg', nome: 'Peso', unita: 'kg', min: 20, max: 300, passo: 0.1, obbl: true }],
    principale: 'kg',
    classifica: (v, ctx, profilo) => classificaBMI(+v.kg, +(profilo && profilo.altezza)),
    formato: v => `${(+v.kg).toFixed(1)} kg`
  },
  {
    id: 'glicemia', nome: 'Glicemia', icona: '🩸', colore: '#f6ad55', nascosto: true,
    campi: [{ k: 'v', nome: 'Glicemia', unita: 'mg/dL', min: 20, max: 600, obbl: true }],
    principale: 'v',
    classifica: () => ({ ...LIVELLI.na, spiega: 'Le soglie dipendono da digiuno/dopo pasto e dalla situazione clinica: confrontala con il tuo medico.' }),
    formato: v => `${v.v} mg/dL`
  },
  {
    id: 'saturazione', nome: 'Saturazione', icona: '🫁', colore: '#63b3ed', nascosto: true,
    campi: [{ k: 'v', nome: 'SpO₂', unita: '%', min: 50, max: 100, obbl: true }, { k: 'fc', nome: 'Frequenza cardiaca', unita: 'bpm', min: 25, max: 230 }],
    principale: 'v',
    classifica: () => ({ ...LIVELLI.na, spiega: 'Il valore va interpretato dal medico in base alla tua situazione.' }),
    formato: v => `${v.v}%` + (v.fc ? ` · ${v.fc} bpm` : '')
  }
];

/* Tipo creato dall'utente: un valore con unità e, se vuoi, un intervallo tuo */
function tipoPersonalizzato(t) {
  return {
    id: t.id, nome: t.nome, icona: t.icona || '📏', colore: t.colore || '#b794f4', personalizzato: true,
    campi: [{ k: 'v', nome: t.nome, unita: t.unita || '', obbl: true, passo: 'any' }],
    principale: 'v',
    rifMin: t.rifMin, rifMax: t.rifMax,
    classifica: v => {
      const r = classificaValoreEsame(+v.v, +t.rifMin, +t.rifMax);
      if (r.livello) r.spiega = r.spiega.replace('indicato dal laboratorio', 'che hai inserito tu');
      return r;
    },
    formato: v => `${v.v} ${t.unita || ''}`.trim()
  };
}

/* Spiegazione dei decimi (vista) */
const SPIEGA_DECIMI = 'I decimi misurano l\'acuità visiva: quanto riesci a distinguere dettagli piccoli con quell\'occhio (10/10 è il riferimento di una vista piena). ' +
  'Non sono un "voto" alla salute dell\'occhio: si confrontano solo con le tue visite precedenti, occhio per occhio e con/senza correzione.';

window.REFS = { FONTI, LIVELLI, TIPI_BASE, classificaPressione, classificaBMI, classificaValoreEsame, tipoPersonalizzato, SPIEGA_DECIMI };
