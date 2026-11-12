'use strict';
/* Dream On Work — gestion des morceaux, musiciens et sets d'un groupe. Données locales (localStorage + IndexedDB). */

// ---------- Utilitaires ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const today = () => new Date().toLocaleDateString('sv-SE'); // AAAA-MM-JJ local
const norm = s => String(s ?? '').trim().toLowerCase();
const splitList = (s, sep = /[,;|]/) => String(s ?? '').split(sep).map(x => x.trim()).filter(Boolean);
function fmtDate(d, short) {
  if (!d) return '';
  const dt = new Date(d + 'T00:00');
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('fr-FR', short ? { day: 'numeric', month: 'short', year: 'numeric' } : { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function safeUrl(u) {
  u = String(u ?? '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return ''; // autre schéma (javascript:, data:…) refusé
  return 'https://' + u;
}
const link = (u, label) => { const s = safeUrl(u); return s ? `<a href="${esc(s)}" target="_blank" rel="noopener">${esc(label || u)}</a>` : esc(label || u); };

// ---------- Données ----------
// Clé de stockage : à terme, une clé par nom de groupe (multi-groupes).
const KEY = 'dow:v1:data';
const TYPES = { repetition: 'Répétition', live: 'Live' };

function seed() {
  const m = (id, firstName, instruments, guest = false) => ({ id, firstName, instruments, birthDate: '', photo: '', guest });
  return {
    version: 1,
    band: { name: 'Dream On', logo: '', background: '', website: 'https://dreamonmusic.com', facebook: '', instagram: '', video: '' },
    musicians: [
      m('m-valerie', 'Valérie', ['chant lead', 'chant', 'piano', 'flûte', 'tambourin']),
      m('m-alex', 'Alex', ['chant lead', 'chant', 'piano', 'guitare acoustique', 'guitare électrique', 'harmonica', 'basse']),
      m('m-sylvain', 'Sylvain', ['basse', 'guitare', 'chant']),
      m('m-francis', 'Francis', ['batterie']),
      m('m-yann', 'Yann', ['guitare électrique', 'piano', 'chant']),
      m('m-arthur', 'Arthur', ['saxophone'], true),
    ],
    songs: structuredClone(SEED_SONGS),
    sets: structuredClone(SEED_SETS),
    seedVersion: SEED_VERSION,
  };
}
function normalize(d) {
  const s = seed();
  d = d && typeof d === 'object' ? d : {};
  const out = { version: 1, seedVersion: d.seedVersion || 0, band: { ...s.band, ...(d.band || {}) }, musicians: [], songs: [], sets: [] };
  for (const m of Array.isArray(d.musicians) ? d.musicians : s.musicians)
    out.musicians.push({ id: m.id || uid(), firstName: m.firstName || '', instruments: Array.isArray(m.instruments) ? m.instruments : [], birthDate: m.birthDate || '', photo: m.photo || '', guest: !!m.guest });
  for (const x of Array.isArray(d.songs) ? d.songs : [])
    out.songs.push({ id: x.id || uid(), title: x.title || '', author: x.author || '', tempo: x.tempo || '', key: x.key || '', capo: x.capo || '', entryOrder: x.entryOrder || '', lead: x.lead || '', singer2: x.singer2 || '', solos: x.solos || '', remarks: x.remarks || '', parts: x.parts && typeof x.parts === 'object' ? x.parts : {}, videos: x.videos || [], scores: x.scores || [], recordings: x.recordings || [] });
  for (const x of Array.isArray(d.sets) ? d.sets : [])
    out.sets.push({ id: x.id || uid(), name: x.name || '', date: x.date || '', type: x.type === 'live' ? 'live' : 'repetition', musicianIds: x.musicianIds || [], songIds: x.songIds || [], remarks: x.remarks || '', recordings: x.recordings || [], photos: x.photos || [] });
  return out;
}
let state;
try { state = normalize(JSON.parse(localStorage.getItem(KEY))); } catch { state = seed(); }
if (!localStorage.getItem(KEY)) state = seed();
// Ancienne adresse par défaut (.fr) corrigée en .com sur les appareils déjà utilisés.
if (state.band.website === 'https://DreamOnMusic.fr') { state.band.website = 'https://dreamonmusic.com'; localStorage.setItem(KEY, JSON.stringify(state)); }
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { alert("Enregistrement impossible : l'espace de stockage de l'appareil est plein."); }
}
// Répertoire de départ : ajouté une seule fois aux appareils déjà utilisés (sans doublon de titre).
function addSeedData() {
  if (state.seedVersion >= SEED_VERSION) return;
  const fresh = normalize({ musicians: [], songs: SEED_SONGS, sets: SEED_SETS });
  const idMap = {};
  for (const x of fresh.songs) {
    const same = state.songs.find(y => y.id === x.id || norm(y.title) === norm(x.title));
    if (same) idMap[x.id] = same.id; else state.songs.push(x);
  }
  for (const t of fresh.sets) {
    if (state.sets.some(y => y.id === t.id)) continue;
    t.songIds = t.songIds.map(id => idMap[id] || id);
    t.musicianIds = t.musicianIds.filter(musician);
    state.sets.push(t);
  }
  state.seedVersion = SEED_VERSION;
  save();
}
let me = localStorage.getItem('dow:me') || '';

const musician = id => state.musicians.find(m => m.id === id);
const mName = id => musician(id)?.firstName || '';
const song = id => state.songs.find(s => s.id === id);
const keyLabel = s => s.key ? s.key + (s.capo ? ` (capo ${s.capo})` : '') : (s.capo ? `(capo ${s.capo})` : '');
const part = (s, mid) => s.parts[mid] || { instruments: [], note: '' };
// Pictogramme placé devant chaque instrument.
const ICONS = [[/chant|voix|ch(o|œ)ur/, '🎤'], [/piano|clavier|orgue|synth/, '🎹'], [/batterie|drum/, '🥁'], [/sax/, '🎷'], [/trompette|trombone|cuivre/, '🎺'],
  [/violon|alto|contrebasse/, '🎻'], [/accord[ée]on/, '🪗'], [/banjo/, '🪕'], [/tambourin|percu|cajon|conga|djemb/, '🪘'], [/guitare|basse|ukul/, '🎸'], [/fl[uû]te|harmonica/, '🎶']];
const iconOf = n => (ICONS.find(([re]) => re.test(norm(n))) || [0, '🎵'])[1];
const withIcon = n => iconOf(n) + '\u00a0' + n;
const instText = list => list.map(withIcon).join(', ');
const partLabel = (s, mid) => { const p = part(s, mid); return [instText(p.instruments), p.note].filter(Boolean).join(' — '); };
// Ligne « qui joue quoi » : pictogrammes des instruments suivis du prénom, pour chaque musicien du morceau.
const lineup = s => {
  const icons = m => [...new Set([...(s.lead === m.id || s.singer2 === m.id ? ['🎤'] : []), ...part(s, m.id).instruments.map(iconOf)])].join('');
  const l = state.musicians.filter(icons).map(m => `<span class="who${m.id === me ? ' me' : ''}">${icons(m)}\u00a0${esc(m.firstName)}</span>`).join(' ');
  return l ? `<div class="lineup">${l}</div>` : '';
};
const voices = s => [s.lead && mName(s.lead), s.singer2 && mName(s.singer2)].filter(Boolean).join(' / ');
addSeedData();

// ---------- Fichiers (IndexedDB) ----------
let dbp;
function db() {
  return dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open('dow-files', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idb(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction('files', mode);
    const rq = fn(tx.objectStore('files'));
    tx.oncomplete = () => res(rq?.result);
    tx.onerror = tx.onabort = () => rej(tx.error);
  });
}
const filePut = (id, blob) => idb('readwrite', s => s.put(blob, id));
const fileGet = id => idb('readonly', s => s.get(id));
const fileDel = id => idb('readwrite', s => s.delete(id));
const fileKeys = () => idb('readonly', s => s.getAllKeys());
const fileClear = () => idb('readwrite', s => s.clear());
const urlCache = new Map();
async function fileUrl(id) {
  if (!urlCache.has(id)) {
    const b = await fileGet(id);
    if (!b) return '';
    urlCache.set(id, URL.createObjectURL(b));
  }
  return urlCache.get(id);
}
function hydrateFiles(root = document) {
  for (const el of $$('[data-file]', root)) {
    fileUrl(el.dataset.file).then(u => { if (u) el[el.tagName === 'A' ? 'href' : 'src'] = u; }).catch(() => {});
  }
}
const blobToDataUrl = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
async function resizeImage(file, max, type = 'image/jpeg') {
  const src = await blobToDataUrl(file);
  if (file.type === 'image/svg+xml') return src;
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('Image illisible')); img.src = src; });
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL(type, 0.85);
}
function dropFiles(owner) {
  for (const l of ['videos', 'scores', 'recordings', 'photos'])
    for (const a of owner[l] || []) if (a.fileId) fileDel(a.fileId).catch(() => {});
}

