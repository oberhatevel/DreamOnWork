# Dream On Work

Application web hors ligne (PWA) pour organiser les répétitions et concerts d'un groupe de musique :
morceaux, musiciens, groupe et sets, avec édition d'une fiche PDF par musicien.

- **Sans installation ni compte** : fichiers statiques (`index.html`, `app.js`, `style.css`), aucun serveur applicatif.
- **Hors ligne** : après une première visite, l'application fonctionne sans réseau (service worker) et peut être installée sur l'écran d'accueil.
- **Données** : enregistrées sur l'appareil (localStorage pour les fiches, IndexedDB pour les fichiers joints).
  Partage entre musiciens par export / import **JSON** (complet, fichiers inclus) ou **CSV** (morceaux, musiciens, sets).
- **PDF** : dans un set, bouton « PDF » → choisir le musicien → « Enregistrer au format PDF » dans la fenêtre d'impression.

## Lancer en local

```sh
python3 -m http.server 8000   # puis ouvrir http://localhost:8000
```

## Mise en ligne

- **jamhit.fr (OVH)** : `.github/workflows/ovh.yml` envoie l'application par SFTP dans `www/` à chaque push.
  Secrets GitHub à définir : `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`. Aucun fichier distant n'est supprimé.
- **GitHub Pages** (adresse de secours) : publication automatique par GitHub (Settings → Pages → Source : « Deploy from a branch »).

## Synchronisation en ligne

- Onglet Données → « Synchronisation en ligne » : nom du groupe + code d'accès partagé par les musiciens.
- Côté serveur : `api/index.php` (PHP + MySQL). Fiches dans les tables `dow_bands`, `dow_docs`, `dow_files` (créées automatiquement) ;
  fichiers joints dans `api/files/<groupe>/`, servis uniquement par l'API.
- Accès à la base : secrets GitHub `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` ; le déploiement en tire `api/config.php` (jamais dans le dépôt).
- Chaque appareil garde sa copie locale ; en cas de modification concurrente d'une même fiche, la plus récente l'emporte.

## Suite prévue

- Comptes individuels par musicien (aujourd'hui : un code partagé par groupe).
