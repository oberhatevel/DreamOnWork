/* Concepteur de plan de scène — module isolé, sans dépendance.
   Entrées : StagePlot.setInput(data) au format « stage-input » ; plans : StagePlot.setPlans(plans).
   Sorties : StagePlot.onChange = plans => … (tableau de documents « stage-plan »). */
const StagePlot = (() => {
  'use strict';

  // ====================== Constantes ======================
  const STD = [1, 3, 5, 10, 15, 20];                       // longueurs standard (m)
  const CABLES = ['XLR', 'Jack instrument', 'Jack enceinte / Speakon', 'Secteur', 'RCA / mini-jack', 'Autre'];
  const CCLS = { 'XLR': 'xlr', 'Jack instrument': 'jack', 'Jack enceinte / Speakon': 'spk', 'Secteur': 'pwr', 'RCA / mini-jack': 'rca', 'Autre': 'oth' };
  const PAD = { l: 1, r: 1, t: 0.5, b: 2 };                // marge autour de la scène (m) : coulisses et salle
  const EXTRAS = [
    { name: 'Arrivée électrique 16 A', type: 'Alimentation' },
    { name: 'Pied de micro', type: 'Pied / support' },
    { name: 'Micro chant', type: 'Micro' },
    { name: 'Micro instrument', type: 'Micro' },
    { name: 'Boîtier de direct (DI)', type: 'DI' },
    { name: 'Retour de scène', type: 'Retour' },
    { name: 'Enceinte de façade', type: 'Sonorisation' },
    { name: 'Table de mixage', type: 'Table de mixage' },
    { name: 'Praticable 2 × 1 m', type: 'Praticable' }
  ];
  const SIZE = { musician: [56, 62], amp: [60, 36], mic: [30, 30], keys: [130, 34], inst: [44, 44], drums: [170, 120], pedals: [56, 24], speaker: [48, 48], monitor: [60, 40], mixer: [110, 56], di: [26, 26], stand: [40, 40], power: [32, 32], riser: [200, 100], light: [36, 36], misc: [36, 26] };
  const DRUM = ['Grosse caisse', 'Caisse claire', 'Tom aigu', 'Tom basse', 'Overhead'];
  const QUIET = ['mic', 'di', 'stand', 'pedals'];             // symboles parlants : étiquette seulement si sélectionné ou renommé
  const AUTOPLACE = ['amp', 'mic', 'keys', 'inst', 'pedals', 'drums'];
  const STATUS = { musicien: 'Apporté par un musicien', groupe: 'Au groupe', location: 'À louer', manquant: 'Manquant' };

  // ====================== État ======================
  let input = null, plans = [], curId = null;
  let idx = { mus: {}, gear: {}, sets: {} };
  let ui = { tab: 'plan', sel: null, selLink: null, linkFrom: null, sheet: null, menu: false, zoom: 1, lib: {}, offer: null };
  let root = null, mounted = false, ppm = 60;
  const hist = {};
  let drag = null, lib = null, pinch = null, noClick = 0, ptr = false, pend = false, pendT = 0, printEl = null;
  const pts = new Map();

  // ====================== Utilitaires ======================
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = p => p + Math.random().toString(36).slice(2, 9);
  const r2 = v => Math.round(v * 100) / 100;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fr = v => String(r2(v)).replace('.', ',');
  const el = id => document.getElementById(id);
  const cut = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
  const clone = o => JSON.parse(JSON.stringify(o));
  const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const frDate = d => { const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(d || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
  const plan = () => plans.find(p => p.id === curId) || plans[0] || null;
  const item = (p, id) => p.items.find(i => i.id === id);

  function reindex() {
    idx = { mus: {}, gear: {}, sets: {} };
    if (!input) return;
    (input.musicians || []).forEach(m => {
      idx.mus[m.id] = m;
      (m.gear || []).forEach(g => { idx.gear[g.id] = { g, owner: m.id, src: 'musicien' }; });
    });
    (input.commonGear || []).forEach(g => { idx.gear[g.id] = { g, owner: null, src: g.owner === 'location' ? 'location' : 'groupe' }; });
    (input.sets || []).forEach(s => { idx.sets[s.id] = s; });
  }

  // Rôle d'un élément (symbole et règles de câblage), d'après le type et le nom — jamais la note.
  function roleOf(type, name) {
    const n = (name || '').toLowerCase();
    if (type === 'Alimentation') return 'power';
    if (type === 'Praticable') return 'riser';
    if (type === 'DI' || /\bdi\b|bo[iî]tiers? de direct/.test(n)) return 'di';
    if (type === 'Micro') return 'mic';
    if (type === 'Ampli') return 'amp';
    if (type === 'Clavier') return 'keys';
    if (type === 'Pédales / effets') return 'pedals';
    if (type === 'Sonorisation') return 'speaker';
    if (type === 'Retour') return 'monitor';
    if (type === 'Table de mixage') return 'mixer';
    if (type === 'Pied / support') return 'stand';
    if (type === 'Instrument') return /batterie/.test(n) ? 'drums' : 'inst';
    if (type === 'Éclairage') return 'light';
    return 'misc';
  }

  // Réglages par défaut d'un élément : le type donne la règle, le nom et la note ne font que pré-cocher.
  function defOpts(role, name, note) {
    const n = (name || '').toLowerCase(), t = n + ' ' + (note || '').toLowerCase();
    const w = (/(\d+)\s*w\b/.exec(n) || [])[1];
    const o = {};
    if (role === 'mic') {
      const k = /(\d+)\s*micros/.exec(n);
      o.channels = k ? +k[1] : 1;
      o.use = /chant|voix/.test(n) ? 'voix' : 'inst';
      o.phantom = /fant[oô]me|48 ?v|statique/.test(t);
      o.stand = o.channels === 1 && !/pince|clip/.test(n);
    } else if (role === 'amp') { o.pickup = /\bdi\b/.test(t) ? 'di' : 'mic'; o.mains = true; }
    else if (role === 'keys') { o.stereo = /st[ée]r[ée]o/.test(t); o.mains = true; }
    else if (role === 'inst') o.mode = /[ée]lectro-?acoustique|\bdi\b/.test(t) ? 'di' : (/guitare [ée]lectrique|\bbasse\b/.test(n) && !/acoustique|contrebasse/.test(n)) ? 'amp' : 'none';
    else if (role === 'pedals') o.mains = true;
    else if (role === 'speaker' || role === 'monitor') o.powered = !/passi[fv]/.test(t);
    else if (role === 'mixer') { o.mains = true; const v = /(\d+)\s*voies/.exec(n); if (v) o.inputs = +v[1]; }
    else if (role === 'misc' || role === 'light') o.mains = /secteur/.test(t);
    if (w) o.watts = +w;
    return o;
  }

  function info(it) {
    if (it.kind === 'musician') {
      const m = idx.mus[it.ref];
      return { role: 'musician', name: it.label || (m && m.firstName) || 'Musicien', type: 'Musicien', note: m ? (m.instruments || []).join(', ') : '', missing: !!input && !m };
    }
    if (it.kind === 'gear') {
      const e = idx.gear[it.ref], g = e && e.g;
      const name = g ? g.name : (it.name || 'Matériel'), type = g ? g.type : (it.type || 'Autre');
      return { role: roleOf(type, name), name, type, note: g ? g.note || '' : '', missing: !!input && !e, src: e ? e.src : null };
    }
    return { role: roleOf(it.type, it.name), name: it.name || 'Élément', type: it.type || 'Autre', note: '', missing: false };
  }
  const O = it => { const i = info(it); return Object.assign(defOpts(i.role, i.name, i.note), it.opts); };
  const lab = it => it.label || info(it).name;
  function ownerName(p, it) {
    const id = it.kind === 'gear' ? (it.owner || (idx.gear[it.ref] && idx.gear[it.ref].owner)) : null;
    if (!id) return '';
    const mi = p.items.find(i => i.kind === 'musician' && i.ref === id);
    return (mi && mi.label) || (idx.mus[id] && idx.mus[id].firstName) || '';
  }
  const full = (p, it) => { const o = ownerName(p, it); return lab(it) + (o ? ' — ' + o : ''); };
  const needsMains = it => { const r = info(it).role, o = O(it); return r === 'speaker' || r === 'monitor' ? o.powered !== false : !!o.mains; };
  const placedCount = (p, ref) => p.items.filter(i => i.kind === 'gear' && i.ref === ref).length;

  // ====================== Plans : création, historique, enregistrement ======================
  function norm(p) {
    p = p && typeof p === 'object' ? p : {};
    p.id = p.id || uid('plan-'); p.name = p.name || 'Plan'; p.updated = p.updated || Date.now();
    p.setIds = Array.isArray(p.setIds) ? p.setIds : [];
    p.stage = Object.assign({ width: 6, depth: 4, unit: 'm' }, p.stage);
    p.stage.width = clamp(+p.stage.width || 6, 1, 40); p.stage.depth = clamp(+p.stage.depth || 4, 1, 30);
    p.items = (Array.isArray(p.items) ? p.items : []).filter(i => i && i.id && isFinite(i.x) && isFinite(i.y));
    p.items.forEach(i => { i.rot = +i.rot || 0; });
    const ids = new Set(p.items.map(i => i.id));
    p.links = (Array.isArray(p.links) ? p.links : []).filter(l => l && l.id && ids.has(l.from) && ids.has(l.to));
    p.needs = (Array.isArray(p.needs) ? p.needs : []).filter(n => n && n.id);
    p.notes = p.notes || '';
    p.settings = Object.assign({ margin: 20, grid: true, snap: true }, p.settings);
    return p;
  }
  function newPlan() {
    let n = plans.length + 1;
    while (plans.some(p => p.name === 'Plan ' + n)) n++;
    return norm({ id: uid('plan-'), name: 'Plan ' + n, updated: Date.now() });
  }
  const H = id => hist[id] || (hist[id] = { undo: [], redo: [] });
  function pushUndo(p) { const h = H(p.id); h.undo.push(JSON.stringify(p)); if (h.undo.length > 60) h.undo.shift(); h.redo = []; }
  function emit() { if (typeof api.onChange === 'function') { try { api.onChange(clone(plans)); } catch (e) { /* l'hôte gère ses erreurs */ } } }
  function touch(p) { recalc(p); p.updated = Date.now(); emit(); }
  function commit(fn) { const p = plan(); if (!p) return; pushUndo(p); fn(p); touch(p); }
  function timeTravel(from, to) {
    const p = plan(), h = p && H(p.id);
    if (!p || !h[from].length) return;
    h[to].push(JSON.stringify(p));
    plans[plans.indexOf(p)] = JSON.parse(h[from].pop());
    if (ui.sel && !item(plan(), ui.sel)) ui.sel = null;
    ui.linkFrom = null; ui.offer = null;
    emit();
  }

  // ====================== Géométrie et longueurs ======================
  function setPos(p, it, x, y) {
    if (p.settings.snap) { x = Math.round(x / 0.25) * 0.25; y = Math.round(y / 0.25) * 0.25; }
    it.x = r2(clamp(x, -PAD.l + 0.2, p.stage.width + PAD.r - 0.2));
    it.y = r2(clamp(y, -PAD.t + 0.2, p.stage.depth + PAD.b - 0.3));
  }
  // Cheminement le long des bords (|dx| + |dy|), marge, puis longueur standard supérieure.
  function linkLen(p, l) {
    const a = item(p, l.from), b = item(p, l.to);
    if (!a || !b) return l.length || 0;
    const raw = dist(a, b) * (1 + (+p.settings.margin || 0) / 100);
    return STD.find(s => s >= raw - 1e-9) || Math.ceil(raw / 5) * 5;
  }
  function recalc(p) { p.links.forEach(l => { if (!l.fixed) l.length = linkLen(p, l); }); }
  function freeSpot(p, role, it) {
    const W = p.stage.width, D = p.stage.depth;
    const isMus = i => i.kind === 'musician';
    let h = [W / 2, D / 2];
    if (role === 'mixer') h = [W - 0.75, D + 1.25];
    else if (role === 'speaker') h = p.items.some(i => info(i).role === 'speaker' && i.x < W / 2) ? [W + 0.5, D - 0.25] : [-0.5, D - 0.25];
    else if (role === 'monitor') h = [W / 2, D - 0.5];
    else if (role === 'power') h = [0.25, 0.25];
    else if (role === 'musician') h = ((idx.mus[it.ref] || {}).gear || []).some(g => roleOf(g.type, g.name) === 'drums') ? [W / 2, 0.75] : [W / 2, D - 1.5];
    const c = [];
    if (role === 'musician') { for (let x = 0.75; x <= W - 0.75; x += 0.25) for (let y = 0.75; y <= D - 1; y += 0.25) c.push([x, y]); }
    else for (let x = -PAD.l + 0.5; x <= W + PAD.r - 0.5; x += 0.5) for (let y = -PAD.t + 0.5; y <= D + PAD.b - 0.5; y += 0.5) c.push([x, y]);
    c.sort((a, b) => Math.hypot(a[0] - h[0], a[1] - h[1]) - Math.hypot(b[0] - h[0], b[1] - h[1]));
    c.unshift(h);
    const free = gap => c.find(q => p.items.every(i => Math.hypot(i.x - q[0], i.y - q[1]) >= (role === 'musician' && isMus(i) ? gap : 0.6)));
    return free(1.75) || free(1.25) || free(0.6) || h;
  }

  // ====================== Pose et édition des éléments ======================
  function scope(p) {
    const s = new Set();
    p.setIds.forEach(id => { const st = idx.sets[id]; if (st) (st.musicianIds || []).forEach(m => s.add(m)); });
    return s;
  }
  function makeItem(p, key) {
    const k = key[0], id = key.slice(2);
    if (k === 'm') {
      const m = idx.mus[id];
      if (!m || p.items.some(i => i.kind === 'musician' && i.ref === id)) return null;
      return { id: uid('i'), kind: 'musician', ref: id, x: 0, y: 0, rot: 0, label: m.firstName || 'Musicien' };
    }
    if (k === 'g') {
      const e = idx.gear[id];
      if (!e || placedCount(p, id) >= (e.g.qty || 1)) return null;
      const it = { id: uid('i'), kind: 'gear', ref: id };
      if (e.owner) it.owner = e.owner;
      Object.assign(it, { x: 0, y: 0, rot: 0, name: e.g.name, type: e.g.type, opts: defOpts(roleOf(e.g.type, e.g.name), e.g.name, e.g.note) });
      return it;
    }
    const x = EXTRAS[+id];
    return x ? { id: uid('i'), kind: 'extra', name: x.name, type: x.type, x: 0, y: 0, rot: 0, opts: defOpts(roleOf(x.type, x.name), x.name, '') } : null;
  }
  function place(key, x, y) {
    const p = plan(), it = p && makeItem(p, key);
    if (!it) return;
    if (x == null) [x, y] = freeSpot(p, info(it).role, it);
    commit(q => { setPos(q, it, x, y); q.items.push(it); });
    ui.sel = it.id; ui.linkFrom = null;
    ui.offer = it.kind === 'musician' && pendingGear(p, it.ref).length ? it.id : null;
    render();
  }
  function pendingGear(p, mid) {
    const m = idx.mus[mid];
    return m ? (m.gear || []).filter(g => AUTOPLACE.includes(roleOf(g.type, g.name)) && !placedCount(p, g.id)) : [];
  }
  // Dispose le matériel d'un musicien autour de lui (il regarde le public, vers le bas du plan).
  function gearAll(mid) {
    commit(p => {
      const mi = item(p, mid);
      if (!mi) return;
      const list = pendingGear(p, mi.ref), roles = list.map(g => roleOf(g.type, g.name));
      const big = roles.includes('keys') || roles.includes('drums');
      let back = 0, left = 0, front = 0;
      list.forEach((g, n) => {
        const it = makeItem(p, 'g:' + g.id), r = roles[n];
        if (!it) return;
        let x = mi.x, y = mi.y;
        if (r === 'amp') { x += [0, -0.75, 0.75][back++ % 3]; y -= 1; }
        else if (r === 'drums') y += 1;
        else if (r === 'keys') y += 0.75;
        else if (r === 'mic') { if (big) { x += 0.75; y += 0.25; } else { x += [0, 0.5, -0.5][front++ % 3]; y += 0.5; } }
        else if (r === 'pedals') { x -= 0.5; y += 0.75; }
        else { x -= 0.75; y += [0, 0.5, -0.5, 1][left++ % 4]; }
        setPos(p, it, x, y);
        p.items.push(it);
      });
    });
  }
  function removeItem(id) {
    commit(p => {
      p.items = p.items.filter(i => i.id !== id);
      p.links = p.links.filter(l => l.from !== id && l.to !== id);
    });
    ui.sel = null; ui.linkFrom = null; ui.offer = null;
  }
  function canDup(p, it) {
    if (it.kind === 'extra') return true;
    if (it.kind !== 'gear') return false;
    const e = idx.gear[it.ref];
    return !!e && placedCount(p, it.ref) < (e.g.qty || 1);
  }
  function makeLink(a, b) {
    commit(p => {
      let f = item(p, a), t = item(p, b);
      if (!f || !t) return;
      const rf = info(f).role, rt = info(t).role;
      let cable = 'XLR';
      if (rf === 'power' || rt === 'power') { cable = 'Secteur'; if (rf === 'power') [f, t] = [t, f]; }
      else if (rf === 'mixer') cable = O(t).powered === false ? 'Jack enceinte / Speakon' : 'XLR';
      else if (rf === 'mic' || rf === 'di') cable = 'XLR';
      else if (rt === 'di' || rf === 'inst' || rf === 'keys' || rf === 'pedals') cable = 'Jack instrument';
      const l = { id: uid('l'), from: f.id, to: t.id, cable, length: 0, auto: false, note: '' };
      if (isInput(p, l)) l.channel = Math.max(0, ...p.links.map(x => x.channel || 0)) + 1;
      p.links.push(l);
      ui.selLink = l.id;
    });
    ui.linkFrom = null;
  }

  // ====================== Câblage automatique ======================
  // Un ampli repiqué prend le micro « instrument » libre le plus proche (1,5 m au plus, pas celui d'un autre musicien).
  function micClaims(p) {
    const byAmp = {}, byMic = {};
    const mics = p.items.filter(i => { const o = O(i); return info(i).role === 'mic' && o.use !== 'voix' && !(o.channels > 1); });
    p.items.filter(i => info(i).role === 'amp' && O(i).pickup === 'mic').forEach(a => {
      const m = mics.filter(x => !byMic[x.id] && (!x.owner || x.owner === a.owner) && dist(a, x) <= 1.5).sort((x, y) => dist(a, x) - dist(a, y))[0];
      if (m) { byAmp[a.id] = m; byMic[m.id] = a; }
    });
    return { byAmp, byMic };
  }
  const isInput = (p, l) => { const t = item(p, l.to), f = item(p, l.from); return !!t && !!f && info(t).role === 'mixer' && l.cable !== 'Secteur' && info(f).role !== 'power'; };
  const chanLinks = p => p.links.filter(l => isInput(p, l));

  function autowire(p) {
    const its = p.items, R = it => info(it).role, by = r => its.filter(i => R(i) === r);
    const manual = p.links.filter(l => !l.auto), old = {}, seen = {}, cnt = {}, out = [];
    p.links.filter(l => l.auto).forEach(l => { const s = l.from + '>' + l.to + '>' + l.cable; seen[s] = (seen[s] || 0) + 1; old[s + '#' + seen[s]] = l; });
    const hadCh = p.links.some(l => l.channel);
    const add = (from, to, cable, note, once) => {
      const pwr = cable === 'Secteur';
      // une liaison faite à la main n'est jamais doublée ni remplacée
      if (manual.some(l => (l.from === from.id && l.to === to.id) || (l.from === from.id && R(from) !== 'mixer' && (l.cable === 'Secteur') === pwr))) return;
      if (once && out.some(l => l.from === from.id && l.to === to.id)) return;
      const s = from.id + '>' + to.id + '>' + cable;
      cnt[s] = (cnt[s] || 0) + 1;
      const o = old[s + '#' + cnt[s]];
      const l = { id: o ? o.id : uid('l'), from: from.id, to: to.id, cable, length: 0, auto: true, note: note || '' };
      if (o && o.channel) l.channel = o.channel;
      out.push(l);
    };
    const mixer = by('mixer')[0], inlets = by('power'), claims = micClaims(p);
    const near = (it, list) => list.slice().sort((a, b) => dist(it, a) - dist(it, b))[0];
    const dis = by('di').filter(d => !manual.some(l => l.from === d.id || l.to === d.id));
    const takeDI = it => { const d = near(it, dis); if (d) dis.splice(dis.indexOf(d), 1); return d; };
    const mons = by('monitor').slice().sort((a, b) => a.x - b.x);
    its.forEach(it => {
      const r = R(it), o = O(it), nm = lab(it);
      if (mixer) {
        if (r === 'mic') {
          const n = Math.max(1, o.channels | 0);
          for (let i = 0; i < n; i++) add(it, mixer, 'XLR', n > 1 ? (DRUM[i] || 'Batterie ' + (i + 1)) : claims.byMic[it.id] ? 'Repiquage ' + lab(claims.byMic[it.id]) : '');
        }
        if (r === 'amp') {
          if (o.pickup === 'di') add(it, mixer, 'XLR', 'Sortie DI de l\'ampli');
          else if (o.pickup === 'mic' && !claims.byAmp[it.id]) add(it, mixer, 'XLR', 'Repiquage ampli — micro à prévoir');
        }
        if (r === 'keys' || (r === 'inst' && o.mode === 'di')) {
          const n = r === 'keys' && o.stereo ? 2 : 1;
          for (let i = 0; i < n; i++) {
            const side = n > 1 ? (i ? ' (droite)' : ' (gauche)') : '', d = takeDI(it);
            if (d) { add(it, d, 'Jack instrument', ''); add(d, mixer, 'XLR', nm + side); }
            else add(it, mixer, 'Jack instrument', 'DI à prévoir' + side);
          }
        }
        if (r === 'speaker') add(mixer, it, o.powered === false ? 'Jack enceinte / Speakon' : 'XLR', /caisson|sub/i.test(nm) ? 'Caisson de basses' : it.x < p.stage.width / 2 ? 'Façade gauche' : 'Façade droite');
        if (r === 'monitor') add(mixer, it, o.powered === false ? 'Jack enceinte / Speakon' : 'XLR', 'Retour ' + (mons.indexOf(it) + 1) + ' (aux ' + (mons.indexOf(it) + 1) + ')');
      }
      if (r === 'inst' && o.mode === 'amp') {
        let amps = by('amp').filter(a => a.owner && a.owner === it.owner);
        if (!amps.length) amps = by('amp').filter(a => dist(a, it) <= 2);
        const amp = near(it, amps), ped = near(it, by('pedals').filter(x => x.owner && x.owner === it.owner));
        if (amp && ped) { add(it, ped, 'Jack instrument', ''); add(ped, amp, 'Jack instrument', '', true); }
        else if (amp) add(it, amp, 'Jack instrument', '');
      }
      if (needsMains(it) && inlets.length) add(it, near(it, inlets), 'Secteur', '');
    });
    p.links = manual.concat(out);
    if (!hadCh) renumber(p);
    else { let mx = Math.max(0, ...p.links.map(l => l.channel || 0)); chanLinks(p).forEach(l => { if (!l.channel) l.channel = ++mx; }); }
  }

  // ====================== Patch ======================
  function patchRow(p, l, claims) {
    const f = item(p, l.from), fi = info(f), o = O(f), own = ownerName(p, f);
    let src, cap, ph = false, s = f;
    if (fi.role === 'di') {
      const up = p.links.find(x => x.to === f.id);
      s = up && item(p, up.from);
      src = s ? full(p, s) : (l.note || lab(f)); cap = 'DI';
    } else if (fi.role === 'mic') {
      const amp = claims.byMic[f.id];
      if (o.channels > 1) src = 'Batterie' + (l.note ? ' — ' + l.note : '');
      else if (amp) { src = full(p, amp); s = amp; }
      else if (o.use === 'voix') src = 'Voix ' + (own || lab(f));
      else src = full(p, f);
      cap = 'Micro : ' + lab(f); ph = !!o.phantom;
    } else if (fi.role === 'amp') { src = full(p, f); cap = o.pickup === 'di' ? 'Sortie DI de l\'ampli' : 'Micro (à prévoir)'; }
    else { src = full(p, f); cap = (fi.role === 'keys' || fi.role === 'inst') ? 'DI (à prévoir)' : 'Ligne'; }
    const n = ((s ? info(s).name : '') + ' ' + src).toLowerCase();
    const cat = fi.role === 'mic' && o.channels > 1 || /batterie/.test(n) ? 0 : /basse/.test(n) ? 1 : /guitare/.test(n) ? 2 : (s && info(s).role === 'keys') || /piano|clavier|synth/.test(n) ? 3 : fi.role === 'mic' && o.use === 'voix' ? 5 : 4;
    return { l, ch: l.channel || 0, src, cap, ph, note: l.note || '', cat };
  }
  function patch(p) {
    const c = micClaims(p);
    return chanLinks(p).map(l => patchRow(p, l, c)).sort((a, b) => (a.ch || 999) - (b.ch || 999));
  }
  // Ordre habituel d'une fiche technique : batterie, basse, guitares, claviers, autres instruments, voix.
  function renumber(p) {
    const c = micClaims(p);
    chanLinks(p).map((l, i) => Object.assign(patchRow(p, l, c), { i })).sort((a, b) => a.cat - b.cat || a.i - b.i).forEach((r, n) => { r.l.channel = n + 1; });
  }
  function outputs(p) {
    return p.links.filter(l => { const f = item(p, l.from), t = item(p, l.to); return f && t && info(f).role === 'mixer' && ['speaker', 'monitor'].includes(info(t).role); })
      .map(l => ({ l, to: lab(item(p, l.to)), note: l.note || '' }));
  }

  // ====================== Listes : câbles, matériel, électricité ======================
  const cableName = (c, len) => (c === 'Secteur' ? 'Rallonge secteur ' : 'Câble ' + c + ' ') + fr(len) + ' m';
  function cableKind(name) {
    const n = name.toLowerCase();
    if (/multiprise/.test(n)) return null;
    if (/xlr/.test(n)) return 'XLR';
    if (/speakon|enceinte|\bhp\b/.test(n)) return 'Jack enceinte / Speakon';
    if (/rca|mini-?jack/.test(n)) return 'RCA / mini-jack';
    if (/jack/.test(n)) return 'Jack instrument';
    if (/secteur|rallonge/.test(n)) return 'Secteur';
    return null;
  }
  function elec(p) {
    const groups = {}, order = [];
    let total = 0, watts = 0, unknown = 0;
    p.items.filter(needsMains).forEach(it => {
      const l = p.links.find(x => x.from === it.id && x.cable === 'Secteur'), inl = l && item(p, l.to);
      const k = inl ? inl.id : '';
      if (!groups[k]) { groups[k] = { name: inl ? lab(inl) : 'Non raccordé', n: 0, watts: 0, items: [] }; order.push(k); }
      const w = +O(it).watts || 0;
      groups[k].n++; groups[k].watts += w; groups[k].items.push(lab(it));
      total++; watts += w; if (!w) unknown++;
    });
    return { total, watts, unknown, groups: order.map(k => groups[k]), inlets: p.items.filter(i => info(i).role === 'power').length };
  }
  function gearList(p) {
    const rows = [], placed = {}, used = {}, pool = [];
    const common = (input && input.commonGear) || [];
    p.items.forEach(i => { if (i.kind === 'gear') placed[i.ref] = (placed[i.ref] || 0) + 1; });
    const musOn = p.items.filter(i => i.kind === 'musician' && idx.mus[i.ref]).map(i => idx.mus[i.ref]);
    const on = new Set(musOn.map(m => m.id));
    // 1. Chaque musicien présent vient avec tout son matériel.
    musOn.forEach(m => (m.gear || []).forEach(g => {
      rows.push({ name: g.name, qty: g.qty || 1, status: 'musicien', who: m.firstName, type: g.type, note: g.note || '' });
      pool.push({ g, avail: (g.qty || 1) - (placed[g.id] || 0) });
    }));
    Object.keys(placed).forEach(ref => {
      const e = idx.gear[ref];
      if (e && e.src === 'musicien' && !on.has(e.owner)) rows.push({ name: e.g.name, qty: placed[ref], status: 'musicien', who: (idx.mus[e.owner] || {}).firstName || '?', type: e.g.type, note: 'musicien absent du plan' });
      if (!e && input) rows.push({ name: (p.items.find(i => i.ref === ref) || {}).name || 'Matériel inconnu', qty: placed[ref], status: 'manquant', type: '', note: 'absent du dernier export JamHit' });
    });
    // 2. Matériel commun posé sur le plan.
    common.forEach(g => {
      const n = placed[g.id] || 0, q = g.qty || 1;
      if (n) used[g.id] = Math.min(n, q);
      if (n > q) rows.push({ name: g.name, qty: n - q, status: 'manquant', type: g.type, note: 'plus d\'exemplaires posés que dans l\'inventaire' });
      pool.push({ g, common: true, avail: Math.max(0, q - n) });
    });
    // Besoin calculé : pris dans l'inventaire non posé, le reste est à prévoir.
    const alloc = (n, pred, name, note, type) => {
      pool.forEach(e => {
        if (n <= 0 || e.avail <= 0 || !pred(e.g)) return;
        const t = Math.min(n, e.avail);
        e.avail -= t; n -= t;
        if (e.common) used[e.g.id] = (used[e.g.id] || 0) + t;
      });
      if (n > 0) rows.push({ name, qty: n, status: 'manquant', type: type || 'Accessoire', note });
      return n;
    };
    const claims = micClaims(p), R = it => info(it).role;
    // Pieds de micro
    const standNeed = p.items.filter(i => R(i) === 'mic' && O(i).stand).length + p.items.filter(i => R(i) === 'amp' && O(i).pickup === 'mic').length;
    const standOn = p.items.filter(i => R(i) === 'stand' && /micro/i.test(info(i).name)).length;
    if (standNeed > standOn) alloc(standNeed - standOn, g => roleOf(g.type, g.name) === 'stand' && /micro/i.test(g.name), 'Pied de micro', standNeed + ' nécessaires (micros sur pied et repiquages d\'ampli)', 'Pied / support');
    // DI et micros de repiquage que le câblage n'a pas trouvés sur le plan
    const diMiss = chanLinks(p).filter(l => { const f = item(p, l.from), r = R(f); return r === 'keys' || (r === 'inst' && O(f).mode === 'di'); }).length;
    if (diMiss) alloc(diMiss, g => roleOf(g.type, g.name) === 'di', 'Boîtier de direct (DI)', 'instrument relié à la table sans DI sur le plan');
    const micMiss = p.items.filter(i => R(i) === 'amp' && O(i).pickup === 'mic' && !claims.byAmp[i.id]).length;
    if (micMiss) alloc(micMiss, g => g.type === 'Micro' && !/chant|voix|batterie|kit|pince/i.test(g.name), 'Micro de repiquage (instrument)', 'pour les amplis repiqués', 'Micro');
    // Multiprises (suggestion : une pour 6 appareils par arrivée)
    const el_ = elec(p);
    const multi = el_.groups.reduce((s, g) => s + (g.n > 1 ? Math.ceil(g.n / 6) : 0), 0);
    if (multi) alloc(multi, g => /multiprise/i.test(g.name), 'Multiprise 6 prises', 'suggestion : ' + el_.total + ' appareils sur secteur');
    // 3. Câbles : besoin regroupé par type et longueur, rapproché de l'inventaire.
    const need = {};
    p.links.forEach(l => { const k = l.cable + '|' + l.length; (need[k] = need[k] || { cable: l.cable, len: +l.length || 0, n: 0 }).n++; });
    const cables = Object.keys(need).map(k => need[k]).sort((a, b) => CABLES.indexOf(a.cable) - CABLES.indexOf(b.cable) || a.len - b.len);
    const stock = pool.map(e => ({ e, kind: cableKind(e.g.name), len: +((/(\d+(?:[.,]\d+)?)\s*m\b/i.exec(e.g.name) || [])[1] || '').replace(',', '.') || 0 })).filter(s => s.kind && s.len).sort((a, b) => a.len - b.len);
    cables.slice().sort((a, b) => b.len - a.len).forEach(c => {
      let n = c.n;
      stock.forEach(s => {
        if (n <= 0 || s.kind !== c.cable || s.len < c.len || s.e.avail <= 0) return;
        const t = Math.min(n, s.e.avail);
        s.e.avail -= t; n -= t;
        if (s.e.common) used[s.e.g.id] = (used[s.e.g.id] || 0) + t;
      });
      c.have = c.n - n; c.miss = n;
      if (n > 0) rows.push({ name: cableName(c.cable, c.len), qty: n, status: 'manquant', type: 'Câble', note: c.n + ' nécessaires, ' + c.have + ' à l\'inventaire' });
    });
    // 4. Matériel commun utilisé (posé ou requis par le câblage).
    common.forEach(g => {
      if (!used[g.id]) return;
      const q = g.qty || 1;
      rows.push({ name: g.name, qty: used[g.id], status: g.owner === 'location' ? 'location' : 'groupe', type: g.type, note: [used[g.id] < q ? used[g.id] + ' sur ' + q : '', g.note || ''].filter(Boolean).join(' · ') });
    });
    // 5. Éléments libres (hors inventaire) et besoins ajoutés à la main.
    const ex = {};
    p.items.filter(i => i.kind === 'extra' && R(i) !== 'power').forEach(i => { (ex[i.name] = ex[i.name] || { name: i.name, qty: 0, status: 'manquant', type: i.type, note: 'élément libre, hors inventaire' }).qty++; });
    Object.keys(ex).forEach(k => rows.push(ex[k]));
    p.needs.forEach(n => {
      const e = n.ref && idx.gear[n.ref];
      const st = e ? (e.src === 'musicien' ? 'musicien' : e.src) : (STATUS[n.status] ? n.status : 'manquant');
      rows.push({ name: e ? e.g.name : n.name, qty: n.qty || 1, status: st, who: e && e.owner ? (idx.mus[e.owner] || {}).firstName : '', type: e ? e.g.type : '', note: n.ref && !e && input ? 'absent du dernier export JamHit' : 'ajouté à la main', need: n.id });
    });
    return { rows, cables, elec: el_ };
  }

  function warnings(p) {
    const w = [], R = it => info(it).role;
    if (!input) { w.push('Aucune donnée JamHit chargée : la bibliothèque ne contient que les éléments libres.'); }
    const gone = p.items.filter(i => info(i).missing).map(lab);
    if (gone.length) w.push('Absent du dernier export JamHit (toujours sur le plan) : ' + gone.join(', ') + '.');
    const sets = p.setIds.filter(id => input && !idx.sets[id]);
    if (sets.length) w.push(sets.length + ' set associé introuvable dans le dernier export JamHit.');
    const wired = p.items.some(i => ['mic', 'amp', 'keys', 'speaker', 'monitor'].includes(R(i)));
    const mixer = p.items.find(i => R(i) === 'mixer');
    if (wired && !mixer) w.push('Aucune table de mixage sur le plan : les liaisons audio ne peuvent pas être proposées.');
    const e = elec(p);
    if (e.total && !e.inlets) w.push('Aucune arrivée électrique sur le plan : ' + e.total + ' appareils ont besoin du secteur.');
    const ch = chanLinks(p).length, inp = mixer && +O(mixer).inputs;
    if (inp && ch > inp) w.push(ch + ' voies nécessaires pour ' + inp + ' entrées sur la table.');
    const long = p.links.filter(l => l.length > 20).length;
    if (long) w.push(long + ' liaison(s) de plus de 20 m : hors longueurs standard.');
    return w;
  }

  // ====================== Dessin (SVG) ======================
  function sym(role, it) {
    switch (role) {
      case 'musician': return `<path class="sp-fl" d="M-10 22L0 36L10 22Z"/><circle class="sp-sh" r="28"/><text class="sp-ini" y="9" text-anchor="middle" font-size="26">${esc((lab(it) || '?').charAt(0).toUpperCase())}</text>`;
      case 'amp': return '<rect class="sp-sh" x="-30" y="-18" width="60" height="36" rx="4"/><path class="sp-ln" d="M-22 10H22"/>';
      case 'mic': return '<circle class="sp-ln" r="14"/><circle class="sp-fl" r="7"/>';
      case 'keys': return '<rect class="sp-sh" x="-65" y="-17" width="130" height="34" rx="3"/><path class="sp-ln" d="M-58 2H58M-39 2V17M-19 2V17M0 2V17M19 2V17M39 2V17"/>';
      case 'inst': return '<path class="sp-sh" d="M0 -22L22 0L0 22L-22 0Z"/>';
      case 'drums': return '<circle class="sp-sh" cx="0" cy="24" r="30"/><circle class="sp-sh" cx="-21" cy="-14" r="14"/><circle class="sp-sh" cx="21" cy="-14" r="14"/><circle class="sp-sh" cx="-52" cy="-34" r="17"/><circle class="sp-sh" cx="54" cy="-28" r="19"/><circle class="sp-ln" cx="-70" cy="2" r="13"/><circle class="sp-ln" cx="66" cy="22" r="16"/>';
      case 'pedals': return '<rect class="sp-sh" x="-28" y="-12" width="56" height="24" rx="3"/><circle class="sp-fl" cx="-15" r="3.5"/><circle class="sp-fl" r="3.5"/><circle class="sp-fl" cx="15" r="3.5"/>';
      case 'speaker': return '<rect class="sp-sh" x="-24" y="-24" width="48" height="48" rx="3"/><circle class="sp-ln" r="13"/>';
      case 'monitor': return '<path class="sp-sh" d="M-30 -20H30L20 20H-20Z"/><path class="sp-ln" d="M-14 8H14"/>';
      case 'mixer': return '<rect class="sp-sh" x="-55" y="-28" width="110" height="56" rx="4"/><path class="sp-ln" d="M-40 -16V16M-24 -16V16M-8 -16V16M8 -16V16M24 -16V16M40 -16V16"/>';
      case 'di': return '<rect class="sp-sh" x="-13" y="-13" width="26" height="26" rx="2"/><text class="sp-tx" y="5" text-anchor="middle" font-size="14">DI</text>';
      case 'stand': return '<path class="sp-ln" d="M0 0V-20M0 0L17 10M0 0L-17 10"/><circle class="sp-fl" r="4"/>';
      case 'power': return '<rect class="sp-sh" x="-16" y="-16" width="32" height="32" rx="7"/><path class="sp-fl" d="M3 -11L-7 2H0L-3 11L7 -2H0Z"/>';
      case 'riser': return '<rect class="sp-riser" x="-100" y="-50" width="200" height="100"/>';
      case 'light': return '<circle class="sp-sh" r="11"/><path class="sp-ln" d="M0 -18V-14M0 14V18M-18 0H-14M14 0H18M-13 -13L-10 -10M10 10L13 13M-13 13L-10 10M10 -10L13 -13"/>';
      default: return '<rect class="sp-sh" x="-18" y="-13" width="36" height="26" rx="6"/>';
    }
  }
  const mini = (role, name) => { const s = SIZE[role] || SIZE.misc, k = Math.max(s[0], s[1]) / 2 + 6; return `<svg class="sp-mini sp-it sp-r-${role}" viewBox="${-k} ${-k} ${2 * k} ${2 * k}" aria-hidden="true">${sym(role, { label: name || '?' })}</svg>`; };
  const viewBox = p => `${-PAD.l * 100} ${-PAD.t * 100} ${(p.stage.width + PAD.l + PAD.r) * 100} ${(p.stage.depth + PAD.t + PAD.b) * 100}`;

  function drawStage(p, o) {
    const W = p.stage.width * 100, D = p.stage.depth * 100, k = 100 / o.ppm;   // k : unités du dessin par pixel d'écran
    const fs = clamp(11 * k, 8, 60), minHit = 40 * k;
    let s = `<rect class="sp-stage" x="0" y="0" width="${W}" height="${D}"/>`;
    if (p.settings.grid) {
      let g = '';
      for (let x = 100; x < W; x += 100) g += `M${x} 0V${D}`;
      for (let y = 100; y < D; y += 100) g += `M0 ${y}H${W}`;
      s += `<path class="sp-grid" d="${g}"/>`;
    }
    s += `<path class="sp-front" d="M0 ${D}H${W}"/>`
      + `<text class="sp-tx sp-dim" x="${W / 2}" y="${D + PAD.b * 100 - fs * 0.8}" text-anchor="middle" font-size="${fs * 1.2}">PUBLIC</text>`
      + `<text class="sp-tx sp-dim" x="${W / 2}" y="${-fs * 0.6}" text-anchor="middle" font-size="${fs}">Fond de scène · ${esc(fr(p.stage.width))} × ${esc(fr(p.stage.depth))} m</text>`;
    const draw = it => {
      const i = info(it), sz = SIZE[i.role] || SIZE.misc, on = o.sel === it.id, src = o.linkFrom === it.id;
      const rot = ((it.rot % 360) + 360) % 360;
      const half = rot % 180 === 0 ? sz[1] / 2 : rot % 90 === 0 ? sz[0] / 2 : Math.max(sz[0], sz[1]) / 2;
      const hw = Math.max(sz[0], minHit) / 2, hh = Math.max(sz[1], minHit) / 2;
      // l'étiquette reste dans le cadre du dessin
      const txt = cut(lab(it), on ? 40 : o.ppm < 55 ? 11 : 16), tw = txt.length * fs * 0.3, cx = it.x * 100;
      const dx = clamp(cx, -PAD.l * 100 + tw + 4, W + PAD.r * 100 - tw - 4) - cx;
      return `<g class="sp-it sp-r-${i.role}${on ? ' sp-on' : ''}${src ? ' sp-src' : ''}${i.missing ? ' sp-miss' : ''}" data-it="${esc(it.id)}" transform="translate(${it.x * 100} ${it.y * 100})">`
        + (on || src ? `<rect class="sp-ring" x="${-sz[0] / 2 - 8}" y="${-sz[1] / 2 - 8}" width="${sz[0] + 16}" height="${sz[1] + 16}" rx="10" transform="rotate(${rot})"/>` : '')
        + `<g transform="rotate(${rot})">${sym(i.role, it)}</g>`
        + `<rect class="sp-hit" x="${-hw}" y="${-hh}" width="${2 * hw}" height="${2 * hh}"/>`
        + (QUIET.includes(i.role) && !on && !src && !it.label && !i.missing ? '' : `<text class="sp-lab" x="${dx}" y="${half + fs * 1.05}" text-anchor="middle" font-size="${fs}" stroke-width="${fs * 0.3}">${esc(txt)}${i.missing ? ' ?' : ''}</text>`) + '</g>';
    };
    const risers = p.items.filter(i => info(i).role === 'riser'), area = i => { const z = SIZE[info(i).role] || SIZE.misc; return z[0] * z[1]; },
      others = p.items.filter(i => info(i).role !== 'riser' && i.id !== o.sel).sort((x, y) => area(y) - area(x)), top = p.items.filter(i => i.id === o.sel && info(i).role !== 'riser');
    s += risers.map(draw).join('');
    if (o.links !== 'none') {
      s += p.links.map(l => {
        const a = item(p, l.from), b = item(p, l.to);
        if (!a || !b) return '';
        const ax = a.x * 100, ay = a.y * 100, bx = b.x * 100, by = b.y * 100, hz = Math.abs(bx - ax) >= Math.abs(by - ay);
        const d = hz ? `M${ax} ${ay}H${bx}V${by}` : `M${ax} ${ay}V${by}H${bx}`;
        const lx = hz ? (ax + bx) / 2 : ax, ly = hz ? ay : (ay + by) / 2;
        return `<path class="sp-l sp-l-${CCLS[l.cable] || 'oth'}${o.links === 'faint' ? ' sp-l-faint' : ''}${o.selLink === l.id ? ' sp-l-on' : ''}" d="${d}" stroke-width="${clamp(2 * k, 2, 12)}"/>`
          + (o.links === 'full' ? `<text class="sp-lab sp-l-len" x="${lx}" y="${ly - fs * 0.3}" text-anchor="middle" font-size="${fs * 0.85}" stroke-width="${fs * 0.3}">${esc(fr(l.length))} m</text>` : '');
      }).join('');
    }
    return s + others.map(draw).join('') + top.map(draw).join('');
  }
  function layout() {
    const w = el('sp-wrap'), s = el('sp-svg'), p = plan();
    if (!w || !s || !p) return;
    const tw = p.stage.width + PAD.l + PAD.r, th = p.stage.depth + PAD.t + PAD.b;
    // sur téléphone, le cadre épouse la scène pour ne pas perdre de hauteur
    w.style.height = window.innerWidth < 900 ? Math.round(clamp(th * (w.clientWidth - 4) / tw + 4, 220, window.innerHeight * 0.62)) + 'px' : '';
    ppm = Math.max(8, Math.min((w.clientWidth - 4) / tw, (w.clientHeight - 4) / th)) * ui.zoom;
    s.style.width = tw * ppm + 'px'; s.style.height = th * ppm + 'px';
    s.setAttribute('viewBox', viewBox(p));
    s.innerHTML = drawStage(p, { ppm, sel: ui.sel, linkFrom: ui.linkFrom, selLink: ui.tab === 'cable' ? ui.selLink : null, links: ui.tab === 'cable' ? 'full' : 'faint' });
  }
  const toM = e => { const r = el('sp-svg').getBoundingClientRect(); return { x: (e.clientX - r.left) / ppm - PAD.l, y: (e.clientY - r.top) / ppm - PAD.t }; };

  // ====================== Rendu HTML ======================
  const btn = (act, label, cls, extra) => `<button type="button" class="sp-btn${cls ? ' ' + cls : ''}" data-sp="${esc(act)}"${extra || ''}>${label}</button>`;
  const legend = () => `<div class="sp-legend">${CABLES.map(c => `<span><i class="sp-dot sp-c-${CCLS[c]}"></i>${esc(c)}</span>`).join('')}</div>`;

  function html() {
    const p = plan(), h = H(p.id), w = warnings(p);
    return `<div class="sp-head">
        <select class="sp-inp sp-plansel" id="sp-plansel" data-sp="plansel" aria-label="Plan de scène">${plans.map(x => `<option value="${esc(x.id)}"${x === p ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
        ${btn('undo', '↶', 'sp-ico', ` title="Annuler" aria-label="Annuler"${h.undo.length ? '' : ' disabled'}`)}
        ${btn('redo', '↷', 'sp-ico', ` title="Rétablir" aria-label="Rétablir"${h.redo.length ? '' : ' disabled'}`)}
        <span class="sp-menuwrap">${btn('menu', 'Menu ▾')}${ui.menu ? `<div class="sp-menu">
          ${btn('plan:new', 'Nouveau plan')}${btn('print', 'Imprimer / PDF')}${btn('exp:json', 'Exporter le plan (JSON)')}${btn('imp', 'Importer un plan (JSON)')}
          ${btn('exp:gear', 'Liste de matériel (CSV)')}${btn('exp:cables', 'Liste de câbles (CSV)')}
          ${btn('plan:dup', 'Dupliquer ce plan')}${btn('plan:del', 'Supprimer ce plan', 'sp-danger')}</div>` : ''}</span>
        <input type="file" id="sp-imp" class="sp-hide" data-sp="impfile" accept=".json,application/json">
      </div>
      <div class="sp-tabs" role="tablist">${[['plan', 'Plan'], ['cable', 'Câblage'], ['gear', 'Matériel']].map(([k, l]) => `<button type="button" role="tab" class="sp-tab${ui.tab === k ? ' sp-tab-on' : ''}" data-sp="tab:${k}">${l}</button>`).join('')}</div>
      ${w.length ? `<ul class="sp-warn">${w.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${ui.tab === 'gear' ? gearHTML(p) : mainHTML(p)}`;
  }

  function mainHTML(p) {
    const cab = ui.tab === 'cable';
    return `<div class="sp-main ${cab ? 'sp-m-cable' : 'sp-m-plan'}${ui.sheet ? ' sp-sh-' + ui.sheet : ''}">
      ${cab ? '' : `<aside class="sp-lib sp-sheet"><div class="sp-sheet-h"><b>Bibliothèque</b>${btn('sheet:', 'Fermer', 'sp-only-sheet')}</div><div class="sp-scroll" id="sp-libscroll">${libHTML(p)}</div></aside>`}
      <section class="sp-center">
        <div class="sp-bar">
          ${cab ? btn('auto', 'Proposer le câblage', 'sp-pri') : btn('sheet:lib', '＋ Ajouter', 'sp-pri sp-narrow')}
          <span class="sp-grow"></span>
          ${btn('zoom:-', '−', 'sp-ico', ' title="Dézoomer" aria-label="Dézoomer"')}${btn('zoom:+', '+', 'sp-ico', ' title="Zoomer" aria-label="Zoomer"')}${btn('zoom:0', '⤢', 'sp-ico', ' title="Ajuster à l\'écran" aria-label="Ajuster à l\'écran"')}
          ${btn('settings', 'Réglages', cab ? '' : 'sp-narrow')}
        </div>
        <div class="sp-selbar">${selbarHTML(p)}</div>
        <div class="sp-wrap" id="sp-wrap"><svg class="sp-svg" id="sp-svg" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Plan de scène"></svg></div>
        ${legend()}
      </section>
      ${cab ? `<aside class="sp-side"><div class="sp-scroll" id="sp-sidescroll">${cableHTML(p)}</div></aside>` : ''}
      <aside class="sp-props sp-sheet"><div class="sp-sheet-h"><b>${ui.sel && item(p, ui.sel) ? 'Élément' : 'Réglages du plan'}</b>${btn('sheet:', 'Fermer', 'sp-only-sheet')}</div><div class="sp-scroll" id="sp-propscroll">${propsHTML(p)}</div></aside>
    </div>`;
  }

  function selbarHTML(p) {
    const it = ui.sel && item(p, ui.sel);
    if (ui.offer && item(p, ui.offer)) {
      const mi = item(p, ui.offer), n = pendingGear(p, mi.ref).length;
      return `<span class="sp-sel-t">Poser aussi le matériel de <b>${esc(lab(mi))}</b> (${n}) ?</span>${btn('offer:yes', 'Poser', 'sp-pri')}${btn('offer:no', 'Non')}`;
    }
    if (ui.linkFrom && item(p, ui.linkFrom)) return `<span class="sp-sel-t">Touchez l'élément à relier à <b>${esc(lab(item(p, ui.linkFrom)))}</b></span>${btn('linkcancel', 'Annuler')}`;
    if (!it) return '<span class="sp-sel-t sp-muted">Touchez un élément pour le sélectionner, glissez-le pour le déplacer.</span>';
    return `<span class="sp-sel-t sp-sel-name"><b>${esc(lab(it))}</b></span>
      ${btn('rot:-45', '↺', 'sp-ico', ' title="Tourner à gauche" aria-label="Tourner à gauche"')}${btn('rot:45', '↻', 'sp-ico', ' title="Tourner à droite" aria-label="Tourner à droite"')}
      ${btn('link', 'Relier')}${canDup(p, it) ? btn('dup', '⧉', 'sp-ico', ' title="Dupliquer" aria-label="Dupliquer"') : ''}${btn('sheet:props', 'Options', 'sp-opt')}${btn('del', '✕', 'sp-ico sp-danger', ' title="Supprimer" aria-label="Supprimer"')}`;
  }

  function libHTML(p) {
    const row = (key, name, sub, cnt, off, role) => `<div class="sp-li${off ? ' sp-off' : ''}" data-lib="${esc(key)}" data-sp="add:${esc(key)}" role="button" tabindex="0"><span class="sp-grip">${mini(role, name)}</span><span class="sp-li-t"><b>${esc(name)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>${cnt ? `<span class="sp-cnt">${esc(cnt)}</span>` : ''}</div>`;
    const sec = (key, title, body, def) => { const open = ui.lib[key] == null ? def : ui.lib[key]; return `<div class="sp-sec"><button type="button" class="sp-sec-h" data-sp="lib:${esc(key)}:${open ? 0 : 1}">${open ? '▾' : '▸'} ${esc(title)}</button>${open ? body : ''}</div>`; };
    const gearRow = g => { const n = placedCount(p, g.id), q = g.qty || 1; return row('g:' + g.id, g.name, [g.type, g.note].filter(Boolean).join(' · '), n + '/' + q, n >= q, roleOf(g.type, g.name)); };
    let s = '<p class="sp-hint">Touchez un élément pour le poser, ou glissez-le sur la scène par son symbole.</p>';
    if (input) {
      const sc = scope(p), mus = input.musicians || [];
      const isOn = m => p.items.some(i => i.kind === 'musician' && i.ref === m.id);
      const mrow = m => row('m:' + m.id, m.firstName || 'Musicien', (m.instruments || []).join(', ') + (m.guest ? ' · invité' : ''), isOn(m) ? 'posé' : '', isOn(m), 'musician');
      const inS = sc.size ? mus.filter(m => sc.has(m.id)) : mus, out = sc.size ? mus.filter(m => !sc.has(m.id)) : [];
      s += sec('mus', sc.size ? 'Musiciens du set' : 'Musiciens', inS.map(mrow).join('') || '<p class="sp-hint">Aucun musicien.</p>', true);
      if (out.length) s += sec('out', 'Hors set (' + out.length + ')', out.map(mrow).join(''), false);
      mus.filter(m => (m.gear || []).length && (isOn(m) || !sc.size || sc.has(m.id))).forEach(m => { s += sec('g-' + m.id, 'Matériel de ' + (m.firstName || '?'), m.gear.map(gearRow).join(''), isOn(m)); });
      const cg = (input.commonGear || []).filter(g => !['Câble', 'Éclairage'].includes(g.type));
      s += sec('common', 'Matériel commun', cg.map(gearRow).join('') || '<p class="sp-hint">Aucun matériel commun.</p>', true);
    }
    return s + sec('extra', 'Éléments libres', EXTRAS.map((x, n) => row('x:' + n, x.name, 'hors inventaire', '', false, roleOf(x.type, x.name))).join(''), true);
  }

  const fld = (label, inner) => `<label class="sp-fld"><span>${label}</span>${inner}</label>`;
  const chk = (act, label, on) => `<label class="sp-chk"><input type="checkbox" data-sp="${esc(act)}"${on ? ' checked' : ''}><span>${label}</span></label>`;
  const opts = (list, v) => list.map(([k, l]) => `<option value="${esc(k)}"${String(v) === String(k) ? ' selected' : ''}>${esc(l)}</option>`).join('');

  function propsHTML(p) {
    const it = ui.sel && item(p, ui.sel);
    if (!it) {
      const sets = (input && input.sets) || [];
      return `${fld('Nom du plan', `<input class="sp-inp" id="sp-f-name" data-sp="pname" value="${esc(p.name)}" maxlength="60">`)}
        <div class="sp-two">${fld('Largeur (m)', `<input class="sp-inp" id="sp-f-w" type="number" inputmode="decimal" min="1" max="40" step="0.5" data-sp="stage:width" value="${esc(p.stage.width)}">`)}
        ${fld('Profondeur (m)', `<input class="sp-inp" id="sp-f-d" type="number" inputmode="decimal" min="1" max="30" step="0.5" data-sp="stage:depth" value="${esc(p.stage.depth)}">`)}</div>
        ${chk('set2:grid', 'Grille (1 m)', p.settings.grid)}${chk('set2:snap', 'Aimantation (25 cm)', p.settings.snap)}
        ${fld('Marge sur les câbles (%)', `<input class="sp-inp" id="sp-f-m" type="number" inputmode="numeric" min="0" max="100" step="5" data-sp="margin" value="${esc(p.settings.margin)}">`)}
        <h4>Sets associés</h4>
        ${sets.length ? sets.map(s => chk('set:' + s.id, `${esc(s.name)} <small>${esc(frDate(s.date))} · ${s.type === 'live' ? 'concert' : 'répétition'}</small>`, p.setIds.includes(s.id))).join('') : '<p class="sp-hint">Aucun set dans les données reçues.</p>'}
        ${p.setIds.filter(id => !idx.sets[id]).map(id => chk('set:' + id, 'Set introuvable <small>absent du dernier export</small>', true)).join('')}
        ${fld('Notes', `<textarea class="sp-inp" id="sp-f-notes" rows="3" data-sp="notes">${esc(p.notes)}</textarea>`)}`;
    }
    const i = info(it), o = O(it), own = ownerName(p, it);
    const num = (key, label, unit) => fld(label, `<input class="sp-inp" id="sp-o-${key}" type="number" inputmode="numeric" min="0" data-sp="opt:${key}" value="${esc(o[key] == null ? '' : o[key])}" placeholder="${unit}">`);
    const sel = (key, label, list) => fld(label, `<select class="sp-inp" data-sp="opt:${key}">${opts(list, o[key])}</select>`);
    let f = '';
    if (i.role === 'mic') f += (o.channels > 1 ? '' : sel('use', 'Utilisation', [['voix', 'Voix'], ['inst', 'Instrument / repiquage']]) + chk('opt:stand', 'Sur pied de micro', o.stand)) + chk('opt:phantom', 'Alimentation fantôme (48 V)', o.phantom) + num('channels', 'Nombre de voies (kit)', '1');
    if (i.role === 'amp') f += sel('pickup', 'Reprise par la sono', [['mic', 'Repiqué au micro'], ['di', 'Sortie DI de l\'ampli'], ['none', 'Non repris']]);
    if (i.role === 'keys') f += chk('opt:stereo', 'Stéréo (2 voies, 2 DI)', o.stereo);
    if (i.role === 'inst') f += sel('mode', 'Branchement', [['none', 'Acoustique (pas de liaison)'], ['amp', 'Vers l\'ampli du musicien'], ['di', 'Par une DI vers la table']]);
    if (i.role === 'speaker' || i.role === 'monitor') f += chk('opt:powered', 'Amplifié (secteur)', o.powered !== false);
    if (i.role === 'mixer') f += num('inputs', 'Entrées de la table', 'voies');
    if (['amp', 'keys', 'pedals', 'mixer', 'misc', 'light'].includes(i.role)) f += chk('opt:mains', 'Branché sur le secteur', o.mains);
    if (needsMains(it)) f += num('watts', 'Puissance (W)', 'W');
    const links = p.links.filter(l => l.from === it.id || l.to === it.id);
    return `<p class="sp-pname"><b>${esc(i.name)}</b><small>${esc([i.type, own, i.src === 'location' ? 'à louer' : i.src === 'groupe' ? 'au groupe' : ''].filter(Boolean).join(' · '))}</small>${i.note ? `<small>${esc(i.note)}</small>` : ''}${i.missing ? '<small class="sp-bad">Absent du dernier export JamHit.</small>' : ''}</p>
      ${fld('Étiquette sur le plan', `<input class="sp-inp" id="sp-f-lab" data-sp="label" value="${esc(it.label || '')}" placeholder="${esc(i.name)}" maxlength="40">`)}
      ${f}
      <h4>Liaisons (${links.length})</h4>
      ${links.map(l => { const a = item(p, l.from), b = item(p, l.to); return `<div class="sp-mini-l"><i class="sp-dot sp-c-${CCLS[l.cable] || 'oth'}"></i><span>${esc(lab(a))} → ${esc(lab(b))} <small>${esc(l.cable)} · ${esc(fr(l.length))} m</small></span>${btn('ldel:' + l.id, '✕', 'sp-ico', ' aria-label="Supprimer la liaison"')}</div>`; }).join('') || '<p class="sp-hint">Aucune liaison. Utilisez « Relier » ou l\'onglet Câblage.</p>'}`;
  }

  function cablesHTML(gl) {
    return gl.cables.length ? `<ul class="sp-list">${gl.cables.map(c => `<li><span class="sp-q">${c.n} ×</span><span><i class="sp-dot sp-c-${CCLS[c.cable] || 'oth'}"></i> ${esc(c.cable)} ${esc(fr(c.len))} m</span><span class="sp-badge${c.miss ? ' sp-b-bad' : ''}">${c.miss ? c.miss + ' à prévoir' : 'à l\'inventaire'}</span></li>`).join('')}</ul>` : '<p class="sp-hint">Aucune liaison pour l\'instant.</p>';
  }
  function patchTable(p) {
    const rows = patch(p);
    return rows.length ? `<div class="sp-tw"><table class="sp-table"><thead><tr><th>Voie</th><th>Source</th><th>Micro / DI</th><th>48 V</th><th>Remarque</th></tr></thead><tbody>${rows.map(r => `<tr><td><input class="sp-inp sp-ch" type="number" inputmode="numeric" min="1" data-sp="lch:${esc(r.l.id)}" value="${esc(r.ch || '')}" aria-label="Voie"></td><td>${esc(r.src)}</td><td>${esc(r.cap)}</td><td>${r.ph ? 'oui' : ''}</td><td>${esc(r.note)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="sp-hint">Aucune voie : posez une table de mixage et des sources, puis proposez le câblage.</p>';
  }
  function outputsHTML(p) {
    const o = outputs(p);
    return o.length ? `<ul class="sp-list">${o.map(x => `<li><span><b>${esc(x.note || 'Sortie')}</b> <small>${esc(x.to)} · ${esc(x.l.cable)} ${esc(fr(x.l.length))} m</small></span></li>`).join('')}</ul>` : '';
  }

  function cableHTML(p) {
    const gl = gearList(p);
    const rows = p.links.map(l => {
      const a = item(p, l.from), b = item(p, l.to);
      return `<div class="sp-link${ui.selLink === l.id ? ' sp-link-on' : ''}" data-sp="lsel:${esc(l.id)}">
        <div class="sp-link-t"><i class="sp-dot sp-c-${CCLS[l.cable] || 'oth'}"></i><span>${esc(full(p, a))} → ${esc(full(p, b))}</span>${l.auto ? '<span class="sp-badge">auto</span>' : ''}${l.length > 20 ? '<span class="sp-badge sp-b-bad">&gt; 20 m</span>' : ''}</div>
        <div class="sp-link-f"><select class="sp-inp" data-sp="lcable:${esc(l.id)}" aria-label="Type de câble">${opts(CABLES.map(c => [c, c]), l.cable)}</select>
          <span class="sp-len"><input class="sp-inp" type="number" inputmode="decimal" min="0" step="1" data-sp="llen:${esc(l.id)}" value="${esc(l.length)}" aria-label="Longueur en mètres"${l.fixed ? ' title="Longueur imposée : videz le champ pour revenir au calcul"' : ''}> m${l.fixed ? ' ✎' : ''}</span>
          <input class="sp-inp sp-note" data-sp="lnote:${esc(l.id)}" value="${esc(l.note || '')}" placeholder="Remarque" aria-label="Remarque">
          ${btn('ldel:' + l.id, '✕', 'sp-ico', ' aria-label="Supprimer la liaison"')}</div></div>`;
    }).join('');
    return `<p class="sp-hint">« Proposer le câblage » recalcule les liaisons marquées <i>auto</i> ; celles créées ou modifiées à la main sont conservées. Pour en ajouter une : sélectionnez un élément, « Relier », puis touchez l'autre.</p>
      <h3>Liaisons (${p.links.length})</h3>${rows || '<p class="sp-hint">Aucune liaison.</p>'}
      <h3>Patch <span class="sp-h-act">${btn('renum', 'Renuméroter')}</span></h3>${patchTable(p)}
      ${outputs(p).length ? '<h3>Sorties de la table</h3>' + outputsHTML(p) : ''}
      <h3>Câbles nécessaires</h3>${cablesHTML(gl)}`;
  }

  function elecHTML(e) {
    if (!e.total) return '<p class="sp-hint">Aucun appareil sur secteur.</p>';
    return `<p><b>${e.total} prise${e.total > 1 ? 's' : ''}</b> nécessaire${e.total > 1 ? 's' : ''}${e.watts ? ` · puissance indiquée ≈ <b>${e.watts} W</b>` : ''}${e.unknown ? ` <small>(${e.unknown} appareil${e.unknown > 1 ? 's' : ''} sans puissance renseignée)</small>` : ''}</p>
      <ul class="sp-list">${e.groups.map(g => `<li><span><b>${esc(g.name)}</b> <small>${g.n} appareil${g.n > 1 ? 's' : ''}${g.watts ? ' · ≈ ' + g.watts + ' W' : ''} — ${esc(g.items.join(', '))}</small></span></li>`).join('')}</ul>
      <p class="sp-hint">Aide indicative : la puissance des amplis est celle affichée, pas leur consommation.</p>`;
  }
  function rowsHTML(rows, del) {
    return `<ul class="sp-list">${rows.map(r => `<li><span class="sp-q">${esc(r.qty)} ×</span><span><b>${esc(r.name)}</b>${r.note ? ` <small>${esc(r.note)}</small>` : ''}</span>${r.status === 'location' || r.status === 'manquant' ? `<span class="sp-badge${r.status === 'manquant' ? ' sp-b-bad' : ''}">${r.status === 'location' ? 'à louer' : 'manquant'}</span>` : ''}${del && r.need ? btn('needdel:' + r.need, '✕', 'sp-ico', ' aria-label="Retirer"') : ''}</li>`).join('')}</ul>`;
  }
  function gearSections(p, gl, edit, below) {
    const mus = gl.rows.filter(r => r.status === 'musicien'), grp = gl.rows.filter(r => r.status === 'groupe'), mis = gl.rows.filter(r => r.status === 'location' || r.status === 'manquant');
    const who = [];
    mus.forEach(r => { if (!who.includes(r.who)) who.push(r.who); });
    return `<section class="sp-card"><h3>Apporté par les musiciens</h3>${who.map(w => `<h4>${esc(w || '?')}</h4>${rowsHTML(mus.filter(r => r.who === w), edit)}`).join('') || '<p class="sp-hint">Posez des musiciens sur le plan.</p>'}</section>
      ${below ? '<div class="sp-stack">' : ''}<section class="sp-card"><h3>Disponible au groupe</h3>${grp.length ? rowsHTML(grp, edit) : '<p class="sp-hint">Rien pour l\'instant.</p>'}</section>${below ? below + '</div>' : ''}
      <section class="sp-card sp-card-bad"><h3>À louer ou manquant</h3>${mis.length ? rowsHTML(mis, edit) : '<p class="sp-hint">Rien à prévoir.</p>'}</section>`;
  }
  function gearHTML(p) {
    const gl = gearList(p);
    const inv = input ? (input.commonGear || []).filter(g => !placedCount(p, g.id) && !p.needs.some(n => n.ref === g.id)) : [];
    return `<div class="sp-gear">
      <div class="sp-bar">${btn('exp:gear', 'Matériel (CSV)')}${btn('exp:cables', 'Câbles (CSV)')}${btn('print', 'Imprimer / PDF')}</div>
      <div class="sp-cols">${gearSections(p, gl, true)}
        <section class="sp-card"><h3>Câbles</h3>${cablesHTML(gl)}</section>
        <section class="sp-card"><h3>Besoin électrique</h3>${elecHTML(gl.elec)}</section>
        <section class="sp-card"><h3>Ajouter un besoin</h3>
          ${inv.length ? `<div class="sp-addrow"><select class="sp-inp" id="sp-n-inv" aria-label="Matériel de l'inventaire">${inv.map(g => `<option value="${esc(g.id)}">${esc(g.name)} (${g.owner === 'location' ? 'à louer' : 'au groupe'})</option>`).join('')}</select>${btn('needinv', 'Ajouter')}</div><p class="sp-hint">Matériel commun non posé sur le plan (éclairage, câbles, accessoires…).</p>` : ''}
          <div class="sp-addrow"><input class="sp-inp sp-note" id="sp-n-name" placeholder="Hors inventaire : nom" maxlength="60" aria-label="Nom"><input class="sp-inp sp-ch" id="sp-n-qty" type="number" inputmode="numeric" min="1" value="1" aria-label="Quantité">
            <select class="sp-inp" id="sp-n-st" aria-label="État">${opts([['location', 'À louer'], ['manquant', 'Manquant'], ['groupe', 'Au groupe']], 'location')}</select>${btn('needadd', 'Ajouter')}</div>
        </section>
      </div></div>`;
  }

  // ====================== Impression et exports ======================
  function printHTML(p) {
    const gl = gearList(p), tw = p.stage.width + PAD.l + PAD.r;
    const sets = p.setIds.map(id => idx.sets[id]).filter(Boolean).map(s => `${s.name} (${frDate(s.date)}, ${s.type === 'live' ? 'concert' : 'répétition'})`).join(' · ');
    const head = t => `<header class="sp-ph"><h1>${esc((input && input.band && input.band.name) || 'Plan de scène')} — ${esc(p.name)}</h1><p>${esc(t)}${sets ? ' · ' + esc(sets) : ''}</p></header>`;
    const links = p.links.map(l => `<tr><td>${esc(full(p, item(p, l.from)))}</td><td>${esc(full(p, item(p, l.to)))}</td><td>${esc(l.cable)}</td><td>${esc(fr(l.length))} m</td><td>${esc(l.note || '')}</td></tr>`).join('');
    return `<section class="sp-page">${head('Plan de scène')}
        <svg class="sp-svg sp-psvg" xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox(p)}">${drawStage(p, { ppm: 680 / tw, links: 'faint', print: true })}</svg>
        ${legend()}${p.notes ? `<p class="sp-pnotes">${esc(p.notes)}</p>` : ''}</section>
      <section class="sp-page">${head('Patch et câblage')}
        <h3>Patch</h3>${patchTable(p).replace(/<input[^>]*value="([^"]*)"[^>]*>/g, '$1')}
        <div class="sp-p2"><div>${outputs(p).length ? '<h3>Sorties de la table</h3>' + outputsHTML(p) : ''}</div>
        <div><h3>Câbles nécessaires</h3>${cablesHTML(gl)}</div></div>
        <div><h3>Liaisons</h3>${links ? `<table class="sp-table"><thead><tr><th>De</th><th>Vers</th><th>Câble</th><th>Long.</th><th>Remarque</th></tr></thead><tbody>${links}</tbody></table>` : '<p>Aucune liaison.</p>'}</div></section>
      <section class="sp-page">${head('Matériel')}<div class="sp-cols">${gearSections(p, gl, false, `<section class="sp-card"><h3>Besoin électrique</h3>${elecHTML(gl.elec)}</section>`)}</div></section>`;
  }
  function buildPrint() {
    const p = plan();
    if (!p || printEl) return;
    printEl = document.createElement('div');
    printEl.className = 'sp-print';
    printEl.innerHTML = printHTML(p);
    document.body.appendChild(printEl);
    document.documentElement.classList.add('sp-printing');
  }
  function clearPrint() {
    if (printEl) printEl.remove();
    printEl = null;
    document.documentElement.classList.remove('sp-printing');
  }
  function download(name, text, type) {
    const a = document.createElement('a'), url = URL.createObjectURL(new Blob([text], { type }));
    a.href = url; a.download = name; a.className = 'sp-hide';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  const csv = rows => '﻿' + rows.map(r => r.map(c => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(';')).join('\r\n') + '\r\n';
  const slug = s => (s || 'plan').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'plan';
  function exportAs(kind) {
    const p = plan(), gl = gearList(p), base = 'plan-de-scene-' + slug(p.name);
    if (kind === 'json') download(base + '.json', JSON.stringify(Object.assign({ app: 'jamhit', format: 'stage-plan', version: 1 }, p), null, 1), 'application/json');
    else if (kind === 'gear') download(base + '-materiel.csv', csv([['Quantité', 'Matériel', 'Type', 'État', 'Qui', 'Remarque']].concat(gl.rows.map(r => [r.qty, r.name, r.type || '', r.status === 'musicien' ? 'Apporté par un musicien' : STATUS[r.status], r.who || '', r.note || '']))), 'text/csv');
    else download(base + '-cables.csv', csv([['Quantité', 'Câble', 'Longueur (m)', 'À l\'inventaire', 'À prévoir']].concat(gl.cables.map(c => [c.n, c.cable, fr(c.len), c.have, c.miss]))), 'text/csv');
  }
  function importFile(file) {
    const rd = new FileReader();
    rd.onload = () => {
      let d = null;
      try { d = JSON.parse(rd.result); } catch (e) { d = null; }
      if (!d || !d.stage || !Array.isArray(d.items)) { window.alert('Ce fichier n\'est pas un plan de scène (format « stage-plan »).'); return; }
      delete d.app; delete d.format; delete d.version;
      const p = norm(d);
      if (plans.some(x => x.id === p.id)) { p.id = uid('plan-'); p.name += ' (importé)'; }
      recalc(p);
      plans.push(p); curId = p.id; ui.sel = null;
      emit(); render();
    };
    rd.readAsText(file);
  }

  // ====================== Actions (délégation : data-sp="action:valeur") ======================
  function act(a, v) {
    const p = plan(), it = ui.sel && item(p, ui.sel);
    if (a !== 'menu') ui.menu = false;
    switch (a) {
      case 'menu': ui.menu = !ui.menu; break;
      case 'tab': ui.tab = v; ui.sheet = null; ui.linkFrom = null; ui.offer = null; break;
      case 'plan':
        if (v === 'new') { const n = newPlan(); plans.push(n); curId = n.id; }
        else if (v === 'dup') { const c = clone(p); c.id = uid('plan-'); c.name = p.name + ' (copie)'; c.updated = Date.now(); plans.push(c); curId = c.id; }
        else if (v === 'del') { if (!window.confirm('Supprimer le plan « ' + p.name + ' » ?')) return; plans = plans.filter(x => x !== p); curId = plans[0] ? plans[0].id : null; }
        ui.sel = null; ui.linkFrom = null; ui.offer = null; ensure(); emit(); break;
      case 'undo': timeTravel('undo', 'redo'); break;
      case 'redo': timeTravel('redo', 'undo'); break;
      case 'sheet': ui.sheet = v && ui.sheet !== v ? v : null; break;
      case 'settings': ui.sel = null; ui.linkFrom = null; ui.sheet = ui.sheet === 'props' ? null : 'props'; break;
      case 'lib': { const [k, o] = v.split(/:(?=[01]$)/); ui.lib[k] = o === '1'; break; }
      case 'add': ui.sheet = null; place(v); return;
      case 'offer': if (v === 'yes' && ui.offer) gearAll(ui.offer); ui.offer = null; break;
      case 'rot': if (it) commit(() => { it.rot = (((it.rot || 0) + +v) % 360 + 360) % 360; }); break;
      case 'dup': if (it && canDup(p, it)) { const c = clone(it); c.id = uid('i'); commit(q => { setPos(q, c, it.x + 0.5, it.y + 0.5); q.items.push(c); }); ui.sel = c.id; } break;
      case 'del': if (it) removeItem(it.id); break;
      case 'link': if (it) { ui.linkFrom = it.id; ui.offer = null; ui.sheet = null; } break;
      case 'linkcancel': ui.linkFrom = null; break;
      case 'zoom': ui.zoom = v === '0' ? 1 : clamp(ui.zoom * (v === '+' ? 1.3 : 1 / 1.3), 1, 5); break;
      case 'auto': commit(autowire); break;
      case 'renum': commit(renumber); break;
      case 'lsel': ui.selLink = ui.selLink === v ? null : v; break;
      case 'ldel': commit(q => { q.links = q.links.filter(l => l.id !== v); }); break;
      case 'needadd': {
        const name = (el('sp-n-name').value || '').trim();
        if (!name) { el('sp-n-name').focus(); return; }
        const n = { id: uid('n'), name, qty: Math.max(1, Math.round(+el('sp-n-qty').value) || 1), status: el('sp-n-st').value };
        commit(q => { q.needs.push(n); });
        break;
      }
      case 'needinv': { const e = idx.gear[(el('sp-n-inv') || {}).value]; if (e) commit(q => { q.needs.push({ id: uid('n'), name: e.g.name, qty: e.g.qty || 1, status: e.src === 'location' ? 'location' : 'groupe', ref: e.g.id }); }); break; }
      case 'needdel': commit(q => { q.needs = q.needs.filter(n => n.id !== v); }); break;
      case 'print': buildPrint(); window.print(); render(); return;
      case 'exp': exportAs(v); break;
      case 'imp': el('sp-imp').click(); break;
      default: return;
    }
    render();
  }

  // Champs : même attribut data-sp, traité à l'événement « change ».
  function change(t) {
    const d = t.getAttribute('data-sp'), i = d.indexOf(':'), a = i < 0 ? d : d.slice(0, i), v = i < 0 ? '' : d.slice(i + 1);
    const p = plan(), it = ui.sel && item(p, ui.sel), text = !/^(checkbox|file)$/.test(t.type) && t.tagName !== 'SELECT';
    const link = id => p.links.find(l => l.id === id);
    switch (a) {
      case 'plansel': curId = t.value; ui.sel = null; ui.linkFrom = null; ui.offer = null; break;
      case 'pname': commit(q => { q.name = t.value.trim() || q.name; }); break;
      case 'stage': commit(q => { q.stage[v] = clamp(+String(t.value).replace(',', '.') || q.stage[v], 1, v === 'width' ? 40 : 30); q.items.forEach(x => setPosRaw(q, x)); }); break;
      case 'set2': commit(q => { q.settings[v] = t.checked; }); break;
      case 'margin': commit(q => { q.settings.margin = clamp(+t.value || 0, 0, 100); }); break;
      case 'set': commit(q => { q.setIds = q.setIds.filter(x => x !== v); if (t.checked) q.setIds.push(v); }); break;
      case 'notes': commit(q => { q.notes = t.value; }); break;
      case 'label': if (it) commit(() => { const s = t.value.trim(); if (s) it.label = s; else if (it.kind === 'musician') it.label = (idx.mus[it.ref] || {}).firstName || 'Musicien'; else delete it.label; }); break;
      case 'opt': if (it) commit(q => {
        const val = t.type === 'checkbox' ? t.checked : t.type === 'number' ? (t.value === '' ? undefined : Math.max(0, +t.value || 0)) : t.value;
        it.opts = Object.assign({}, O(it), { [v]: val });
        if (val === undefined) delete it.opts[v];
        if (q.links.some(l => l.auto)) autowire(q);   // les liaisons proposées suivent les réglages
      }); break;
      case 'lcable': commit(() => { const l = link(v); if (l) { l.cable = t.value; l.auto = false; } }); break;
      case 'llen': commit(() => { const l = link(v); if (!l) return; const n = +String(t.value).replace(',', '.'); if (t.value === '' || !(n > 0)) delete l.fixed; else { l.length = n; l.fixed = true; } l.auto = false; }); break;
      case 'lnote': commit(() => { const l = link(v); if (l) { l.note = t.value; l.auto = false; } }); break;
      case 'lch': commit(() => { const l = link(v); if (l) { const n = Math.round(+t.value); if (n > 0) l.channel = n; else delete l.channel; } }); break;
      case 'impfile': if (t.files && t.files[0]) importFile(t.files[0]); t.value = ''; return;
      default: return;
    }
    // Un champ texte se valide en le quittant : on attend la fin du geste en cours avant de redessiner,
    // sinon le bouton que l'utilisateur est en train de toucher serait remplacé sous son doigt.
    if (text) { pend = true; layout(); clearTimeout(pendT); if (!ptr) pendT = setTimeout(flush, 90); } else render();
  }
  const setPosRaw = (p, it) => { it.x = r2(clamp(it.x, -PAD.l + 0.2, p.stage.width + PAD.r - 0.2)); it.y = r2(clamp(it.y, -PAD.t + 0.2, p.stage.depth + PAD.b - 0.3)); };
  function flush() { if (pend) render(); }

  // ====================== Événements ======================
  function onClick(e) {
    const t = e.target.closest ? e.target.closest('[data-sp]') : null;
    if (ui.menu && !(e.target.closest && e.target.closest('.sp-menuwrap'))) { ui.menu = false; if (!t) { render(); return; } }
    if (!t || /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
    const d = t.getAttribute('data-sp'), i = d.indexOf(':');
    if (d.indexOf('add:') === 0 && Date.now() - noClick < 400) return;   // fin d'un glisser depuis la bibliothèque
    act(i < 0 ? d : d.slice(0, i), i < 0 ? '' : d.slice(i + 1));
  }
  function onChange(e) { if (e.target.getAttribute && e.target.getAttribute('data-sp')) change(e.target); }
  function onDown(e) {
    const svg = e.target.closest && e.target.closest('#sp-svg'), p = plan();
    if (svg && p) {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { svg.setPointerCapture(e.pointerId); } catch (x) { /* capture indisponible */ }
      if (pts.size === 2) {
        const a = [...pts.values()];
        if (drag && drag.moved && drag.type === 'item') touch(p);
        drag = null; pinch = { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1, z: ui.zoom };
        return;
      }
      const g = e.target.closest('[data-it]'), it = g && item(p, g.getAttribute('data-it'));
      e.preventDefault();
      if (it) {
        if (ui.linkFrom && ui.linkFrom !== it.id && item(p, ui.linkFrom)) { makeLink(ui.linkFrom, it.id); drag = { type: 'none' }; render(); return; }
        const m = toM(e);
        drag = { type: 'item', id: it.id, dx: it.x - m.x, dy: it.y - m.y, sx: e.clientX, sy: e.clientY, moved: false };
        if (ui.sel !== it.id) { ui.sel = it.id; if (ui.offer !== it.id) ui.offer = null; layout(); }
      } else {
        const w = el('sp-wrap');
        drag = { type: 'pan', sx: e.clientX, sy: e.clientY, sl: w.scrollLeft, st: w.scrollTop, moved: false };
      }
      return;
    }
    const row = e.target.closest && e.target.closest('[data-lib]');
    if (row && !row.classList.contains('sp-off') && (e.pointerType === 'mouse' || e.target.closest('.sp-grip'))) {
      lib = { key: row.getAttribute('data-lib'), name: (row.querySelector('b') || {}).textContent || '', sx: e.clientX, sy: e.clientY, on: false, ghost: null, id: e.pointerId };
      try { row.setPointerCapture(e.pointerId); } catch (x) { /* capture indisponible */ }
    }
  }
  function onMove(e) {
    if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size >= 2) {
      const a = [...pts.values()];
      ui.zoom = clamp(pinch.z * Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) / pinch.d, 1, 5);
      layout();
      return;
    }
    if (lib && e.pointerId === lib.id) {
      if (!lib.on) {
        if (Math.hypot(e.clientX - lib.sx, e.clientY - lib.sy) < 6) return;
        lib.on = true;
        lib.ghost = document.createElement('div');
        lib.ghost.className = 'sp-ghost';
        lib.ghost.textContent = lib.name;
        root.appendChild(lib.ghost);
        ui.sheet = null;                                   // sur téléphone, le tiroir se referme pour laisser voir la scène
        const m = root.querySelector('.sp-main');
        if (m) m.classList.remove('sp-sh-lib');
      }
      lib.ghost.style.left = e.clientX + 'px'; lib.ghost.style.top = e.clientY + 'px';
      return;
    }
    const p = plan();
    if (!drag || !p) return;
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 5) return;
      drag.moved = true;
      if (drag.type === 'item') pushUndo(p);
    }
    if (drag.type === 'item') {
      const it = item(p, drag.id), m = toM(e);
      if (it) { setPos(p, it, m.x + drag.dx, m.y + drag.dy); recalc(p); layout(); }
    } else if (drag.type === 'pan') {
      const w = el('sp-wrap');
      if (w) { w.scrollLeft = drag.sl - (e.clientX - drag.sx); w.scrollTop = drag.st - (e.clientY - drag.sy); }
    }
  }
  function onUp(e) {
    pts.delete(e.pointerId);
    if (pinch && pts.size < 2) { pinch = null; drag = null; return; }
    if (lib && e.pointerId === lib.id) {
      const l = lib;
      lib = null;
      if (l.on) {
        if (l.ghost) l.ghost.remove();
        noClick = Date.now();
        const s = el('sp-svg'), r = s && s.getBoundingClientRect();
        if (r && e.type !== 'pointercancel' && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) { const m = toM(e); place(l.key, m.x, m.y); } else render();
      }
      return;
    }
    const p = plan();
    if (!drag || !p) return;
    const d = drag;
    drag = null;
    if (d.type === 'item') { if (d.moved) touch(p); render(); }
    else if (d.type === 'pan' && !d.moved) { if (ui.sel || ui.linkFrom || ui.offer) { ui.sel = null; ui.linkFrom = null; ui.offer = null; render(); } }
  }
  function onKey(e) {
    if (/^(INPUT|SELECT|TEXTAREA)$/.test((e.target || {}).tagName || '')) return;
    const mod = e.ctrlKey || e.metaKey, k = e.key;
    if ((k === 'Delete' || k === 'Backspace') && ui.sel && ui.tab !== 'gear') { e.preventDefault(); act('del', ''); }
    else if (mod && (k === 'z' || k === 'Z') && !e.shiftKey) { e.preventDefault(); act('undo', ''); }
    else if (mod && (k === 'y' || k === 'Y' || ((k === 'z' || k === 'Z') && e.shiftKey))) { e.preventDefault(); act('redo', ''); }
    else if (k === 'Escape' && (ui.linkFrom || ui.sheet || ui.menu)) { ui.linkFrom = null; ui.sheet = null; ui.menu = false; render(); }
    else if ((k === 'Enter' || k === ' ') && e.target.matches && e.target.matches('.sp-li')) { e.preventDefault(); e.target.click(); }
  }
  const onDocDown = () => { ptr = true; };
  const onDocUp = () => { ptr = false; if (pend) { clearTimeout(pendT); pendT = setTimeout(flush, 90); } };
  const onResize = () => layout();

  // ====================== Cycle de vie ======================
  function ensure() {
    if (!plans.length) { const n = newPlan(); plans.push(n); curId = n.id; }
    if (!plan() || plan().id !== curId) curId = plans[0].id;
  }
  function render() {
    if (!mounted || !root) return;
    pend = false;
    ensure();
    const p = plan();
    if (ui.sel && !item(p, ui.sel)) ui.sel = null;
    const a = document.activeElement, fid = a && root.contains(a) ? a.id : '', keep = {};
    ['sp-wrap', 'sp-libscroll', 'sp-sidescroll', 'sp-propscroll'].forEach(id => { const e = el(id); if (e) keep[id] = [e.scrollLeft, e.scrollTop]; });
    root.innerHTML = html();
    layout();
    Object.keys(keep).forEach(id => { const e = el(id); if (e) { e.scrollLeft = keep[id][0]; e.scrollTop = keep[id][1]; } });
    if (fid && el(fid)) { try { el(fid).focus({ preventScroll: true }); } catch (e) { /* focus impossible */ } }
  }
  function view() { return '<div class="sp-root" id="sp-root"></div>'; }
  function mount(id) {
    root = el('sp-root');
    if (!root) return;
    if (mounted) leave(true);
    mounted = true;
    if (id && plans.some(p => p.id === id)) curId = id;
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    root.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeprint', buildPrint);
    window.addEventListener('afterprint', clearPrint);
    document.addEventListener('pointerdown', onDocDown, true);
    document.addEventListener('pointerup', onDocUp, true);
    document.addEventListener('pointercancel', onDocUp, true);
    render();
  }
  function leave(keepRoot) {
    if (root) { root.removeEventListener('click', onClick); root.removeEventListener('change', onChange); root.removeEventListener('pointerdown', onDown); }
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('beforeprint', buildPrint);
    window.removeEventListener('afterprint', clearPrint);
    document.removeEventListener('pointerdown', onDocDown, true);
    document.removeEventListener('pointerup', onDocUp, true);
    document.removeEventListener('pointercancel', onDocUp, true);
    clearTimeout(pendT); clearPrint();
    if (lib && lib.ghost) lib.ghost.remove();
    drag = null; lib = null; pinch = null; pts.clear(); mounted = false;
    if (keepRoot !== true) root = null;
  }
  // Données JamHit (lecture seule) : l'outil n'en garde qu'une copie et ne les modifie jamais.
  function setInput(data) {
    input = data && typeof data === 'object' && Array.isArray(data.musicians) ? clone(data) : null;
    reindex();
    render();
  }
  function setPlans(list) {
    plans = (Array.isArray(list) ? clone(list) : []).map(norm);
    plans.forEach(recalc);
    if (!plans.some(p => p.id === curId)) curId = plans[0] ? plans[0].id : null;
    ui.sel = null; ui.linkFrom = null; ui.offer = null;
    render();
  }
  const getPlans = () => clone(plans);

  const api = { view, mount, leave, setInput, setPlans, getPlans, onChange: null };
  return api;
})();