// ---------- Dialogue générique ----------
const dlg = $('#dlg');
let dlgSubmit = null;
function openDialog({ title, body, onSubmit, ok = 'Enregistrer' }) {
  $('#dlg-title').textContent = title;
  $('#dlg-body').innerHTML = body;
  $('#dlg-ok').textContent = ok;
  dlgSubmit = onSubmit;
  dlg.showModal();
  dlg.scrollTop = 0;
}
$('#dlg-form').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const keep = await dlgSubmit(new FormData(e.target), e.target);
    if (keep === false) return;
    dlg.close();
    save();
    render();
  } catch (err) { alert('Erreur : ' + err.message); }
});
const field = (label, name, value = '', attrs = '') => `<label class="f">${label}<input name="${name}" value="${esc(value)}" ${attrs}></label>`;
const area = (label, name, value = '') => `<label class="f">${label}<textarea name="${name}">${esc(value)}</textarea></label>`;
const selectMusician = (label, name, value) => `<label class="f">${label}<select name="${name}"><option value="">—</option>${state.musicians.map(m => `<option value="${m.id}" ${m.id === value ? 'selected' : ''}>${esc(m.firstName)}</option>`).join('')}</select></label>`;

// ---------- Rendu ----------
const view = $('#view');
function route() {
  const [, page = 'sets', id] = location.hash.split('/');
  return { page, id };
}
function render() {
  const { page, id } = route();
  $('#brand-name').textContent = state.band.name || 'Mon groupe';
  $('#brand-logo').src = state.band.logo || 'icon.svg';
  $('.top').style.backgroundImage = state.band.background ? `linear-gradient(rgba(20,14,40,.72), rgba(20,14,40,.72)), url("${state.band.background}")` : '';
  document.title = (state.band.name || 'Groupe') + ' — Work';
  $('#me-select').innerHTML = `<option value="">—</option>` + state.musicians.map(m => `<option value="${m.id}" ${m.id === me ? 'selected' : ''}>${esc(m.firstName)}</option>`).join('');
  const tab = { sets: 'set', songs: 'song' }[page] || page;
  $$('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
  const pages = { sets: vSets, set: vSet, songs: vSongs, song: vSong, musicians: vMusicians, band: vBand, data: vData };
  view.innerHTML = (pages[page] || vSets)(id);
  hydrateFiles(view);
  const q = $('#song-search');
  if (q) q.addEventListener('input', () => filterList(q.value, '#song-list > *'));
}
function filterList(q, sel, root = document) {
  q = norm(q);
  for (const el of $$(sel, root)) el.hidden = !!q && !norm(el.textContent).includes(q);
}

// --- Sets
function vSets() {
  const t = today();
  const up = state.sets.filter(s => !s.date || s.date >= t).sort((a, b) => (a.date || '9').localeCompare(b.date || '9'));
  const past = state.sets.filter(s => s.date && s.date < t).sort((a, b) => b.date.localeCompare(a.date));
  const card = s => `<a class="card" href="#/set/${s.id}"><div class="row"><div class="grow">
      <h3>${esc(s.name)} <span class="badge ${s.type}">${TYPES[s.type]}</span></h3>
      <div class="muted">${esc(fmtDate(s.date)) || 'Date à définir'} · ${s.songIds.length} morceau${s.songIds.length > 1 ? 'x' : ''}</div>
    </div><span class="muted">›</span></div></a>`;
  return `<div class="head"><h1>Sets</h1><button class="btn primary" data-act="set-edit">+ Nouveau set</button></div>
    ${state.sets.length ? '' : `<div class="empty">Aucun set pour l'instant.<br>Créez la prochaine répétition ou le prochain concert, puis choisissez-y les morceaux.</div>`}
    ${up.length ? `<h2>À venir</h2>${up.map(card).join('')}` : ''}
    ${past.length ? `<h2>Passés</h2>${past.map(card).join('')}` : ''}`;
}
function vSet(id) {
  const s = state.sets.find(x => x.id === id);
  if (!s) return notFound('#/sets');
  const songs = s.songIds.map(song).filter(Boolean);
  const rows = songs.map((x, i) => `<div class="card set-row" data-song="${x.id}"><div class="row">
      <span class="grip" title="Glisser pour déplacer">⠿</span>
      <span class="num">${i + 1}</span>
      <a class="grow" href="#/song/${x.id}?set=${s.id}" style="text-decoration:none;color:inherit">
        <h3>${esc(x.title)}</h3>
        <div class="muted">${[x.author, keyLabel(x), x.tempo && x.tempo + ' bpm'].filter(Boolean).map(esc).join(' · ')}</div>
        ${lineup(x)}
        ${me && part(x, me).note ? `<div class="mine">${esc(mName(me))} : ${esc(part(x, me).note)}</div>` : ''}
      </a>
      <button class="icon" title="Monter" data-act="set-move" data-id="${s.id}" data-i="${i}" data-d="-1" ${i ? '' : 'disabled'}>▲</button>
      <button class="icon" title="Descendre" data-act="set-move" data-id="${s.id}" data-i="${i}" data-d="1" ${i < songs.length - 1 ? '' : 'disabled'}>▼</button>
      <button class="icon" title="Retirer du set" data-act="set-remove" data-id="${s.id}" data-i="${i}">✕</button>
    </div></div>`).join('');
  return `<a class="back" href="#/sets">‹ Sets</a>
    <div class="head"><div><h1>${esc(s.name)} <span class="badge ${s.type}">${TYPES[s.type]}</span></h1>
      <div class="muted">${esc(fmtDate(s.date)) || 'Date à définir'}</div></div>
      <div class="actions">
        <button class="btn primary" data-act="set-print" data-id="${s.id}">PDF</button>
        <button class="btn" data-act="set-edit" data-id="${s.id}">Modifier</button>
        <button class="btn" data-act="set-dup" data-id="${s.id}">Dupliquer</button>
        <button class="btn danger" data-act="set-del" data-id="${s.id}">Supprimer</button>
      </div></div>
    <div class="chips">${s.musicianIds.map(musician).filter(Boolean).map(m => `<span class="chip">${esc(m.firstName)}</span>`).join('') || '<span class="muted">Aucun musicien</span>'}</div>
    ${s.remarks ? `<p class="pre">${esc(s.remarks)}</p>` : ''}
    <div class="sec-head"><h2>Morceaux (${songs.length})</h2><button class="btn primary small" data-act="set-pick" data-id="${s.id}">Choisir les morceaux</button></div>
    <div id="set-songs" data-id="${s.id}">${rows || `<div class="empty">Aucun morceau sélectionné.</div>`}</div>
    ${attSection('Enregistrements', 'set:' + s.id, 'recordings', 'audio/*,video/*')}
    ${attSection('Photos', 'set:' + s.id, 'photos', 'image/*')}`;
}

// --- Morceaux
function vSongs() {
  const list = [...state.songs].sort((a, b) => a.title.localeCompare(b.title, 'fr'));
  return `<div class="head"><h1>Morceaux</h1><button class="btn primary" data-act="song-edit">+ Nouveau morceau</button></div>
    ${list.length ? `<input id="song-search" type="search" placeholder="Rechercher un morceau, un auteur…" style="margin-bottom:.75rem">` : `<div class="empty">Aucun morceau. Ajoutez le répertoire du groupe ici, ou importez un fichier CSV depuis l'onglet Données.</div>`}
    <div id="song-list">${list.map(x => `<a class="card" href="#/song/${x.id}"><div class="row"><div class="grow">
      <h3>${esc(x.title)}</h3>
      <div class="muted">${[x.author, keyLabel(x), x.tempo && x.tempo + ' bpm'].filter(Boolean).map(esc).join(' · ') || 'À compléter'}</div>
      ${lineup(x)}
      ${me && part(x, me).note ? `<div class="mine">${esc(mName(me))} : ${esc(part(x, me).note)}</div>` : ''}
    </div><span class="muted">›</span></div></a>`).join('')}</div>`;
}
function vSong(idq) {
  const [id, query] = String(idq || '').split('?');
  const x = song(id);
  if (!x) return notFound('#/songs');
  const fromSet = state.sets.find(s => s.id === new URLSearchParams(query || '').get('set'));
  const inSets = state.sets.filter(s => s.songIds.includes(x.id));
  const info = [['Auteur', x.author], ['Tempo', x.tempo && x.tempo + ' bpm'], ['Tonalité', keyLabel(x)], ["Ordre d'entrée", x.entryOrder],
    ['Chanteur lead', mName(x.lead)], ['Chanteur 2', mName(x.singer2)], ['Solos', x.solos]].filter(r => r[1]);
  const parts = state.musicians.filter(m => partLabel(x, m.id));
  return `<a class="back" href="${fromSet ? '#/set/' + fromSet.id : '#/songs'}">‹ ${fromSet ? esc(fromSet.name) : 'Morceaux'}</a>
    <div class="head"><h1>${esc(x.title)}</h1><div class="actions">
      <button class="btn primary" data-act="song-edit" data-id="${x.id}">Modifier</button>
      <button class="btn danger" data-act="song-del" data-id="${x.id}">Supprimer</button></div></div>
    <div class="card">${info.length ? `<dl class="info">${info.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : '<span class="muted">Fiche à compléter : tempo, tonalité, chanteurs…</span>'}</div>
    <h2>Instruments</h2>
    <div class="card">${parts.length ? `<div class="tablewrap"><table><tr><th>Musicien</th><th>Instruments</th><th>Note</th></tr>${parts.map(m => `<tr ${m.id === me ? 'class="mine"' : ''}><td>${esc(m.firstName)}</td><td>${esc(instText(part(x, m.id).instruments))}</td><td class="pre">${esc(part(x, m.id).note)}</td></tr>`).join('')}</table></div>` : '<span class="muted">Aucun instrument défini — cliquez sur Modifier.</span>'}</div>
    ${x.remarks ? `<h2>Remarques</h2><div class="card pre">${esc(x.remarks)}</div>` : ''}
    ${attSection('Liens vidéo', 'song:' + x.id, 'videos', 'video/*')}
    ${attSection('Partitions', 'song:' + x.id, 'scores', '.pdf,image/*,.txt,.gp,.gp5,.gpx,.musicxml,.mxl')}
    ${attSection('Enregistrements', 'song:' + x.id, 'recordings', 'audio/*,video/*')}
    ${inSets.length ? `<h2>Dans les sets</h2><div class="chips">${inSets.map(s => `<a class="chip" href="#/set/${s.id}">${esc(s.name)}${s.date ? ' · ' + esc(fmtDate(s.date, true)) : ''}</a>`).join('')}</div>` : ''}`;
}

// --- Musiciens
function vMusicians() {
  return `<div class="head"><h1>Musiciens</h1><button class="btn primary" data-act="mus-edit">+ Nouveau musicien</button></div>
    ${state.musicians.map(m => `<div class="card"><div class="row">
      ${m.photo ? `<img class="avatar" src="${esc(m.photo)}" alt="">` : `<span class="avatar">${esc(m.firstName.slice(0, 1).toUpperCase())}</span>`}
      <div class="grow"><h3>${esc(m.firstName)} ${m.guest ? '<span class="badge">Invité</span>' : ''}</h3>
        <div class="muted">${esc(instText(m.instruments)) || 'Aucun instrument'}</div>
        ${m.birthDate ? `<div class="muted">🎂 ${esc(fmtDate(m.birthDate, true))}</div>` : ''}</div>
      <button class="icon" title="Modifier" data-act="mus-edit" data-id="${m.id}">✎</button>
      <button class="icon" title="Supprimer" data-act="mus-del" data-id="${m.id}">🗑</button>
    </div></div>`).join('') || '<div class="empty">Aucun musicien.</div>'}
    <p class="muted">Les musiciens « invités » ne sont pas présélectionnés dans les nouveaux sets.</p>`;
}

// --- Groupe
function vBand() {
  const b = state.band;
  const rows = [['Site internet', b.website], ['Facebook', b.facebook], ['Instagram', b.instagram], ['Vidéo de présentation', b.video]];
  return `<div class="hero" ${b.background ? `style="background-image:linear-gradient(rgba(20,14,40,.15), rgba(20,14,40,.8)), url('${esc(b.background)}')"` : ''}>
      <img class="logo-big" src="${esc(b.logo || 'icon.svg')}" alt="Logo">
      <h1>${esc(b.name)}</h1>
    </div>
    <div class="head"><span class="muted">${b.background ? '' : "Ajoutez une image de fond et le logo du groupe avec « Modifier »."}</span><button class="btn primary" data-act="band-edit">Modifier</button></div>
    <div class="card"><dl class="info">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v ? link(v) : '<span class="muted">—</span>'}</dd>`).join('')}</dl></div>`;
}

// --- Données
function vData() {
  const v = (document.querySelector('script[src*="app.js"]')?.src.split('v=')[1] || '').replace('__V__', 'locale');
  return `<h1>Données</h1>
    <p class="muted">Les données sont enregistrées sur cet appareil et restent disponibles hors ligne. Pour les partager avec les autres musiciens ou les sauvegarder, exportez-les puis importez le fichier sur l'autre appareil.</p>
    <h2>Exporter</h2>
    <div class="card"><div class="actions">
      <button class="btn primary" data-act="exp-json">Tout (JSON, avec fichiers)</button>
      <button class="btn" data-act="exp-csv" data-id="songs">Morceaux (CSV)</button>
      <button class="btn" data-act="exp-csv" data-id="musicians">Musiciens (CSV)</button>
      <button class="btn" data-act="exp-csv" data-id="sets">Sets (CSV)</button>
    </div><p class="muted">Le JSON contient tout (groupe, musiciens, morceaux, sets, photos, partitions, enregistrements). Les CSV s'ouvrent dans un tableur ; ils ne contiennent pas les fichiers joints.</p></div>
    <h2>Importer</h2>
    <div class="card"><button class="btn primary" data-act="imp">Choisir un fichier JSON ou CSV…</button>
      <p class="muted">CSV : le type (morceaux, musiciens, sets) est reconnu d'après les colonnes. Les lignes existantes (même identifiant ou même nom) sont mises à jour, les autres ajoutées.</p></div>
    <h2>Réinitialiser</h2>
    <div class="card"><button class="btn danger" data-act="reset">Effacer toutes les données de cet appareil</button></div>
    <p class="muted">Version de l'application : ${esc(v)}</p>`;
}
const notFound = back => `<div class="empty">Élément introuvable. <a href="${back}">Retour</a></div>`;

