/* =========================================================
   Cartella Salute — App
   ========================================================= */
'use strict';
const VERSIONE = '1.2.0';
/* FONTI e LIVELLI arrivano da refs.js */

/* ---------- Utilità ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const isoLoc = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const oggi = () => isoLoc().slice(0, 10);
function parseD(s) {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  return new Date(s);
}
const fmtD = s => s ? parseD(s).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const fmtDb = s => s ? parseD(s).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
const fmtDO = s => s ? parseD(s).toLocaleString('it-IT', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const fmtOra = s => s ? parseD(s).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '';
const num = s => {
  if (s === null || s === undefined || s === '') return NaN;
  const t = String(s).replace(',', '.').replace(/[<>≤≥\s]/g, '');
  return t === '' ? NaN : Number(t);
};
const fmtN = (n, dec = 1) => isFinite(n) ? (Math.round(n * 10 ** dec) / 10 ** dec).toLocaleString('it-IT') : '–';
const giorniFa = s => Math.floor((Date.now() - parseD(s).getTime()) / 86400000);
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const byData = k => (a, b) => (b[k] || '').localeCompare(a[k] || '');

function toast(msg, ms = 2200) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), ms);
}

/* ---------- Stato ---------- */
const S = {
  view: 'home', pid: 'io', profilo: null,
  tipoMisura: 'pressione', periodo: '90', dal: '', al: '',
  visiteTab: 'fatte', tipi: [], d: {}
};
const SPECIALITA = [
  ['Medico di base', '👨‍⚕️'], ['Cardiologo', '❤️'], ['Dermatologo', '🧴'], ['Oculista', '👁️'], ['Dentista', '🦷'],
  ['Ortopedico', '🦴'], ['Fisioterapista', '💪'], ['Otorino', '👂'], ['Gastroenterologo', '🫃'], ['Neurologo', '🧠'],
  ['Urologo', '🩺'], ['Endocrinologo', '🧬'], ['Allergologo', '🤧'], ['Psicologo', '💬'], ['Nutrizionista', '🥗'],
  ['Pronto soccorso', '🚑'], ['Laboratorio analisi', '🧪'], ['Altro', '📋']
];
const icoSpec = s => (SPECIALITA.find(x => norm(x[0]) === norm(s)) || [null, '🩺'])[1];
const isOculista = s => /ocul|oftalm|vista|ottic/i.test(s || '');
const STATI_PROB = { attiva: ['Attiva', '🔴'], osservazione: ['In osservazione', '👀'], rivalutare: ['Da rivalutare', '🔁'], risolta: ['Risolta', '✅'] };

async function caricaDati() {
  for (const s of ['misure', 'visite', 'appuntamenti', 'esami', 'problemi', 'farmaci']) {
    S.d[s] = (await DB.tutti(s)).filter(r => (r.p || 'io') === S.pid);
  }
  // Documenti: senza tenere i file in memoria più del necessario
  S.d.documenti = (await DB.tutti('documenti')).filter(r => (r.p || 'io') === S.pid);
  const custom = await DB.tutti('tipi');
  const visibili = await DB.get('tipiVisibili', ['pressione', 'peso']);
  S.tipiTutti = [...REFS.TIPI_BASE, ...custom.map(REFS.tipoPersonalizzato)];
  S.tipi = S.tipiTutti.filter(t => visibili.includes(t.id) || t.personalizzato);
  S.tipiCustom = custom;
  S.visibili = visibili;
}
const tipo = id => (S.tipiTutti || REFS.TIPI_BASE).find(t => t.id === id);
const docsDi = (t, id) => S.d.documenti.filter(d => d.link && d.link.t === t && d.link.id === id);

/* =========================================================
   GRAFICI (SVG fatti a mano, funzionano offline)
   ========================================================= */
function passoBello(r) {
  const p = Math.pow(10, Math.floor(Math.log10(r))); const f = r / p;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}
function grafico({ serie, linee = [], bande = [], h = 180, w = 340, mini = false }) {
  const pts = serie.flatMap(s => s.punti);
  if (!pts.length) return '';
  let xmin = Math.min(...pts.map(p => p.x)), xmax = Math.max(...pts.map(p => p.x));
  if (xmax === xmin) { xmin -= 86400000; xmax += 86400000; }
  const yv = pts.map(p => p.y).concat(mini ? [] : linee.map(l => l.y)).concat(mini ? [] : bande.flatMap(b => [b.y1, b.y2].filter(isFinite)));
  let ymin = Math.min(...yv), ymax = Math.max(...yv);
  if (ymax === ymin) { ymin -= 1; ymax += 1; }
  const padY = (ymax - ymin) * 0.12; ymin -= padY; ymax += padY;
  const L = mini ? 3 : 34, R = mini ? 3 : 10, T = mini ? 4 : 10, B = mini ? 4 : 22;
  const X = x => L + (x - xmin) / (xmax - xmin) * (w - L - R);
  const Y = y => T + (1 - (y - ymin) / (ymax - ymin)) * (h - T - B);
  let g = '';
  if (!mini) {
    const st = passoBello((ymax - ymin) / 4);
    for (let v = Math.ceil(ymin / st) * st; v <= ymax; v += st) {
      g += `<line x1="${L}" x2="${w - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)" stroke-width="1"/>` +
           `<text x="${L - 5}" y="${Y(v) + 3}" text-anchor="end">${fmtN(v, st < 1 ? 1 : 0)}</text>`;
    }
    const ticks = [xmin, (xmin + xmax) / 2, xmax];
    const lungo = xmax - xmin > 300 * 86400000;
    ticks.forEach((t, i) => {
      const d = new Date(t);
      const lab = lungo ? d.toLocaleDateString('it-IT', { month: 'short', year: '2-digit' }) : d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
      g += `<text x="${X(t)}" y="${h - 6}" text-anchor="${i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}">${lab}</text>`;
    });
  }
  for (const b of bande) {
    const y1 = isFinite(b.y2) ? Y(Math.min(b.y2, ymax)) : T, y2 = isFinite(b.y1) ? Y(Math.max(b.y1, ymin)) : h - B;
    g += `<rect x="${L}" width="${w - L - R}" y="${y1}" height="${Math.max(0, y2 - y1)}" fill="${b.colore}" opacity=".13" rx="4"/>`;
  }
  if (!mini) for (const l of linee) {
    if (l.y < ymin || l.y > ymax) continue;
    g += `<line x1="${L}" x2="${w - R}" y1="${Y(l.y)}" y2="${Y(l.y)}" stroke="${l.colore}" stroke-dasharray="4 4" stroke-width="1.2" opacity=".8"/>` +
         `<text x="${L + 3}" y="${Y(l.y) - 3}" text-anchor="start" style="fill:${l.colore}">${esc(l.etichetta || '')}</text>`;
  }
  for (const s of serie) {
    const ps = [...s.punti].sort((a, b) => a.x - b.x);
    if (!ps.length) continue;
    const d = ps.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
    g += `<path d="${d}" fill="none" stroke="${s.colore}" stroke-width="${mini ? 2.4 : 2.2}" stroke-linejoin="round" stroke-linecap="round"/>`;
    if (!mini || ps.length < 2) {
      g += ps.map(p => `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="${mini ? 2.5 : 3.4}" fill="${p.colore || s.colore}" stroke="var(--card)" stroke-width="1.5"/>`).join('');
    }
  }
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img">${g}</svg>`;
}

/* =========================================================
   SBLOCCO CON SEQUENZA
   ========================================================= */
async function sha(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
function codiceRecupero() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const r = crypto.getRandomValues(new Uint8Array(8));
  const c = [...r].map(x => A[x % A.length]).join('');
  return c.slice(0, 4) + '-' + c.slice(4);
}
const normCodice = c => String(c).toUpperCase().replace(/[^A-Z0-9]/g, '');

function creaPattern(box, onDone) {
  const size = 270, gap = size / 3, pts = [];
  for (let i = 0; i < 9; i++) pts.push({ x: gap / 2 + (i % 3) * gap, y: gap / 2 + Math.floor(i / 3) * gap });
  box.innerHTML = `<svg viewBox="0 0 ${size} ${size}"><polyline points=""/>${pts.map((p, i) =>
    `<circle class="pr" data-i="${i}" cx="${p.x}" cy="${p.y}" r="28"/><circle class="pd" data-i="${i}" cx="${p.x}" cy="${p.y}" r="9"/>`).join('')}</svg>`;
  const svg = $('svg', box), poly = $('polyline', box);
  let seq = [], drawing = false, cur = null;
  const loc = e => { const r = svg.getBoundingClientRect(); return { x: (e.clientX - r.left) * size / r.width, y: (e.clientY - r.top) * size / r.height }; };
  const hit = p => pts.findIndex(q => Math.hypot(q.x - p.x, q.y - p.y) < 32);
  function add(i) {
    if (seq.includes(i)) return;
    if (seq.length) {
      const a = seq[seq.length - 1], ax = a % 3, ay = Math.floor(a / 3), bx = i % 3, by = Math.floor(i / 3);
      if ((ax + bx) % 2 === 0 && (ay + by) % 2 === 0) {
        const m = ((ay + by) / 2) * 3 + (ax + bx) / 2;
        if (m !== a && m !== i && !seq.includes(m)) seq.push(m);
      }
    }
    seq.push(i);
    try { navigator.vibrate && navigator.vibrate(8); } catch (e) {}
  }
  function redraw() {
    $$('circle', box).forEach(c => c.classList.toggle('on', seq.includes(+c.dataset.i)));
    const p = seq.map(i => `${pts[i].x},${pts[i].y}`);
    if (cur && drawing && seq.length) p.push(`${cur.x},${cur.y}`);
    poly.setAttribute('points', p.join(' '));
  }
  svg.addEventListener('pointerdown', e => {
    e.preventDefault(); drawing = true; seq = []; box.classList.remove('err');
    try { svg.setPointerCapture(e.pointerId); } catch (er) {}
    const p = loc(e), i = hit(p); if (i >= 0) add(i); cur = p; redraw();
  });
  svg.addEventListener('pointermove', e => {
    if (!drawing) return; const p = loc(e), i = hit(p); if (i >= 0) add(i); cur = p; redraw();
  });
  const fine = () => { if (!drawing) return; drawing = false; cur = null; redraw(); if (seq.length) onDone(seq.join('')); };
  svg.addEventListener('pointerup', fine); svg.addEventListener('pointercancel', fine);
  const reset = () => { seq = []; box.classList.remove('err'); redraw(); };
  return { reset, errore() { box.classList.add('err'); setTimeout(reset, 650); } };
}

const lockEl = () => $('#lock');
function lockHTML(titolo, msg, extra = '') {
  return `<div class="lock-box"><div class="lock-logo">🩺</div><h1 class="lock-title">${titolo}</h1>
    <p id="lock-msg" class="lock-msg">${msg}</p><div id="pattern" class="pattern"></div>${extra}</div>`;
}

async function mostraLock() {
  const lk = await DB.get('lock');
  if (!lk) return;
  S.bloccato = true;
  const L = lockEl(); L.classList.remove('hidden');
  L.innerHTML = lockHTML('Cartella Salute', 'Disegna la sequenza per sbloccare', `<button id="lock-recover" class="btn-link">Ho dimenticato la sequenza</button>`);
  let errori = 0, attesa = 0;
  const pat = creaPattern($('#pattern', L), async seq => {
    if (Date.now() < attesa) { pat.reset(); return; }
    if (await sha(lk.salt + ':' + seq) === lk.hash) {
      S.bloccato = false; L.classList.add('hidden'); $('#app').classList.remove('hidden');
      if (!S.avviata) { S.avviata = true; await entra(); }
    } else {
      errori++; pat.errore();
      const m = $('#lock-msg', L); m.classList.add('err');
      if (errori >= 5) {
        attesa = Date.now() + 30000; errori = 0;
        m.textContent = 'Troppi tentativi: riprova tra 30 secondi';
        setTimeout(() => { m.textContent = 'Disegna la sequenza per sbloccare'; m.classList.remove('err'); }, 30000);
      } else m.textContent = 'Sequenza sbagliata, riprova';
    }
  });
  $('#lock-recover', L).onclick = () => recupero(lk);
}

function recupero(lk) {
  const L = lockEl();
  L.innerHTML = `<div class="lock-box"><div class="lock-logo">🔑</div><h1 class="lock-title">Codice di recupero</h1>
    <p class="lock-msg">Inserisci il codice che ti ho dato alla prima configurazione</p>
    <div class="f"><input id="rc" placeholder="XXXX-XXXX" autocomplete="off" style="text-align:center;font-size:22px;letter-spacing:.1em;text-transform:uppercase"></div>
    <button id="rc-ok" class="btn">Verifica</button><button id="rc-back" class="btn-link mt">Torna alla sequenza</button></div>`;
  $('#rc-back', L).onclick = mostraLock;
  $('#rc-ok', L).onclick = async () => {
    const h = await sha(lk.recSalt + ':' + normCodice($('#rc', L).value));
    if (h === lk.recHash) impostaSequenza(true);
    else toast('Codice non valido');
  };
}

function impostaSequenza(daRecupero = false, onFine) {
  const L = lockEl(); L.classList.remove('hidden');
  let prima = null;
  L.innerHTML = lockHTML('Nuova sequenza', 'Disegna una sequenza (almeno 4 punti)',
    daRecupero || !onFine ? '' : `<button id="seq-annulla" class="btn-link">Annulla</button>`);
  if ($('#seq-annulla', L)) $('#seq-annulla', L).onclick = () => { L.classList.add('hidden'); };
  const msg = () => $('#lock-msg', L);
  const pat = creaPattern($('#pattern', L), async seq => {
    if (seq.length < 4) { pat.errore(); msg().textContent = 'Troppo corta: collega almeno 4 punti'; msg().classList.add('err'); return; }
    if (!prima) { prima = seq; pat.reset(); msg().classList.remove('err'); msg().textContent = 'Ridisegnala per conferma'; return; }
    if (seq !== prima) { prima = null; pat.errore(); msg().classList.add('err'); msg().textContent = 'Non coincide. Ricomincia da capo'; return; }
    const vecchio = await DB.get('lock');
    const salt = codiceRecupero();
    const lk = { ...(vecchio || {}), salt, hash: await sha(salt + ':' + seq) };
    let codice = null;
    if (!vecchio || daRecupero) {
      codice = codiceRecupero();
      lk.recSalt = codiceRecupero();
      lk.recHash = await sha(lk.recSalt + ':' + normCodice(codice));
    }
    await DB.set('lock', lk);
    if (codice) mostraCodice(codice, onFine);
    else { L.classList.add('hidden'); toast('Sequenza aggiornata ✅'); onFine && onFine(); }
  });
}

function mostraCodice(codice, onFine) {
  const L = lockEl();
  L.innerHTML = `<div class="lock-box"><div class="lock-logo">🔑</div><h1 class="lock-title">Il tuo codice di recupero</h1>
    <p class="lock-msg">Scrivilo su un foglio e tienilo in un posto sicuro. Serve solo se dimentichi la sequenza.</p>
    <div class="code-box">${codice}</div>
    <label class="row small" style="justify-content:center;margin:14px 0"><input type="checkbox" id="cc"> L'ho scritto da qualche parte</label>
    <button id="cc-ok" class="btn" disabled>Continua</button></div>`;
  $('#cc', L).onchange = e => { $('#cc-ok', L).disabled = !e.target.checked; };
  $('#cc-ok', L).onclick = async () => {
    L.classList.add('hidden'); S.bloccato = false; $('#app').classList.remove('hidden');
    if (onFine) onFine(); else if (!S.avviata) { S.avviata = true; await entra(); }
  };
}

/* ---------- Primo avvio ---------- */
function primoAvvio() {
  const L = lockEl(); L.classList.remove('hidden');
  L.innerHTML = `<div class="lock-box" style="text-align:left">
    <div class="lock-logo">🩺</div>
    <h1 class="lock-title" style="text-align:center">Benvenuto in Cartella Salute</h1>
    <p class="lock-msg" style="text-align:center">Prima di iniziare, due dati per usare i riferimenti giusti.</p>
    <div class="f"><label>Nome</label><input id="ob-nome" placeholder="Es. Federico" autocomplete="given-name"></div>
    <div class="f-row">
      <div class="f"><label>Anno di nascita</label><input id="ob-anno" type="number" inputmode="numeric" min="1900" max="${new Date().getFullYear()}" placeholder="1995"></div>
      <div class="f"><label>Altezza (cm)</label><input id="ob-alt" type="number" inputmode="numeric" min="100" max="230" placeholder="178"></div>
    </div>
    <div class="f"><span class="lab">Sesso</span><div class="seg" id="ob-sesso"><button data-v="M">Maschio</button><button data-v="F">Femmina</button><button data-v="">Non dire</button></div></div>
    <p class="hint">Restano solo sul tuo telefono. Puoi cambiarli quando vuoi.</p>
    <button id="ob-ok" class="btn mt">Avanti: crea la sequenza di sblocco</button></div>`;
  let sesso = '';
  segmento($('#ob-sesso', L), v => sesso = v, '');
  $('#ob-ok', L).onclick = async () => {
    const nome = $('#ob-nome', L).value.trim();
    if (!nome) return toast('Scrivi almeno il nome');
    const prof = { id: 'io', nome, anno: +$('#ob-anno', L).value || null, altezza: +$('#ob-alt', L).value || null, sesso, admin: true };
    await DB.set('profilo:io', prof);
    impostaSequenza(false, null);
  };
}

function segmento(el, onCh, iniz) {
  const bs = $$('button', el);
  const set = v => bs.forEach(b => b.classList.toggle('on', b.dataset.v === v));
  bs.forEach(b => b.onclick = e => { e.preventDefault(); set(b.dataset.v); onCh(b.dataset.v); });
  if (iniz !== undefined) set(iniz);
}

/* =========================================================
   FOGLIO A SCOMPARSA (moduli)
   ========================================================= */
