'use strict';
/* Mode scène (Live View) : paroles et accords en grands caractères sur fond noir, défilement automatique calé
   sur le tempo (ou sur la durée du morceau), commande au clavier ou par pédale Bluetooth (qui se comporte comme un clavier).
   Utilise les globales de app.js : state, song, esc, keyLabel, mName, me, part, instText, save. */
const Live = (() => {
  const KEY = 'dow:live';
  const opt = { size: 0, ...readOpt() };   // taille du texte en px (0 = automatique selon l'écran)
  function readOpt() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } }
  const saveOpt = () => { try { localStorage.setItem(KEY, JSON.stringify(opt)); } catch { /* stockage indisponible */ } };

  let root = null, ids = [], idx = 0, title = '';
  let playing = false, pos = 0, last = 0, raf = 0, leadUntil = 0, beatT0 = 0, hideT = 0, wake = null, ownScroll = false;

  const cur = () => song(ids[idx]);
  // Taille automatique : la plus grande qui fait tenir la ligne la plus longue sur la largeur (accords alignés sur les paroles).
  let fit = 28;
  const sizePx = () => opt.size || fit;
  function fitSize(text) {
    const sc = el('lv-scroll'), avail = Math.max(200, (sc ? sc.clientWidth : innerWidth) - 34);
    const longest = Math.max(20, ...String(text || '').replace(/\t/g, '    ').split('\n').map(l => l.replace(/\s+$/, '').length));
    fit = Math.round(Math.min(46, Math.max(18, avail / (longest * 0.61))));
  }
  // Durée saisie « 4:30 » ou « 270 » → secondes
  function durSec(s) {
    const m = String(s || '').trim().match(/^(\d+)(?::(\d{1,2}))?$/);
    return m ? (m[2] !== undefined ? +m[1] * 60 + +m[2] : +m[1]) : 0;
  }

  // ---------- Mise en forme des paroles et accords ----------
  const CHORD = /^\(?(?:[A-G](?:#|b|♯|♭)?|(?:Do|Ré|Re|Mi|Fa|Sol|La|Si)(?:#|b|♯|♭)?)(?:m|maj|min|dim|aug|sus|add|M|°|ø|\+)?\d{0,2}(?:(?:sus|add|maj|b|#)\d{1,2})*(?:\/(?:[A-G]|Do|Ré|Re|Mi|Fa|Sol|La|Si)(?:#|b|♯|♭)?)?\)?$/;
  const SECTION = /^\s*\[?(intro|couplet|refrain|pr[ée][- ]?refrain|pr[ée][- ]?chorus|chorus|verse|bridge|pont|solo|break|interlude|outro|fin|coda|r\/)\b.*$/i;
  function isChordLine(line) {
    const toks = line.replace(/[|!\-–=.]+/g, ' ').trim().split(/\s+/).filter(Boolean);
    if (!toks.length) return false;
    const n = toks.filter(t => CHORD.test(t) || /^[x×]\d+$/i.test(t) || /^\(x\d+\)$/i.test(t)).length;
    return n / toks.length >= 0.7;
  }
  function chartHTML(text) {
    return text.replace(/\r/g, '').split('\n').map(l => {
      if (!l.trim()) return '<div class="lv-l lv-empty">&nbsp;</div>';
      if (SECTION.test(l) && l.trim().length < 40) return `<div class="lv-l lv-sec">${esc(l.trim())}</div>`;
      if (isChordLine(l)) return `<div class="lv-l lv-ch">${esc(l)}</div>`;
      return `<div class="lv-l">${esc(l)}</div>`;
    }).join('');
  }

  // ---------- Affichage ----------
  function shell() {
    root = document.createElement('div');
    root.id = 'lv'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Mode scène');
    root.innerHTML = `
      <div class="lv-top">
        <div class="lv-ttl"><b id="lv-title"></b><span id="lv-meta"></span></div>
        <span class="lv-beat" id="lv-beat" aria-hidden="true"></span>
        <span class="lv-pos" id="lv-pos"></span>
        <button class="lv-b" data-lv="close" aria-label="Quitter le mode scène">✕</button>
      </div>
      <div class="lv-scroll" id="lv-scroll"><div class="lv-text" id="lv-text"></div><div class="lv-end" id="lv-end"></div></div>
      <div class="lv-bar">
        <button class="lv-b" data-lv="prev" aria-label="Morceau précédent">⏮</button>
        <button class="lv-b lv-play" data-lv="play" id="lv-play" aria-label="Lancer ou arrêter le défilement">▶</button>
        <button class="lv-b" data-lv="next" aria-label="Morceau suivant">⏭</button>
        <span class="lv-grp"><button class="lv-b" data-lv="slow" aria-label="Plus lent">−</button><span id="lv-speed"></span><button class="lv-b" data-lv="fast" aria-label="Plus rapide">+</button></span>
        <span class="lv-grp"><button class="lv-b" data-lv="small" aria-label="Texte plus petit">A−</button><button class="lv-b" data-lv="auto" aria-label="Taille automatique">A</button><button class="lv-b" data-lv="big" aria-label="Texte plus grand">A+</button></span>
        <button class="lv-b" data-lv="help" aria-label="Aide pédale">⌨</button>
      </div>
      <div class="lv-help" id="lv-help" hidden>
        <b>Commandes au clavier ou à la pédale Bluetooth</b>
        <p>Espace ou Entrée : lancer / arrêter le défilement<br>Flèche bas, Page suivante, Flèche droite : avancer d'un écran (puis morceau suivant)<br>Flèche haut, Page précédente, Flèche gauche : reculer d'un écran (puis morceau précédent)<br>Échap : quitter</p>
        <p>Une pédale tourne-page Bluetooth se connecte à la tablette comme un clavier ; ses deux pédales envoient en général « page suivante » et « page précédente », ou les flèches.</p>
        <p>Toucher le bas de l'écran avance, toucher le haut recule, toucher le milieu affiche ou masque les commandes.</p>
      </div>`;
    document.body.append(root);
    root.addEventListener('click', onClick);
    root.addEventListener('pointerup', onTap);
    root.querySelector('#lv-scroll').addEventListener('scroll', onScroll, { passive: true });
  }
  function show() {
    const x = cur(); if (!x) return close();
    stop(); pos = 0;
    const sc = el('lv-scroll'); sc.scrollTop = 0;
    const chart = (x.chart || '').trim() || (x.remarks || '').trim();
    el('lv-title').textContent = x.title || 'Sans titre';
    const meta = [keyLabel(x), x.tempo && x.tempo + ' bpm', mName(x.lead) && '🎤 ' + mName(x.lead)].filter(Boolean);
    const mine = me && part(x, me) ? [instText(part(x, me).instruments), part(x, me).note].filter(Boolean).join(' — ') : '';
    el('lv-meta').innerHTML = esc(meta.join(' · ')) + (mine ? `<br><span class="lv-mine">${esc(mName(me))} : ${esc(mine)}</span>` : '');
    el('lv-pos').textContent = ids.length > 1 ? `${idx + 1} / ${ids.length}` : '';
    fitSize(chart);
    el('lv-text').style.fontSize = sizePx() + 'px';
    el('lv-text').innerHTML = chart
      ? (!(x.chart || '').trim() ? '<div class="lv-note">Paroles et accords non renseignés : affichage des remarques du morceau.</div>' : '') + chartHTML(chart)
      : '<div class="lv-note">Pas de paroles ni d\'accords pour ce morceau.<br>Ajoutez-les dans sa fiche : Modifier → « Paroles et accords ».</div>';
    const nx = song(ids[idx + 1]);
    el('lv-end').innerHTML = nx ? `<button class="lv-b lv-nextsong" data-lv="next">Morceau suivant : ${esc(nx.title)} ⏭</button>` : (ids.length > 1 ? '<div class="lv-note">Fin du set</div>' : '');
    beatT0 = performance.now();
    speedUI(); ctlShow();
  }
  const el = id => root && root.querySelector('#' + id);

  // ---------- Défilement ----------
  // Vitesse de base : la durée du morceau si elle est saisie, sinon une ligne de texte par mesure de 4 temps au tempo.
  function speed() {
    const x = cur(), sc = el('lv-scroll'), lh = sizePx() * 1.45;
    const room = Math.max(0, sc.scrollHeight - sc.clientHeight), d = durSec(x.duration), t = +x.tempo;
    const base = d > 0 ? room / d : t > 0 ? lh / (4 * 60 / t) : lh / 2.5;
    return base * (+x.liveSpeed || 1);
  }
  function speedUI() {
    const x = cur(), d = durSec(x.duration);
    el('lv-speed').textContent = `×${(+x.liveSpeed || 1).toFixed(1)}` + (d ? ` · ${x.duration}` : x.tempo ? ` · ${x.tempo} bpm` : '');
  }
  function play() {
    const sc = el('lv-scroll'), x = cur();
    if (sc.scrollTop >= sc.scrollHeight - sc.clientHeight - 2) { sc.scrollTop = 0; }
    pos = sc.scrollTop; playing = true; last = performance.now();
    // Décompte d'une mesure (4 temps) avant de démarrer depuis le haut
    leadUntil = pos < 4 && +x.tempo > 0 ? last + 4 * 60000 / +x.tempo : 0;
    beatT0 = last;
    el('lv-play').textContent = '⏸'; el('lv-play').classList.add('on');
    cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
    ctlShow();
  }
  function stop() {
    playing = false; cancelAnimationFrame(raf);
    if (root) { el('lv-play').textContent = '▶'; el('lv-play').classList.remove('on'); ctlShow(true); }
  }
  function loop(now) {
    if (!playing) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    beat(now);
    if (leadUntil && now < leadUntil) return;
    leadUntil = 0;
    const sc = el('lv-scroll');
    pos += speed() * dt;
    ownScroll = true; sc.scrollTop = pos;
    if (pos >= sc.scrollHeight - sc.clientHeight - 1) stop();   // arrivé en bas : on s'arrête, le bouton « Morceau suivant » est visible
  }
  // Point lumineux sur chaque temps (accent sur le premier), pour garder le tempo sous les yeux
  function beat(now) {
    const t = +cur().tempo, b = el('lv-beat'); if (!b || !(t > 0)) return;
    const per = 60000 / t, n = Math.floor((now - beatT0) / per), ph = ((now - beatT0) % per) / per;
    b.style.opacity = ph < 0.18 ? '1' : '.18';
    b.classList.toggle('acc', n % 4 === 0);
    b.classList.toggle('lead', !!leadUntil && now < leadUntil);
  }
  function onScroll() {
    const sc = el('lv-scroll');
    if (ownScroll) { ownScroll = false; return; }
    pos = sc.scrollTop;   // défilement à la main pendant la lecture : on repart de là
  }
  // Avancer / reculer d'un écran, puis changer de morceau aux extrémités
  function page(dir) {
    const sc = el('lv-scroll'), step = sc.clientHeight * 0.8, max = sc.scrollHeight - sc.clientHeight;
    if (dir > 0 && sc.scrollTop >= max - 2) return go(1);
    if (dir < 0 && sc.scrollTop <= 2) return go(-1, true);
    pos = Math.max(0, Math.min(max, sc.scrollTop + dir * step));
    ownScroll = true; sc.scrollTo({ top: pos, behavior: 'smooth' });
  }
  function go(d, toEnd) {
    const n = idx + d;
    if (n < 0 || n >= ids.length) return;
    idx = n; show();
    if (toEnd) { const sc = el('lv-scroll'); sc.scrollTop = pos = sc.scrollHeight; }
  }
  function setSpeed(f) {
    const x = cur(); x.liveSpeed = Math.round(Math.min(3, Math.max(0.3, (+x.liveSpeed || 1) * f)) * 10) / 10;
    save(); speedUI();   // réglage gardé pour ce morceau (et synchronisé)
  }
  function setSize(d) { opt.size = Math.min(72, Math.max(16, sizePx() + d)); saveOpt(); const p = el('lv-scroll').scrollTop / Math.max(1, el('lv-scroll').scrollHeight); el('lv-text').style.fontSize = opt.size + 'px'; el('lv-scroll').scrollTop = pos = p * el('lv-scroll').scrollHeight; }

  // ---------- Commandes ----------
  function ctlShow(keep) {
    if (!root) return;
    root.classList.remove('lv-hide'); clearTimeout(hideT);
    if (!keep && playing) hideT = setTimeout(() => { if (playing) root.classList.add('lv-hide'); }, 3500);
  }
  function act(a) {
    if (a === 'close') return close();
    if (a === 'play') return playing ? stop() : play();
    if (a === 'prev') return go(-1);
    if (a === 'next') return go(1);
    if (a === 'slow') return setSpeed(1 / 1.1);
    if (a === 'fast') return setSpeed(1.1);
    if (a === 'small') return setSize(-2);
    if (a === 'big') return setSize(2);
    if (a === 'auto') { opt.size = 0; saveOpt(); return show(); }
    if (a === 'help') { const h = el('lv-help'); h.hidden = !h.hidden; }
  }
  function onClick(e) { const b = e.target.closest('[data-lv]'); if (b) { e.stopPropagation(); act(b.dataset.lv); ctlShow(); } }
  // Toucher la zone de texte : bas = avancer, haut = reculer, milieu = commandes
  let downY = null;
  function onTap(e) {
    if (e.target.closest('button, .lv-help') || !e.target.closest('#lv-scroll')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const h = innerHeight, y = e.clientY;
    if (downY !== null && Math.abs(downY - y) > 12) return;   // c'était un glissement, pas un toucher
    if (y > h * 0.72) page(1); else if (y < h * 0.28) page(-1); else if (root.classList.contains('lv-hide')) ctlShow(); else { root.classList.add('lv-hide'); clearTimeout(hideT); }
  }
  function onDown(e) { downY = e.target.closest && e.target.closest('#lv-scroll') ? e.clientY : null; }
  function onKey(e) {
    if (!root || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const k = e.key, map = { ' ': 'play', Enter: 'play', MediaPlayPause: 'play', Escape: 'close' };
    let used = true;
    if (map[k]) act(map[k]);
    else if (['ArrowDown', 'PageDown', 'ArrowRight'].includes(k)) page(1);
    else if (['ArrowUp', 'PageUp', 'ArrowLeft'].includes(k)) page(-1);
    else if (k === 'MediaTrackNext') go(1);
    else if (k === 'MediaTrackPrevious') go(-1);
    else if (k === '+' || k === '=') setSize(2);
    else if (k === '-') setSize(-2);
    else used = false;
    if (used) { e.preventDefault(); e.stopImmediatePropagation(); ctlShow(); }
  }
  async function keepAwake() {
    try { if ('wakeLock' in navigator && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } } catch { /* refusé ou non pris en charge */ }
  }
  const onVis = () => { if (!document.hidden && root) keepAwake(); };
  const onResize = () => { if (root && !opt.size) { const x = cur(); fitSize((x.chart || '').trim() || x.remarks); el('lv-text').style.fontSize = sizePx() + 'px'; } };

  // ---------- Ouverture / fermeture ----------
  function open(songIds, start = 0, name = '') {
    ids = songIds.filter(id => song(id)); if (!ids.length) return;
    idx = Math.min(Math.max(0, start), ids.length - 1); title = name;
    if (!root) shell();
    document.documentElement.classList.add('lv-open');
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVis);
    root.addEventListener('pointerdown', onDown);
    try { if (document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); } catch { /* non pris en charge */ }
    keepAwake();
    show();
  }
  function close() {
    stop(); clearTimeout(hideT);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVis);
    if (wake) { wake.release().catch(() => {}); wake = null; }
    try { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch { /* sans effet */ }
    if (root) { root.remove(); root = null; }
    document.documentElement.classList.remove('lv-open');
  }
  return { open, close, isChordLine, durSec, get isOpen() { return !!root; } };
})();