// ---------- Pièces jointes (liens ou fichiers) ----------
const ownerOf = ref => { const [t, id] = ref.split(':'); return (t === 'song' ? state.songs : state.sets).find(x => x.id === id); };
function attSection(title, ref, list, accept) {
  const items = ownerOf(ref)[list] || [];
  const html = items.map(a => {
    const label = esc(a.label || a.fileName || a.url || 'Sans titre');
    const date = a.date ? ` <span class="muted">· ${esc(fmtDate(a.date, true))}</span>` : '';
    const mime = a.mime || '';
    let main;
    if (!a.fileId) main = `🔗 ${link(a.url, a.label || a.url)}${date}`;
    else if (mime.startsWith('audio/')) main = `🎵 <a data-file="${a.fileId}" download="${esc(a.fileName || 'audio')}">${label}</a>${date}<audio controls preload="none" data-file="${a.fileId}"></audio>`;
    else if (mime.startsWith('image/')) main = `<div class="row"><a data-file="${a.fileId}" target="_blank"><img class="thumb" data-file="${a.fileId}" alt=""></a><span>${label}${date}</span></div>`;
    else main = `📄 <a data-file="${a.fileId}" target="_blank">${label}</a>${date}`;
    return `<div class="att"><div class="grow">${main}</div>
      <button class="icon" title="Modifier" data-act="att-edit" data-ref="${ref}" data-list="${list}" data-id="${a.id}" data-accept="${esc(accept)}">✎</button>
      <button class="icon" title="Supprimer" data-act="att-del" data-ref="${ref}" data-list="${list}" data-id="${a.id}">🗑</button></div>`;
  }).join('');
  return `<div class="sec-head"><h2>${title}</h2><button class="btn small" data-act="att-edit" data-ref="${ref}" data-list="${list}" data-accept="${esc(accept)}">+ Ajouter</button></div>
    <div class="card">${html || '<span class="muted">Rien pour le moment.</span>'}</div>`;
}