function apriSheet(html, onMount) {
  const sh = $('#sheet'), bg = $('#sheet-bg');
  sh.innerHTML = `<div class="sheet-grip"></div>${html}`;
  sh.classList.remove('hidden'); bg.classList.remove('hidden');
  sh.scrollTop = 0;
  bg.onclick = chiudiSheet;
  sentinella();
  S.sheetAperto = true;
  onMount && onMount(sh);
}
/* Il tasto "indietro" di Android chiude il foglio aperto invece di uscire dall'app */
function sentinella() { if (!(history.state && history.state.cs)) history.pushState({ cs: 1 }, ''); }
function chiudiSheet() {
  if (!S.sheetAperto) return;
  S.sheetAperto = false;
  $('#sheet').classList.add('hidden'); $('#sheet-bg').classList.add('hidden');
  $('#sheet').innerHTML = '';
}
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if ($('.viewer')) $('.viewer').remove(); else if (S.sheetAperto) chiudiSheet();
});
window.addEventListener('popstate', () => {
  if ($('.viewer')) { $('.viewer').remove(); if (S.sheetAperto) sentinella(); return; }
  if (S.sheetAperto) chiudiSheet();
});
function conferma(testo, si = 'Elimina') {
  return new Promise(ok => {
    const box = document.createElement('div');
    box.className = 'sheet-bg'; box.style.zIndex = 60; box.style.display = 'grid'; box.style.placeItems = 'center';
    box.innerHTML = `<div class="card" style="max-width:340px;margin:16px"><p style="margin:0 0 14px">${esc(testo)}</p>
      <div class="btns"><button class="btn sec" data-r="0">Annulla</button><button class="btn danger" data-r="1">${esc(si)}</button></div></div>`;
    document.body.appendChild(box);
    box.onclick = e => { const r = e.target.dataset.r; if (r !== undefined || e.target === box) { box.remove(); ok(r === '1'); } };
  });
}
const val = (sh, id) => { const e = $('#' + id, sh); return e ? e.value.trim() : ''; };

/* ---------- Allegati nei moduli ---------- */
function gestoreAllegati(sh, esistenti = []) {
  const box = $('.files', sh);
  const nuovi = [], rimossi = new Set();
  const inp = document.createElement('input');
  inp.type = 'file'; inp.multiple = true; inp.accept = 'application/pdf,image/*'; inp.hidden = true;
  sh.appendChild(inp);
  function disegna() {
    const tutti = [...esistenti.filter(d => !rimossi.has(d.id)).map(d => ({ d, nuovo: false })), ...nuovi.map(d => ({ d, nuovo: true }))];
    box.innerHTML = tutti.map(({ d }, i) => fileTile(d, i)).join('') + `<div class="file file-add" data-add>＋<br>Allega<br>PDF o foto</div>`;
    $$('.file', box).forEach(el => {
      if (el.dataset.add !== undefined) { el.onclick = () => inp.click(); return; }
      const t = tutti[+el.dataset.i];
      $('.x', el).onclick = ev => { ev.stopPropagation(); if (t.nuovo) nuovi.splice(nuovi.indexOf(t.d), 1); else rimossi.add(t.d.id); disegna(); };
      el.onclick = () => apriDocumento(t.d);
    });
  }
  inp.onchange = async () => {
    for (const f of inp.files) nuovi.push(await preparaFile(f));
    inp.value = ''; disegna();
  };
  disegna();
  return {
    aggiungi(d) { nuovi.push(d); disegna(); },
    get quanti() { return nuovi.length + esistenti.filter(d => !rimossi.has(d.id)).length; },
    async salva(link, dataDoc, extra = {}) {
      for (const id of rimossi) await DB.elimina('documenti', id);
      for (const d of nuovi) {
        const { _file, ...rec } = d;
        Object.assign(rec, extra, { link, p: S.pid, data: dataDoc || d.data || oggi() });
        await DB.salva('documenti', rec);
      }
    }
  };
}
const urlCache = new Map();
function blobUrl(d) {
  if (!d.blob) return '';
  if (!urlCache.has(d.id || d)) urlCache.set(d.id || d, URL.createObjectURL(d.blob));
  return urlCache.get(d.id || d);
}
function fileTile(d, i) {
  const img = /^image\//.test(d.mime);
  return `<div class="file" data-i="${i}"><button class="x" type="button" aria-label="Rimuovi">✕</button>
    ${img ? `<img src="${blobUrl(d)}" alt="">` : `<div class="fi">📄</div><div class="fn">${esc(d.nome)}</div>`}</div>`;
}
async function preparaFile(f) {
  let blob = f, mime = f.type || 'application/octet-stream', nome = f.name || 'documento';
  // Le foto molto grandi vengono ridotte (restano ben leggibili) per non riempire il telefono
  if (/^image\/(jpeg|png|webp|heic)/.test(mime) && f.size > 1.5e6) {
    try {
      const bmp = await createImageBitmap(f);
      const k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const b2 = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.86));
      if (b2 && b2.size < f.size) { blob = b2; mime = 'image/jpeg'; nome = nome.replace(/\.\w+$/, '') + '.jpg'; }
    } catch (e) {}
  }
  return { nome, mime, size: blob.size, blob, data: oggi(), _file: f };
}

/* ---------- Visualizzatore documenti ---------- */
let _pdfjs = null;
function caricaScript(src) {
  return new Promise((ok, ko) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => ko(new Error('Rete')); document.head.appendChild(s); });
}
async function pdfjs() {
  if (_pdfjs) return _pdfjs;
  await caricaScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  _pdfjs = window.pdfjsLib; return _pdfjs;
}
async function apriDocumento(d) {
  if (!d.blob) { const full = await DB.uno('documenti', d.id); if (full) d = full; }
  const v = document.createElement('div'); v.className = 'viewer';
  v.innerHTML = `<div class="viewer-top"><button class="btn sm" data-c>✕</button><div class="vt">${esc(d.titolo || d.nome)}</div>
    <button class="btn sm" data-s>📤</button><a class="btn sm" data-dl download="${esc(d.nome)}" href="${blobUrl(d)}">⬇️</a></div>
    <div class="viewer-body"><div class="muted">Apro il documento…</div></div>`;
  document.body.appendChild(v); sentinella();
  $('[data-c]', v).onclick = () => v.remove();
  $('[data-s]', v).onclick = () => condividiFile(new File([d.blob], d.nome, { type: d.mime }), d.titolo || d.nome);
  const body = $('.viewer-body', v);
  if (/^image\//.test(d.mime)) { body.innerHTML = `<img src="${blobUrl(d)}" alt="">`; return; }
  if (d.mime === 'application/pdf') {
    try {
      const lib = await pdfjs();
      const pdf = await lib.getDocument({ data: new Uint8Array(await d.blob.arrayBuffer()) }).promise;
      body.innerHTML = '';
      for (let n = 1; n <= pdf.numPages; n++) {
        const pg = await pdf.getPage(n);
        const vp = pg.getViewport({ scale: Math.min(2.2, (window.innerWidth * 1.8) / pg.getViewport({ scale: 1 }).width) });
        const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
        body.appendChild(c);
        await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      }
      return;
    } catch (e) {
      body.innerHTML = `<div class="card" style="max-width:420px"><p>Non riesco a mostrare il PDF qui (serve internet la prima volta).</p>
        <a class="btn" download="${esc(d.nome)}" href="${blobUrl(d)}">Apri / scarica il PDF</a></div>`;
      return;
    }
  }
  body.innerHTML = `<div class="card"><p>Anteprima non disponibile per questo tipo di file.</p><a class="btn" download="${esc(d.nome)}" href="${blobUrl(d)}">Scarica</a></div>`;
}
async function condividiFile(file, titolo) {
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: titolo }); return true; }
  } catch (e) { if (e.name === 'AbortError') return false; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return true;
}

/* =========================================================
   SCHERMATE
   ========================================================= */
const TITOLI = { home: 'Cartella Salute', misure: 'Misurazioni', visite: 'Visite', esami: 'Esami e referti', altro: 'Altro', problemi: 'Problematiche', farmaci: 'Farmaci', documenti: 'Documenti', cerca: 'Cerca', impostazioni: 'Impostazioni' };

async function render() {
  const v = $('#view');
  $('#top-title').textContent = TITOLI[S.view] || 'Cartella Salute';
  $('#top-sub').textContent = S.view === 'home'
    ? `Ciao ${S.profilo ? S.profilo.nome : ''} 👋 · ${new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}`
    : (S.profilo ? S.profilo.nome : '');
  $('#profile-chip').textContent = (S.profilo && S.profilo.nome || '?')[0].toUpperCase();
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.nav === S.view || (S.view !== 'home' && ['problemi', 'farmaci', 'documenti', 'impostazioni'].includes(S.view) && t.dataset.nav === 'altro')));
  const fn = VISTE[S.view] || VISTE.home;
  v.innerHTML = await fn();
  v.style.animation = 'none'; void v.offsetWidth; v.style.animation = '';
  if (VISTE_DOPO[S.view]) VISTE_DOPO[S.view](v);
}
async function vai(view) { S.view = view; window.scrollTo(0, 0); await render(); }

/* ---------- Pressione: medie ---------- */
function misureDi(tipoId) { return S.d.misure.filter(m => m.tipo === tipoId).sort(byData('data')); }
function mediaPressione(lista) {
  if (!lista.length) return null;
  const m = k => lista.reduce((s, x) => s + (+x.v[k] || 0), 0) / lista.filter(x => isFinite(+x.v[k]) && x.v[k] !== '').length;
  return { sis: Math.round(m('sis')), dia: Math.round(m('dia')), fc: Math.round(m('fc')), n: lista.length };
}

function prossimiControlli() {
  const out = [], t = oggi();
  for (const a of S.d.appuntamenti) if (!a.fatto) out.push({ data: a.data, ora: a.ora, ico: icoSpec(a.specialita), t: a.specialita || 'Appuntamento', s: [a.medico, a.luogo].filter(Boolean).join(' · '), apri: ['appuntamento', a.id], scaduto: a.data < t });
  for (const v of S.d.visite) if (v.prossimo && v.prossimo >= t && !S.d.appuntamenti.some(a => !a.fatto && a.specialita === v.specialita && a.data >= t))
    out.push({ data: v.prossimo, ico: '🔁', t: `Controllo ${v.specialita || ''}`.trim(), s: 'Indicato nella visita del ' + fmtD(v.data), apri: ['visita', v.id] });
  for (const p of S.d.problemi) if (p.prossimo && p.prossimo >= t && p.stato !== 'risolta')
    out.push({ data: p.prossimo, ico: '📋', t: `Controllo: ${p.titolo}`, s: 'Problematica', apri: ['problema', p.id] });
  return out.sort((a, b) => (a.data + (a.ora || '')).localeCompare(b.data + (b.ora || '')));
}

const VISTE = {};
const VISTE_DOPO = {};

