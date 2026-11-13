'use strict';
/* Onglet Outils : métronome (tempo), accordeur de guitare, accords et gammes sur le manche.
   Repris du projet « Positions de gammes – manche de guitare ». Actions : attribut data-tl="action:valeur". */
const Tools = (() => {
  const el = id => document.getElementById(id);
  const mod = a => ((a % 12) + 12) % 12;
  const SUBS = [['tempo', 'Tempo'], ['tuner', 'Accordeur'], ['scales', 'Accords et gammes'], ['stage', 'Plan de scène']];
  const KEY = 'dow:tools';
  let st = { key: 9, q: 'min', modes: false, mode: 0, pos: 0, deg: false, nums: true, caged: false, cq: '', blues: false, bpm: 100, snd: true, fl: false };
  try { Object.assign(st, JSON.parse(localStorage.getItem(KEY)) || {}); } catch { /* réglages par défaut */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* stockage indisponible */ } };
  let sub = '', full = false;

  // ====================== Métronome ======================
  // Planification Web Audio à l'avance (précis), son et flash optionnels, tempo par « tap ».
  let AC = null, run = false, nextT = 0, beat = 0, tmr = null, taps = [];
  const clk = () => AC ? AC.currentTime : performance.now() / 1000;
  function mstart() {
    try { if (!AC) { const C = window.AudioContext || window.webkitAudioContext; if (C) AC = new C(); } if (AC && AC.state === 'suspended') AC.resume(); } catch { AC = null; }
    run = true; beat = 0; nextT = clk() + 0.08; clearInterval(tmr); tmr = setInterval(sched, 25); sched();
  }
  function mstop() { run = false; clearInterval(tmr); }
  function sched() {
    while (run && nextT < clk() + 0.15) {
      const t = nextT, b = beat, acc = b % 4 === 0;
      if (st.snd && AC) {
        const o = AC.createOscillator(), g = AC.createGain();
        o.frequency.value = acc ? 1600 : 1100;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.6, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
        o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + 0.08);
      }
      setTimeout(() => pulse(acc, b), Math.max(0, (t - clk()) * 1000));
      nextT += 60 / st.bpm; beat++;
    }
  }
  function pulse(acc, b) {
    if (!run) return;
    const d = el('tl-dot');
    if (d) { d.style.transition = 'none'; d.style.opacity = '1'; void d.offsetWidth; d.style.transition = 'opacity .25s'; d.style.opacity = '.25'; }
    // au-delà de 180 BPM, un flash sur deux (pas plus de 3 flashs par seconde)
    if (st.fl && (st.bpm <= 180 || b % 2 === 0)) {
      let f = el('tl-fl');
      if (!f) { f = document.createElement('div'); f.id = 'tl-fl'; document.body.append(f); }
      f.style.transition = 'none'; f.style.opacity = acc ? '.4' : '.25'; void f.offsetWidth; f.style.transition = 'opacity .18s'; f.style.opacity = '0';
    }
  }
  function tap() {
    const t = performance.now();
    if (taps.length && t - taps[taps.length - 1] > 2000) taps = [];
    taps.push(t); if (taps.length > 5) taps.shift();
    if (taps.length > 1) { const d = (taps[taps.length - 1] - taps[0]) / (taps.length - 1); st.bpm = Math.round(Math.min(240, Math.max(30, 60000 / d))); }
  }
  const setBpm = v => { st.bpm = Math.round(Math.min(240, Math.max(30, v))); };
  function tempoHTML() {
    const songs = state.songs.filter(s => +s.tempo >= 30 && +s.tempo <= 240);
    return `<div class="card tl-tempo">
      <div class="tl-bpm"><span id="tl-dot" aria-hidden="true"></span><b id="tl-bpm"></b><small>BPM</small></div>
      <div class="tl-ctl">
        <button class="tl-b" data-tl="b:-5" aria-label="Ralentir de 5">−5</button><button class="tl-b" data-tl="b:-1" aria-label="Ralentir">−</button>
        <button class="tl-b tl-play on" data-tl="mp" id="tl-mp" aria-label="Démarrer ou arrêter le métronome"></button>
        <button class="tl-b" data-tl="b:1" aria-label="Accélérer">+</button><button class="tl-b" data-tl="b:5" aria-label="Accélérer de 5">+5</button>
      </div>
      <input type="range" id="tl-rng" min="30" max="240" step="1" aria-label="Tempo">
      <div class="tl-ctl"><button class="tl-b" data-tl="tap">Tap</button><button class="tl-b" data-tl="ms" id="tl-ms"></button><button class="tl-b" data-tl="mf" id="tl-mf"></button></div>
      ${songs.length ? `<label class="f">Reprendre le tempo d'un morceau<select id="tl-song"><option value="">—</option>${songs.map(s => `<option value="${+s.tempo}">${esc(s.title)} — ${+s.tempo} bpm</option>`).join('')}</select></label>` : ''}
      <p class="muted">« Tap » : tapez le tempo en rythme, il est calculé sur vos derniers appuis. Le premier temps de chaque mesure à 4 temps est accentué. Sur iPhone et iPad, le son est coupé par le commutateur silencieux.</p>
    </div>`;
  }
  function metroUI() {
    const set = (id, fn) => { const e = el(id); if (e) fn(e); };
    set('tl-bpm', e => { e.textContent = st.bpm; });
    set('tl-rng', e => { e.value = st.bpm; });
    set('tl-mp', e => { e.textContent = run ? '⏸' : '▶'; });
    set('tl-ms', e => { e.textContent = st.snd ? 'Son : activé' : 'Son : coupé'; e.classList.toggle('on', st.snd); });
    set('tl-mf', e => { e.textContent = st.fl ? 'Flash : activé' : 'Flash : désactivé'; e.classList.toggle('on', st.fl); });
    set('tl-mini', e => { e.innerHTML = `<button class="tl-b" data-tl="mp" aria-label="Démarrer ou arrêter le métronome">${run ? '⏸' : '▶'}</button> <b>${st.bpm}</b> BPM`; });
  }

  // ====================== Accordeur ======================
  // Micro + détection de hauteur YIN, aiguille ±50 cents, note de référence (Web Audio).
  const TS = [['E', 2, 82.41, 6], ['A', 2, 110, 5], ['D', 3, 146.83, 4], ['G', 3, 196, 3], ['B', 3, 246.94, 2], ['E', 4, 329.63, 1]];
  let tnBytes = null, tnHeard = 0;
  let tnOn = false, tnAuto = true, tnSel = 0, tnDone = [], tnCtx = null, tnStream = null, tnAn = null, tnBuf = null, tnRaf = 0, tnLast = 0, tnHist = [], tnIn = 0, tnSil = 0, tnTc = null, tnOsc = null, tnTimer = null;
  function yin(buf, sr) {
    const W = 2048, tmin = Math.max(2, Math.floor(sr / 400)), tmax = Math.min(Math.floor(sr / 60), buf.length - W - 1);
    let r = 0; for (let i = 0; i < W; i++) r += buf[i] * buf[i]; if (Math.sqrt(r / W) < 0.002) return -1;   // seuil bas : micros de tablette peu sensibles
    const d = new Float32Array(tmax + 2); let acc = 0; d[0] = 1;
    for (let t = 1; t <= tmax; t++) { let s = 0; for (let j = 0; j < W; j++) { const x = buf[j] - buf[j + t]; s += x * x; } acc += s; d[t] = acc ? s * t / acc : 1; }
    let t = -1;
    for (let k = tmin; k < tmax; k++) if (d[k] < 0.15) { while (k + 1 < tmax && d[k + 1] < d[k]) k++; t = k; break; }
    if (t < 0) { let m = tmin; for (let k = tmin; k < tmax; k++) if (d[k] < d[m]) m = k; if (d[m] > 0.3) return -1; t = m; }
    const a = d[t - 1], b = d[t], c = d[t + 1], den = a - 2 * b + c;
    return sr / (den ? t + (a - c) / (2 * den) : t);
  }
  function tnNeedle(c, col) { const n = el('tl-needle'); if (n) { n.style.left = (50 + Math.max(-50, Math.min(50, c))) + '%'; n.style.background = col; } }
  function tnChips() {
    const s = el('tl-str'); if (!s) return;
    s.innerHTML = TS.map((x, i) => `<button class="tl-b${tnSel === i ? ' on' : ''}${tnDone[i] ? ' ok' : ''}" data-tl="s:${i}" aria-label="Corde ${x[3]}, ${x[0]}"><b>${x[0]}${tnDone[i] ? ' ✓' : ''}</b><small>${x[3]}</small></button>`).join('');
    el('tl-auto').textContent = tnAuto ? 'Auto : oui' : 'Auto : non'; el('tl-auto').classList.toggle('on', tnAuto);
    el('tl-mic').textContent = tnOn ? '⏹ Arrêter' : '🎤 Écouter'; el('tl-mic').classList.toggle('on', tnOn);
    el('tl-tone').classList.toggle('on', !!tnOsc);
  }
  function tnIdle() {
    if (!el('tl-name')) return;
    tnNeedle(0, 'var(--muted)');
    el('tl-name').textContent = tnAuto ? '–' : TS[tnSel][0];
    el('tl-hz').textContent = tnAuto ? '' : 'corde ' + TS[tnSel][3] + ' · ' + TS[tnSel][2].toFixed(1) + ' Hz';
    el('tl-stat').style.color = 'var(--muted)';
    el('tl-stat').textContent = tnOn ? 'Jouez une corde à vide…' : 'Appuyez sur « Écouter », puis jouez une corde à vide. Ou écoutez la note de référence.';
  }
  function tnUpdate(f) {
    if (!el('tl-name')) return;
    let i = tnSel;
    if (tnAuto) { let best = 1e9; TS.forEach((s, k) => { const c = Math.abs(1200 * Math.log2(f / s[2])); if (c < best) { best = c; i = k; } }); if (i !== tnSel) { tnSel = i; tnChips(); } }
    const t = TS[i]; let c = 1200 * Math.log2(f / t[2]); c = ((c + 600) % 1200 + 1200) % 1200 - 600;
    const a = Math.abs(c), col = a <= 5 ? '#22c55e' : a <= 15 ? '#f59e0b' : '#ef4444';
    tnNeedle(c, col);
    el('tl-name').textContent = t[0] + t[1];
    el('tl-hz').textContent = 'corde ' + t[3] + ' · ' + f.toFixed(1) + ' Hz · ' + (c > 0 ? '+' : '') + Math.round(c) + ' cents';
    el('tl-stat').style.color = col;
    el('tl-stat').textContent = a <= 5 ? '✓ Accordée' : c < 0 ? 'Trop grave : tendre la corde (monter)' : 'Trop aigu : détendre la corde (descendre)';
    const now = performance.now();
    if (a <= 5) { if (!tnIn) tnIn = now; else if (now - tnIn > 900 && !tnDone[i]) { tnDone[i] = true; tnChips(); } } else tnIn = 0;
  }
  // Lecture du signal : flottants si le navigateur le permet, sinon octets convertis (anciens Safari).
  function tnRead() {
    if (tnAn.getFloatTimeDomainData) { tnAn.getFloatTimeDomainData(tnBuf); return; }
    const b = tnBytes || (tnBytes = new Uint8Array(tnAn.fftSize));
    tnAn.getByteTimeDomainData(b);
    for (let i = 0; i < b.length; i++) tnBuf[i] = (b[i] - 128) / 128;
  }
  function tnLevel() { let r = 0; for (let i = 0; i < 2048; i++) r += tnBuf[i] * tnBuf[i]; return Math.sqrt(r / 2048); }
  function tnLoop(now) {
    tnRaf = requestAnimationFrame(tnLoop);
    if (now - tnLast < 50) return; tnLast = now;
    if (!tnCtx || !tnAn) return;
    if (tnCtx.state !== 'running') { tnCtx.resume().catch(() => {}); tnMsg('Son en pause : touchez l’écran pour réactiver l’écoute.'); return; }
    tnRead();
    // Niveau du micro : montre que le son arrive, même sans note reconnue
    const lv = tnLevel(), bar = el('tl-level');
    if (bar) bar.style.width = Math.min(100, Math.round(Math.sqrt(lv) * 220)) + '%';
    if (lv > 0.0005) tnHeard = now; else if (now - tnHeard > 4000) tnMsg('Le micro ne capte aucun son. Vérifiez que le micro de l’appareil n’est pas couvert, ou que le bon micro est autorisé pour ce site.');
    if (lv > 0.0005 && el('tl-msg') && /ne capte aucun son|en pause/.test(el('tl-msg').textContent)) tnMsg('');
    const f = yin(tnBuf, tnCtx.sampleRate);
    if (f > 0) { tnSil = 0; tnHist.push(f); if (tnHist.length > 5) tnHist.shift(); const s = [...tnHist].sort((x, y) => x - y); tnUpdate(s[s.length >> 1]); }
    else if (++tnSil > 10 && tnHist.length) { tnHist = []; tnIn = 0; tnIdle(); }
  }
  const tnMsg = t => { const m = el('tl-msg'); if (m && m.textContent !== t) m.textContent = t; };
  function tnStart() {
    // Le contexte audio est créé et relancé tout de suite, pendant l'appui : iPhone et iPad refusent sinon de le démarrer.
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { tnMsg('Accordeur indisponible sur ce navigateur : utilisez la note de référence.'); return; }
    try { tnCtx = new C(); tnCtx.resume().catch(() => {}); } catch { tnCtx = null; tnMsg('Audio indisponible sur ce navigateur.'); return; }
    tnMsg('Autorisation du micro…');
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      .catch(() => navigator.mediaDevices.getUserMedia({ audio: true }))   // certains appareils refusent les réglages fins
      .then(stream => {
        if (!tnCtx) { stream.getTracks().forEach(t => t.stop()); return; }
        tnStream = stream;
        tnAn = tnCtx.createAnalyser(); tnAn.fftSize = 4096; tnBuf = new Float32Array(tnAn.fftSize); tnBytes = null;
        const src = tnCtx.createMediaStreamSource(stream), mute = tnCtx.createGain();
        mute.gain.value = 0;
        // Safari ne traite le son que si la chaîne aboutit à la sortie : on la relie, volume à zéro.
        src.connect(tnAn); tnAn.connect(mute); mute.connect(tnCtx.destination);
        tnCtx.resume().catch(() => {});
        tnOn = true; tnHeard = performance.now(); tnMsg(''); tnChips(); tnIdle();
        cancelAnimationFrame(tnRaf); tnRaf = requestAnimationFrame(tnLoop);
      })
      .catch(() => { tnStop(); tnMsg('Micro indisponible : accès refusé, ou page ouverte sans HTTPS. Autorisez le micro pour ce site dans les réglages du navigateur, ou utilisez la note de référence.'); });
  }
  function tnStop() {
    cancelAnimationFrame(tnRaf); tnOn = false; tnHist = []; tnIn = 0;
    if (tnStream) tnStream.getTracks().forEach(t => t.stop()); tnStream = null;
    if (tnCtx) tnCtx.close().catch(() => {}); tnCtx = null; tnAn = null;
    const bar = el('tl-level'); if (bar) bar.style.width = '0';
    tnChips(); tnIdle();
  }
  function tnToneStop() {
    clearTimeout(tnTimer);
    if (tnOsc && tnTc) { const t = tnTc.currentTime, g = tnOsc.g.gain; g.cancelScheduledValues(t); g.setValueAtTime(Math.max(g.value, 0.0001), t); g.exponentialRampToValueAtTime(0.0001, t + 0.08); tnOsc.o.stop(t + 0.1); tnOsc.o2.stop(t + 0.1); }
    tnOsc = null; tnChips();
  }
  function tnTone() {
    if (tnOsc) { tnToneStop(); return; }
    try {
      const C = window.AudioContext || window.webkitAudioContext; if (!tnTc) tnTc = new C(); if (tnTc.state === 'suspended') tnTc.resume();
      const t = tnTc.currentTime, f = TS[tnSel][2], o = tnTc.createOscillator(), o2 = tnTc.createOscillator(), g = tnTc.createGain(), g2 = tnTc.createGain();
      o.type = 'triangle'; o.frequency.value = f; o2.type = 'sine'; o2.frequency.value = f * 2; g2.gain.value = 0.3;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.05);
      o.connect(g); o2.connect(g2); g2.connect(g); g.connect(tnTc.destination); o.start(t); o2.start(t);
      tnOsc = { o, o2, g }; tnTimer = setTimeout(tnToneStop, 4000); tnChips();
    } catch { /* audio indisponible */ }
  }
  function tnQuit() { if (tnOsc) tnToneStop(); if (tnOn || tnStream) tnStop(); if (tnTc) { tnTc.close().catch(() => {}); tnTc = null; } }
  function tunerHTML() {
    return `<div class="card tl-tuner">
      <div class="tl-ctl" id="tl-str"></div>
      <div class="tl-note"><span id="tl-name">–</span><small id="tl-hz"></small></div>
      <div class="tl-meter"><i class="z"></i><i class="needle" id="tl-needle"></i><span class="l">♭</span><span class="r">♯</span></div>
      <div class="tl-stat" id="tl-stat" aria-live="polite"></div>
      <div class="tl-lv" title="Niveau du micro"><span>Micro</span><i><b id="tl-level"></b></i></div>
      <div class="tl-ctl"><button class="tl-b" data-tl="mic" id="tl-mic"></button><button class="tl-b" data-tl="auto" id="tl-auto"></button><button class="tl-b" data-tl="tone" id="tl-tone">🔊 Note de référence</button></div>
      <small class="muted" id="tl-msg"></small>
      <p class="muted">Accordage standard (Mi La Ré Sol Si Mi). En mode Auto, la corde la plus proche de la note jouée est choisie toute seule ; une corde tenue juste environ une seconde reçoit un ✓.</p>
    </div>`;
  }

  // ====================== Accords et gammes ======================
  const OPEN = [40, 45, 50, 55, 59, 64], MAXF = 17;
  const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  const DEG = { 0: '1', 1: '♭2', 2: '2', 3: '♭3', 4: '3', 5: '4', 6: '♭5', 7: '5', 8: '♭6', 9: '6', 10: '♭7', 11: '7' };
  const PENTA = { min: [0, 3, 5, 7, 10], maj: [0, 2, 4, 7, 9] };
  const PEMO = { min: 'mélancolique, bluesy', maj: 'joyeux, ouvert' };
  const BLUES = { min: [0, 3, 5, 6, 7, 10], maj: [0, 2, 3, 4, 7, 9] };
  const BEMO = { min: 'plaintif, tendu, bluesy', maj: 'joyeux, swing, country' };
  const SH = {
    maj: [{ n: 'C', r: 0, f: [-1, 3, 2, 0, 1, 0] }, { n: 'A', r: 9, f: [-1, 0, 2, 2, 2, 0] }, { n: 'G', r: 7, f: [3, 2, 0, 0, 0, 3] }, { n: 'E', r: 4, f: [0, 2, 2, 1, 0, 0] }, { n: 'D', r: 2, f: [-1, -1, 0, 2, 3, 2] }],
    min: [{ n: 'Cm', r: 0, f: [-1, 3, 1, 0, 1, -1] }, { n: 'Am', r: 9, f: [-1, 0, 2, 2, 1, 0] }, { n: 'Gm', r: 7, f: [3, 1, 0, 0, 3, 3] }, { n: 'Em', r: 4, f: [0, 2, 2, 0, 0, 0] }, { n: 'Dm', r: 2, f: [-1, -1, 0, 2, 3, 1] }],
  };
  const MODES = {
    min: [['Éolien', [0, 2, 3, 5, 7, 8, 10], 'triste, mélancolique', { c: [[0, 'm'], [8, ''], [10, '']], e: 'Le ♭VI et le ♭VII apportent la sixte mineure : côté épique et mélancolique.' }],
      ['Dorien', [0, 2, 3, 5, 7, 9, 10], 'nostalgique, groovy', { c: [[0, 'm7'], [5, '7', '']], e: 'Le IV (dominant ou majeur) contient la sixte majeure : son groovy, funky.' }],
      ['Phrygien', [0, 1, 3, 5, 7, 8, 10], 'sombre, tendu', { c: [[0, 'm'], [1, '']], e: 'Le ♭II, un demi-ton au-dessus de la tonique, contient la ♭2 : tension espagnole, métal.' }],
      ['Locrien', [0, 1, 3, 5, 6, 8, 10], 'instable, angoissant']],
    maj: [['Ionien', [0, 2, 4, 5, 7, 9, 11], 'joyeux, lumineux', { c: [[0, ''], [5, ''], [7, '']], e: 'Le IV et le V forment la cadence majeure I – IV – V : lumineuse et résolue.' }],
      ['Lydien', [0, 2, 4, 6, 7, 9, 11], 'rêveur, féerique', { c: [[0, ''], [2, '', '/@']], e: 'Le II majeur contient la ♯4 : effet aérien, suspendu et rêveur.' }],
      ['Mixolydien', [0, 2, 4, 5, 7, 9, 10], 'décontracté, rock', { c: [[0, ''], [10, ''], [5, '']], e: 'Le ♭VII contient la ♭7 : rock sudiste et blues-rock.' }]],
  };
  const COL = ['#ef4444', '#f59e0b', '#22c55e', '#06b6d4', '#6366f1', '#d946ef', '#84cc16'];
  const QL = [['', 'Triade'], ['2', '2'], ['4', '4'], ['6', '6'], ['7', '7'], ['9', '9'], ['dim', 'dim'], ['aug', 'aug']];
  // CAGED : notes (demi-tons depuis la tonique), suffixe et formes de base selon la qualité d'accord choisie
  function tones() { const m = st.q === 'min', t = m ? 3 : 4, a = st.cq; return a === '2' ? [0, 2, 7] : a === '4' ? [0, 5, 7] : a === 'dim' ? [0, 3, 6] : a === 'aug' ? [0, 4, 8] : a === '6' ? [0, t, 7, 9] : a === '7' ? [0, t, 7, 10] : a === '9' ? [0, t, 7, 10, 2] : [0, t, 7]; }
  function suffix() { const m = st.q === 'min', a = st.cq; return a === '2' ? 'sus2' : a === '4' ? 'sus4' : a === 'dim' || a === 'aug' ? a : (m ? 'm' : '') + a; }
  function baseShapes() { const a = st.cq; return a === 'dim' ? SH.min : (a === 'aug' || a === '2' || a === '4') ? SH.maj : SH[st.q]; }
  function scale() { return st.caged ? tones() : st.blues ? BLUES[st.q] : st.modes ? MODES[st.q][st.mode][1] : PENTA[st.q]; }
  // voicing : chaque forme de base est adaptée en remplaçant chaque note par la note d'accord la plus proche (même zone),
  // puis on y ajoute les notes caractéristiques manquantes
  function cagedInst(inst, mn, T) {
    const pcs = T.map(t => mod(st.key + t)), ess = T.length > 3 ? T.filter(t => t !== 7) : T;
    baseShapes().forEach((sh, k) => {
      const sf = mod(st.key - sh.r);
      [sf, sf + 12].forEach(sft => {
        const b = {}; let ok = true, lo = 99, hi = 0;
        sh.f.forEach((f, s) => { if (f < 0) return; const fr = f + sft; if (fr > MAXF) ok = false; b[s] = fr; lo = Math.min(lo, fr); hi = Math.max(hi, fr); });
        if (!ok) return;
        const w0 = Math.max(0, lo - 1), w1 = Math.min(MAXF, hi + 1), v = {};
        const cand = (s, set) => { const r = []; for (let fr = w0; fr <= w1; fr++) if (set.includes(mod(OPEN[s] + fr))) r.push(fr); return r; };
        Object.keys(b).forEach(x => { const s = +x, c = cand(s, pcs); if (c.length) v[s] = c.reduce((p, q) => Math.abs(q - b[s]) < Math.abs(p - b[s]) ? q : p); });
        ess.forEach(t => {
          const pc = mod(st.key + t), ks = Object.keys(v).map(Number);
          if (ks.some(s => mod(OPEN[s] + v[s]) === pc)) return;
          const cnt = {}; ks.forEach(s => { const p = mod(OPEN[s] + v[s]); cnt[p] = (cnt[p] || 0) + 1; });
          const ss = ks.filter(s => cnt[mod(OPEN[s] + v[s])] > 1).sort((x, y) => y - x);
          for (const s of ss) { const c = cand(s, [pc]); if (c.length) { v[s] = c[0]; break; } }
        });
        const notes = Object.keys(v).map(s => ({ s: +s, f: v[s] }));
        if (!notes.length) return;
        inst.push({ k, notes });
        const m = Math.min(...notes.map(o => o.f)); if (!(k in mn) || m < mn[k]) mn[k] = m;
      });
    });
  }
  function scalesHTML() {
    return `<div class="tl-scales">
      <div class="tl-head">
        <div class="tl-nav"><button class="tl-b tl-arrow" data-tl="k-" aria-label="Tonalité précédente">‹</button><div id="tl-title" aria-live="polite"></div><button class="tl-b tl-arrow" data-tl="k+" aria-label="Tonalité suivante">›</button></div>
        <div class="tl-seg" id="tl-q"></div>
        <div class="tl-seg" id="tl-t"></div>
        <button class="tl-b" data-tl="h">Plein écran</button>
      </div>
      <div class="tl-row" id="tl-keys"></div>
      <div class="tl-row" id="tl-modes"></div>
      <div class="tl-row" id="tl-cq"></div>
      <div class="tl-chords" id="tl-chords"></div>
      <div class="tl-row" id="tl-pos"></div>
      <div class="tl-hint">Tournez l'appareil en paysage pour agrandir le manche.</div>
      <div id="tl-info"></div>
      <button class="tl-b" id="tl-mbtn" data-tl="h" aria-label="Afficher le menu">☰ Menu</button>
      <div id="tl-board"></div>
      <div class="tl-foot"><span>Glissez sur le manche pour changer de tonalité</span><span><button class="tl-b" data-tl="n" id="tl-nbtn"></button> <button class="tl-b" data-tl="d" id="tl-dbtn"></button></span></div>
    </div>`;
  }
  function drawScales() {
    if (!el('tl-board')) return;
    if (st.mode >= MODES[st.q].length) st.mode = 0;
    const cg = st.caged, iv = scale(), n = cg || st.blues ? 5 : iv.length, per = n === 5 ? 2 : 3;
    if (st.pos > n) st.pos = 0;
    // notes de la gamme (hauteurs MIDI) puis positions : 2 (penta) ou 3 (7 notes) notes par corde
    const S = []; for (let p = 20; p <= 95; p++) if ((st.blues ? PENTA[st.q] : iv).includes(mod(p - st.key))) S.push(p);
    const inst = [], mn = {};
    // CAGED : cinq formes d'accord (frettes relatives, -1 = corde non jouée), décalées en barré jusqu'à la tonalité
    if (cg) cagedInst(inst, mn, iv);
    (cg ? [] : S).forEach((t, ti) => {
      if (mod(t - st.key) || t < 28 || t > 76) return;
      for (let k = 0; k < n; k++) {
        let idx = ti + k, notes = [], ok = true;
        for (let s = 0; s < 6 && ok; s++) {
          for (let j = 0; j < per; j++) {
            const p = S[idx + j];
            if (p === undefined) { ok = false; break; }
            const f = p - OPEN[s];
            if (f < 0 || f > MAXF) { ok = false; break; }
            notes.push({ s, f });
          }
          idx += per;
        }
        if (ok) {
          if (st.blues) { // blues = boîte pentatonique + note bleue située dans la boîte
            const lo = Math.min(...notes.map(o => o.f)), hi = Math.max(...notes.map(o => o.f)), bp = iv.filter(d => !PENTA[st.q].includes(d));
            for (let s = 0; s < 6; s++) for (let f = lo; f <= hi; f++) if (bp.includes(mod(OPEN[s] + f - st.key))) notes.push({ s, f });
          }
          inst.push({ k, notes });
        }
      }
    });
    const cov = {};
    inst.forEach(i => { if (st.pos && i.k !== st.pos - 1) return; i.notes.forEach(o => { const id = o.s + '_' + o.f; (cov[id] = cov[id] || []); if (!cov[id].includes(i.k)) cov[id].push(i.k); }); });

    // en-tête
    const mname = cg ? 'Accords CAGED (' + NAMES[st.key] + suffix() + ')' : st.blues ? 'Blues ' + (st.q === 'min' ? 'mineure' : 'majeure') + ' (' + BEMO[st.q] + ')' : st.modes ? MODES[st.q][st.mode][0] + ' (' + MODES[st.q][st.mode][2] + ')' : 'Pentatonique (' + PEMO[st.q] + ')';
    let ch = st.modes ? MODES[st.q][st.mode][3] : null;
    let cs = ch ? ch.c.map(([o, s, a]) => { const nm = NAMES[mod(st.key + o)]; return nm + s + (a === undefined ? '' : ' (ou ' + nm + a.replace('@', NAMES[st.key]) + ')'); }).join(' → ') : '';
    if (cg) {
      const nm = NAMES[st.key] + suffix();
      cs = Object.keys(mn).sort((a, b) => mn[a] - mn[b]).map(k => baseShapes()[k].n[0]).join(' → ');
      ch = { e: 'Cinq formes CAGED jouées en barré : chacune donne l’accord de ' + nm + ' à un endroit différent du manche. Pour 2, 4, 6, 7, 9, dim et aug, la forme est adaptée pour inclure les notes caractéristiques. Notes en couleur : la forme choisie ; en gris : les autres notes de l’accord.' };
    }
    const btn = (a, on, label) => `<button class="tl-b${on ? ' on' : ''}" data-tl="${a}">${label}</button>`;
    el('tl-title').innerHTML = NAMES[st.key] + ' ' + (st.q === 'min' ? 'mineur' : 'majeur') + '<small>' + mname + '</small>';
    el('tl-q').innerHTML = [['min', 'Mineur'], ['maj', 'Majeur']].map(([v, l]) => btn('q:' + v, st.q === v, l)).join('');
    el('tl-t').innerHTML = [[0, 'Pentatonique'], [1, 'Modes'], [2, 'CAGED'], [3, 'Blues']].map(([v, l]) => btn('t:' + v, (st.blues ? 3 : st.caged ? 2 : +st.modes) === v, l)).join('');
    el('tl-keys').innerHTML = NAMES.map((x, i) => btn('key:' + i, st.key === i, x)).join('');
    el('tl-modes').style.display = st.modes ? 'flex' : 'none';
    el('tl-cq').style.display = cg ? 'flex' : 'none';
    el('tl-cq').innerHTML = QL.map(([v, l]) => btn('c:' + v, st.cq === v, l)).join('');
    el('tl-modes').innerHTML = MODES[st.q].map((m, i) => btn('m:' + i, st.mode === i, `${m[0]} (${m[2]})`)).join('');
    let ph = btn('p:0', st.pos === 0, 'Toutes');
    for (let k = 0; k < n; k++) ph += btn('p:' + (k + 1), st.pos === k + 1, `<span class="tl-dotc" style="background:${COL[k]}"></span>${cg ? baseShapes()[k].n[0] : k + 1}`);
    el('tl-pos').innerHTML = ph;
    el('tl-dbtn').textContent = st.deg ? 'Afficher les notes' : 'Afficher les degrés';
    el('tl-nbtn').textContent = st.nums ? 'Masquer les numéros' : 'Afficher les numéros';
    el('tl-info').textContent = NAMES[st.key] + ' ' + (st.q === 'min' ? 'mineur' : 'majeur') + ' – ' + mname + (st.pos ? ' – position ' + st.pos : '') + (cs ? '\n' + (cg ? 'Formes : ' : 'Accords : ') + cs : '');
    el('tl-chords').style.display = cs ? 'block' : 'none';
    el('tl-chords').innerHTML = cs ? '<b>' + (cg ? 'Formes : ' : 'Accords : ') + cs + '</b><br>' + ch.e : '';

    // manche
    const W = 1000, H = 250, x0 = 52, x1 = 985, top = 34, gap = 34;
    const fx = f => x0 + (x1 - x0) * (1 - Math.pow(2, -f / 12)) / (1 - Math.pow(2, -MAXF / 12));
    const cx = f => f === 0 ? 26 : (fx(f - 1) + fx(f)) / 2, cy = s => top + (5 - s) * gap;
    let g = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Manche de guitare"><rect x="${x0}" y="${top - 18}" width="${x1 - x0 + 10}" height="${5 * gap + 36}" rx="6" fill="var(--tl-board)"/>`;
    g += `<rect x="${x0 - 5}" y="${top - 18}" width="6" height="${5 * gap + 36}" fill="var(--tl-str)"/>`;
    for (let f = 1; f <= MAXF; f++) g += `<line x1="${fx(f)}" x2="${fx(f)}" y1="${top - 18}" y2="${top + 5 * gap + 18}" stroke="var(--tl-fret)" stroke-width="2.5"/>`;
    for (let s = 0; s < 6; s++) g += `<line x1="${x0}" x2="${x1 + 10}" y1="${cy(s)}" y2="${cy(s)}" stroke="var(--tl-str)" stroke-width="${1 + (5 - s) * 0.35}" opacity=".75"/>`;
    if (st.nums) for (let f = 1; f <= MAXF; f++) g += `<text x="${cx(f)}" y="${H - 12}" text-anchor="middle" font-size="14" font-weight="${[3, 5, 7, 9, 12, 15, 17].includes(f) ? 800 : 400}" fill="var(--muted)">${f}</text>`;
    for (let s = 0; s < 6; s++) for (let f = 0; f <= MAXF; f++) {
      const p = OPEN[s] + f, d = mod(p - st.key);
      if (!iv.includes(d)) continue;
      const ks = cov[s + '_' + f], x = cx(f), y = cy(s), root = d === 0;
      const label = st.deg ? DEG[d] : NAMES[mod(p)];
      if (ks) {
        const c = COL[ks[0]];
        if (ks.length > 1) g += `<circle cx="${x}" cy="${y}" r="17" fill="none" stroke="${COL[ks[1]]}" stroke-width="3"/>`;
        g += `<circle cx="${x}" cy="${y}" r="${root ? 14 : 13}" fill="${c}"${root ? ' stroke="#fff" stroke-width="3"' : (st.blues && !PENTA[st.q].includes(d) ? ' stroke="#fff" stroke-width="2" stroke-dasharray="3 2"' : '')}/>`;
        g += `<text x="${x}" y="${y + 5}" text-anchor="middle" font-size="${label.length > 1 ? 12 : 14}" font-weight="${root ? 800 : 600}" fill="#fff" stroke="rgba(0,0,0,.45)" stroke-width=".6" paint-order="stroke">${label}</text>`;
      } else {
        g += `<circle cx="${x}" cy="${y}" r="11" fill="none" stroke="var(--tl-ghost)" stroke-width="${root ? 2.5 : 1.2}" opacity=".7"/>`;
        g += `<text x="${x}" y="${y + 4}" text-anchor="middle" font-size="11" fill="var(--tl-ghost)">${label}</text>`;
      }
    }
    el('tl-board').innerHTML = g + '</svg>';
  }
  function setFull(v) {
    full = v;
    document.body.classList.toggle('tl-full', full);
    try {
      if (full && !document.fullscreenElement && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
      else if (!full && document.fullscreenElement) document.exitFullscreen();
    } catch { /* plein écran non supporté */ }
  }

  // ====================== Actions ======================
  function act(a) {
    const i = a.indexOf(':'), k = i < 0 ? a : a.slice(0, i), v = i < 0 ? '' : a.slice(i + 1);
    if (k === 'k-') st.key = mod(st.key - 1);
    else if (k === 'k+') st.key = mod(st.key + 1);
    else if (k === 'key') st.key = +v;
    else if (k === 'q') { st.q = v; st.mode = 0; }
    else if (k === 't') { st.modes = v === '1'; st.caged = v === '2'; st.blues = v === '3'; st.pos = 0; }
    else if (k === 'm') st.mode = +v;
    else if (k === 'p') st.pos = +v;
    else if (k === 'd') st.deg = !st.deg;
    else if (k === 'n') st.nums = !st.nums;
    else if (k === 'c') st.cq = v;
    else if (k === 'h') setFull(!full);
    else if (k === 'mp') { if (run) mstop(); else mstart(); }
    else if (k === 'b') setBpm(st.bpm + +v);
    else if (k === 'tap') tap();
    else if (k === 'ms') st.snd = !st.snd;
    else if (k === 'mf') st.fl = !st.fl;
    else if (k === 'mic') { if (tnOn) tnStop(); else tnStart(); return; }
    else if (k === 'auto') { tnAuto = !tnAuto; tnChips(); if (!tnOn) tnIdle(); return; }
    else if (k === 'tone') { tnTone(); return; }
    else if (k === 's') { tnSel = +v; tnAuto = false; tnHist = []; tnIn = 0; tnChips(); tnIdle(); return; }
    save(); metroUI(); drawScales();
  }
  document.addEventListener('click', e => { const b = e.target.closest('[data-tl]'); if (b) act(b.dataset.tl); });
  document.addEventListener('input', e => { if (e.target.id === 'tl-rng') { setBpm(+e.target.value); save(); metroUI(); } });
  document.addEventListener('change', e => { if (e.target.id === 'tl-song' && e.target.value) { setBpm(+e.target.value); save(); metroUI(); } });
  document.addEventListener('keydown', e => {
    if (sub !== 'scales' || !el('tl-board') || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || document.querySelector('dialog[open]')) return;
    if (e.key === 'ArrowLeft') act('k-'); else if (e.key === 'ArrowRight') act('k+'); else if (e.key === 'Escape' && full) act('h');
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && tnCtx && tnCtx.state !== 'running') tnCtx.resume().catch(() => {}); });
  document.addEventListener('pointerdown', () => { if (tnOn && tnCtx && tnCtx.state !== 'running') tnCtx.resume().catch(() => {}); }, true);
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && full) { full = false; document.body.classList.remove('tl-full'); } });

  // ====================== Intégration à l'application ======================
  function view(id) {
    const s = SUBS.some(x => x[0] === id) ? id : 'tempo';
    return `<div class="tl-sub">${SUBS.map(([k, l]) => `<a href="#/tools/${k}" class="${k === s ? 'on' : ''}">${l}</a>`).join('')}${s === 'tempo' ? '' : '<span class="tl-mini" id="tl-mini"></span>'}</div>
      ${s === 'tempo' ? tempoHTML() : s === 'tuner' ? tunerHTML() : s === 'stage' ? StagePlot.view() : scalesHTML()}`;
  }
  // Appelé après l'affichage de l'onglet Outils.
  function mount(id) {
    const s = SUBS.some(x => x[0] === id) ? id : 'tempo';
    if (s !== 'tuner') tnQuit();
    if (s !== 'stage') StagePlot.leave();
    if (s !== 'scales' && full) setFull(false);
    sub = s;
    metroUI();
    if (s === 'tuner') { tnChips(); if (!tnOn) tnIdle(); }
    if (s === 'stage') {
      // Plan de scène : données du groupe en lecture seule, plans enregistrés et synchronisés avec le reste.
      StagePlot.setInput(stageInput());
      StagePlot.setPlans(state.stagePlans);
      StagePlot.onChange = plans => { state.stagePlans = plans; save(); };
      StagePlot.mount(decodeURIComponent(location.hash.split('/')[3] || ''));
    }
    if (s === 'scales') {
      drawScales();
      // glissement sur le manche : gauche = demi-ton au-dessus, droite = demi-ton en dessous
      const bd = el('tl-board'); let sx = null, sy = null;
      bd.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; });
      bd.addEventListener('pointerup', e => { if (sx === null) return; const dx = e.clientX - sx, dy = e.clientY - sy; sx = null; if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) act(dx < 0 ? 'k+' : 'k-'); });
      bd.addEventListener('pointercancel', () => { sx = null; });
    }
  }
  // Appelé quand on quitte l'onglet Outils : micro, métronome et plein écran sont arrêtés.
  function leave() { if (!sub) return; sub = ''; tnQuit(); mstop(); StagePlot.leave(); if (full) setFull(false); }
  return { view, mount, leave };
})();