// ---------- Actions ----------
const A = {
  'dlg-cancel': () => dlg.close(),

  // Sets
  'set-edit'(el) {
    const s = state.sets.find(x => x.id === el.dataset.id);
    const sel = s ? s.musicianIds : state.musicians.filter(m => !m.guest).map(m => m.id);
    openDialog({
      title: s ? 'Modifier le set' : 'Nouveau set',
      body: `${field('Nom', 'name', s?.name, 'required placeholder="Ex. Répétition du jeudi"')}
        <div class="grid2">${field('Date', 'date', s?.date ?? '', 'type="date"')}
        <label class="f">Type<select name="type">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${s?.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>
        <fieldset><legend>Musiciens</legend><div class="checks">${state.musicians.map(m => `<label><input type="checkbox" name="mus" value="${m.id}" ${sel.includes(m.id) ? 'checked' : ''}>${esc(m.firstName)}${m.guest ? ' (invité)' : ''}</label>`).join('')}</div></fieldset>
        ${area('Remarques', 'remarks', s?.remarks)}`,
      onSubmit(fd) {
        const t = s || { id: uid(), songIds: [], recordings: [], photos: [] };
        Object.assign(t, { name: fd.get('name').trim(), date: fd.get('date'), type: fd.get('type'), musicianIds: fd.getAll('mus'), remarks: fd.get('remarks').trim() });
        if (!s) { state.sets.push(t); location.hash = '#/set/' + t.id; }
      },
    });
  },
  'set-del'(el) {
    const s = state.sets.find(x => x.id === el.dataset.id);
    if (!confirm(`Supprimer le set « ${s.name} » ? (les morceaux sont conservés)`)) return;
    dropFiles(s);
    state.sets = state.sets.filter(x => x !== s);
    save(); location.hash = '#/sets';
  },
  'set-dup'(el) {
    const s = state.sets.find(x => x.id === el.dataset.id);
    const c = { ...s, id: uid(), name: s.name + ' (copie)', date: '', songIds: [...s.songIds], musicianIds: [...s.musicianIds], recordings: [], photos: [] };
    state.sets.push(c); save(); location.hash = '#/set/' + c.id;
  },
  'set-move'(el) {
    const s = state.sets.find(x => x.id === el.dataset.id), i = +el.dataset.i, j = i + +el.dataset.d;
    [s.songIds[i], s.songIds[j]] = [s.songIds[j], s.songIds[i]];
    save(); render();
  },
  'set-remove'(el) {
    state.sets.find(x => x.id === el.dataset.id).songIds.splice(+el.dataset.i, 1);
    save(); render();
  },
  'set-pick'(el) {
    const s = state.sets.find(x => x.id === el.dataset.id);
    s.songIds = s.songIds.filter(song);
    const list = [...state.songs].sort((a, b) => a.title.localeCompare(b.title, 'fr'));
    openDialog({
      title: 'Morceaux du set', ok: 'Valider',
      body: `<input type="search" id="pick-q" placeholder="Rechercher…">
        <div class="picklist">${list.map(x => `<label><input type="checkbox" name="song" value="${x.id}" ${s.songIds.includes(x.id) ? 'checked' : ''}><span>${esc(x.title)} <span class="muted">${esc([x.author, keyLabel(x)].filter(Boolean).join(' · '))}</span></span></label>`).join('') || '<label class="muted">Le répertoire est vide : créez un morceau ci-dessous.</label>'}</div>
        ${field('Ou créer un nouveau morceau et l\'ajouter', 'newTitle', '', 'placeholder="Titre du morceau"')}`,
      onSubmit(fd) {
        const picked = fd.getAll('song');
        s.songIds = [...s.songIds.filter(id => picked.includes(id)), ...picked.filter(id => !s.songIds.includes(id))];
        const t = fd.get('newTitle').trim();
        if (t) { const n = normalize({ songs: [{ title: t }] }).songs[0]; state.songs.push(n); s.songIds.push(n.id); }
      },
    });
    $('#pick-q').addEventListener('input', e => filterList(e.target.value, '.picklist label', dlg));
  },
  'set-print'(el) {
    const s = state.sets.find(x => x.id === el.dataset.id);
    const ms = s.musicianIds.map(musician).filter(Boolean);
    openDialog({
      title: 'Éditer le PDF', ok: 'Imprimer / PDF',
      body: `<label class="f">Fiche pour<select name="who"><option value="">Tout le groupe (fiche générale)</option>${ms.map(m => `<option value="${m.id}" ${m.id === me ? 'selected' : ''}>${esc(m.firstName)}</option>`).join('')}</select></label>
        <p class="muted">La fenêtre d'impression s'ouvre : choisissez « Enregistrer au format PDF » comme imprimante.</p>`,
      onSubmit(fd) { buildPrint(s, fd.get('who')); setTimeout(() => window.print(), 100); },
    });
  },

  // Morceaux
  'song-edit'(el) {
    const x = song(el.dataset.id);
    openDialog({
      title: x ? 'Modifier le morceau' : 'Nouveau morceau',
      body: `${field('Nom du morceau', 'title', x?.title, 'required')}
        ${field('Auteur', 'author', x?.author)}
        <div class="grid2">${field('Tempo (bpm)', 'tempo', x?.tempo, 'type="number" min="20" max="320" inputmode="numeric"')}
        ${field('Tonalité', 'key', x?.key, 'list="keys" placeholder="Ex. Am, F#, Bb"')}
        ${field('Capo (case)', 'capo', x?.capo, 'type="number" min="0" max="12" inputmode="numeric"')}
        ${field("Ordre d'entrée", 'entryOrder', x?.entryOrder, 'placeholder="Ex. batterie, puis guitare"')}
        ${selectMusician('Chanteur lead', 'lead', x?.lead)}
        ${selectMusician('Chanteur 2', 'singer2', x?.singer2)}</div>
        ${field('Solos', 'solos', x?.solos, 'placeholder="Ex. guitare Yann après le 2e refrain"')}
        <datalist id="keys">${'C,C#,Db,D,Eb,E,F,F#,G,Ab,A,Bb,B'.split(',').flatMap(k => [k, k + 'm']).map(k => `<option value="${k}">`).join('')}</datalist>
        <h2>Instruments par musicien</h2>
        ${state.musicians.map(m => { const p = x ? part(x, m.id) : { instruments: [], note: '' }; return `<fieldset><legend>${esc(m.firstName)}${m.guest ? ' (invité)' : ''}</legend>
          <div class="checks">${[...new Set([...m.instruments, ...p.instruments])].map(i => `<label><input type="checkbox" name="inst_${m.id}" value="${esc(i)}" ${p.instruments.includes(i) ? 'checked' : ''}>${esc(withIcon(i))}</label>`).join('') || '<span class="muted">Aucun instrument déclaré</span>'}</div>
          <input name="note_${m.id}" value="${esc(p.note)}" placeholder="Note (son, effet, accordage…)"></fieldset>`; }).join('')}
        ${area('Remarques', 'remarks', x?.remarks)}`,
      onSubmit(fd) {
        const t = x || normalize({ songs: [{}] }).songs[0];
        for (const k of ['title', 'author', 'tempo', 'key', 'capo', 'entryOrder', 'lead', 'singer2', 'solos', 'remarks']) t[k] = fd.get(k).trim();
        if (t.capo === '0') t.capo = '';
        t.parts = {};
        for (const m of state.musicians) {
          const instruments = fd.getAll('inst_' + m.id), note = fd.get('note_' + m.id).trim();
          if (instruments.length || note) t.parts[m.id] = { instruments, note };
        }
        if (!x) { state.songs.push(t); location.hash = '#/song/' + t.id; }
      },
    });
  },
  'song-del'(el) {
    const x = song(el.dataset.id);
    if (!confirm(`Supprimer le morceau « ${x.title} » ? Il sera retiré de tous les sets.`)) return;
    dropFiles(x);
    state.songs = state.songs.filter(s => s !== x);
    for (const s of state.sets) s.songIds = s.songIds.filter(id => id !== x.id);
    save(); location.hash = '#/songs';
  },

  // Musiciens
  'mus-edit'(el) {
    const m = musician(el.dataset.id);
    openDialog({
      title: m ? 'Modifier le musicien' : 'Nouveau musicien',
      body: `${field('Prénom', 'firstName', m?.firstName, 'required')}
        ${field('Instruments (séparés par des virgules)', 'instruments', m?.instruments.join(', '), 'placeholder="chant, guitare, piano"')}
        ${field('Date de naissance', 'birthDate', m?.birthDate, 'type="date"')}
        ${field('Photo', 'photo', '', 'type="file" accept="image/*"')}
        ${m?.photo ? `<label class="check" style="margin-bottom:.7rem"><input type="checkbox" name="noPhoto"> Supprimer la photo actuelle</label><br>` : ''}
        <label class="check"><input type="checkbox" name="guest" ${m?.guest ? 'checked' : ''}> Musicien invité (non présélectionné dans les sets)</label>`,
      async onSubmit(fd) {
        const t = m || { id: uid(), photo: '' };
        Object.assign(t, { firstName: fd.get('firstName').trim(), instruments: splitList(fd.get('instruments')), birthDate: fd.get('birthDate'), guest: fd.has('guest') });
        if (fd.has('noPhoto')) t.photo = '';
        if (fd.get('photo')?.size) t.photo = await resizeImage(fd.get('photo'), 400);
        if (!m) state.musicians.push(t);
      },
    });
  },
  'mus-del'(el) {
    const m = musician(el.dataset.id);
    if (!confirm(`Supprimer ${m.firstName} ? Ses instruments seront retirés des morceaux et des sets.`)) return;
    state.musicians = state.musicians.filter(x => x !== m);
    for (const s of state.sets) s.musicianIds = s.musicianIds.filter(id => id !== m.id);
    for (const x of state.songs) { delete x.parts[m.id]; if (x.lead === m.id) x.lead = ''; if (x.singer2 === m.id) x.singer2 = ''; }
    if (me === m.id) { me = ''; localStorage.removeItem('dow:me'); }
    save(); render();
  },

  // Groupe
  'band-edit'() {
    const b = state.band;
    openDialog({
      title: 'Modifier le groupe',
      body: `${field('Nom du groupe', 'name', b.name, 'required')}
        ${field('Logo (image)', 'logo', '', 'type="file" accept="image/*"')}
        ${b.logo ? `<label class="check" style="margin-bottom:.7rem"><input type="checkbox" name="noLogo"> Supprimer le logo actuel</label>` : ''}
        ${field('Image de fond (photo du groupe, bannière du site…)', 'background', '', 'type="file" accept="image/*"')}
        ${b.background ? `<label class="check" style="margin-bottom:.7rem"><input type="checkbox" name="noBg"> Supprimer l'image de fond actuelle</label>` : ''}
        ${field('Site internet', 'website', b.website, 'inputmode="url"')}
        ${field('Facebook', 'facebook', b.facebook, 'inputmode="url"')}
        ${field('Instagram', 'instagram', b.instagram, 'inputmode="url"')}
        ${field('Vidéo de présentation (lien)', 'video', b.video, 'inputmode="url"')}`,
      async onSubmit(fd) {
        for (const k of ['name', 'website', 'facebook', 'instagram', 'video']) b[k] = fd.get(k).trim();
        if (fd.has('noLogo')) b.logo = '';
        if (fd.has('noBg')) b.background = '';
        if (fd.get('background')?.size) b.background = await resizeImage(fd.get('background'), 1600);
        if (fd.get('logo')?.size) b.logo = await resizeImage(fd.get('logo'), 512, 'image/png');
      },
    });
  },

  // Pièces jointes
  'att-edit'(el) {
    const { ref, list, id, accept } = el.dataset;
    const owner = ownerOf(ref);
    const a = (owner[list] ||= []).find(x => x.id === id);
    openDialog({
      title: a ? 'Modifier' : 'Ajouter',
      body: `${field('Libellé', 'label', a?.label, 'placeholder="Ex. Version studio, prise du 12/11…"')}
        ${field('Date', 'date', a ? a.date : today(), 'type="date"')}
        ${field('Lien (URL)', 'url', a?.url, 'inputmode="url" placeholder="https://…"')}
        ${field(a?.fileId ? `Remplacer le fichier (${esc(a.fileName || '')})` : 'Ou fichier depuis cet appareil', 'file', '', `type="file" accept="${esc(accept || '')}" ${a ? '' : 'multiple'}`)}`,
      async onSubmit(fd) {
        const files = fd.getAll('file').filter(f => f.size), url = fd.get('url').trim(), label = fd.get('label').trim(), date = fd.get('date');
        if (url && !safeUrl(url)) { alert('Lien invalide.'); return false; }
        if (!a && !files.length && !url) { alert('Indiquez un lien ou choisissez un fichier.'); return false; }
        const put = async (t, f) => { if (t.fileId) { await fileDel(t.fileId); urlCache.delete(t.fileId); } t.fileId = uid(); t.mime = f.type; t.fileName = f.name; t.url = ''; await filePut(t.fileId, f); };
        if (a) {
          Object.assign(a, { label, date });
          if (files[0]) await put(a, files[0]);
          else if (url) { if (a.fileId) { await fileDel(a.fileId); delete a.fileId; delete a.mime; delete a.fileName; } a.url = url; }
        } else if (files.length) {
          for (const f of files) { const t = { id: uid(), label: files.length > 1 ? '' : label, date }; await put(t, f); owner[list].push(t); }
          if (url) owner[list].push({ id: uid(), label, date, url });
        } else owner[list].push({ id: uid(), label, date, url });
      },
    });
  },
  'att-del'(el) {
    const { ref, list, id } = el.dataset;
    const owner = ownerOf(ref), a = owner[list].find(x => x.id === id);
    if (!confirm(`Supprimer « ${a.label || a.fileName || a.url} » ?`)) return;
    if (a.fileId) fileDel(a.fileId).catch(() => {});
    owner[list] = owner[list].filter(x => x !== a);
    save(); render();
  },

  // Données
  'exp-json': exportJson,
  'exp-csv': el => exportCsv(el.dataset.id),
  imp: () => $('#import-file').click(),
  async reset() {
    if (!confirm('Effacer toutes les données de cet appareil et revenir aux données de départ ? Pensez à exporter avant.')) return;
    await fileClear(); urlCache.clear();
    state = seed(); save(); render();
  },
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  e.preventDefault();
  Promise.resolve(A[el.dataset.act]?.(el)).catch(err => alert('Erreur : ' + err.message));
});
// Réordonner les morceaux d'un set en glissant la poignée (souris, doigt ou stylet).
view.addEventListener('pointerdown', e => {
  const grip = e.target.closest('.grip');
  if (!grip) return;
  const row = grip.closest('.set-row'), list = row.parentElement;
  e.preventDefault();
  grip.setPointerCapture(e.pointerId);
  row.classList.add('dragging');
  const grab = e.clientY - row.getBoundingClientRect().top;
  const mid = el => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; };
  const move = ev => {
    row.style.transform = '';
    const prev = row.previousElementSibling, next = row.nextElementSibling;
    if (prev && ev.clientY < mid(prev)) row.after(prev);   // on déplace le voisin : la ligne saisie garde le pointeur
    else if (next && ev.clientY > mid(next)) list.insertBefore(next, row);
    row.style.transform = `translateY(${ev.clientY - grab - row.getBoundingClientRect().top}px)`;
    if (ev.clientY < 90) scrollBy(0, -14); else if (ev.clientY > innerHeight - 90) scrollBy(0, 14);
  };
  const end = () => {
    grip.removeEventListener('pointermove', move);
    grip.removeEventListener('pointerup', end);
    grip.removeEventListener('pointercancel', end);
    const set = state.sets.find(x => x.id === list.dataset.id);
    const order = $$('.set-row', list).map(r => r.dataset.song);
    if (set && order.length === set.songIds.length) { set.songIds = order; save(); }
    render();
  };
  grip.addEventListener('pointermove', move);
  grip.addEventListener('pointerup', end);
  grip.addEventListener('pointercancel', end);
});
$('#me-select').addEventListener('change', e => { me = e.target.value; localStorage.setItem('dow:me', me); render(); });
window.addEventListener('hashchange', () => { render(); scrollTo(0, 0); });

// ---------- PDF (impression) ----------
function buildPrint(s, who) {
  const m = musician(who), b = state.band;
  const songs = s.songIds.map(song).filter(Boolean);
  const ms = s.musicianIds.map(musician).filter(Boolean);
  const cell = v => `<td class="pre">${esc(v)}</td>`;
  const rows = songs.map((x, i) => `<tr><td>${i + 1}</td><td><span class="p-title">${esc(x.title)}</span>${x.author ? `<br><span class="muted">${esc(x.author)}</span>` : ''}</td>
    ${cell(keyLabel(x))}${cell(x.tempo)}${cell(x.entryOrder)}${cell(voices(x))}${cell(x.solos)}
    ${m ? cell(instText(part(x, m.id).instruments)) + cell(part(x, m.id).note) : cell(ms.filter(p => partLabel(x, p.id)).map(p => `${p.firstName} : ${partLabel(x, p.id)}`).join('\n'))}
    ${cell(x.remarks)}</tr>`).join('');
  $('#print-area').innerHTML = `<div class="p-head">${b.logo ? `<img src="${esc(b.logo)}" alt="">` : ''}<div>
      <h1>${esc(b.name)} — ${esc(s.name)}${m ? ' — ' + esc(m.firstName) : ''}</h1>
      <div class="muted">${[TYPES[s.type], fmtDate(s.date), ms.map(p => p.firstName).join(', ')].filter(Boolean).map(esc).join(' · ')}</div>
      ${s.remarks ? `<div class="pre">${esc(s.remarks)}</div>` : ''}</div></div>
    <table><thead><tr><th>#</th><th>Morceau</th><th>Tonalité</th><th>Tempo</th><th>Entrée</th><th>Chant</th><th>Solos</th>
      ${m ? '<th>Mes instruments</th><th>Mes notes</th>' : '<th>Instruments</th>'}<th>Remarques</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// ---------- Export / import ----------
function download(name, content, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
const slug = () => (state.band.name || 'groupe').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'groupe';

async function exportJson() {
  const files = [];
  for (const id of await fileKeys()) { const b = await fileGet(id); files.push({ id, type: b.type, data: await blobToDataUrl(b) }); }
  download(`${slug()}-${today()}.json`, JSON.stringify({ app: 'dreamonwork', version: 1, exportedAt: new Date().toISOString(), data: state, files }, null, 1), 'application/json');
}

const links = l => (l || []).filter(a => a.url).map(a => a.url).join(' | ');
const CSV = {
  songs: {
    file: 'morceaux',
    head: () => ['id', 'Titre', 'Auteur', 'Tempo', 'Tonalité', 'Capo', "Ordre d'entrée", 'Chanteur lead', 'Chanteur 2', 'Solos', 'Remarques', 'Liens vidéo', 'Partitions (liens)', 'Enregistrements (liens)',
      ...state.musicians.flatMap(m => ['Instruments ' + m.firstName, 'Note ' + m.firstName])],
    rows: () => state.songs.map(x => [x.id, x.title, x.author, x.tempo, x.key, x.capo, x.entryOrder, mName(x.lead), mName(x.singer2), x.solos, x.remarks, links(x.videos), links(x.scores), links(x.recordings),
      ...state.musicians.flatMap(m => [part(x, m.id).instruments.join(', '), part(x, m.id).note])]),
  },
  musicians: {
    file: 'musiciens',
    head: () => ['id', 'Prénom', 'Instruments', 'Date de naissance', 'Invité'],
    rows: () => state.musicians.map(m => [m.id, m.firstName, m.instruments.join(', '), m.birthDate, m.guest ? 'oui' : 'non']),
  },
  sets: {
    file: 'sets',
    head: () => ['id', 'Nom', 'Date', 'Type', 'Musiciens', 'Morceaux', 'Remarques', 'Enregistrements (liens)'],
    rows: () => state.sets.map(s => [s.id, s.name, s.date, TYPES[s.type], s.musicianIds.map(mName).filter(Boolean).join(', '), s.songIds.map(id => song(id)?.title).filter(Boolean).join(' | '), s.remarks, links(s.recordings)]),
  },
};
function exportCsv(kind) {
  const c = CSV[kind];
  const q = v => { v = String(v ?? ''); return /[";\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  download(`${slug()}-${c.file}-${today()}.csv`, '﻿' + [c.head(), ...c.rows()].map(r => r.map(q).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
}
function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/)[0];
  const sep = [';', ',', '\t'].reduce((a, b) => first.split(b).length > first.split(a).length ? b : a);
  const rows = []; let row = [], cur = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += c; }
    else if (c === '"') inQ = true;
    else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const head = rows.shift().map(h => h.trim());
  return rows.filter(r => r.some(v => v.trim())).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}
function importCsv(text) {
  const recs = parseCsv(text);
  if (!recs.length) throw new Error('Fichier CSV vide.');
  const has = k => k in recs[0];
  const byName = n => state.musicians.find(m => norm(m.firstName) === norm(n))?.id || '';
  const addLinks = (list, v) => { for (const u of splitList(v, '|')) if (safeUrl(u) && !list.some(a => a.url === u)) list.push({ id: uid(), label: '', date: '', url: u }); };
  let added = 0, updated = 0;
  const upsert = (coll, r, nameKey, nameField) => {
    let t = coll.find(x => r.id && x.id === r.id) || coll.find(x => norm(x[nameField]) === norm(r[nameKey]));
    if (t) updated++; else { t = { id: r.id || uid() }; coll.push(t); added++; }
    return t;
  };
  let kind;
  if (has('Titre')) {
    kind = 'morceau(x)';
    for (const r of recs) {
      if (!r.Titre) continue;
      const t = upsert(state.songs, r, 'Titre', 'title');
      const set = (k, col) => { if (has(col)) t[k] = r[col]; };
      set('title', 'Titre'); set('author', 'Auteur'); set('tempo', 'Tempo'); set('key', 'Tonalité'); set('capo', 'Capo'); set('entryOrder', "Ordre d'entrée"); set('solos', 'Solos'); set('remarks', 'Remarques');
      if (has('Chanteur lead')) t.lead = byName(r['Chanteur lead']);
      if (has('Chanteur 2')) t.singer2 = byName(r['Chanteur 2']);
      Object.assign(t, normalize({ songs: [t] }).songs[0]);
      addLinks(t.videos, r['Liens vidéo']); addLinks(t.scores, r['Partitions (liens)']); addLinks(t.recordings, r['Enregistrements (liens)']);
      for (const m of state.musicians) {
        const ci = 'Instruments ' + m.firstName, cn = 'Note ' + m.firstName;
        if (!has(ci) && !has(cn)) continue;
        const p = { instruments: has(ci) ? splitList(r[ci]) : part(t, m.id).instruments, note: has(cn) ? r[cn] : part(t, m.id).note };
        if (p.instruments.length || p.note) t.parts[m.id] = p; else delete t.parts[m.id];
      }
    }
  } else if (has('Prénom')) {
    kind = 'musicien(s)';
    for (const r of recs) {
      if (!r['Prénom']) continue;
      const t = upsert(state.musicians, r, 'Prénom', 'firstName');
      t.firstName = r['Prénom'];
      if (has('Instruments')) t.instruments = splitList(r.Instruments);
      if (has('Date de naissance')) t.birthDate = r['Date de naissance'];
      if (has('Invité')) t.guest = /^(oui|yes|1|true|x)$/i.test(r['Invité']);
      t.instruments ||= []; t.birthDate ||= ''; t.photo ||= ''; t.guest = !!t.guest;
    }
  } else if (has('Nom')) {
    kind = 'set(s)';
    for (const r of recs) {
      if (!r.Nom) continue;
      const t = upsert(state.sets, r, 'Nom', 'name');
      t.name = r.Nom;
      if (has('Date')) t.date = r.Date;
      if (has('Type')) t.type = /live|concert/i.test(r.Type) ? 'live' : 'repetition';
      if (has('Remarques')) t.remarks = r.Remarques;
      if (has('Musiciens')) t.musicianIds = splitList(r.Musiciens).map(byName).filter(Boolean);
      else if (!t.musicianIds) t.musicianIds = state.musicians.filter(m => !m.guest).map(m => m.id);
      if (has('Morceaux')) t.songIds = splitList(r.Morceaux, '|').map(n => state.songs.find(x => norm(x.title) === norm(n))?.id).filter(Boolean);
      Object.assign(t, normalize({ sets: [t] }).sets[0]);
      addLinks(t.recordings, r['Enregistrements (liens)']);
    }
  } else throw new Error('Colonnes non reconnues. Attendu : « Titre » (morceaux), « Prénom » (musiciens) ou « Nom » (sets).');
  save(); render();
  alert(`Import terminé : ${added} ${kind} ajouté(s), ${updated} mis à jour.`);
}
function importJson(text) {
  const j = JSON.parse(text);
  const data = j.data || j;
  if (!data || !(data.band || data.songs || data.musicians || data.sets)) throw new Error("Ce fichier JSON n'est pas un export de l'application.");
  const inc = normalize({ musicians: [], ...data });
  openDialog({
    title: 'Importer le fichier JSON', ok: 'Importer',
    body: `<p>${inc.songs.length} morceau(x), ${inc.musicians.length} musicien(s), ${inc.sets.length} set(s), ${(j.files || []).length} fichier(s).</p>
      <label class="f">Mode<select name="mode"><option value="merge">Fusionner avec les données de cet appareil</option><option value="replace">Remplacer toutes les données de cet appareil</option></select></label>
      <p class="muted">Fusion : les éléments du fichier remplacent ceux de même identifiant, les autres sont conservés.</p>`,
    async onSubmit(fd) {
      if (fd.get('mode') === 'replace') {
        if (!confirm('Remplacer toutes les données de cet appareil ?')) return false;
        await fileClear(); urlCache.clear();
        state = inc;
        state.seedVersion = SEED_VERSION;
      } else {
        if (data.band) state.band = inc.band;
        for (const k of ['musicians', 'songs', 'sets']) {
          if (!Array.isArray(data[k])) continue;
          for (const x of inc[k]) { const i = state[k].findIndex(y => y.id === x.id); if (i >= 0) state[k][i] = x; else state[k].push(x); }
        }
      }
      for (const f of j.files || []) { await filePut(f.id, await (await fetch(f.data)).blob()); urlCache.delete(f.id); }
    },
  });
}
$('#import-file').addEventListener('change', async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const text = await f.text();
    if (/\.json$/i.test(f.name) || text.trimStart().startsWith('{')) importJson(text); else importCsv(text);
  } catch (err) { alert('Import impossible : ' + err.message); }
});

// ---------- Démarrage ----------
const offline = () => { $('#offline').hidden = navigator.onLine; };
addEventListener('online', offline); addEventListener('offline', offline); offline();
if (!location.hash) history.replaceState(null, '', '#/sets');
render();
navigator.storage?.persist?.().catch(() => {});
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
