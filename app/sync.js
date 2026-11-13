'use strict';
/* Synchronisation en ligne : chaque appareil garde sa copie locale et échange ses changements avec le serveur.
   Règle en cas de modification des deux côtés : la fiche modifiée le plus récemment l'emporte. */
const Sync = (() => {
  const KEY = 'dow:sync', API = '../api/index.php';
  let cfg = read();
  if (cfg.band && (cfg.kinds || 1) < 2) { cfg.lastRev = 0; cfg.kinds = 2; try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch { /* sans effet */ } }
  let status = 'off', message = '', running = false, timer = null;

  function read() {
    try { return { docs: {}, seen: {}, mt: {}, files: {}, lastRev: 0, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; }
    catch { return { docs: {}, seen: {}, mt: {}, files: {}, lastRev: 0 }; }
  }
  const store = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch { /* stockage plein : réessayé au prochain passage */ } };
  const enabled = () => !!(cfg.band && cfg.code);
  const slugify = s => String(s || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  // Empreinte d'une fiche (cyrb53) : sert à repérer ce qui a changé depuis la dernière synchronisation.
  function hash(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }
  const ids = list => list.map(x => x.id);
  // Fiches locales, une par élément : « type:identifiant » → texte JSON.
  function localDocs() {
    const m = new Map();
    m.set('band:band', JSON.stringify(state.band));
    for (const x of state.musicians) m.set('musician:' + x.id, JSON.stringify(x));
    for (const x of state.songs) m.set('song:' + x.id, JSON.stringify(x));
    for (const x of state.sets) m.set('set:' + x.id, JSON.stringify(x));
    for (const x of state.stagePlans) m.set('stageplan:' + x.id, JSON.stringify(x));
    m.set('meta:order', JSON.stringify({ musicians: ids(state.musicians), songs: ids(state.songs), sets: ids(state.sets), stagePlans: ids(state.stagePlans) }));
    return m;
  }
  // Note l'heure de modification des fiches qui viennent de changer (touch = false : changement automatique, non prioritaire).
  function stamp(touch) {
    if (!enabled()) return;
    const docs = localDocs(), now = Date.now();
    for (const [k, j] of docs) { const h = hash(j); if (cfg.seen[k] !== h) { cfg.seen[k] = h; if (touch) cfg.mt[k] = now; } }
    for (const k of Object.keys(cfg.seen)) if (!docs.has(k) && cfg.seen[k] !== '-') { cfg.seen[k] = '-'; if (touch) cfg.mt[k] = now; }
    store();
  }

  async function api(action, { method = 'GET', body, headers = {}, raw = false, creds = cfg } = {}) {
    let res;
    try {
      res = await fetch(`${API}?a=${action}`, { method, body, cache: 'no-store', headers: { 'X-Band': creds.band, 'X-Code': encodeURIComponent(creds.code), ...headers } });
    } catch { throw Object.assign(new Error('Serveur injoignable.'), { offline: true }); }
    if (raw && res.ok) return res;
    let data = null;
    try { data = await res.json(); } catch { /* réponse non JSON */ }
    if (!res.ok || !data) throw Object.assign(new Error(data?.message || (res.status === 404 ? "La synchronisation n'est pas disponible à cette adresse." : `Erreur du serveur (${res.status}).`)), { code: data?.error, status: res.status });
    return data;
  }

  function setStatus(s, msg = '') {
    status = s; message = msg;
    const ind = document.getElementById('sync-ind');
    if (ind) {
      ind.hidden = s === 'off';
      ind.textContent = { ok: '☁️', sync: '🔄', offline: '📴', error: '⚠️' }[s] || '☁️';
      ind.title = label();
    }
    const el = document.getElementById('sync-status');
    if (el) el.textContent = label();
  }
  function label() {
    const when = cfg.lastOk ? new Date(cfg.lastOk).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
    return { off: 'Non connecté.', sync: 'Synchronisation en cours…', ok: `Synchronisé (${when}).`, idle: when ? `Dernière synchronisation : ${when}.` : 'En attente de synchronisation.',
      offline: `Hors ligne${when ? ` — dernière synchronisation : ${when}` : ''}. Vous pouvez continuer à travailler : les changements partiront au retour du réseau.`, error: `Erreur : ${message}` }[status] || '';
  }

  // Applique au stockage local une fiche reçue du serveur. Renvoie vrai si quelque chose a changé.
  function applyRemote(r, order) {
    const coll = { musician: 'musicians', song: 'songs', set: 'sets', stageplan: 'stagePlans' }[r.k];
    if (r.del) {
      if (!coll) return false;
      const n = state[coll].length;
      state[coll] = state[coll].filter(x => x.id !== r.id);
      return state[coll].length !== n;
    }
    let data;
    try { data = JSON.parse(r.d); } catch { return false; }
    if (r.k === 'band') { state.band = normalize({ musicians: [], band: data }).band; return true; }
    if (r.k === 'meta') { if (r.id === 'order') order.value = data; return false; }
    if (!coll) return false;
    const item = normalize({ musicians: [], [coll]: [{ ...data, id: r.id }] })[coll][0];
    const i = state[coll].findIndex(x => x.id === r.id);
    if (i >= 0) state[coll][i] = item; else state[coll].push(item);
    return true;
  }
  function applyOrder(o) {
    let changed = false;
    for (const coll of ['musicians', 'songs', 'sets', 'stagePlans']) {
      if (coll === 'stagePlans' && !o?.[coll]) continue;
      const pos = new Map((o?.[coll] || []).map((id, i) => [id, i]));
      const before = ids(state[coll]).join();
      state[coll] = state[coll].map((x, i) => [x, pos.has(x.id) ? pos.get(x.id) : 1e9 + i]).sort((a, b) => a[1] - b[1]).map(a => a[0]);
      if (ids(state[coll]).join() !== before) changed = true;
    }
    return changed;
  }

  async function run() {
    clearTimeout(timer);
    if (!enabled() || running) return;
    if (!navigator.onLine) return setStatus('offline');
    if (dlg.open) return schedule(4000);            // pas d'échange pendant une saisie
    running = true; setStatus('sync');
    try {
      stamp(false);
      // 1. Recevoir ce qui a changé sur le serveur
      const pull = await api('pull&since=' + (cfg.lastRev || 0));
      let local = localDocs(), changed = false;
      const applied = new Map(), order = { value: null };
      for (const r of pull.docs) {
        const k = r.k + ':' + r.id, known = cfg.docs[k];
        const cur = local.has(k) ? hash(local.get(k)) : '-';
        const dirty = known ? known.h !== cur : cur !== '-';
        // Modifiée des deux côtés : la plus récente l'emporte (une fiche jamais synchronisée cède au serveur).
        if (dirty && known && (cfg.mt[k] || 0) > r.t) continue;
        if (!r.del && !dirty && known && r.k !== 'meta' && hash(r.d) === cur) { applied.set(k, r.rev); continue; }
        if (applyRemote(r, order)) changed = true;
        applied.set(k, r.rev);
      }
      if (order.value && applyOrder(order.value)) changed = true;
      local = localDocs();
      for (const [k, rev] of applied) { const h = local.has(k) ? hash(local.get(k)) : '-'; cfg.docs[k] = { h, r: rev }; cfg.seen[k] = h; }
      if (changed) { persist(); if (!dlg.open) render(); }
      // 2. Envoyer ce qui a changé sur cet appareil
      const out = [];
      for (const [k, j] of local) { const h = hash(j); if (cfg.docs[k]?.h !== h) out.push({ key: k, h, d: j }); }
      for (const k of Object.keys(cfg.docs)) if (!local.has(k) && cfg.docs[k].h !== '-') out.push({ key: k, h: '-', del: 1 });
      for (let i = 0; i < out.length;) {
        const batch = []; let size = 0;
        while (i < out.length && batch.length < 60 && (size === 0 || size + (out[i].d?.length || 0) < 3e6)) { size += out[i].d?.length || 0; batch.push(out[i++]); }
        await api('push', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ docs: batch.map(x => { const [k, ...id] = x.key.split(':'); return { k, id: id.join(':'), d: x.d, del: x.del || 0, t: cfg.mt[x.key] || 0 }; }) }) });
        for (const x of batch) cfg.docs[x.key] = { h: x.h };
        store();
      }
      cfg.lastRev = pull.rev;
      store();
      // 3. Envoyer les fichiers joints présents sur cet appareil et absents du serveur
      const failed = await pushFiles();
      cfg.lastOk = Date.now(); store();
      if (failed) setStatus('error', `${failed} fichier(s) joint(s) n'ont pas pu être envoyés (trop volumineux ou réseau coupé).`);
      else setStatus('ok');
    } catch (e) {
      if (e.offline) setStatus('offline'); else setStatus('error', e.message);
    } finally {
      running = false;
      if (enabled()) schedule(60000);
    }
  }
  function fileIds() {
    const out = new Set();
    for (const s of state.sets) if (s.posterId) out.add(s.posterId);
    for (const o of [...state.songs, ...state.sets]) for (const l of ['videos', 'scores', 'recordings', 'photos']) for (const a of o[l] || []) if (a.fileId) out.add(a.fileId);
    return out;
  }
  async function pushFiles() {
    let failed = 0;
    for (const id of fileIds()) {
      if (cfg.files[id]) continue;
      const blob = await fileGet(id);
      if (!blob) continue;                           // pas sur cet appareil : téléchargé à la demande
      try {
        await api('file&id=' + id, { method: 'PUT', body: blob, headers: { 'Content-Type': blob.type || 'application/octet-stream', 'X-Size': String(blob.size) } });
        cfg.files[id] = 1; store();
      } catch (e) { if (e.offline) throw e; failed++; }
    }
    return failed;
  }
  // Récupère depuis le serveur un fichier joint absent de cet appareil.
  async function download(id) {
    if (!enabled() || !navigator.onLine) return null;
    try {
      const res = await api('file&id=' + id, { raw: true });
      const blob = await res.blob();
      cfg.files[id] = 1; store();
      return blob;
    } catch { return null; }
  }

  function schedule(ms) { clearTimeout(timer); if (enabled()) timer = setTimeout(run, ms); }
  // Appelé à chaque enregistrement local.
  function changed(touch = true) { if (!enabled()) return; stamp(touch); schedule(2000); }

  // mode : 'join' (le groupe doit exister), 'create' (le nom doit être libre) ou '' (l'un ou l'autre).
  async function connect(name, code, prepare, mode = '') {
    const band = slugify(name);
    if (band.length < 2) throw new Error('Indiquez le nom du groupe (au moins 2 lettres ou chiffres).');
    if (code.length < 4) throw new Error("Le code d'accès doit comporter au moins 4 caractères.");
    const res = await api('ping' + (mode === 'join' ? '&nocreate=1' : mode === 'create' ? '&mustcreate=1' : ''), { creds: { band, code } });
    if (prepare) prepare(res);          // dernier réglage des données locales avant le premier échange
    cfg = { band, code, lastRev: 0, docs: {}, seen: {}, mt: {}, files: {}, lastOk: 0, kinds: 2 };
    store(); setStatus('idle');
    run();
    return res;
  }
  function disconnect() { clearTimeout(timer); cfg = { docs: {}, seen: {}, mt: {}, files: {}, lastRev: 0 }; localStorage.removeItem(KEY); setStatus('off'); }
  function start() {
    setStatus(enabled() ? 'idle' : 'off');
    schedule(800);
    addEventListener('online', () => schedule(500));
    addEventListener('offline', () => enabled() && setStatus('offline'));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(500); });
  }
  // Nombre de fiches modifiées sur cet appareil et pas encore envoyées au serveur.
  function pending() {
    if (!enabled()) return 0;
    const local = localDocs(); let n = 0;
    for (const [k, j] of local) if (cfg.docs[k]?.h !== hash(j)) n++;
    for (const k of Object.keys(cfg.docs)) if (!local.has(k) && cfg.docs[k].h !== '-') n++;
    return n;
  }
  return { enabled, changed, run, connect, disconnect, download, start, label, slugify, pending, get band() { return cfg.band || ''; }, get status() { return status; } };
})();