VISTE.home = async () => {
  const pr = misureDi('pressione'), pe = misureDi('peso');
  const ult = pr[0];
  const mese = pr.filter(m => giorniFa(m.data) <= 30 && m.contesto !== 'ambulatorio');
  const med = mediaPressione(mese);
  let h = '';

  // Avvisi utili
  const lastBk = await DB.get('ultimoBackup');
  const nDati = S.d.misure.length + S.d.visite.length + S.d.esami.length;
  if (nDati && (!lastBk || giorniFa(lastBk) >= 14)) {
    h += `<div class="alert lv-warn card-tap" data-act="backup">💾 <b>${lastBk ? `Ultimo backup ${giorniFa(lastBk)} giorni fa` : 'Non hai ancora fatto un backup'}</b> — tocca per salvarlo su Drive.</div>`;
  }
  if (ult && ult.contesto !== 'ambulatorio') {
    const c = REFS.classificaPressione(+ult.v.sis, +ult.v.dia, ult.contesto);
    if (c.livello === 'alta' && giorniFa(ult.data) < 1) h += `<div class="alert lv-alta">🔴 <b>Ultima misura molto alta (${ult.v.sis}/${ult.v.dia}).</b> ${esc(c.spiega)}</div>`;
  }

  // Pressione
  h += `<div class="card hero card-tap" data-act="vaiMisura" data-tipo="pressione">
    <div class="card-h"><div class="card-t">❤️ Pressione</div>${ult ? `<span class="card-sub">${fmtDO(ult.data)}</span>` : ''}</div>`;
  if (ult) {
    const c = REFS.classificaPressione(+ult.v.sis, +ult.v.dia, ult.contesto);
    h += `<div class="row between"><div class="big">${ult.v.sis}/${ult.v.dia} <small>mmHg${ult.v.fc ? ` · ${ult.v.fc} bpm` : ''}</small></div></div>
      <div class="mt"><span class="badge ${c.cls}"><span class="dot"></span>${c.testo}</span>
      <span class="badge">${ult.contesto === 'ambulatorio' ? '🏥 Ambulatorio' : '🏠 Casa'}</span></div>`;
    if (pr.length > 1) h += `<div class="mt">${grafico({ serie: [
      { colore: '#ff5d73', punti: pr.slice(0, 30).map(m => ({ x: parseD(m.data).getTime(), y: +m.v.sis })) },
      { colore: '#60a5fa', punti: pr.slice(0, 30).map(m => ({ x: parseD(m.data).getTime(), y: +m.v.dia })) }], mini: true, h: 60 })}</div>`;
    h += med && med.n > 1 ? `<div class="card-sub mt">Media a casa ultimi 30 giorni: <b>${med.sis}/${med.dia}</b> (${med.n} misure)</div>` : '';
    if (giorniFa(ult.data) > 31) h += `<div class="card-sub mt">⏰ Sono passati ${giorniFa(ult.data)} giorni dall'ultima misura: è il momento di misurarla.</div>`;
  } else {
    h += `<div class="empty"><div class="e-ico">❤️</div>Nessuna misura ancora.<br><button class="btn sm mt" data-act="nuovaMisura" data-tipo="pressione">Inserisci la prima</button></div>`;
  }
  h += `</div>`;

  // Peso
  const up = pe[0];
  h += `<div class="card card-tap" data-act="vaiMisura" data-tipo="peso"><div class="card-h"><div class="card-t">⚖️ Peso</div>${up ? `<span class="card-sub">${fmtD(up.data)}</span>` : ''}</div>`;
  if (up) {
    const c = REFS.classificaBMI(+up.v.kg, +(S.profilo && S.profilo.altezza));
    const prec = pe[1];
    const diff = prec ? (+up.v.kg - +prec.v.kg) : null;
    h += `<div class="row between"><div class="big">${fmtN(+up.v.kg)} <small>kg</small></div>
      ${diff !== null ? `<span class="badge">${diff > 0 ? '▲' : diff < 0 ? '▼' : '='} ${fmtN(Math.abs(diff))} kg</span>` : ''}</div>
      <div class="mt">${c.bmi ? `<span class="badge ${c.cls}"><span class="dot"></span>BMI ${fmtN(c.bmi)} · ${c.testo}</span>` : `<span class="card-sub">Aggiungi l'altezza nel profilo per il BMI</span>`}</div>`;
    if (pe.length > 1) h += `<div class="mt">${grafico({ serie: [{ colore: '#4fd1c5', punti: pe.slice(0, 40).map(m => ({ x: parseD(m.data).getTime(), y: +m.v.kg })) }], mini: true, h: 54 })}</div>`;
  } else {
    h += `<div class="empty"><div class="e-ico">⚖️</div>Nessun peso registrato.<br><button class="btn sm mt" data-act="nuovaMisura" data-tipo="peso">Inserisci il peso</button></div>`;
  }
  h += `</div>`;

  // Azioni rapide
  h += `<div class="grid2">
    <button class="card card-tap" style="text-align:left" data-act="nuovaMisura" data-tipo="pressione"><div class="card-t">➕ Pressione</div><div class="card-sub">Nuova misura</div></button>
    <button class="card card-tap" style="text-align:left" data-act="nuovaVisita"><div class="card-t">🩺 Visita</div><div class="card-sub">Registra una visita</div></button>
    <button class="card card-tap" style="text-align:left" data-act="nuovoEsame"><div class="card-t">🧪 Referto</div><div class="card-sub">Esami e analisi</div></button>
    <button class="card card-tap" style="text-align:left" data-act="nuovoApp"><div class="card-t">📅 Appuntamento</div><div class="card-sub">Prossima visita</div></button>
  </div>`;

  // Prossimi
  const pc = prossimiControlli().slice(0, 4);
  h += `<div class="sec-t">Prossimi controlli <button class="btn-link" data-act="nuovoApp">＋ Aggiungi</button></div><div class="card"><div class="list">`;
  h += pc.length ? pc.map(x => `<div class="item" data-act="apri" data-k="${x.apri[0]}" data-id="${x.apri[1]}">
      <div class="item-ico">${x.ico}</div><div class="item-body"><div class="item-t">${esc(x.t)}</div><div class="item-s">${esc(x.s)}</div></div>
      <div class="item-r">${x.scaduto ? '<span class="lv-warn">Da segnare</span><br>' : ''}${fmtD(x.data)}${x.ora ? '<br>' + x.ora : ''}</div></div>`).join('')
    : `<div class="empty small">Nessun controllo in programma.</div>`;
  h += `</div></div>`;

  // Problematiche attive
  const pa = S.d.problemi.filter(p => p.stato !== 'risolta');
  if (pa.length) {
    h += `<div class="sec-t">In osservazione <button class="btn-link" data-nav-go="problemi">Tutte</button></div><div class="card"><div class="list">` +
      pa.slice(0, 4).map(p => `<div class="item" data-act="apri" data-k="problema" data-id="${p.id}"><div class="item-ico">${STATI_PROB[p.stato || 'attiva'][1]}</div>
      <div class="item-body"><div class="item-t">${esc(p.titolo)}</div><div class="item-s">${STATI_PROB[p.stato || 'attiva'][0]}${p.prossimo ? ' · controllo ' + fmtD(p.prossimo) : ''}</div></div></div>`).join('') + `</div></div>`;
  }

  // Ultime visite e documenti
  const uv = [...S.d.visite].sort(byData('data')).slice(0, 3);
  if (uv.length) h += `<div class="sec-t">Ultime visite <button class="btn-link" data-nav-go="visite">Tutte</button></div><div class="card"><div class="list">${uv.map(rigaVisita).join('')}</div></div>`;
  const ud = [...S.d.documenti].sort(byData('creato')).slice(0, 4);
  if (ud.length) h += `<div class="sec-t">Ultimi documenti <button class="btn-link" data-nav-go="documenti">Tutti</button></div><div class="card"><div class="files">${ud.map((d, i) => `<div class="file" data-doc="${d.id}">${/^image\//.test(d.mime) ? `<img src="${blobUrl(d)}" alt="">` : `<div class="fi">📄</div>`}<div class="fn" style="position:relative;z-index:1">${esc(d.titolo || d.nome)}</div></div>`).join('')}</div></div>`;
  return h;
};

function rigaVisita(v) {
  return `<div class="item" data-act="apri" data-k="visita" data-id="${v.id}"><div class="item-ico">${icoSpec(v.specialita)}</div>
    <div class="item-body"><div class="item-t">${esc(v.specialita || 'Visita')}${v.motivo ? ' · ' + esc(v.motivo) : ''}</div>
    <div class="item-s">${esc([v.medico, v.struttura].filter(Boolean).join(' · ') || '—')}</div></div>
    <div class="item-r">${fmtD(v.data)}${docsDi('visite', v.id).length ? '<br>📎 ' + docsDi('visite', v.id).length : ''}</div></div>`;
}

/* ---------- Misure ---------- */
function filtroPeriodo(lista) {
  const p = S.periodo;
  if (p === 'tutto') return lista;
  if (p === 'custom') {
    return lista.filter(m => (!S.dal || m.data.slice(0, 10) >= S.dal) && (!S.al || m.data.slice(0, 10) <= S.al));
  }
  return lista.filter(m => giorniFa(m.data) <= +p);
}
VISTE.misure = async () => {
  if (!S.tipi.find(t => t.id === S.tipoMisura)) S.tipoMisura = S.tipi[0] ? S.tipi[0].id : 'pressione';
  const T = tipo(S.tipoMisura);
  let h = `<div class="chips">${S.tipi.map(t => `<button class="chip ${t.id === S.tipoMisura ? 'on' : ''}" data-act="tipoMis" data-tipo="${t.id}">${t.icona} ${esc(t.nome)}</button>`).join('')}
    <button class="chip" data-act="gestTipi">＋ Altro</button></div>`;
  const P = [['7', '7 giorni'], ['30', 'Mese'], ['90', '3 mesi'], ['365', 'Anno'], ['tutto', 'Tutto'], ['custom', 'Periodo…']];
  h += `<div class="chips">${P.map(([k, l]) => `<button class="chip ${S.periodo === k ? 'on' : ''}" data-act="periodo" data-p="${k}">${l}</button>`).join('')}</div>`;
  if (S.periodo === 'custom') h += `<div class="f-row"><div class="f"><label>Dal</label><input type="date" id="p-dal" value="${S.dal}"></div><div class="f"><label>Al</label><input type="date" id="p-al" value="${S.al}"></div></div>`;
  const tutte = misureDi(T.id);
  const lista = filtroPeriodo(tutte);
  h += `<div class="card">`;
  if (!lista.length) {
    h += `<div class="empty"><div class="e-ico">${T.icona}</div>Nessuna misura in questo periodo.</div>`;
  } else if (T.id === 'pressione') {
    const casa = lista.filter(m => m.contesto !== 'ambulatorio');
    const med = mediaPressione(casa.length ? casa : lista);
    const ctx = casa.length ? 'casa' : 'ambulatorio';
    const c = REFS.classificaPressione(med.sis, med.dia, ctx);
    h += `<div class="card-h"><div class="card-t">Media ${ctx === 'casa' ? 'a casa' : 'in ambulatorio'}</div><span class="card-sub">${med.n} misure</span></div>
      <div class="big">${med.sis}/${med.dia} <small>mmHg${isFinite(med.fc) && med.fc ? ` · ${med.fc} bpm` : ''}</small></div>
      <div class="mt"><span class="badge ${c.cls}"><span class="dot"></span>${c.testo}</span></div>
      <p class="small muted">${esc(c.spiega)}</p>
      ${med.n < 6 ? `<div class="alert info">ℹ️ Con poche misure la media è poco affidabile. Per una valutazione più solida fai una <b>settimana di controllo</b>: per 7 giorni, mattina e sera, 2 misure a 1 minuto di distanza, dopo 5 minuti seduto.</div>` : ''}
      ${grafico({ serie: [
        { colore: '#ff5d73', punti: lista.map(m => ({ x: parseD(m.data).getTime(), y: +m.v.sis })) },
        { colore: '#60a5fa', punti: lista.map(m => ({ x: parseD(m.data).getTime(), y: +m.v.dia })) }],
        linee: [{ y: 135, colore: 'var(--warn)', etichetta: '135' }, { y: 85, colore: 'var(--warn)', etichetta: '85' }] })}
      <div class="legend"><span><i style="background:#ff5d73"></i>Sistolica (max)</span><span><i style="background:#60a5fa"></i>Diastolica (min)</span><span>- - soglie ipertensione a casa</span></div>
      <div class="src mt">Fonte: <a href="${FONTI.esc2024.url}" target="_blank" rel="noopener">${FONTI.esc2024.nome}</a></div>`;
  } else {
    const k = T.principale;
    const vals = lista.map(m => +m.v[k]).filter(isFinite);
    const media = vals.reduce((a, b) => a + b, 0) / vals.length;
    const ult = lista[0];
    const c = T.classifica(ult.v, ult.contesto, S.profilo);
    const bande = T.personalizzato && (isFinite(+T.rifMin) || isFinite(+T.rifMax)) ? [{ y1: +T.rifMin, y2: +T.rifMax, colore: 'var(--ok)' }] : [];
    h += `<div class="card-h"><div class="card-t">Ultima: ${esc(T.formato(ult.v))}</div><span class="card-sub">${fmtD(ult.data)}</span></div>
      <div class="mt"><span class="badge ${c.cls}"><span class="dot"></span>${c.testo}</span></div>
      <p class="small muted">${esc(c.spiega || '')}</p>
      ${grafico({ serie: [{ colore: T.colore, punti: lista.map(m => ({ x: parseD(m.data).getTime(), y: +m.v[k] })) }], bande })}
      <div class="stats"><div class="stat"><b>${fmtN(media)}</b><span>media</span></div><div class="stat"><b>${fmtN(Math.min(...vals))}</b><span>minimo</span></div><div class="stat"><b>${fmtN(Math.max(...vals))}</b><span>massimo</span></div></div>
      ${c.fonte ? `<div class="src mt">Fonte: <a href="${c.fonte.url}" target="_blank" rel="noopener">${esc(c.fonte.nome)}</a></div>` : ''}`;
  }
  h += `</div>`;
  h += `<button class="btn" data-act="nuovaMisura" data-tipo="${T.id}">＋ Nuova misura ${esc(T.nome.toLowerCase())}</button>`;
  if (T.id === 'pressione' || T.id === 'peso') h += `<button class="btn sec mt" data-act="importa">📥 Importa ${T.id === 'peso' ? 'dalla bilancia' : 'dal misuratore'} (CSV)</button>`;
  if (T.id === 'peso') h += composizioneHTML(lista);
  h += `<div class="sec-t">Storico <span>${lista.length}</span></div><div class="card"><div class="list">` +
    (lista.length ? lista.map(m => {
      const c = T.classifica(m.v, m.contesto, S.profilo);
      return `<div class="item" data-act="apri" data-k="misura" data-id="${m.id}"><div class="item-ico ${c.cls}"><span class="dot"></span></div>
      <div class="item-body"><div class="item-t">${esc(T.formato(m.v))}</div><div class="item-s">${T.contesto ? (m.contesto === 'ambulatorio' ? '🏥 ' : '🏠 ') : ''}${esc(m.note || '')}</div></div>
      <div class="item-r">${fmtD(m.data)}<br>${fmtOra(m.data)}</div></div>`;
    }).join('') : `<div class="empty small">—</div>`) + `</div></div>`;
  return h;
};
function composizioneHTML(lista) {
  const con = lista.filter(m => COMPOSIZIONE.some(([k]) => isFinite(m.v[k])));
  if (!con.length) return '';
  const u = con[0], p = con[1];
  const righe = COMPOSIZIONE.filter(([k]) => isFinite(u.v[k])).map(([k, nome, un]) => {
    const d = p && isFinite(p.v[k]) ? u.v[k] - p.v[k] : null;
    return `<tr><td>${nome}</td><td><b>${fmtN(u.v[k], k === 'bmr' || k === 'viscerale' ? 0 : 1)}</b> <span class="small muted">${un}</span></td>
      <td class="small muted">${d === null || Math.abs(d) < 0.05 ? (d === null ? '' : '=') : (d > 0 ? '▲ ' : '▼ ') + fmtN(Math.abs(d), k === 'bmr' ? 0 : 1)}</td></tr>`;
  }).join('');
  const gr = con.filter(m => isFinite(m.v.grasso));
  return `<div class="sec-t">Composizione corporea <span>${fmtD(u.data)}</span></div><div class="card">
    <table class="tbl"><tr><th></th><th>Ultima</th><th>${p ? 'vs ' + fmtDb(p.data) : ''}</th></tr>${righe}</table>
    ${gr.length > 1 ? `<div class="card-sub mt">Grasso corporeo nel tempo (%)</div>${grafico({ serie: [{ colore: '#f6ad55', punti: gr.map(m => ({ x: parseD(m.data).getTime(), y: m.v.grasso })) }], h: 130 })}` : ''}
    <p class="hint">🤖 Valori stimati dalla bilancia (bioimpedenza): utili per vedere l'andamento nel tempo, meno precisi come numero assoluto. Possono variare con acqua bevuta, ora del giorno e pasti: pesati sempre in condizioni simili.</p></div>`;
}
VISTE_DOPO.misure = v => {
  const d = $('#p-dal', v), a = $('#p-al', v);
  if (d) { d.onchange = () => { S.dal = d.value; render(); }; a.onchange = () => { S.al = a.value; render(); }; }
};

/* ---------- Visite ---------- */
VISTE.visite = async () => {
  let h = `<div class="seg" style="margin-bottom:12px"><button data-act="visTab" data-v="fatte" class="${S.visiteTab === 'fatte' ? 'on' : ''}">Visite fatte</button><button data-act="visTab" data-v="prossime" class="${S.visiteTab === 'prossime' ? 'on' : ''}">Appuntamenti</button></div>`;
  if (S.visiteTab === 'prossime') {
    const lista = [...S.d.appuntamenti].sort((a, b) => (a.data + (a.ora || '')).localeCompare(b.data + (b.ora || '')));
    const fut = lista.filter(a => !a.fatto), fatti = lista.filter(a => a.fatto).reverse();
    h += `<button class="btn" data-act="nuovoApp">＋ Nuovo appuntamento</button><div class="sec-t">In programma</div><div class="card"><div class="list">` +
      (fut.length ? fut.map(rigaApp).join('') : '<div class="empty small">Nessun appuntamento.</div>') + `</div></div>`;
    if (fatti.length) h += `<div class="sec-t">Passati</div><div class="card"><div class="list">${fatti.slice(0, 20).map(rigaApp).join('')}</div></div>`;
    return h;
  }
  const oc = S.d.visite.filter(v => isOculista(v.specialita) && v.vista && Object.values(v.vista).some(x => x !== '' && x != null));
  if (oc.length) h += `<div class="card card-tap hero" data-act="andamentoVista"><div class="card-h"><div class="card-t">👁️ Andamento della vista</div><span class="card-sub">${oc.length} visite</span></div><div class="card-sub">Confronta decimi, gradazione e pressione oculare nel tempo</div></div>`;
  h += `<button class="btn" data-act="nuovaVisita">＋ Registra una visita</button>`;
  const lista = [...S.d.visite].sort(byData('data'));
  if (!lista.length) return h + `<div class="card mt"><div class="empty"><div class="e-ico">🩺</div>Nessuna visita registrata.<br>Aggiungi la prima: specialista, note e referto.</div></div>`;
  const anni = {};
  lista.forEach(v => (anni[v.data.slice(0, 4)] = anni[v.data.slice(0, 4)] || []).push(v));
  for (const a of Object.keys(anni).sort().reverse()) h += `<div class="sec-t">${a}</div><div class="card"><div class="list">${anni[a].map(rigaVisita).join('')}</div></div>`;
  return h;
};
function rigaApp(a) {
  const scad = !a.fatto && a.data < oggi();
  return `<div class="item" data-act="apri" data-k="appuntamento" data-id="${a.id}"><div class="item-ico">${a.fatto ? '✅' : icoSpec(a.specialita)}</div>
    <div class="item-body"><div class="item-t">${esc(a.specialita || 'Appuntamento')}</div><div class="item-s">${esc([a.medico, a.luogo].filter(Boolean).join(' · ') || '—')}</div></div>
    <div class="item-r">${scad ? '<span class="lv-warn">Da segnare</span><br>' : ''}${fmtD(a.data)}${a.ora ? '<br>' + a.ora : ''}</div></div>`;
}

/* ---------- Esami ---------- */
function valoriRaggruppati() {
  const g = {};
  for (const e of S.d.esami) for (const r of (e.valori || [])) {
    if (!r.nome) continue;
    const k = norm(r.nome);
    (g[k] = g[k] || { nome: r.nome, punti: [] }).punti.push({ ...r, data: e.data, esame: e.id });
  }
  Object.values(g).forEach(x => { x.punti.sort(byData('data')); x.nome = x.punti[0].nome; });
  return g;
}
function trendHTML(cur, prev) {
  if (!isFinite(cur) || !isFinite(prev)) return '';
  if (cur === prev) return '<span class="trend eq">=</span>';
  return `<span class="trend eq">${cur > prev ? '▲' : '▼'}</span>`;
}
VISTE.esami = async () => {
  let h = `<button class="btn" data-act="nuovoEsame">＋ Nuovo referto / esame</button>`;
  const g = valoriRaggruppati();
  const ks = Object.keys(g).sort();
  if (ks.length) {
    h += `<div class="sec-t">Valori nel tempo <span>${ks.length}</span></div><div class="card"><div class="list">` + ks.map(k => {
      const x = g[k], u = x.punti[0], p = x.punti[1];
      const c = REFS.classificaValoreEsame(num(u.v), num(u.min), num(u.max));
      return `<div class="item" data-act="valore" data-k="${esc(k)}"><div class="item-ico ${c.cls}"><span class="dot"></span></div>
        <div class="item-body"><div class="item-t">${esc(x.nome)}</div><div class="item-s">${x.punti.length} ${x.punti.length === 1 ? 'misura' : 'misure'} · ultima ${fmtD(u.data)}</div></div>
        <div class="item-r"><b style="color:var(--txt)">${esc(u.v)}</b> ${esc(u.unita || '')} ${p ? trendHTML(num(u.v), num(p.v)) : ''}</div></div>`;
    }).join('') + `</div></div>`;
  }
  const lista = [...S.d.esami].sort(byData('data'));
  h += `<div class="sec-t">Referti</div><div class="card"><div class="list">` +
    (lista.length ? lista.map(e => {
      const fuori = (e.valori || []).filter(r => REFS.classificaValoreEsame(num(r.v), num(r.min), num(r.max)).livello === 'check').length;
      return `<div class="item" data-act="apri" data-k="esame" data-id="${e.id}"><div class="item-ico">🧪</div>
      <div class="item-body"><div class="item-t">${esc(e.titolo || 'Esame')}</div><div class="item-s">${esc(e.struttura || '')}${(e.valori || []).length ? ` · ${e.valori.length} valori` : ''}${fuori ? ` · <span class="lv-check">${fuori} fuori intervallo</span>` : ''}</div></div>
      <div class="item-r">${fmtD(e.data)}${docsDi('esami', e.id).length ? '<br>📎 ' + docsDi('esami', e.id).length : ''}</div></div>`;
    }).join('') : `<div class="empty"><div class="e-ico">🧪</div>Nessun referto.<br>Aggiungi gli esami del sangue con il PDF: l'app può leggere i valori da sola.</div>`) + `</div></div>`;
  return h;
};

/* ---------- Altro ---------- */
VISTE.altro = async () => {
  const lastBk = await DB.get('ultimoBackup');
  const voci = [
    ['problemi', '📋', 'Problematiche', `${S.d.problemi.filter(p => p.stato !== 'risolta').length} attive o in osservazione`],
    ['farmaci', '💊', 'Farmaci e terapie', `${S.d.farmaci.filter(f => !f.al || f.al >= oggi()).length} in corso`],
    ['documenti', '📁', 'Tutti i documenti', `${S.d.documenti.length} file`],
    ['act:riepilogo', '📄', 'PDF di riepilogo', 'Scegli cosa includere e stampalo o salvalo'],
    ['act:backup', '💾', 'Backup e ripristino', lastBk ? `Ultimo: ${fmtD(lastBk)}` : 'Mai fatto'],
    ['act:importa', '📥', 'Importa da misuratore o bilancia', 'File CSV della pressione o del peso (es. RENPHO)'],
    ['act:csv', '📊', 'Esporta misure in CSV', 'Si apre anche con Excel o Fogli'],
    ['act:profilo', '👤', 'Profilo', S.profilo ? `${S.profilo.nome}${S.profilo.anno ? ' · ' + S.profilo.anno : ''}` : ''],
    ['act:temi', '🎨', 'Tema', 'Turchese, Viola, Notte, Chiaro'],
    ['act:gestTipi', '📏', 'Tipi di misura', 'Attiva glicemia, saturazione o creane di nuovi'],
    ['act:sequenza', '🔒', 'Cambia sequenza di sblocco', ''],
    ['act:info', 'ℹ️', 'Fonti mediche e informazioni', `Versione ${VERSIONE}`]
  ];
  return `<div class="card"><div class="list">${voci.map(([k, i, t, s]) => `<div class="item" ${k.startsWith('act:') ? `data-act="${k.slice(4)}"` : `data-nav-go="${k}"`}>
    <div class="item-ico">${i}</div><div class="item-body"><div class="item-t">${t}</div>${s ? `<div class="item-s">${esc(s)}</div>` : ''}</div><div class="item-r">›</div></div>`).join('')}</div></div>
    <p class="small muted" style="text-align:center;margin-top:18px">Cartella Salute aiuta a tenere in ordine i tuoi dati.<br>Non sostituisce il parere del medico.</p>`;
};

VISTE.problemi = async () => {
  const ord = ['attiva', 'osservazione', 'rivalutare', 'risolta'];
  let h = `<button class="btn" data-act="nuovoProblema">＋ Nuova problematica</button>`;
  if (!S.d.problemi.length) return h + `<div class="card mt"><div class="empty"><div class="e-ico">📋</div>Nessuna problematica.<br>Qui puoi seguire un disturbo nel tempo, con visite, esami e farmaci collegati.</div></div>`;
  for (const st of ord) {
    const l = S.d.problemi.filter(p => (p.stato || 'attiva') === st);
    if (!l.length) continue;
    h += `<div class="sec-t">${STATI_PROB[st][1]} ${STATI_PROB[st][0]}</div><div class="card"><div class="list">` + l.map(p => {
      const nv = S.d.visite.filter(v => (v.problemi || []).includes(p.id)).length, ne = S.d.esami.filter(v => (v.problemi || []).includes(p.id)).length;
      return `<div class="item" data-act="apri" data-k="problema" data-id="${p.id}"><div class="item-ico">${STATI_PROB[st][1]}</div>
      <div class="item-body"><div class="item-t">${esc(p.titolo)}</div><div class="item-s">${nv} visite · ${ne} esami${p.prossimo ? ' · controllo ' + fmtD(p.prossimo) : ''}</div></div><div class="item-r">›</div></div>`;
    }).join('') + `</div></div>`;
  }
  return h;
};

VISTE.farmaci = async () => {
  let h = `<button class="btn" data-act="nuovoFarmaco">＋ Annota un farmaco</button>`;
  const inCorso = S.d.farmaci.filter(f => !f.al || f.al >= oggi()), finiti = S.d.farmaci.filter(f => f.al && f.al < oggi());
  const riga = f => `<div class="item" data-act="apri" data-k="farmaco" data-id="${f.id}"><div class="item-ico">💊</div>
    <div class="item-body"><div class="item-t">${esc(f.nome)}${f.dose ? ' · ' + esc(f.dose) : ''}</div><div class="item-s">${esc([f.frequenza, f.prescritto && 'da ' + f.prescritto].filter(Boolean).join(' · ') || '—')}</div></div>
    <div class="item-r">${f.dal ? 'dal ' + fmtD(f.dal) : ''}${f.al ? '<br>al ' + fmtD(f.al) : ''}</div></div>`;
  if (!S.d.farmaci.length) return h + `<div class="card mt"><div class="empty"><div class="e-ico">💊</div>Nessun farmaco annotato.</div></div>`;
  if (inCorso.length) h += `<div class="sec-t">In corso</div><div class="card"><div class="list">${inCorso.map(riga).join('')}</div></div>`;
  if (finiti.length) h += `<div class="sec-t">Terminati</div><div class="card"><div class="list">${finiti.map(riga).join('')}</div></div>`;
  return h;
};

VISTE.documenti = async () => {
  const lista = [...S.d.documenti].sort((a, b) => (b.data || '').localeCompare(a.data || '') || (b.creato || '').localeCompare(a.creato || ''));
  let h = `<button class="btn" data-act="nuovoDoc">＋ Aggiungi documento</button>`;
  if (!lista.length) return h + `<div class="card mt"><div class="empty"><div class="e-ico">📁</div>Nessun documento.</div></div>`;
  const dove = d => {
    if (!d.link) return 'Documento libero';
    const m = { visite: ['visite', v => `${v.specialita || 'Visita'}`], esami: ['esami', e => e.titolo || 'Esame'], problemi: ['problemi', p => p.titolo] }[d.link.t];
    const r = m && S.d[m[0]].find(x => x.id === d.link.id);
    return r ? m[1](r) : '';
  };
  const tot = lista.reduce((s, d) => s + (d.size || 0), 0);
  h += `<div class="sec-t">${lista.length} file <span>${(tot / 1048576).toFixed(1)} MB</span></div><div class="card"><div class="list">` +
    lista.map(d => `<div class="item" data-doc="${d.id}"><div class="item-ico">${/^image\//.test(d.mime) ? '🖼️' : '📄'}</div>
    <div class="item-body"><div class="item-t">${esc(d.titolo || d.nome)}</div><div class="item-s">${esc(dove(d))}</div></div><div class="item-r">${fmtD(d.data)}<br>${((d.size || 0) / 1024).toFixed(0)} KB</div></div>`).join('') + `</div></div>`;
  return h;
};

VISTE.cerca = async () => `<input class="search-in" id="q" placeholder="Cerca visite, referti, valori, date (es. 2024, dermatologo)…" autofocus><div id="res"></div>`;
VISTE_DOPO.cerca = v => {
  const q = $('#q', v), res = $('#res', v);
  const fai = () => {
    const t = norm(q.value);
    if (t.length < 2) { res.innerHTML = '<div class="empty small">Scrivi almeno 2 lettere</div>'; return; }
    const hit = (...xs) => xs.some(x => norm(x).includes(t));
    const out = [];
    S.d.visite.forEach(x => hit(x.specialita, x.medico, x.struttura, x.motivo, x.esito, x.note, fmtDb(x.data), x.data) && out.push(['visita', x.id, icoSpec(x.specialita), x.specialita || 'Visita', fmtD(x.data)]));
    S.d.esami.forEach(x => hit(x.titolo, x.struttura, x.note, fmtDb(x.data), x.data, ...(x.valori || []).map(r => r.nome)) && out.push(['esame', x.id, '🧪', x.titolo || 'Esame', fmtD(x.data)]));
    S.d.problemi.forEach(x => hit(x.titolo, x.descrizione, x.note) && out.push(['problema', x.id, '📋', x.titolo, STATI_PROB[x.stato || 'attiva'][0]]));
    S.d.farmaci.forEach(x => hit(x.nome, x.note, x.prescritto) && out.push(['farmaco', x.id, '💊', x.nome, x.dose || '']));
    S.d.appuntamenti.forEach(x => hit(x.specialita, x.medico, x.luogo, x.note, fmtDb(x.data), x.data) && out.push(['appuntamento', x.id, '📅', x.specialita || 'Appuntamento', fmtD(x.data)]));
    S.d.documenti.forEach(x => hit(x.nome, x.titolo, fmtDb(x.data)) && out.push(['doc', x.id, '📄', x.titolo || x.nome, fmtD(x.data)]));
    res.innerHTML = out.length ? `<div class="card"><div class="list">${out.map(([k, id, i, t, s]) => `<div class="item" ${k === 'doc' ? `data-doc="${id}"` : `data-act="apri" data-k="${k}" data-id="${id}"`}><div class="item-ico">${i}</div><div class="item-body"><div class="item-t">${esc(t)}</div><div class="item-s">${esc(s)}</div></div></div>`).join('')}</div></div>`
      : '<div class="empty">Nessun risultato</div>';
  };
  q.oninput = fai; setTimeout(() => q.focus(), 50);
};

/* =========================================================
   MODULI
   ========================================================= */
function campoData(id, lab, v, tipoI = 'date') { return `<div class="f"><label for="${id}">${lab}</label><input type="${tipoI}" id="${id}" value="${esc(v || '')}"></div>`; }
function campo(id, lab, v, extra = '') { return `<div class="f"><label for="${id}">${lab}</label><input id="${id}" value="${esc(v ?? '')}" ${extra}></div>`; }
function area(id, lab, v, ph = '') { return `<div class="f"><label for="${id}">${lab}</label><textarea id="${id}" placeholder="${esc(ph)}">${esc(v || '')}</textarea></div>`; }
function selProblemi(sel = []) {
  if (!S.d.problemi.length) return '';
  return `<details class="fold" ${sel.length ? 'open' : ''}><summary>📋 Collega a una problematica</summary>${S.d.problemi.map(p =>
    `<label class="row" style="padding:6px 0"><input type="checkbox" name="prob" value="${p.id}" ${sel.includes(p.id) ? 'checked' : ''}> ${esc(p.titolo)}</label>`).join('')}</details>`;
}
const leggiProblemi = sh => $$('input[name=prob]:checked', sh).map(i => i.value);
const datalistSpec = `<datalist id="dl-spec">${SPECIALITA.map(s => `<option value="${s[0]}">`).join('')}</datalist>`;
async function dopoSalvataggio(msg) { await caricaDati(); chiudiSheet(); await render(); toast(msg); }

/* ---------- Misura ---------- */
function formMisura(tipoId, m) {
  const T = tipo(tipoId); const nuovo = !m; m = m || { tipo: tipoId, data: isoLoc(), v: {}, contesto: 'casa' };
  let ctx = m.contesto || 'casa';
  const campi = T.campi.map(c => `<div class="f ${T.campi.length <= 3 ? 'big-input' : ''}"><label for="m-${c.k}">${c.nome}${c.unita ? ` (${c.unita})` : ''}</label>
    <input id="m-${c.k}" type="text" inputmode="decimal" autocomplete="off" value="${esc(m.v[c.k] ?? '')}" placeholder="${c.obbl ? '' : 'facoltativo'}"></div>`).join('');
  apriSheet(`<h2>${T.icona} ${nuovo ? 'Nuova misura' : 'Modifica misura'}: ${esc(T.nome)}</h2>
    <div class="${T.campi.length === 3 ? 'f-row3' : T.campi.length === 2 ? 'f-row' : ''}">${campi}</div>
    <div id="m-live"></div>
    ${T.contesto ? `<div class="f"><span class="lab">Dove l'hai misurata?</span><div class="seg" id="m-ctx"><button data-v="casa">🏠 A casa</button><button data-v="ambulatorio">🏥 Dal medico</button></div></div>` : ''}
    ${campoData('m-data', 'Data e ora', m.data, 'datetime-local')}
    ${area('m-note', 'Note (facoltative)', m.note, T.id === 'pressione' ? 'Es. a riposo, dopo il caffè, dopo la palestra…' : '')}
    <div class="btns">${nuovo ? '' : '<button class="btn danger" id="m-del">Elimina</button>'}<button class="btn" id="m-ok">Salva</button></div>`, sh => {
    if (T.contesto) segmento($('#m-ctx', sh), v => { ctx = v; live(); }, ctx);
    const live = () => {
      const v = {}; T.campi.forEach(c => v[c.k] = val(sh, 'm-' + c.k));
      if (!T.campi.filter(c => c.obbl).every(c => isFinite(num(v[c.k])))) { $('#m-live', sh).innerHTML = ''; return; }
      const c = T.classifica(v, ctx, S.profilo);
      $('#m-live', sh).innerHTML = `<div class="alert ${c.livello === 'alta' || c.livello === 'warn' ? c.cls : 'info'}"><b class="${c.cls}">${c.icona} ${esc(c.testo)}</b><br>${esc(c.spiega || '')}</div>`;
    };
    T.campi.forEach(c => $('#m-' + c.k, sh).addEventListener('input', live));
    live();
    setTimeout(() => nuovo && $('#m-' + T.campi[0].k, sh).focus(), 250);
    $('#m-ok', sh).onclick = async () => {
      const v = {};
      for (const c of T.campi) {
        const raw = val(sh, 'm-' + c.k);
        if (raw === '') { if (c.obbl) return toast(`Manca: ${c.nome}`); continue; }
        const n = num(raw);
        if (!isFinite(n)) return toast(`${c.nome}: non è un numero`);
        if ((isFinite(c.min) && n < c.min) || (isFinite(c.max) && n > c.max)) return toast(`${c.nome}: ${n} sembra fuori scala, controlla`);
        v[c.k] = n;
      }
      if (T.id === 'pressione' && v.sis <= v.dia) return toast('La sistolica (max) deve essere più alta della diastolica (min)');
      const dt = val(sh, 'm-data') || isoLoc();
      Object.assign(m, { tipo: T.id, v, data: dt, contesto: T.contesto ? ctx : undefined, note: val(sh, 'm-note'), p: S.pid });
      await DB.salva('misure', m);
      await dopoSalvataggio('Misura salvata ✅');
    };
    if (!nuovo) $('#m-del', sh).onclick = async () => { if (await conferma('Eliminare questa misura?')) { await DB.elimina('misure', m.id); await dopoSalvataggio('Misura eliminata'); } };
  });
}

/* ---------- Visita ---------- */
const CAMPI_VISTA = [
  ['odNat', 'OD senza correzione', '/10'], ['osNat', 'OS senza correzione', '/10'],
  ['odCorr', 'OD con correzione', '/10'], ['osCorr', 'OS con correzione', '/10'],
  ['odSfera', 'OD sfera', 'D'], ['osSfera', 'OS sfera', 'D'],
  ['odCil', 'OD cilindro', 'D'], ['osCil', 'OS cilindro', 'D'],
  ['odAsse', 'OD asse', '°'], ['osAsse', 'OS asse', '°'],
  ['odTono', 'OD pressione oculare', 'mmHg'], ['osTono', 'OS pressione oculare', 'mmHg']
];
function formVisita(v, pre = {}) {
  const nuovo = !v; v = v || { data: oggi(), vista: {}, ...pre };
  const vista = v.vista || {};
  apriSheet(`<h2>🩺 ${nuovo ? 'Nuova visita' : 'Modifica visita'}</h2>${datalistSpec}
    <div class="f-row">${campoData('v-data', 'Data', v.data)}${campo('v-spec', 'Specialista / tipo', v.specialita, 'list="dl-spec" placeholder="Es. Dermatologo"')}</div>
    <div class="f-row">${campo('v-medico', 'Medico', v.medico, 'placeholder="Facoltativo"')}${campo('v-strutt', 'Struttura', v.struttura, 'placeholder="Facoltativo"')}</div>
    ${campo('v-motivo', 'Motivo', v.motivo, 'placeholder="Es. controllo nei, mal di schiena…"')}
    ${area('v-esito', '👨‍⚕️ Cosa ha detto il medico', v.esito, 'Diagnosi, indicazioni, terapia consigliata…')}
    ${area('v-note', '📝 Mie note personali', v.note, 'Come mi sentivo, domande da fare la prossima volta…')}
    <details class="fold" id="v-vista-box" ${isOculista(v.specialita) ? 'open' : ''} style="${isOculista(v.specialita) ? '' : 'display:none'}">
      <summary>👁️ Dati della vista (tutti facoltativi)</summary>
      <p class="hint">OD = occhio destro · OS = occhio sinistro. Decimi da 0 a 10 (o più). Sfera e cilindro in diottrie, es. −1,25.</p>
      <div class="f-row">${CAMPI_VISTA.map(([k, l, u]) => `<div class="f"><label>${l} <span class="muted">${u}</span></label><input id="vv-${k}" inputmode="decimal" value="${esc(vista[k] ?? '')}"></div>`).join('')}</div>
      ${campo('vv-difetti', 'Difetti rilevati', vista.difetti, 'placeholder="Es. miopia, astigmatismo"')}
      <div class="f"><label>Correzione</label><select id="vv-corr">${['', 'Occhiali', 'Lenti a contatto', 'Occhiali e lenti', 'Nessuna'].map(o => `<option ${vista.correzione === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
    </details>
    ${campoData('v-prossimo', '🔁 Prossimo controllo (se indicato)', v.prossimo)}
    ${selProblemi(v.problemi || [])}
    <div class="f"><span class="lab">📎 Referti e allegati</span><div class="files"></div></div>
    <div class="btns">${nuovo ? '' : '<button class="btn danger" id="v-del">Elimina</button>'}<button class="btn" id="v-ok">Salva</button></div>`, sh => {
    const all = gestoreAllegati(sh, nuovo ? [] : docsDi('visite', v.id));
    const spec = $('#v-spec', sh), box = $('#v-vista-box', sh);
    spec.addEventListener('input', () => { const o = isOculista(spec.value); box.style.display = o ? '' : 'none'; if (o) box.open = true; });
    $('#v-ok', sh).onclick = async () => {
      if (!val(sh, 'v-data')) return toast('Inserisci la data');
      const vv = {};
      CAMPI_VISTA.forEach(([k]) => { const x = val(sh, 'vv-' + k); if (x !== '') vv[k] = x.replace('.', ','); });
      if (val(sh, 'vv-difetti')) vv.difetti = val(sh, 'vv-difetti');
      if (val(sh, 'vv-corr')) vv.correzione = val(sh, 'vv-corr');
      Object.assign(v, {
        p: S.pid, data: val(sh, 'v-data'), specialita: val(sh, 'v-spec') || 'Visita', medico: val(sh, 'v-medico'), struttura: val(sh, 'v-strutt'),
        motivo: val(sh, 'v-motivo'), esito: val(sh, 'v-esito'), note: val(sh, 'v-note'), prossimo: val(sh, 'v-prossimo'),
        problemi: leggiProblemi(sh), vista: isOculista(val(sh, 'v-spec')) ? vv : {}
      });
      await DB.salva('visite', v);
      await all.salva({ t: 'visite', id: v.id }, v.data);
      if (pre._daApp) { const a = S.d.appuntamenti.find(x => x.id === pre._daApp); if (a) { a.fatto = true; a.visita = v.id; await DB.salva('appuntamenti', a); } }
      await dopoSalvataggio('Visita salvata ✅');
    };
    if (!nuovo) $('#v-del', sh).onclick = () => eliminaConAllegati('visite', v, 'questa visita');
  });
}
async function eliminaConAllegati(store, r, cosa) {
  const docs = docsDi(store, r.id);
  if (!await conferma(`Eliminare ${cosa}${docs.length ? ` e i suoi ${docs.length} allegati` : ''}? Non si può annullare (a meno di ripristinare un backup).`)) return;
  for (const d of docs) await DB.elimina('documenti', d.id);
  await DB.elimina(store, r.id);
  await dopoSalvataggio('Eliminato');
}

function dettaglioVisita(v) {
  const docs = docsDi('visite', v.id);
  const probs = S.d.problemi.filter(p => (v.problemi || []).includes(p.id));
  let vistaH = '';
  if (isOculista(v.specialita) && v.vista && Object.keys(v.vista).length) {
    const prec = S.d.visite.filter(x => x.id !== v.id && isOculista(x.specialita) && x.data < v.data && x.vista && Object.keys(x.vista).length).sort(byData('data'))[0];
    vistaH = `<div class="sec-t">👁️ Vista${prec ? ` · confronto con ${fmtD(prec.data)}` : ''}</div><div class="card">${tabellaVista(v.vista, prec && prec.vista)}
      ${v.vista.difetti ? `<p class="small">Difetti: <b>${esc(v.vista.difetti)}</b></p>` : ''}${v.vista.correzione ? `<p class="small">Correzione: <b>${esc(v.vista.correzione)}</b></p>` : ''}
      <p class="hint">${esc(REFS.SPIEGA_DECIMI)}</p></div>`;
  }
  apriSheet(`<div class="row between"><h2 style="margin:0">${icoSpec(v.specialita)} ${esc(v.specialita || 'Visita')}</h2><button class="btn sm sec" id="d-mod">✏️ Modifica</button></div>
    <p class="muted" style="margin:4px 0 12px">${fmtD(v.data)}${v.medico ? ' · ' + esc(v.medico) : ''}${v.struttura ? ' · ' + esc(v.struttura) : ''}</p>
    ${v.motivo ? `<div class="card"><div class="card-sub">Motivo</div>${esc(v.motivo)}</div>` : ''}
    ${v.esito ? `<div class="card"><div class="row between"><div class="card-sub">Cosa ha detto il medico</div><span class="prov">👨‍⚕️ dal medico</span></div><div style="white-space:pre-wrap">${esc(v.esito)}</div></div>` : ''}
    ${v.note ? `<div class="card"><div class="row between"><div class="card-sub">Mie note</div><span class="prov">📝 mia nota</span></div><div style="white-space:pre-wrap">${esc(v.note)}</div></div>` : ''}
    ${vistaH}
    ${v.prossimo ? `<div class="card">🔁 Prossimo controllo: <b>${fmtD(v.prossimo)}</b></div>` : ''}
    ${probs.length ? `<div class="card"><div class="card-sub">Problematiche collegate</div>${probs.map(p => `<div class="item" data-act="apri" data-k="problema" data-id="${p.id}"><div class="item-ico">📋</div><div class="item-body"><div class="item-t">${esc(p.titolo)}</div></div></div>`).join('')}</div>` : ''}
    ${docs.length ? `<div class="sec-t">📎 Allegati</div><div class="files">${docs.map(d => `<div class="file" data-doc="${d.id}">${/^image\//.test(d.mime) ? `<img src="${blobUrl(d)}" alt="">` : `<div class="fi">📄</div><div class="fn">${esc(d.nome)}</div>`}</div>`).join('')}</div>` : ''}
  `, sh => { $('#d-mod', sh).onclick = () => { chiudiSheet(); setTimeout(() => formVisita(v), 60); }; });
}

function tabellaVista(cur, prec) {
  const righe = [['Senza correzione', 'odNat', 'osNat', 'dec'], ['Con correzione', 'odCorr', 'osCorr', 'dec'], ['Sfera (D)', 'odSfera', 'osSfera', 'grad'],
    ['Cilindro (D)', 'odCil', 'osCil', 'grad'], ['Asse (°)', 'odAsse', 'osAsse', ''], ['Pressione oculare', 'odTono', 'osTono', '']];
  const cella = (k, tipoT) => {
    const c = cur[k]; if (c === undefined || c === '') return '<td class="muted">–</td>';
    let t = '';
    if (prec && prec[k] !== undefined && prec[k] !== '') {
      const a = num(c), b = num(prec[k]);
      if (isFinite(a) && isFinite(b) && a !== b) {
        if (tipoT === 'dec') t = a > b ? ' <span class="trend up">▲ migliorata</span>' : ' <span class="trend down">▼ calata</span>';
        else if (tipoT === 'grad') t = Math.abs(a) > Math.abs(b) ? ' <span class="trend eq">gradazione ↑</span>' : ' <span class="trend eq">gradazione ↓</span>';
        else t = ` <span class="trend eq">(prima ${esc(prec[k])})</span>`;
      } else if (isFinite(a) && isFinite(b)) t = ' <span class="trend eq">= stabile</span>';
    }
    return `<td><b>${esc(c)}</b>${tipoT === 'dec' ? '/10' : ''}${t}</td>`;
  };
  const vis = righe.filter(r => (cur[r[1]] ?? '') !== '' || (cur[r[2]] ?? '') !== '');
  if (!vis.length) return '<p class="muted">Nessun dato numerico inserito.</p>';
  return `<table class="tbl"><tr><th></th><th>Occhio destro</th><th>Occhio sinistro</th></tr>${vis.map(r => `<tr><td class="small muted">${r[0]}</td>${cella(r[1], r[3])}${cella(r[2], r[3])}</tr>`).join('')}</table>`;
}

function andamentoVista() {
  const lista = S.d.visite.filter(v => isOculista(v.specialita) && v.vista && Object.keys(v.vista).length).sort(byData('data'));
  const serie = (k, col) => ({ colore: col, punti: lista.filter(v => isFinite(num(v.vista[k]))).map(v => ({ x: parseD(v.data).getTime(), y: num(v.vista[k]) })) });
  const sNat = [serie('odNat', '#2dd4bf'), serie('osNat', '#f472b6')].filter(s => s.punti.length);
  const sCorr = [serie('odCorr', '#2dd4bf'), serie('osCorr', '#f472b6')].filter(s => s.punti.length);
  const sSf = [serie('odSfera', '#2dd4bf'), serie('osSfera', '#f472b6')].filter(s => s.punti.length);
  const leg = `<div class="legend"><span><i style="background:#2dd4bf"></i>Occhio destro</span><span><i style="background:#f472b6"></i>Occhio sinistro</span></div>`;
  const blocco = (t, s) => s.length && s.some(x => x.punti.length) ? `<div class="card"><div class="card-t">${t}</div>${grafico({ serie: s, h: 150 })}${leg}</div>` : '';
  apriSheet(`<h2>👁️ Andamento della vista</h2>
    <div class="alert info">${esc(REFS.SPIEGA_DECIMI)}</div>
    ${blocco('Decimi senza correzione', sNat)}${blocco('Decimi con correzione', sCorr)}${blocco('Sfera (diottrie)', sSf)}
    <div class="sec-t">Visite</div><div class="card"><div class="list">${[...lista].reverse().map(rigaVisita).join('')}</div></div>`);
}

/* ---------- Appuntamento ---------- */
function formApp(a) {
  const nuovo = !a; a = a || { data: '', ora: '' };
  apriSheet(`<h2>📅 ${nuovo ? 'Nuovo appuntamento' : 'Appuntamento'}</h2>${datalistSpec}
    <div class="f-row">${campoData('a-data', 'Data', a.data)}${campoData('a-ora', 'Ora', a.ora, 'time')}</div>
    ${campo('a-spec', 'Specialista / tipo', a.specialita, 'list="dl-spec" placeholder="Es. Oculista"')}
    <div class="f-row">${campo('a-medico', 'Medico', a.medico)}${campo('a-luogo', 'Dove', a.luogo)}</div>
    ${area('a-note', 'Note', a.note, 'Cosa portare, impegnativa, domande da fare…')}
    ${!nuovo && !a.fatto ? `<button class="btn sec mt" id="a-fatto">✅ Fatta: registra la visita</button>` : ''}
    ${a.fatto && a.visita ? `<button class="btn sec mt" data-act="apri" data-k="visita" data-id="${a.visita}">Apri la visita registrata</button>` : ''}
    <div class="btns">${nuovo ? '' : '<button class="btn danger" id="a-del">Elimina</button>'}<button class="btn" id="a-ok">Salva</button></div>`, sh => {
    const leggi = () => Object.assign(a, { p: S.pid, data: val(sh, 'a-data'), ora: val(sh, 'a-ora'), specialita: val(sh, 'a-spec'), medico: val(sh, 'a-medico'), luogo: val(sh, 'a-luogo'), note: val(sh, 'a-note') });
    $('#a-ok', sh).onclick = async () => {
      if (!val(sh, 'a-data')) return toast('Inserisci la data');
      leggi(); await DB.salva('appuntamenti', a); await dopoSalvataggio('Appuntamento salvato ✅');
    };
    if ($('#a-fatto', sh)) $('#a-fatto', sh).onclick = async () => {
      leggi(); await DB.salva('appuntamenti', a); await caricaDati(); chiudiSheet();
      setTimeout(() => formVisita(null, { data: a.data <= oggi() ? a.data : oggi(), specialita: a.specialita, medico: a.medico, struttura: a.luogo, _daApp: a.id }), 60);
    };
    if (!nuovo) $('#a-del', sh).onclick = async () => { if (await conferma('Eliminare questo appuntamento?')) { await DB.elimina('appuntamenti', a.id); await dopoSalvataggio('Eliminato'); } };
  });
}

/* ---------- Esame / referto ---------- */
function formEsame(e) {
  const nuovo = !e; e = e || { data: oggi(), titolo: 'Esami del sangue', valori: [] };
  const g = valoriRaggruppati();
  const noti = Object.values(g).map(x => x.nome);
  let righe = (e.valori || []).map(r => ({ ...r }));
  apriSheet(`<h2>🧪 ${nuovo ? 'Nuovo referto' : 'Modifica referto'}</h2>
    <datalist id="dl-val">${noti.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
    <div class="f-row">${campoData('e-data', 'Data del prelievo / esame', e.data)}${campo('e-tit', 'Tipo di esame', e.titolo, 'placeholder="Es. Esami del sangue"')}</div>
    ${campo('e-strutt', 'Laboratorio / struttura', e.struttura, 'placeholder="Facoltativo"')}
    <div class="f"><span class="lab">📎 Referto (PDF o foto)</span><div class="files"></div></div>
    <button class="btn sec" id="e-leggi">🤖 Leggi i valori dal referto</button>
    <p class="hint">L'app prova a leggere nome, valore, unità e intervallo. Tu controlli tutto prima di salvare: se un dato non è chiaro lo lascia vuoto.</p>
    <div id="e-stato"></div>
    <div class="sec-t">Valori <button class="btn-link" id="e-add">＋ Aggiungi</button></div>
    <div id="e-righe"></div>
    ${area('e-note', '📝 Note', e.note, 'Es. a digiuno, indicazioni del medico…')}
    ${selProblemi(e.problemi || [])}
    <div class="btns">${nuovo ? '' : '<button class="btn danger" id="e-del">Elimina</button>'}<button class="btn" id="e-ok">Salva</button></div>`, sh => {
    const all = gestoreAllegati(sh, nuovo ? [] : docsDi('esami', e.id));
    const box = $('#e-righe', sh);
    const leggiRighe = () => { righe = $$('.vr', box).map((el, i) => ({ ...righe[i], nome: $('[data-f=nome]', el).value.trim(), v: $('[data-f=v]', el).value.trim(), unita: $('[data-f=unita]', el).value.trim(), min: $('[data-f=min]', el).value.trim(), max: $('[data-f=max]', el).value.trim() })); };
    const disegna = () => {
      box.innerHTML = righe.length ? righe.map((r, i) => `<div class="card vr" style="padding:12px">
        <div class="row between"><input data-f="nome" list="dl-val" value="${esc(r.nome)}" placeholder="Nome (es. Emoglobina)" style="flex:1;border:0;background:none;font-weight:700;font-size:16px;outline:none;min-width:0">
        ${r.orig && r.orig !== 'manuale' ? '<span class="prov">🤖 letto · controlla</span>' : ''}<button class="btn-link" data-x="${i}" aria-label="Rimuovi">✕</button></div>
        <div class="f-row" style="grid-template-columns:1.2fr 1fr 1fr 1fr;gap:6px;margin-top:6px">
          <div class="f" style="margin:0"><label>Valore</label><input data-f="v" inputmode="decimal" value="${esc(r.v)}"></div>
          <div class="f" style="margin:0"><label>Unità</label><input data-f="unita" value="${esc(r.unita)}"></div>
          <div class="f" style="margin:0"><label>Rif. min</label><input data-f="min" inputmode="decimal" value="${esc(r.min)}"></div>
          <div class="f" style="margin:0"><label>Rif. max</label><input data-f="max" inputmode="decimal" value="${esc(r.max)}"></div>
        </div></div>`).join('') : `<div class="empty small">Nessun valore. Puoi anche salvare solo il PDF.</div>`;
      $$('[data-x]', box).forEach(b => b.onclick = () => { leggiRighe(); righe.splice(+b.dataset.x, 1); disegna(); });
      $$('[data-f=nome]', box).forEach((inp, i) => inp.addEventListener('change', () => {
        const k = norm(inp.value); const prev = g[k] && g[k].punti[0];
        if (!prev) return;
        const el = $$('.vr', box)[i];
        ['unita', 'min', 'max'].forEach(f => { const x = $(`[data-f=${f}]`, el); if (!x.value && prev[f]) x.value = prev[f]; });
      }));
    };
    disegna();
    $('#e-add', sh).onclick = () => { leggiRighe(); righe.push({ nome: '', v: '', unita: '', min: '', max: '', orig: 'manuale' }); disegna(); $$('[data-f=nome]', box).pop().focus(); };

    // Lettura automatica
    const picker = document.createElement('input'); picker.type = 'file'; picker.accept = 'application/pdf,image/*'; picker.hidden = true; sh.appendChild(picker);
    $('#e-leggi', sh).onclick = () => picker.click();
    picker.onchange = async () => {
      const f = picker.files[0]; picker.value = ''; if (!f) return;
      const stato = $('#e-stato', sh);
      stato.innerHTML = `<div class="alert info">⏳ Sto leggendo il referto… (la prima volta serve internet per scaricare il lettore)</div>`;
      try {
        const doc = await preparaFile(f);
        const res = await leggiReferto(f, msg => stato.innerHTML = `<div class="alert info">⏳ ${esc(msg)}</div>`);
        all.aggiungi(doc);
        if (res.data && !$('#e-data', sh).dataset.toccata) $('#e-data', sh).value = res.data;
        if (!res.valori.length) {
          stato.innerHTML = `<div class="alert lv-warn">Non sono riuscito a leggere valori in modo affidabile${res.ocr ? ' dalla foto' : ''}. Ho allegato il file: puoi inserire a mano i valori che vuoi seguire.</div>`;
          return;
        }
        leggiRighe();
        righe = righe.filter(r => r.nome || r.v).concat(res.valori.map(r => ({ ...r, orig: res.ocr ? 'ocr' : 'pdf' })));
        disegna();
        stato.innerHTML = `<div class="alert info">✅ Ho trovato <b>${res.valori.length} valori</b>${res.data ? ` e la data ${fmtD(res.data)}` : ''}. <b>Controllali uno per uno</b> con il referto prima di salvare${res.ocr ? ' (dalla foto la lettura è meno precisa)' : ''}.</div>`;
      } catch (err) {
        stato.innerHTML = `<div class="alert lv-warn">Non riesco a leggere il file adesso (${esc(err.message || 'errore')}). Puoi comunque allegarlo e scrivere i valori a mano.</div>`;
      }
    };
    $('#e-data', sh).addEventListener('input', ev => ev.target.dataset.toccata = 1);

    $('#e-ok', sh).onclick = async () => {
      leggiRighe();
      const valori = righe.filter(r => r.nome || r.v);
      const senzaNome = valori.find(r => !r.nome); if (senzaNome) return toast('C\'è un valore senza nome');
      Object.assign(e, { p: S.pid, data: val(sh, 'e-data') || oggi(), titolo: val(sh, 'e-tit') || 'Esame', struttura: val(sh, 'e-strutt'), note: val(sh, 'e-note'), problemi: leggiProblemi(sh),
        valori: valori.map(r => ({ nome: r.nome, v: r.v, unita: r.unita, min: r.min, max: r.max, orig: r.orig || 'manuale' })) });
      await DB.salva('esami', e);
      await all.salva({ t: 'esami', id: e.id }, e.data);
      await dopoSalvataggio('Referto salvato ✅');
    };
    if (!nuovo) $('#e-del', sh).onclick = () => eliminaConAllegati('esami', e, 'questo referto');
  });
}

function dettaglioEsame(e) {
  const docs = docsDi('esami', e.id);
  const g = valoriRaggruppati();
  apriSheet(`<div class="row between"><h2 style="margin:0">🧪 ${esc(e.titolo || 'Esame')}</h2><button class="btn sm sec" id="d-mod">✏️ Modifica</button></div>
    <p class="muted" style="margin:4px 0 12px">${fmtD(e.data)}${e.struttura ? ' · ' + esc(e.struttura) : ''}</p>
    ${(e.valori || []).length ? `<div class="card"><table class="tbl"><tr><th>Valore</th><th>Risultato</th><th>Intervallo lab.</th></tr>${e.valori.map(r => {
      const c = REFS.classificaValoreEsame(num(r.v), num(r.min), num(r.max));
      const storico = g[norm(r.nome)];
      const prec = storico && storico.punti.find(p => p.esame !== e.id && p.data < e.data);
      return `<tr data-act="valore" data-k="${esc(norm(r.nome))}" style="cursor:pointer"><td>${esc(r.nome)}${prec ? `<div class="small muted">prima: ${esc(prec.v)} (${fmtDb(prec.data)})</div>` : ''}</td>
        <td><b class="${c.cls}">${esc(r.v)}</b> <span class="small muted">${esc(r.unita || '')}</span></td>
        <td class="small muted">${r.min || r.max ? `${esc(r.min || '…')} – ${esc(r.max || '…')}` : '—'}</td></tr>`;
    }).join('')}</table>
    <p class="hint">Colori: <span class="lv-ok">● nell'intervallo del laboratorio</span> · <span class="lv-check">● fuori intervallo</span> · <span class="lv-na">● senza intervallo</span>. Un valore fuori intervallo non è una diagnosi: va valutato dal medico.</p></div>` : ''}
    ${e.note ? `<div class="card"><div class="card-sub">Note</div><div style="white-space:pre-wrap">${esc(e.note)}</div></div>` : ''}
    ${docs.length ? `<div class="sec-t">📎 Referto</div><div class="files">${docs.map(d => `<div class="file" data-doc="${d.id}">${/^image\//.test(d.mime) ? `<img src="${blobUrl(d)}" alt="">` : `<div class="fi">📄</div><div class="fn">${esc(d.nome)}</div>`}</div>`).join('')}</div>` : ''}
  `, sh => { $('#d-mod', sh).onclick = () => { chiudiSheet(); setTimeout(() => formEsame(e), 60); }; });
}

function dettaglioValore(k) {
  const g = valoriRaggruppati()[k]; if (!g) return;
  const pts = g.punti.filter(p => isFinite(num(p.v)));
  const u = g.punti[0];
  const bande = isFinite(num(u.min)) || isFinite(num(u.max)) ? [{ y1: num(u.min), y2: num(u.max), colore: 'var(--ok)' }] : [];
  apriSheet(`<h2>📈 ${esc(g.nome)}</h2>
    ${pts.length > 0 ? `<div class="card">${grafico({ serie: [{ colore: '#2dd4bf', punti: pts.map(p => {
      const c = REFS.classificaValoreEsame(num(p.v), num(p.min), num(p.max));
      return { x: parseD(p.data).getTime(), y: num(p.v), colore: c.livello === 'check' ? 'var(--check)' : '#2dd4bf' };
    }) }], bande })}
    ${bande.length ? `<div class="legend"><span><i style="background:var(--ok);opacity:.35"></i>Intervallo dell'ultimo referto (${esc(u.min || '…')}–${esc(u.max || '…')} ${esc(u.unita || '')})</span></div>` : ''}</div>` : ''}
    <div class="card"><table class="tbl"><tr><th>Data</th><th>Valore</th><th>Intervallo lab.</th></tr>${g.punti.map(p => {
      const c = REFS.classificaValoreEsame(num(p.v), num(p.min), num(p.max));
      return `<tr data-act="apri" data-k="esame" data-id="${p.esame}" style="cursor:pointer"><td>${fmtDb(p.data)}</td><td><b class="${c.cls}">${esc(p.v)}</b> <span class="small muted">${esc(p.unita || '')}</span></td><td class="small muted">${p.min || p.max ? `${esc(p.min || '…')} – ${esc(p.max || '…')}` : '—'}</td></tr>`;
    }).join('')}</table></div>
    <p class="hint">Ogni valore è confrontato con l'intervallo scritto sul <b>suo</b> referto: laboratori e metodi diversi possono avere intervalli diversi.</p>`);
}

/* ---------- Lettura referti (PDF digitale o foto) ---------- */
async function testoDaPDF(file) {
  const lib = await pdfjs();
  const pdf = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const righe = [];
  for (let n = 1; n <= Math.min(pdf.numPages, 15); n++) {
    const pg = await pdf.getPage(n);
    const tc = await pg.getTextContent();
    const items = tc.items.filter(i => i.str && i.str.trim()).map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width || 0 }));
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const gruppi = [];
    for (const it of items) {
      const g = gruppi.find(g => Math.abs(g.y - it.y) < 3);
      if (g) g.it.push(it); else gruppi.push({ y: it.y, it: [it] });
    }
    gruppi.sort((a, b) => b.y - a.y);
    for (const g of gruppi) {
      g.it.sort((a, b) => a.x - b.x);
      let s = '', fineX = null;
      for (const it of g.it) { if (fineX !== null) s += (it.x - fineX > 12 ? '   ' : ' '); s += it.s; fineX = it.x + it.w; }
      righe.push(s.replace(/\s{4,}/g, '   ').trim());
    }
  }
  return righe.join('\n');
}
async function testoDaFoto(file, onMsg) {
  if (!window.Tesseract) { onMsg && onMsg('Scarico il lettore di testo (OCR)…'); await caricaScript('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'); }
  const w = await Tesseract.createWorker('ita', 1, { logger: m => m.status === 'recognizing text' && onMsg && onMsg(`Leggo la foto… ${Math.round(m.progress * 100)}%`) });
  const r = await w.recognize(file);
  await w.terminate();
  return r.data.text || '';
}
const RE_NUM = '[<>≤≥]?\\s?\\d+(?:[.,]\\d+)?';
const ESCLUDI = /\b(pag|pagina|data|ora|tessera|richiesta|nascita|telefono|tel|fax|cap|via|codice|n\.|reg|regione|azienda|ulss|u\.l\.s\.s|presidio|ospedale|certificato|iso|direttore|sig|accett|prel)\b/i;
// Sembra un'unità di misura? (g/L, 10*9/L, fL, pg, %, mmol/L, U/L…) — evita di scambiare parole per unità
const sembraUnita = u => /[\/%]/.test(u) || (u.length <= 6 && /[a-zµμ]/.test(u)) || u.length <= 3;
function estraiValori(testo) {
  const out = [], visti = new Set();
  const re = new RegExp(`^\\s*([A-Za-zÀ-ÿµ][A-Za-zÀ-ÿ0-9 ()/.,'%+\\-]{1,70}?)\\s*[:.]{0,3}\\s+(${RE_NUM})(?:\\s*\\*)?(?:\\s*[HhLl](?=\\s))?(?:\\s+([^\\s\\[\\]()]{1,14}))?(.*)$`);
  for (const riga of testo.split(/\n/)) {
    const m = riga.match(re); if (!m) continue;
    let [, nome, v, unita, resto] = m;
    nome = nome.replace(/[\s:.]+$/, '').trim();
    if (nome.length < 3 || ESCLUDI.test(nome) || /\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/.test(riga.slice(0, 40))) continue;
    let min = '', max = '';
    const rr = (resto || '').match(new RegExp(`\\[?\\s*(${RE_NUM})\\s*[-–÷]\\s*(${RE_NUM})\\s*\\]?`));
    if (rr) { min = rr[1].replace(/\s/g, ''); max = rr[2].replace(/\s/g, ''); }
    else {
      const up = (resto || '').match(new RegExp(`(?:^|\\s|\\[)[<≤]\\s*(\\d+(?:[.,]\\d+)?)`)); if (up) max = up[1];
      const lo = (resto || '').match(new RegExp(`(?:^|\\s|\\[)[>≥]\\s*(\\d+(?:[.,]\\d+)?)`)); if (lo) min = lo[1];
    }
    if (unita && /^[\d.,\-–]+$/.test(unita)) { unita = ''; }
    if (unita && /^[<>≤≥]/.test(unita)) unita = '';
    if (unita && !sembraUnita(unita)) unita = '';
    // Serve almeno un'unità o un intervallo, altrimenti è probabilmente testo qualsiasi
    if (!unita && !min && !max) continue;
    const k = norm(nome); if (visti.has(k)) continue; visti.add(k);
    out.push({ nome, v: v.replace(/\s/g, ''), unita: unita || '', min, max });
  }
  return out;
}
function estraiData(testo) {
  const cerca = (re) => { const m = testo.match(re); if (!m) return ''; let [, d, mo, y] = m; if (y.length === 2) y = '20' + y; const iso = `${y}-${pad(+mo)}-${pad(+d)}`; return isFinite(parseD(iso)) && +mo <= 12 && +d <= 31 ? iso : ''; };
  return cerca(/prel[a-z.]*\s*[:.]?\s*(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/i) || cerca(/(?:data|del)\s*[:.]?\s*(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/i) || '';
}
async function leggiReferto(file, onMsg) {
  let testo = '', ocr = false;
  if (file.type === 'application/pdf') {
    onMsg && onMsg('Leggo il PDF…');
    testo = await testoDaPDF(file);
    if (testo.replace(/\s/g, '').length < 40) {
      // PDF scansionato (è solo un'immagine): provo con l'OCR sulla prima pagina
      onMsg && onMsg('Il PDF è una scansione: provo a leggerlo come foto…');
      const lib = await pdfjs(); const pdf = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      const pg = await pdf.getPage(1); const vp = pg.getViewport({ scale: 2.5 });
      const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
      await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      testo = await testoDaFoto(await new Promise(r => c.toBlob(r, 'image/png')), onMsg); ocr = true;
    }
  } else if (/^image\//.test(file.type)) {
    testo = await testoDaFoto(file, onMsg); ocr = true;
  } else throw new Error('formato non supportato');
  return { valori: estraiValori(testo), data: estraiData(testo), ocr, testo };
}

/* ---------- Problematica ---------- */
function formProblema(p) {
  const nuovo = !p; p = p || { stato: 'attiva', evoluzione: [] };
  let stato = p.stato || 'attiva';
  apriSheet(`<h2>📋 ${nuovo ? 'Nuova problematica' : 'Modifica problematica'}</h2>
    ${campo('p-tit', 'Nome', p.titolo, 'placeholder="Es. Mal di schiena, neo sulla spalla…"')}
    <div class="f"><span class="lab">Stato</span><div class="seg" id="p-stato">${Object.entries(STATI_PROB).map(([k, [l, i]]) => `<button data-v="${k}">${i} ${l}</button>`).join('')}</div></div>
    ${campoData('p-inizio', 'Prima comparsa (se la sai)', p.inizio)}
    ${area('p-desc', '👨‍⚕️ Cosa sappiamo (dal medico)', p.descrizione, 'Diagnosi o indicazioni ricevute')}
    ${area('p-note', '📝 Mie note', p.note, 'Sintomi, quando peggiora, cosa aiuta…')}
    ${campoData('p-prossimo', '🔁 Prossimo controllo', p.prossimo)}
    <div class="btns">${nuovo ? '' : '<button class="btn danger" id="p-del">Elimina</button>'}<button class="btn" id="p-ok">Salva</button></div>`, sh => {
    segmento($('#p-stato', sh), v => stato = v, stato);
    $('#p-ok', sh).onclick = async () => {
      if (!val(sh, 'p-tit')) return toast('Dai un nome alla problematica');
      const cambioStato = !nuovo && p.stato !== stato;
      Object.assign(p, { p: S.pid, titolo: val(sh, 'p-tit'), stato, inizio: val(sh, 'p-inizio'), descrizione: val(sh, 'p-desc'), note: val(sh, 'p-note'), prossimo: val(sh, 'p-prossimo') });
      p.evoluzione = p.evoluzione || [];
      if (nuovo) p.evoluzione.push({ data: oggi(), testo: 'Problematica registrata', auto: true });
      if (cambioStato) p.evoluzione.push({ data: oggi(), testo: `Stato cambiato in: ${STATI_PROB[stato][0]}`, auto: true });
      await DB.salva('problemi', p); await dopoSalvataggio('Salvato ✅');
    };
    if (!nuovo) $('#p-del', sh).onclick = async () => {
      if (!await conferma('Eliminare questa problematica? Visite ed esami collegati restano, perdono solo il collegamento.')) return;
      await DB.elimina('problemi', p.id); await dopoSalvataggio('Eliminata');
    };
  });
}
function dettaglioProblema(p) {
  const vis = S.d.visite.filter(v => (v.problemi || []).includes(p.id));
  const es = S.d.esami.filter(v => (v.problemi || []).includes(p.id));
  const fa = S.d.farmaci.filter(f => f.problema === p.id);
  const ev = [
    ...vis.map(v => ({ data: v.data, html: `${icoSpec(v.specialita)} <b>Visita ${esc(v.specialita || '')}</b>${v.esito ? `<div class="small muted">${esc(v.esito.slice(0, 140))}</div>` : ''}`, k: 'visita', id: v.id })),
    ...es.map(e => ({ data: e.data, html: `🧪 <b>${esc(e.titolo || 'Esame')}</b>`, k: 'esame', id: e.id })),
    ...fa.map(f => ({ data: f.dal || '', html: `💊 <b>Inizio ${esc(f.nome)}</b>${f.dose ? ' · ' + esc(f.dose) : ''}`, k: 'farmaco', id: f.id })),
    ...(p.evoluzione || []).map((x, i) => ({ data: x.data, html: `${x.auto ? '⚙️' : '📝'} ${esc(x.testo)}`, evo: i })),
    ...(p.inizio ? [{ data: p.inizio, html: '🚩 <b>Prima comparsa</b>' }] : [])
  ].filter(x => x.data).sort(byData('data'));
  apriSheet(`<div class="row between"><h2 style="margin:0">📋 ${esc(p.titolo)}</h2><button class="btn sm sec" id="d-mod">✏️ Modifica</button></div>
    <p style="margin:8px 0 12px"><span class="badge">${STATI_PROB[p.stato || 'attiva'][1]} ${STATI_PROB[p.stato || 'attiva'][0]}</span>${p.prossimo ? ` <span class="badge">🔁 ${fmtD(p.prossimo)}</span>` : ''}</p>
    ${p.descrizione ? `<div class="card"><div class="row between"><div class="card-sub">Cosa sappiamo</div><span class="prov">👨‍⚕️ dal medico</span></div><div style="white-space:pre-wrap">${esc(p.descrizione)}</div></div>` : ''}
    ${p.note ? `<div class="card"><div class="row between"><div class="card-sub">Mie note</div><span class="prov">📝 mia nota</span></div><div style="white-space:pre-wrap">${esc(p.note)}</div></div>` : ''}
    <div class="sec-t">Cronologia <button class="btn-link" id="d-agg">＋ Aggiornamento</button></div>
    <div class="card">${ev.length ? `<div class="tl">${ev.map(x => `<div class="tl-i" ${x.k ? `data-act="apri" data-k="${x.k}" data-id="${x.id}"` : ''}><div class="tl-d">${fmtD(x.data)}</div>${x.html}</div>`).join('')}</div>` : '<div class="empty small">Ancora niente. Collega visite ed esami a questa problematica dai loro moduli.</div>'}</div>
  `, sh => {
    $('#d-mod', sh).onclick = () => { chiudiSheet(); setTimeout(() => formProblema(p), 60); };
    $('#d-agg', sh).onclick = () => {
      chiudiSheet();
      setTimeout(() => apriSheet(`<h2>📝 Aggiornamento</h2>${campoData('u-data', 'Data', oggi())}${area('u-t', 'Com\'è andata', '', 'Es. migliorato dopo la fisioterapia')}<button class="btn" id="u-ok">Aggiungi</button>`, s2 => {
        $('#u-ok', s2).onclick = async () => {
          if (!val(s2, 'u-t')) return toast('Scrivi qualcosa');
          p.evoluzione = p.evoluzione || []; p.evoluzione.push({ data: val(s2, 'u-data') || oggi(), testo: val(s2, 'u-t') });
          await DB.salva('problemi', p); await dopoSalvataggio('Aggiornamento aggiunto ✅');
        };
      }), 60);
    };
  });
}

/* ---------- Farmaco ---------- */
function formFarmaco(f) {
  const nuovo = !f; f = f || { dal: oggi() };
  apriSheet(`<h2>💊 ${nuovo ? 'Annota un farmaco' : 'Farmaco'}</h2>
    ${campo('f-nome', 'Nome', f.nome, 'placeholder="Es. Tachipirina"')}
    <div class="f-row">${campo('f-dose', 'Dose', f.dose, 'placeholder="Es. 1000 mg"')}${campo('f-freq', 'Quando', f.frequenza, 'placeholder="Es. 2 volte al giorno"')}</div>
    <div class="f-row">${campoData('f-dal', 'Dal', f.dal)}${campoData('f-al', 'Al (vuoto = in corso)', f.al)}</div>
    ${campo('f-presc', 'Prescritto da', f.prescritto, 'placeholder="Facoltativo"')}
    ${S.d.problemi.length ? `<div class="f"><label>Per quale problematica</label><select id="f-prob"><option value="">—</option>${S.d.problemi.map(p => `<option value="${p.id}" ${f.problema === p.id ? 'selected' : ''}>${esc(p.titolo)}</option>`).join('')}</select></div>` : ''}
    ${area('f-note', 'Note', f.note, 'Indicazioni ricevute, effetti…')}
    <div class="btns">${nuovo ? '' : '<button class="btn danger" id="f-del">Elimina</button>'}<button class="btn" id="f-ok">Salva</button></div>`, sh => {
    $('#f-ok', sh).onclick = async () => {
      if (!val(sh, 'f-nome')) return toast('Scrivi il nome');
      Object.assign(f, { p: S.pid, nome: val(sh, 'f-nome'), dose: val(sh, 'f-dose'), frequenza: val(sh, 'f-freq'), dal: val(sh, 'f-dal'), al: val(sh, 'f-al'), prescritto: val(sh, 'f-presc'), problema: val(sh, 'f-prob'), note: val(sh, 'f-note') });
      await DB.salva('farmaci', f); await dopoSalvataggio('Farmaco salvato ✅');
    };
    if (!nuovo) $('#f-del', sh).onclick = async () => { if (await conferma('Eliminare questo farmaco?')) { await DB.elimina('farmaci', f.id); await dopoSalvataggio('Eliminato'); } };
  });
}

/* ---------- Documento libero ---------- */
function formDoc(d) {
  const nuovo = !d;
  if (!nuovo) {
    apriSheet(`<h2>📄 Documento</h2>${campo('d-tit', 'Titolo', d.titolo || d.nome)}${campoData('d-data', 'Data', d.data)}
      <button class="btn sec" id="d-apri">👁️ Apri</button>
      <div class="btns"><button class="btn danger" id="d-del">Elimina</button><button class="btn" id="d-ok">Salva</button></div>`, sh => {
      $('#d-apri', sh).onclick = () => apriDocumento(d);
      $('#d-ok', sh).onclick = async () => { d.titolo = val(sh, 'd-tit'); d.data = val(sh, 'd-data'); await DB.salva('documenti', d); await dopoSalvataggio('Salvato'); };
      $('#d-del', sh).onclick = async () => { if (await conferma('Eliminare questo documento?')) { await DB.elimina('documenti', d.id); await dopoSalvataggio('Eliminato'); } };
    });
    return;
  }
  apriSheet(`<h2>📄 Aggiungi documento</h2>
    ${campo('d-tit', 'Titolo', '', 'placeholder="Es. Tessera vaccinazioni, certificato…"')}${campoData('d-data', 'Data del documento', oggi())}
    <div class="f"><span class="lab">File</span><div class="files"></div></div>
    <p class="hint">Per un referto con valori usa "Esami" o collegalo a una visita: così finisce nello storico giusto.</p>
    <button class="btn" id="d-ok">Salva</button>`, sh => {
    const all = gestoreAllegati(sh, []);
    $('#d-ok', sh).onclick = async () => {
      if (!all.quanti) return toast('Allega almeno un file');
      const tit = val(sh, 'd-tit');
      await all.salva(null, val(sh, 'd-data') || oggi(), tit ? { titolo: tit } : {});
      await dopoSalvataggio('Documento salvato ✅');
    };
  });
}

/* ---------- Apertura elementi ---------- */
async function apri(k, id) {
  const m = { misura: 'misure', visita: 'visite', appuntamento: 'appuntamenti', esame: 'esami', problema: 'problemi', farmaco: 'farmaci' }[k];
  const r = S.d[m].find(x => x.id === id) || await DB.uno(m, id);
  if (!r) return toast('Elemento non trovato');
  if (S.sheetAperto) { chiudiSheet(); await new Promise(ok => setTimeout(ok, 60)); }
  ({ misura: () => formMisura(r.tipo, r), visita: () => dettaglioVisita(r), appuntamento: () => formApp(r), esame: () => dettaglioEsame(r), problema: () => dettaglioProblema(r), farmaco: () => formFarmaco(r) })[k]();
}

/* =========================================================
   IMPOSTAZIONI
   ========================================================= */
function formProfilo() {
  const p = S.profilo || {};
  let sesso = p.sesso || '';
  apriSheet(`<h2>👤 Profilo</h2>
    ${campo('pr-nome', 'Nome', p.nome)}
    <div class="f-row">${campo('pr-anno', 'Anno di nascita', p.anno, 'type="number" inputmode="numeric"')}${campo('pr-alt', 'Altezza (cm)', p.altezza, 'type="number" inputmode="numeric"')}</div>
    <div class="f"><span class="lab">Sesso</span><div class="seg" id="pr-sesso"><button data-v="M">Maschio</button><button data-v="F">Femmina</button><button data-v="">Non dire</button></div></div>
    <div class="alert info">👨‍👩‍👧 <b>Profili di famiglia</b>: con il collegamento al foglio Google potrai vedere anche i profili di mamma e Beatrice da qui.</div>
    <button class="btn" id="pr-ok">Salva</button>`, sh => {
    segmento($('#pr-sesso', sh), v => sesso = v, sesso);
    $('#pr-ok', sh).onclick = async () => {
      if (!val(sh, 'pr-nome')) return toast('Scrivi il nome');
      S.profilo = { ...p, id: S.pid, nome: val(sh, 'pr-nome'), anno: +val(sh, 'pr-anno') || null, altezza: +val(sh, 'pr-alt') || null, sesso };
      await DB.set('profilo:' + S.pid, S.profilo); await dopoSalvataggio('Profilo salvato ✅');
    };
  });
}

const TEMI = [['turchese', 'Turchese', 'linear-gradient(135deg,#14b8a6,#0ea5e9)'], ['viola', 'Viola', 'linear-gradient(135deg,#8b5cf6,#ec4899)'], ['notte', 'Notte', 'linear-gradient(135deg,#000,#06b6d4)'], ['chiaro', 'Chiaro', 'linear-gradient(135deg,#f3f6f9,#14b8a6)']];
function applicaTema(t) {
  document.documentElement.dataset.theme = t;
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  $('meta[name=theme-color]').setAttribute('content', bg || '#0b1117');
}
async function sceltaTema() {
  const cur = await DB.get('tema', 'turchese');
  apriSheet(`<h2>🎨 Tema</h2><div class="themes">${TEMI.map(([k, n, g]) => `<button class="theme-b ${k === cur ? 'on' : ''}" data-t="${k}"><i style="background:${g}"></i>${n}</button>`).join('')}</div>`, sh => {
    $$('[data-t]', sh).forEach(b => b.onclick = async () => {
      applicaTema(b.dataset.t); await DB.set('tema', b.dataset.t);
      $$('[data-t]', sh).forEach(x => x.classList.toggle('on', x === b));
    });
  });
}

function gestioneTipi() {
  apriSheet(`<h2>📏 Tipi di misura</h2>
    <p class="muted small">Attiva quelli che ti servono. Puoi anche crearne di nuovi con la tua unità e, se vuoi, un intervallo indicato dal tuo medico.</p>
    <div class="card"><div class="list">${REFS.TIPI_BASE.map(t => `<label class="item"><div class="item-ico">${t.icona}</div><div class="item-body"><div class="item-t">${t.nome}</div><div class="item-s">${t.campi.map(c => c.unita).filter(Boolean).join(' · ')}</div></div>
      <input type="checkbox" data-vis="${t.id}" ${S.visibili.includes(t.id) ? 'checked' : ''}></label>`).join('')}
      ${S.tipiCustom.map(t => `<div class="item"><div class="item-ico">${esc(t.icona || '📏')}</div><div class="item-body"><div class="item-t">${esc(t.nome)}</div><div class="item-s">${esc(t.unita || '')}${t.rifMin || t.rifMax ? ` · rif. ${esc(t.rifMin || '…')}–${esc(t.rifMax || '…')} (tuo)` : ''}</div></div><button class="btn-link" data-delt="${t.id}">Elimina</button></div>`).join('')}
    </div></div>
    <div class="sec-t">Crea un nuovo tipo</div>
    <div class="f-row">${campo('t-nome', 'Nome', '', 'placeholder="Es. Circonferenza vita"')}${campo('t-unita', 'Unità', '', 'placeholder="Es. cm"')}</div>
    <div class="f-row">${campo('t-min', 'Rif. minimo (facoltativo)', '', 'inputmode="decimal"')}${campo('t-max', 'Rif. massimo (facoltativo)', '', 'inputmode="decimal"')}</div>
    <p class="hint">Inserisci un intervallo solo se te l'ha indicato il medico o una fonte affidabile: l'app lo mostrerà come "intervallo tuo".</p>
    <button class="btn" id="t-ok">Crea</button>`, sh => {
    $$('[data-vis]', sh).forEach(c => c.onchange = async () => {
      const vis = $$('[data-vis]:checked', sh).map(x => x.dataset.vis);
      await DB.set('tipiVisibili', vis); await caricaDati(); render();
    });
    $$('[data-delt]', sh).forEach(b => b.onclick = async () => {
      const n = S.d.misure.filter(m => m.tipo === b.dataset.delt).length;
      if (!await conferma(n ? `Eliminare il tipo e le sue ${n} misure?` : 'Eliminare questo tipo?')) return;
      for (const m of S.d.misure.filter(m => m.tipo === b.dataset.delt)) await DB.elimina('misure', m.id);
      await DB.elimina('tipi', b.dataset.delt); await dopoSalvataggio('Eliminato');
    });
    $('#t-ok', sh).onclick = async () => {
      if (!val(sh, 't-nome')) return toast('Scrivi il nome');
      const t = { id: 'c_' + DB.uid(), nome: val(sh, 't-nome'), unita: val(sh, 't-unita'), rifMin: val(sh, 't-min').replace(',', '.'), rifMax: val(sh, 't-max').replace(',', '.'), icona: '📏' };
      await DB.salva('tipi', t); S.tipoMisura = t.id; await dopoSalvataggio('Tipo creato ✅');
    };
  });
}

function info() {
  apriSheet(`<h2>ℹ️ Fonti e informazioni</h2>
    <div class="card"><div class="card-t">❤️ Pressione</div><p class="small">Fasce secondo le <a href="${FONTI.esc2024.url}" target="_blank" rel="noopener">linee guida ESC 2024</a>:</p>
    <table class="tbl"><tr><th></th><th>Non elevata</th><th>Elevata</th><th>Ipertensione</th></tr>
    <tr><td>A casa</td><td>&lt;120/70</td><td>120/70–134/84</td><td>≥135/85</td></tr>
    <tr><td>Ambulatorio</td><td>&lt;120/70</td><td>120/70–139/89</td><td>≥140/90</td></tr></table>
    <p class="small muted">Conta la fascia più alta tra sistolica e diastolica. Da 180/110 in su va esclusa un'emergenza. Una misura singola non è una diagnosi.</p></div>
    <div class="card"><div class="card-t">⚖️ Peso</div><p class="small">BMI con le categorie dell'<a href="${FONTI.oms_bmi.url}" target="_blank" rel="noopener">OMS</a>: sotto 18,5 sottopeso · 18,5–24,9 normopeso · 25–29,9 sovrappeso · da 30 obesità. È un'indicazione generica.</p></div>
    <div class="card"><div class="card-t">🧪 Esami</div><p class="small">Ogni valore è confrontato solo con l'intervallo scritto sul suo referto. L'app non usa intervalli generici per gli esami: cambiano con laboratorio, metodo, età e sesso.</p></div>
    <div class="card"><div class="card-t">🔒 Dove sono i tuoi dati</div><p class="small">Tutto è salvato nel telefono, dentro l'app. Il file di backup è leggibile da chi può aprirlo: tienilo nel tuo Drive personale con la verifica in due passaggi attiva. Se cancelli i dati di Chrome i dati dell'app spariscono: per questo serve il backup.</p>
    <p class="small muted" id="i-spazio"></p></div>
    <p class="small muted" style="text-align:center">Cartella Salute ${VERSIONE} · non sostituisce il parere del medico.<br>In caso di urgenza chiama il 112.</p>`, async sh => {
    const sp = await DB.spazio(); const pers = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false;
    if (sp) $('#i-spazio', sh).textContent = `Spazio usato: ${(sp.usage / 1048576).toFixed(1)} MB · protezione dalla pulizia automatica: ${pers ? 'attiva ✅' : 'non concessa dal browser'}`;
  });
}

/* =========================================================
   BACKUP, RIPRISTINO, CSV
   ========================================================= */
const blobToDataURL = b => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ko; r.readAsDataURL(b); });
async function dataURLToBlob(u) { return (await fetch(u)).blob(); }

async function creaBackup() {
  const out = { app: 'cartella-salute', versione: 1, appVersione: VERSIONE, creato: new Date().toISOString(), dati: {} };
  for (const s of DB_STORES) {
    let rs = await DB.tutti(s);
    if (s === 'impostazioni') rs = rs.filter(r => r.k !== 'lock');
    if (s === 'documenti') rs = await Promise.all(rs.map(async d => { const { blob, ...r } = d; return { ...r, dataURL: blob ? await blobToDataURL(blob) : null }; }));
    out.dati[s] = rs;
  }
  return out;
}
function backupSheet() {
  apriSheet(`<h2>💾 Backup e ripristino</h2>
    <div class="card"><div class="card-t">Salva un backup</div><p class="small muted">Crea un unico file con tutti i dati, PDF e foto compresi. Poi scegli <b>Drive</b> per salvarlo lì.</p>
      <button class="btn" id="b-fai">💾 Crea backup e salvalo su Drive</button><p class="small muted" id="b-ult"></p></div>
    <div class="card"><div class="card-t">Ripristina</div><p class="small muted">Scegli un file di backup (es. da Drive). <b>Sostituisce</b> i dati attuali con quelli del backup. La sequenza di sblocco resta quella attuale.</p>
      <button class="btn sec" id="b-rip">♻️ Ripristina da un file</button><input type="file" id="b-file" accept="application/json,.json" hidden></div>
    <div class="alert info">💡 Consiglio: un backup ogni 2 settimane su Drive, e ogni tanto una copia anche sul PC o su una chiavetta.</div>`, async sh => {
    const u = await DB.get('ultimoBackup'); $('#b-ult', sh).textContent = u ? `Ultimo backup: ${fmtDO(u)}` : 'Nessun backup fatto finora.';
    $('#b-fai', sh).onclick = async () => {
      const b = $('#b-fai', sh); b.disabled = true; b.textContent = '⏳ Preparo il file…';
      try {
        const dati = await creaBackup();
        const nome = `CartellaSalute-backup-${oggi()}.json`;
        const file = new File([JSON.stringify(dati)], nome, { type: 'application/json' });
        const ok = await condividiFile(file, 'Backup Cartella Salute');
        if (ok) { await DB.set('ultimoBackup', new Date().toISOString()); toast('Backup creato ✅'); chiudiSheet(); render(); }
      } catch (e) { toast('Errore nel backup: ' + e.message); }
      b.disabled = false; b.textContent = '💾 Crea backup e salvalo su Drive';
    };
    $('#b-rip', sh).onclick = () => $('#b-file', sh).click();
    $('#b-file', sh).onchange = async ev => {
      const f = ev.target.files[0]; if (!f) return;
      try {
        const dati = JSON.parse(await f.text());
        if (dati.app !== 'cartella-salute' || !dati.dati) throw new Error('Non è un backup di Cartella Salute');
        const n = ['visite', 'esami', 'misure', 'documenti'].map(s => `${(dati.dati[s] || []).length} ${s}`).join(', ');
        if (!await conferma(`Backup del ${fmtDO(dati.creato)} con ${n}. Sostituire i dati attuali?`, 'Ripristina')) return;
        await ripristina(dati);
        await caricaDati(); S.profilo = await DB.get('profilo:' + S.pid, S.profilo);
        applicaTema(await DB.get('tema', 'turchese'));
        chiudiSheet(); await render(); toast('Dati ripristinati ✅');
      } catch (e) { toast('Ripristino non riuscito: ' + e.message, 3500); }
      ev.target.value = '';
    };
  });
}
async function ripristina(dati) {
  // controllo prima, poi sostituisco: se qualcosa non va non tocco niente
  const pronti = {};
  for (const s of DB_STORES) {
    const rs = dati.dati[s] || [];
    if (s === 'documenti') pronti[s] = await Promise.all(rs.map(async d => { const { dataURL, ...r } = d; return { ...r, blob: dataURL ? await dataURLToBlob(dataURL) : null }; }));
    else pronti[s] = rs.filter(r => !(s === 'impostazioni' && r.k === 'lock'));
  }
  for (const s of DB_STORES) {
    if (s === 'impostazioni') { for (const r of await DB.tutti(s)) if (r.k !== 'lock') await DB.elimina(s, r.k); }
    else await DB.svuota(s);
    for (const r of pronti[s]) await apriDB().then(db => new Promise((ok, ko) => { const t = db.transaction(s, 'readwrite'); t.objectStore(s).put(r); t.oncomplete = ok; t.onerror = () => ko(t.error); }));
  }
  urlCache.clear();
}

/* ---------- Import CSV dal misuratore di pressione ----------
   Riconosce le colonne dal nome (Systolic/Sistolica, Diastolic, Pulse/bpm, Time/Data, Note).
   Salta i doppioni: stessa misura salvata due volte a pochi minuti di distanza,
   oppure già presente nell'app. */
function parseCSV(testo) {
  const righe = testo.replace(/^﻿/, '').split(/\r?\n/).filter(r => r.trim());
  if (!righe.length) return [];
  const sep = (righe[0].match(/;/g) || []).length > (righe[0].match(/,/g) || []).length ? ';' : ',';
  const split = r => { const out = []; let cur = '', q = false; for (const ch of r) { if (ch === '"') q = !q; else if (ch === sep && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map(x => x.trim()); };
  return righe.map(split);
}
function dataDaCSV(s) {
  s = String(s || '').trim();
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})[ T]+(\d{1,2}):(\d{2})/);
  if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}T${pad(+m[4])}:${m[5]}`;
  m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})[ T]+(\d{1,2}):(\d{2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}T${pad(+m[4])}:${m[5]}`;
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}T12:00`;
  return '';
}
/* Composizione corporea dalla bilancia: chiave, etichetta, unità, possibili nomi di colonna */
const COMPOSIZIONE = [
  ['grasso', 'Grasso corporeo', '%', /^(percentuale di grasso corporeo|body fat|grasso corporeo|fat)/],
  ['muscoli', 'Massa muscolare', 'kg', /^(massa muscolare\(|muscle mass)/],
  ['acqua', 'Acqua corporea', '%', /^(percentuale di acqua corporea|body water|water)/],
  ['viscerale', 'Grasso viscerale', '', /^(grasso viscerale|visceral)/],
  ['ossa', 'Massa ossea', 'kg', /^(massa ossea|bone mass)/],
  ['bmr', 'Metabolismo basale', 'kcal', /^(bmr|metabolismo basale)/]
];
function misureDaCSV(testo, esistenti) {
  const R = parseCSV(testo); if (R.length < 2) return { tipo: null, nuove: [], doppie: 0, scartate: 0 };
  const h = R[0].map(norm);
  const col = re => h.findIndex(x => re.test(x));
  const cDate = col(/^(data|date|giorno)\b/), cTime = col(/^(tempo|ora|time|orario)\b/), cN = col(/^(note|osservazioni)/);
  if (cDate < 0 && cTime < 0) throw new Error('Non trovo la colonna con la data');
  const quando = r => dataDaCSV(cDate >= 0 && cTime >= 0 && cDate !== cTime ? `${r[cDate]} ${r[cTime]}` : r[cDate >= 0 ? cDate : cTime]);
  const cS = col(/^(sys|systol|sistol)/), cD = col(/^(dia|diastol)/);
  const cKg = col(/^(peso|weight)(\s*\(kg\))?$/);
  const nuove = []; let doppie = 0, scartate = 0;
  let tipo, vicino, leggi;
  if (cS >= 0 && cD >= 0) {
    tipo = 'pressione';
    const cP = col(/^(pulse|bpm|polso|battito|fc|freq|heart)/);
    vicino = (a, b) => a.v.sis === b.v.sis && a.v.dia === b.v.dia && Math.abs(parseD(a.data) - parseD(b.data)) <= 5 * 60000;
    leggi = r => {
      const sis = num(r[cS]), dia = num(r[cD]), fc = cP >= 0 ? num(r[cP]) : NaN;
      if (!isFinite(sis) || !isFinite(dia) || sis < 50 || sis > 260 || dia < 30 || dia > 160 || sis <= dia) return null;
      return { v: { sis, dia, ...(isFinite(fc) && fc > 0 ? { fc } : {}) }, contesto: 'casa', origine: 'misuratore' };
    };
  } else if (cKg >= 0) {
    tipo = 'peso';
    const cc = COMPOSIZIONE.map(([k, , , re]) => [k, col(re)]).filter(([, i]) => i >= 0);
    // la bilancia salva spesso la stessa pesata più volte di fila: pesate entro 10 minuti (differenza < 1 kg) = una sola, la più completa
    vicino = (a, b) => Math.abs(a.v.kg - b.v.kg) < 1 && Math.abs(parseD(a.data) - parseD(b.data)) <= 10 * 60000;
    leggi = r => {
      const kg = num(r[cKg]);
      if (!isFinite(kg) || kg < 20 || kg > 300) return null;
      const v = { kg };
      for (const [k, i] of cc) { const x = num(r[i]); if (isFinite(x) && x > 0) v[k] = x; }
      return { v, origine: 'bilancia' };
    };
  } else throw new Error('Non riconosco il file: servono le colonne della pressione (sistolica/diastolica) o del peso');
  for (const r of R.slice(1)) {
    const data = quando(r), base = data && leggi(r);
    if (!base) { scartate++; continue; }
    const m = { tipo, data, note: cN >= 0 ? (r[cN] || '').replace(/^-+$/, '') : '', ...base };
    if (esistenti.some(e => e.tipo === tipo && vicino(e, m))) { doppie++; continue; }
    const gemella = nuove.find(n => vicino(n, m));
    if (gemella) {
      doppie++;
      // tengo la versione più completa (con la composizione corporea)
      if (Object.keys(m.v).length > Object.keys(gemella.v).length) Object.assign(gemella, m);
      continue;
    }
    nuove.push(m);
  }
  nuove.sort((a, b) => b.data.localeCompare(a.data));
  return { tipo, nuove, doppie, scartate };
}
function importaMisuratore() {
  apriSheet(`<h2>📥 Importa da misuratore o bilancia</h2>
    <p class="muted small">Scegli il file CSV esportato dall'app del misuratore di pressione o della bilancia (es. RENPHO). L'app riconosce da sola il tipo e salta le misure doppie.</p>
    <button class="btn" id="im-file">📂 Scegli il file CSV</button><input type="file" id="im-in" accept=".csv,text/csv,text/plain" hidden>
    <div id="im-res"></div>`, sh => {
    $('#im-file', sh).onclick = () => $('#im-in', sh).click();
    $('#im-in', sh).onchange = async ev => {
      const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
      const res = $('#im-res', sh);
      try {
        const { tipo, nuove, doppie, scartate } = misureDaCSV(await f.text(), S.d.misure);
        if (!nuove.length) { res.innerHTML = `<div class="alert info">Nessuna misura nuova da importare${doppie ? ` (${doppie} già presenti o doppie)` : ''}.</div>`; return; }
        const pr = tipo === 'pressione';
        const riga = m => {
          if (pr) {
            const c = REFS.classificaPressione(m.v.sis, m.v.dia, 'casa');
            return `<div class="item"><div class="item-ico ${c.cls}"><span class="dot"></span></div><div class="item-body"><div class="item-t">${m.v.sis}/${m.v.dia}${m.v.fc ? ' · ' + m.v.fc + ' bpm' : ''}</div><div class="item-s">🏠 casa</div></div><div class="item-r">${fmtD(m.data)}<br>${fmtOra(m.data)}</div></div>`;
          }
          return `<div class="item"><div class="item-ico">⚖️</div><div class="item-body"><div class="item-t">${fmtN(m.v.kg, 2)} kg</div><div class="item-s">${m.v.grasso ? `grasso ${fmtN(m.v.grasso)}%` : 'solo peso'}${m.v.muscoli ? ` · muscoli ${fmtN(m.v.muscoli)} kg` : ''}</div></div><div class="item-r">${fmtD(m.data)}<br>${fmtOra(m.data)}</div></div>`;
        };
        res.innerHTML = `<div class="sec-t">${pr ? '❤️ Pressione' : '⚖️ Peso'} · ${nuove.length} misure nuove</div><div class="card"><div class="list">${nuove.map(riga).join('')}</div></div>
        ${doppie ? `<p class="small muted">Saltate ${doppie} doppie (salvate più volte di fila o già presenti).</p>` : ''}${scartate ? `<p class="small lv-check">Ignorate ${scartate} righe non valide.</p>` : ''}
        ${pr ? `<div class="f"><span class="lab">Dove sono state misurate?</span><div class="seg" id="im-ctx"><button data-v="casa">🏠 A casa</button><button data-v="ambulatorio">🏥 Dal medico</button></div></div>` : ''}
        <button class="btn" id="im-ok">Importa ${nuove.length} misure</button>`;
        let ctx = 'casa'; if (pr) segmento($('#im-ctx', sh), v => ctx = v, ctx);
        $('#im-ok', sh).onclick = async () => {
          for (const m of nuove) { if (pr) m.contesto = ctx; m.p = S.pid; await DB.salva('misure', m); }
          S.tipoMisura = tipo; S.periodo = 'tutto'; S.view = 'misure';
          await dopoSalvataggio(`${nuove.length} misure importate ✅`);
        };
      } catch (e) { res.innerHTML = `<div class="alert lv-warn">Non riesco a leggere il file: ${esc(e.message)}</div>`; }
    };
  });
}

async function esportaCSV() {
  const righe = [['Data', 'Ora', 'Tipo', 'Valore 1', 'Valore 2', 'Valore 3', 'Dove', 'Note']];
  const nf = x => x === undefined || x === '' ? '' : String(x).replace('.', ',');
  for (const m of [...S.d.misure].sort((a, b) => a.data.localeCompare(b.data))) {
    const T = tipo(m.tipo); const ks = T ? T.campi.map(c => c.k) : Object.keys(m.v);
    righe.push([fmtDb(m.data), m.data.length > 10 ? fmtOra(m.data) : '', T ? T.nome : m.tipo, ...[0, 1, 2].map(i => nf(m.v[ks[i]])), m.contesto || '', m.note || '']);
  }
  righe.push([]); righe.push(['Esami: data', 'Esame', 'Valore', 'Risultato', 'Unità', 'Rif. min', 'Rif. max', 'Laboratorio']);
  for (const e of [...S.d.esami].sort((a, b) => a.data.localeCompare(b.data))) for (const r of e.valori || []) righe.push([fmtDb(e.data), e.titolo, r.nome, r.v, r.unita, r.min, r.max, e.struttura || '']);
  const csv = '﻿' + righe.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  await condividiFile(new File([csv], `CartellaSalute-misure-${oggi()}.csv`, { type: 'text/csv' }), 'Misure Cartella Salute');
}

/* =========================================================
   PDF DI RIEPILOGO (stampa → salva come PDF)
   ========================================================= */
function riepilogoSheet() {
  const sez = [['profilo', '👤 Dati personali', true], ['problemi', '📋 Problematiche', true], ['farmaci', '💊 Farmaci', true], ['pressione', '❤️ Pressione', true],
    ['peso', '⚖️ Peso', true], ['visite', '🩺 Visite', true], ['vista', '👁️ Vista', true], ['esami', '🧪 Esami e valori', true], ['appuntamenti', '📅 Prossimi appuntamenti', false]];
  apriSheet(`<h2>📄 PDF di riepilogo</h2><p class="muted small">Scegli cosa mettere, poi nella schermata di stampa scegli <b>"Salva come PDF"</b>.</p>
    <div class="card">${sez.map(([k, l, on]) => `<label class="row" style="padding:8px 0"><input type="checkbox" name="rs" value="${k}" ${on ? 'checked' : ''}> ${l}</label>`).join('')}</div>
    <div class="f"><label>Periodo</label><select id="rs-per"><option value="tutto">Tutto</option><option value="365">Ultimo anno</option><option value="1095">Ultimi 3 anni</option></select></div>
    <label class="row small" style="padding:4px 0 10px"><input type="checkbox" id="rs-ris"> Includi anche le problematiche risolte</label>
    <label class="row small" style="padding:0 0 10px"><input type="checkbox" id="rs-note" checked> Includi le mie note personali</label>
    <button class="btn" id="rs-ok">📄 Crea il PDF</button>`, sh => {
    $('#rs-ok', sh).onclick = () => {
      const scelte = $$('input[name=rs]:checked', sh).map(x => x.value);
      generaRiepilogo(scelte, $('#rs-per', sh).value, $('#rs-ris', sh).checked, $('#rs-note', sh).checked);
    };
  });
}
function generaRiepilogo(sc, per, risolte, note) {
  const dentro = d => per === 'tutto' || (d && giorniFa(d) <= +per);
  const P = S.profilo || {};
  let h = `<h1>Riepilogo sanitario — ${esc(P.nome || '')}</h1><div class="pa-note">Creato il ${fmtDO(isoLoc())} con Cartella Salute · ${per === 'tutto' ? 'tutto lo storico' : per === '365' ? 'ultimo anno' : 'ultimi 3 anni'}. Documento personale, non sostituisce il parere del medico.</div>`;
  if (sc.includes('profilo')) h += `<h2>Dati personali</h2><table><tr><th>Nome</th><td>${esc(P.nome || '')}</td><th>Anno di nascita</th><td>${esc(P.anno || '—')}</td></tr><tr><th>Sesso</th><td>${P.sesso === 'M' ? 'Maschio' : P.sesso === 'F' ? 'Femmina' : '—'}</td><th>Altezza</th><td>${P.altezza ? P.altezza + ' cm' : '—'}</td></tr></table>`;
  if (sc.includes('problemi')) {
    const l = S.d.problemi.filter(p => risolte || p.stato !== 'risolta');
    h += `<h2>Problematiche</h2>${l.length ? `<table><tr><th>Problematica</th><th>Stato</th><th>Dal</th><th>Cosa sappiamo</th>${note ? '<th>Note personali</th>' : ''}</tr>${l.map(p => `<tr><td>${esc(p.titolo)}</td><td>${STATI_PROB[p.stato || 'attiva'][0]}</td><td>${fmtDb(p.inizio) || '—'}</td><td>${esc(p.descrizione || '')}</td>${note ? `<td>${esc(p.note || '')}</td>` : ''}</tr>`).join('')}</table>` : '<p>Nessuna.</p>'}`;
  }
  if (sc.includes('farmaci')) {
    const l = S.d.farmaci.filter(f => !f.al || f.al >= oggi() || dentro(f.al));
    h += `<h2>Farmaci</h2>${l.length ? `<table><tr><th>Farmaco</th><th>Dose</th><th>Quando</th><th>Dal</th><th>Al</th><th>Prescritto da</th></tr>${l.map(f => `<tr><td>${esc(f.nome)}</td><td>${esc(f.dose || '')}</td><td>${esc(f.frequenza || '')}</td><td>${fmtDb(f.dal)}</td><td>${f.al ? fmtDb(f.al) : 'in corso'}</td><td>${esc(f.prescritto || '')}</td></tr>`).join('')}</table>` : '<p>Nessuno.</p>'}`;
  }
  if (sc.includes('pressione')) {
    const l = misureDi('pressione').filter(m => dentro(m.data));
    const casa = l.filter(m => m.contesto !== 'ambulatorio'), med = mediaPressione(casa);
    h += `<h2>Pressione arteriosa</h2>${l.length ? `${med ? `<p>Media misure a casa nel periodo: <b>${med.sis}/${med.dia} mmHg</b>${isFinite(med.fc) && med.fc ? ` · FC media ${med.fc} bpm` : ''} (${med.n} misure).</p>` : ''}
      <table><tr><th>Data</th><th>Sistolica</th><th>Diastolica</th><th>FC</th><th>Dove</th>${note ? '<th>Note</th>' : ''}</tr>${l.slice(0, 40).map(m => `<tr><td>${fmtDO(m.data)}</td><td>${m.v.sis}</td><td>${m.v.dia}</td><td>${m.v.fc || ''}</td><td>${m.contesto === 'ambulatorio' ? 'Ambulatorio' : 'Casa'}</td>${note ? `<td>${esc(m.note || '')}</td>` : ''}</tr>`).join('')}</table>${l.length > 40 ? `<p class="pa-note">Mostrate le ultime 40 di ${l.length} misure.</p>` : ''}` : '<p>Nessuna misura nel periodo.</p>'}`;
  }
  if (sc.includes('peso')) {
    const l = misureDi('peso').filter(m => dentro(m.data));
    h += `<h2>Peso</h2>${l.length ? `<table><tr><th>Data</th><th>Peso</th><th>BMI</th></tr>${l.slice(0, 30).map(m => { const c = REFS.classificaBMI(+m.v.kg, +P.altezza); return `<tr><td>${fmtDb(m.data)}</td><td>${fmtN(+m.v.kg)} kg</td><td>${c.bmi ? fmtN(c.bmi) : '—'}</td></tr>`; }).join('')}</table>` : '<p>Nessun dato nel periodo.</p>'}`;
  }
  if (sc.includes('visite')) {
    const l = [...S.d.visite].filter(v => dentro(v.data)).sort(byData('data'));
    h += `<h2>Visite</h2>${l.length ? `<table><tr><th>Data</th><th>Specialista</th><th>Medico / struttura</th><th>Motivo</th><th>Cosa ha detto il medico</th>${note ? '<th>Note personali</th>' : ''}</tr>${l.map(v => `<tr><td>${fmtDb(v.data)}</td><td>${esc(v.specialita || '')}</td><td>${esc([v.medico, v.struttura].filter(Boolean).join(' · '))}</td><td>${esc(v.motivo || '')}</td><td>${esc(v.esito || '')}</td>${note ? `<td>${esc(v.note || '')}</td>` : ''}</tr>`).join('')}</table>` : '<p>Nessuna visita nel periodo.</p>'}`;
  }
  if (sc.includes('vista')) {
    const l = S.d.visite.filter(v => isOculista(v.specialita) && v.vista && Object.keys(v.vista).length && dentro(v.data)).sort(byData('data'));
    if (l.length) h += `<h2>Vista</h2><table><tr><th>Data</th><th>OD nat.</th><th>OS nat.</th><th>OD corr.</th><th>OS corr.</th><th>OD sfera/cil/asse</th><th>OS sfera/cil/asse</th><th>Tono OD/OS</th></tr>${l.map(v => { const x = v.vista; return `<tr><td>${fmtDb(v.data)}</td><td>${esc(x.odNat || '')}</td><td>${esc(x.osNat || '')}</td><td>${esc(x.odCorr || '')}</td><td>${esc(x.osCorr || '')}</td><td>${esc([x.odSfera, x.odCil, x.odAsse].filter(Boolean).join(' / '))}</td><td>${esc([x.osSfera, x.osCil, x.osAsse].filter(Boolean).join(' / '))}</td><td>${esc([x.odTono, x.osTono].filter(Boolean).join(' / '))}</td></tr>`; }).join('')}</table><p class="pa-note">Decimi di acuità visiva (x/10), diottrie, mmHg.</p>`;
  }
  if (sc.includes('esami')) {
    const l = [...S.d.esami].filter(e => dentro(e.data)).sort(byData('data'));
    h += `<h2>Esami</h2>${l.length ? l.map(e => `<p><b>${fmtDb(e.data)} — ${esc(e.titolo || 'Esame')}</b>${e.struttura ? ' · ' + esc(e.struttura) : ''}</p>${(e.valori || []).length ? `<table><tr><th>Valore</th><th>Risultato</th><th>Unità</th><th>Intervallo laboratorio</th><th></th></tr>${e.valori.map(r => { const c = REFS.classificaValoreEsame(num(r.v), num(r.min), num(r.max)); return `<tr><td>${esc(r.nome)}</td><td><b>${esc(r.v)}</b></td><td>${esc(r.unita || '')}</td><td>${r.min || r.max ? `${esc(r.min || '…')} – ${esc(r.max || '…')}` : '—'}</td><td>${c.livello === 'check' ? 'fuori intervallo' : ''}</td></tr>`; }).join('')}</table>` : '<p class="pa-note">Solo documento allegato.</p>'}`).join('') : '<p>Nessun esame nel periodo.</p>'}`;
  }
  if (sc.includes('appuntamenti')) {
    const l = prossimiControlli().filter(x => !x.scaduto);
    h += `<h2>Prossimi appuntamenti e controlli</h2>${l.length ? `<table><tr><th>Data</th><th>Cosa</th><th>Dettagli</th></tr>${l.map(x => `<tr><td>${fmtDb(x.data)} ${x.ora || ''}</td><td>${esc(x.t)}</td><td>${esc(x.s)}</td></tr>`).join('')}</table>` : '<p>Nessuno.</p>'}`;
  }
  let pa = $('#print-area');
  if (!pa) { pa = document.createElement('div'); pa.id = 'print-area'; document.body.appendChild(pa); }
  pa.innerHTML = h;
  const vecchioTitolo = document.title;
  document.title = `Riepilogo sanitario ${P.nome || ''} ${oggi()}`;
  setTimeout(() => { window.print(); document.title = vecchioTitolo; }, 100);
}

/* =========================================================
   MENU "NUOVO" E AZIONI
   ========================================================= */
function menuNuovo() {
  const voci = [
    ...S.tipi.map(t => [`nuovaMisura`, t.icona, t.nome, t.id]),
    ['nuovaVisita', '🩺', 'Visita'], ['nuovoApp', '📅', 'Appuntamento'], ['nuovoEsame', '🧪', 'Referto / esame'],
    ['nuovoProblema', '📋', 'Problematica'], ['nuovoFarmaco', '💊', 'Farmaco'], ['nuovoDoc', '📄', 'Documento']
  ];
  apriSheet(`<h2>Cosa vuoi aggiungere?</h2><div class="grid2">${voci.map(([a, i, t, tp]) => `<button class="card card-tap" style="text-align:left;margin:0" data-act="${a}" ${tp ? `data-tipo="${tp}"` : ''}><div style="font-size:24px">${i}</div><div class="card-t">${esc(t)}</div></button>`).join('')}</div>`);
}

const AZIONI = {
  nuovo: menuNuovo,
  cerca: () => vai('cerca'),
  profili: formProfilo,
  profilo: formProfilo,
  temi: sceltaTema,
  gestTipi: gestioneTipi,
  info,
  backup: backupSheet,
  csv: esportaCSV,
  importa: importaMisuratore,
  riepilogo: riepilogoSheet,
  sequenza: () => impostaSequenza(false, () => {}),
  andamentoVista,
  vaiMisura: el => { S.tipoMisura = el.dataset.tipo; vai('misure'); },
  tipoMis: el => { S.tipoMisura = el.dataset.tipo; render(); },
  periodo: el => { S.periodo = el.dataset.p; render(); },
  visTab: el => { S.visiteTab = el.dataset.v; render(); },
  nuovaMisura: el => formMisura(el.dataset.tipo || 'pressione'),
  nuovaVisita: () => formVisita(),
  nuovoApp: () => formApp(),
  nuovoEsame: () => formEsame(),
  nuovoProblema: () => formProblema(),
  nuovoFarmaco: () => formFarmaco(),
  nuovoDoc: () => formDoc(),
  apri: el => apri(el.dataset.k, el.dataset.id),
  valore: el => { if (S.sheetAperto) { chiudiSheet(); setTimeout(() => dettaglioValore(el.dataset.k), 60); } else dettaglioValore(el.dataset.k); }
};

document.addEventListener('click', async e => {
  const doc = e.target.closest('[data-doc]');
  if (doc && !e.target.closest('.x')) {
    const d = S.d.documenti.find(x => x.id === doc.dataset.doc);
    if (d) { S.view === 'documenti' && !S.sheetAperto ? formDoc(d) : apriDocumento(d); }
    return;
  }
  const nav = e.target.closest('[data-nav]');
  if (nav) { if (S.sheetAperto) chiudiSheet(); return vai(nav.dataset.nav); }
  const go = e.target.closest('[data-nav-go]');
  if (go) { if (S.sheetAperto) chiudiSheet(); return vai(go.dataset.navGo); }
  const act = e.target.closest('[data-act]');
  if (act && AZIONI[act.dataset.act]) {
    e.preventDefault();
    const a = act.dataset.act;
    const apreForm = /^nuov|apri|valore/.test(a);
    if (S.sheetAperto && apreForm && a !== 'apri' && a !== 'valore') { chiudiSheet(); await new Promise(ok => setTimeout(ok, 60)); }
    AZIONI[a](act);
  }
});

/* =========================================================
   AVVIO
   ========================================================= */
async function entra() {
  S.profilo = await DB.get('profilo:' + S.pid, null);
  await caricaDati();
  await render();
  DB.persistente();
}
document.addEventListener('visibilitychange', async () => {
  if (document.hidden) { S.nascostaDa = Date.now(); return; }
  if (S.nascostaDa && Date.now() - S.nascostaDa > 90000 && !S.bloccato && await DB.get('lock')) mostraLock();
});

(async function avvio() {
  applicaTema(await DB.get('tema', 'turchese'));
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  const lk = await DB.get('lock');
  if (!lk) {
    const prof = await DB.get('profilo:io');
    if (prof) impostaSequenza(false, null); else primoAvvio();
  } else mostraLock();
})();

window.__TEST__ = { S, estraiValori, estraiData, REFS, creaBackup, ripristina, caricaDati, render };
