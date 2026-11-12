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

Le workflow `.github/workflows/pages.yml` publie le dépôt sur GitHub Pages
(à activer une fois : Settings → Pages → Source : « GitHub Actions »).
N'importe quel hébergement statique convient également.

## Suite prévue

- Accès par nom de groupe (plusieurs groupes) et synchronisation en ligne des données entre musiciens.
