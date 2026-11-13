'use strict';
/* Groupe de démonstration (fictif) affiché au premier lancement de l'application.
   Il est remplacé par les données réelles dès que l'on crée son groupe ou que l'on se connecte à la synchronisation. */
const DEMO = (() => {
  const svg = s => 'data:image/svg+xml,' + encodeURIComponent(s);
  const avatar = (letter, color) => svg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="${color}"/><text x="60" y="80" font-family="system-ui,sans-serif" font-size="64" font-weight="700" text-anchor="middle" fill="#fff">${letter}</text></svg>`);
  const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
  const yt = q => 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q);
  const M = (id, firstName, instruments, birthDate, color, guest = false) => ({ id, firstName, instruments, birthDate, photo: avatar(firstName[0], color), guest });
  const att = (id, label, url, date = '') => ({ id, label, date, url });
  // Morceau : rôles par défaut (Inès basse, Marc batterie) complétés par les parties de Léa, Tom et Sam.
  const song = (id, title, author, tempo, key, capo, lead, f) => ({
    id, title, author, tempo: String(tempo), key, capo: capo ? String(capo) : '', lead: 'd-' + lead, singer2: 'd-' + (lead === 'lea' ? 'tom' : 'lea'),
    entryOrder: f.entry || '', solos: f.solos || '', remarks: f.remarks || '',
    parts: {
      'd-lea': { instruments: [lead === 'lea' ? 'chant lead' : 'chant', ...(f.lea || [])], note: f.leaNote || '' },
      'd-tom': { instruments: [lead === 'tom' ? 'chant lead' : 'chant', ...(f.tom || ['guitare électrique'])], note: f.tomNote || '' },
      'd-ines': { instruments: ['basse'], note: f.inesNote || '' },
      'd-marc': { instruments: ['batterie'], note: f.marcNote || '' },
      'd-sam': { instruments: f.sam || ['guitare électrique'], note: f.samNote || '' },
      ...(f.zoe ? { 'd-zoe': { instruments: ['saxophone'], note: f.zoe } } : {}),
    },
    videos: [att(id + '-v', 'Version originale', yt(title + ' ' + author))],
    scores: f.score ? [att(id + '-s', 'Grille d’accords', 'https://www.ultimate-guitar.com/search.php?search_type=title&value=' + encodeURIComponent(title))] : [],
    recordings: f.rec ? [att(id + '-r', 'Prise de la dernière répétition (lien d’exemple)', 'https://example.com/nova-station/' + id + '.mp3', day(-8))] : [],
  });
  const songs = [
    song('d-proud-mary', 'Proud Mary', 'Creedence Clearwater Revival', 120, 'D', 0, 'lea', { entry: 'Intro guitare (Tom), tout le monde à la 5e mesure', solos: 'Guitare Sam après le 2e refrain', remarks: 'Version lente sur le premier couplet, puis on accélère à 140.\nFin sèche sur le dernier « rollin’ ».', samNote: 'Son crunch', score: true, rec: true }),
    song('d-heart-of-gold', 'Heart of Gold', 'Neil Young', 86, 'Em', 3, 'tom', { tom: ['guitare acoustique', 'harmonica'], tomNote: 'Harmonica en Sol', entry: 'Guitare acoustique et harmonica seuls', solos: 'Harmonica après chaque refrain', remarks: 'Tempo posé, ne pas presser sur le refrain.\nFin : ralentir sur le dernier accord.', samNote: 'Son clair, delay léger', score: true }),
    song('d-venus', 'Venus', 'Shocking Blue', 130, 'Em', 0, 'lea', { entry: 'Riff de guitare (Sam), 2 mesures', solos: 'Guitare Sam, 8 mesures', remarks: 'Break avant le dernier refrain : silence complet sur 1 mesure.', samNote: 'B7sus4 en intro', rec: true }),
    song('d-aint-no-sunshine', 'Ain’t No Sunshine', 'Bill Withers', 85, 'Am', 0, 'lea', { lea: ['piano'], sam: ['guitare électrique'], entry: 'Voix et basse seules', solos: 'Saxophone (si Zoé est là), sinon guitare', remarks: 'Les « I know » : batterie seule en soutien, tout le monde s’arrête.', zoe: 'Solo sur 8 mesures', inesNote: 'Jeu au doigt, très sobre' }),
    song('d-the-passenger', 'The Passenger', 'Iggy Pop', 135, 'Am', 2, 'tom', { entry: 'Guitare rythmique (Tom), puis batterie', solos: '', remarks: 'Les « la la la » : tout le monde chante.', tomNote: 'Capo 2, accords ouverts', marcNote: 'Charley fermé sur les couplets', score: true }),
    song('d-sweet-home-alabama', 'Sweet Home Alabama', 'Lynyrd Skynyrd', 98, 'D', 0, 'lea', { sam: ['piano'], samNote: 'Piano électrique', entry: 'Riff de guitare (Tom)', solos: 'Guitare Tom, puis piano Sam', remarks: 'Grille D – C – G tout du long.', rec: true }),
    song('d-knockin', 'Knockin’ on Heaven’s Door', 'Bob Dylan', 68, 'G', 2, 'tom', { tom: ['guitare acoustique'], entry: 'Guitare acoustique, entrée progressive', solos: 'Guitare Sam sur la grille du refrain', remarks: 'Dernier refrain a cappella, reprise tous ensemble.', samNote: 'Volume à la pédale sur les couplets' }),
    song('d-wild-horses', 'Wild Horses', 'The Rolling Stones', 70, 'G', 0, 'lea', { tom: ['guitare acoustique'], entry: 'Deux guitares seules', solos: 'Guitare Sam après le 2e refrain', remarks: 'À retravailler : les chœurs du refrain.', samNote: 'Arpèges, son clair' }),
  ];
  const band5 = ['d-lea', 'd-tom', 'd-ines', 'd-marc', 'd-sam'];
  return () => ({
    version: 1, demo: true,
    band: {
      name: 'Nova Station', website: 'https://nova-station.example', facebook: 'https://www.facebook.com/novastation.exemple', instagram: 'https://www.instagram.com/novastation.exemple', video: yt('concert rock live'),
      logo: svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c3aed"/><stop offset=".6" stop-color="#db2777"/><stop offset="1" stop-color="#f59e0b"/></linearGradient></defs><rect width="200" height="200" rx="36" fill="url(#g)"/><text x="100" y="128" font-family="system-ui,sans-serif" font-size="92" font-weight="900" text-anchor="middle" fill="#fff">NS</text></svg>'),
      background: svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1e1b4b"/><stop offset=".55" stop-color="#7c3aed"/><stop offset="1" stop-color="#db2777"/></linearGradient><radialGradient id="s" cx=".5" cy="0" r=".9"><stop offset="0" stop-color="#fde68a" stop-opacity=".55"/><stop offset="1" stop-color="#fde68a" stop-opacity="0"/></radialGradient></defs><rect width="1200" height="800" fill="url(#g)"/><rect width="1200" height="800" fill="url(#s)"/><g fill="#fff" opacity=".12"><circle cx="220" cy="560" r="150"/><circle cx="620" cy="640" r="210"/><circle cx="1010" cy="540" r="170"/></g></svg>'),
    },
    musicians: [
      M('d-lea', 'Léa', ['chant lead', 'chant', 'piano', 'tambourin'], '1992-04-18', '#db2777'),
      M('d-tom', 'Tom', ['chant lead', 'chant', 'guitare acoustique', 'guitare électrique', 'harmonica'], '1988-09-02', '#7c3aed'),
      M('d-ines', 'Inès', ['basse', 'chant'], '1995-01-27', '#0891b2'),
      M('d-marc', 'Marc', ['batterie'], '1985-06-11', '#ca8a04'),
      M('d-sam', 'Sam', ['guitare électrique', 'piano', 'chant'], '1990-11-30', '#16a34a'),
      M('d-zoe', 'Zoé', ['saxophone'], '1997-03-08', '#ea580c', true),
    ],
    songs: structuredClone(songs),
    sets: [
      { id: 'd-set-repet', name: 'Répétition du jeudi', date: day(6), type: 'repetition', musicianIds: band5, songIds: ['d-wild-horses', 'd-heart-of-gold', 'd-the-passenger', 'd-knockin'],
        remarks: 'Local à 20 h. On commence par Wild Horses (chœurs à caler), puis filage des trois autres.', posterId: '', posterUrl: '', recordings: [], photos: [] },
      { id: 'd-set-concert', name: 'Café des Arts', date: day(30), type: 'live', musicianIds: [...band5, 'd-zoe'],
        songIds: ['d-proud-mary', 'd-venus', 'd-heart-of-gold', 'd-aint-no-sunshine', 'd-the-passenger', 'd-knockin', 'd-sweet-home-alabama'],
        remarks: 'Balances à 18 h, concert à 20 h 30.\nPause après « Ain’t No Sunshine ». Bis : Sweet Home Alabama.', posterId: '', posterUrl: 'posters/demo-nova-station.jpg',
        recordings: [att('d-set-r', 'Vidéo du dernier concert (lien d’exemple)', yt('concert rock live'), day(-40))], photos: [] },
    ],
  });
})();
