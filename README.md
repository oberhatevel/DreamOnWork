# Dream On Work

Application web hors ligne (PWA) pour organiser les répétitions et concerts d'un groupe de musique :
morceaux, musiciens, groupe et sets, avec édition d'une fiche PDF par musicien.

- **Organisation** : la racine contient les pages publiques (`index.html` présentation, `tutoriel.html`, `site/`), l'application est dans `app/`, la synchronisation dans `api/`.
- **Onglet Outils** (`app/tools.js`) : métronome, accordeur de guitare, accords et gammes sur le manche, plan de scène (`app/stageplot/`).
- **Hors ligne** : après une première visite, l'application fonctionne sans réseau (service worker) et peut être installée sur l'écran d'accueil.
- **Données** : enregistrées sur l'appareil (localStorage pour les fiches, IndexedDB pour les fichiers joints).
  Partage entre musiciens par export / import **JSON** (complet, fichiers inclus) ou **CSV** (morceaux, musiciens, sets).
- **PDF** : dans un set, bouton « PDF » → choisir le musicien → « Enregistrer au format PDF » dans la fenêtre d'impression.

## Matériel et plan de scène

- Onglet Musiciens : matériel de chaque musicien (`musician.gear`) et matériel commun du groupe (`band.gear`, « au groupe » ou « à louer »).
- Outils → **Plan de scène** (`app/stageplot/`, module `StagePlot`) : plan de scène, câblage proposé, patch, liste de matériel, impression.
  Il lit les musiciens, le matériel et les sets du groupe sans les modifier ; ses plans sont enregistrés dans `state.stagePlans`
  et synchronisés comme fiches `stageplan`. La page d'un set montre ses plans et permet d'en créer un. Détails : `app/stageplot/README.md`.
- `docs/plan-de-scene/` : cahier des charges d'origine (non publié sur le site). Données → « Plan de scène (JSON) » exporte toujours les données au format `stage-input`.

## Données de départ

Au premier lancement, l'application affiche un groupe de démonstration fictif (`app/demo-data.js`, « Nova Station »).
Il est retiré dès que l'on crée son groupe ou que l'on connecte l'appareil à la synchronisation ; il n'est jamais envoyé au serveur.
Les données réelles d'un groupe n'existent que sur ses appareils et, s'il synchronise, dans la base du serveur.

## Lancer en local

```sh
python3 -m http.server 8000   # puis ouvrir http://localhost:8000/app/
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
