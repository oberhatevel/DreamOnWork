# Concepteur de plan de scène — cahier des charges

Outil autonome, développé dans un projet séparé, destiné à être intégré plus tard à **JamHit**
(application web pour groupes de musique : répertoire, sets, musiciens, matériel) comme quatrième outil de l'onglet « Outils ».

Ce document décrit le besoin, les données échangées avec JamHit et les contraintes à respecter pour que l'intégration
soit simple. Le fichier `PROMPT.md` contient le texte à donner à l'assistant pour démarrer le nouveau projet ;
`exemple-entree.json` est un jeu de données d'exemple (groupe fictif).

## Objectif

À partir du groupe, de ses musiciens et de leur matériel, concevoir un **plan de scène dynamique** et en déduire :

1. **Le plan de scène** : position de chaque musicien, de ses instruments, amplis, micros, retours, de la sono et des arrivées électriques.
2. **Le plan de câblage** : chaque liaison (source → destination), avec le **type de câble** et la **longueur** nécessaire.
3. **La liste de matériel et d'accessoires** : tout ce qu'il faut pour la date, en distinguant ce qui est **disponible**
   (matériel d'un musicien, matériel du groupe) de ce qui est **à louer** ou manquant.

Un plan de scène peut être associé à **un ou plusieurs sets** (concerts live ou répétitions). Un groupe a donc plusieurs plans
(« petite salle », « plein air », « local de répétition »…), réutilisés d'une date à l'autre.

## Utilisateurs et usage

- Des musiciens amateurs ou semi-professionnels, sur **tablette ou téléphone** (tactile d'abord), parfois sur ordinateur.
- Au local ou dans une salle **sans réseau** : l'outil doit fonctionner hors ligne.
- Le résultat est montré au groupe, envoyé à la salle ou au sonorisateur (fiche technique), et imprimé.

## Données reçues de JamHit

JamHit exporte un fichier JSON (onglet Données → « Plan de scène (JSON) »), format `stage-input` version 1 :

```jsonc
{
  "app": "jamhit", "format": "stage-input", "version": 1, "exportedAt": "2026-11-13T11:40:57.570Z",
  "band": { "name": "Nova Station" },
  "musicians": [
    { "id": "d-tom", "firstName": "Tom", "guest": false,
      "instruments": ["chant lead", "chant", "guitare acoustique", "guitare électrique", "harmonica"],
      "gear": [ { "id": "g-tom-3", "name": "Ampli guitare 40 W", "type": "Ampli", "qty": 1, "note": "Repiqué au micro · secteur" } ] }
  ],
  "commonGear": [
    { "id": "g-c-1", "name": "Table de mixage 16 voies", "type": "Table de mixage", "qty": 1, "note": "12 entrées micro XLR", "owner": "groupe" },
    { "id": "g-c-7", "name": "Micros batterie (kit 5 micros)", "type": "Micro", "qty": 1, "note": "", "owner": "location" }
  ],
  "sets": [ { "id": "d-set-concert", "name": "Café des Arts", "date": "2027-03-13", "type": "live", "musicianIds": ["d-tom"] } ]
}
```

- `gear[].type` prend l'une de ces valeurs : `Instrument`, `Ampli`, `Micro`, `Pédales / effets`, `Clavier`, `Sonorisation`,
  `Table de mixage`, `Retour`, `Pied / support`, `Câble`, `Éclairage`, `Accessoire`, `Autre`.
- `commonGear[].owner` vaut `groupe` (disponible) ou `location` (à louer). Le matériel d'un musicien est toujours disponible.
- `note` est un texte libre (marque, connectique, alimentation) : ne pas en dépendre pour la logique, mais l'afficher.
- `sets[].type` vaut `live` ou `repetition`. Les identifiants (`id`) sont stables d'un export à l'autre : c'est par eux
  que le plan référence musiciens, matériel et sets.

Les données de JamHit sont **en lecture seule** pour l'outil : il ne modifie ni les musiciens ni le matériel.
Si un musicien ou un matériel référencé disparaît d'un nouvel export, l'outil le signale sans planter.

## Données produites par l'outil

Un document par plan, format `stage-plan` version 1, sérialisable en JSON (c'est lui qui sera stocké et synchronisé par JamHit) :

```jsonc
{
  "id": "plan-abc123", "name": "Petite salle", "updated": 1763034057570,
  "setIds": ["d-set-concert"],                      // sets associés (0, 1 ou plusieurs)
  "stage": { "width": 6, "depth": 4, "unit": "m" }, // dimensions de la scène
  "items": [                                        // tout ce qui est posé sur le plan
    { "id": "i1", "kind": "musician", "ref": "d-tom", "x": 1.2, "y": 2.5, "rot": 0, "label": "Tom" },
    { "id": "i2", "kind": "gear", "ref": "g-tom-3", "owner": "d-tom", "x": 0.8, "y": 3.4, "rot": 0 },
    { "id": "i3", "kind": "extra", "name": "Arrivée électrique 16 A", "type": "Alimentation", "x": 0, "y": 3.9, "rot": 0 }
  ],
  "links": [                                        // câblage
    { "id": "l1", "from": "i2", "to": "i9", "cable": "XLR", "length": 10, "auto": true, "note": "repiquage ampli" }
  ],
  "needs": [                                        // besoins hors inventaire, ajoutés à la main
    { "id": "n1", "name": "Multiprise 6 prises", "qty": 2, "status": "location" }
  ],
  "notes": "Balances à 18 h."
}
```

## Fonctions attendues

### Plan de scène
- Scène rectangulaire aux dimensions réglables (mètres), avec le bord de scène et le public repérés, grille et aimantation optionnelles.
- Bibliothèque à gauche (ou en tiroir sur téléphone) : les musiciens du groupe, leur matériel, le matériel commun, plus
  quelques éléments libres (arrivée électrique, praticable, pied de micro, retour, DI…).
- Glisser-déposer au doigt et à la souris ; déplacer, tourner, dupliquer, supprimer ; annuler / rétablir.
- Poser un musicien propose de poser aussi son matériel autour de lui.
- Présélection selon le set associé : seuls les musiciens du set sont proposés par défaut.
- Symboles clairs et lisibles en petit (formes simples + étiquette), pas de dessin réaliste.

### Câblage
- Chaque liaison relie deux éléments du plan : micro → table, instrument → DI → table, table → enceintes, table → retours, élément → alimentation.
- **Proposition automatique** des liaisons à partir du type de matériel (un micro va à la table en XLR, un ampli repiqué demande un micro et un XLR,
  un clavier ou une guitare électro-acoustique passe par une DI, tout ce qui est amplifié demande du secteur), toujours modifiable à la main.
- **Type de câble** par liaison : XLR, jack instrument, jack enceinte / Speakon, secteur (rallonge, multiprise), RCA / mini-jack, autre.
- **Longueur** calculée d'après la distance sur le plan, avec une marge réglable (par défaut +20 %, cheminement le long des bords plutôt qu'en diagonale),
  puis arrondie à la longueur standard supérieure (1, 3, 5, 10, 15, 20 m).
- Numérotation des voies de la table (patch) : voie, source, micro ou DI, alimentation fantôme, remarque.

### Listes
- **Patch** (liste des voies) et **liste de câbles** regroupée par type et longueur (« 6 × XLR 10 m »).
- **Liste de matériel** complète pour la date, en trois états : apporté par un musicien, disponible au groupe, **à louer / manquant**.
  Le rapprochement se fait avec l'inventaire reçu (par exemple 10 câbles XLR 10 m au groupe, 12 nécessaires → 2 à prévoir).
- **Besoin électrique** : nombre de prises et puissance approximative si elle est renseignée.

### Sorties
- Impression / PDF (via l'impression du navigateur) : une page plan, une page patch et câblage, une page matériel. Fond blanc à l'impression.
- Export et import du plan en JSON (format `stage-plan`).
- Export CSV de la liste de matériel et de la liste de câbles.

## Contraintes d'intégration à JamHit

JamHit est une application web **statique, sans étape de compilation et sans dépendance** (HTML, CSS, JavaScript natifs),
installable (PWA) et utilisable hors ligne. Pour que l'outil s'y greffe sans réécriture :

- **Aucune dépendance externe**, aucun appel réseau, aucune police ou image distante. Dessin en SVG (ou canvas), pas de bibliothèque.
- **Un module isolé** : tout le code dans une fonction auto-exécutée exposant un seul objet global, sur le modèle des outils existants :
  `const StagePlot = (() => { … return { view, mount, leave }; })();`
  - `view(id)` renvoie le HTML de l'outil (chaîne) ;
  - `mount(id)` est appelé après l'insertion du HTML (branchement des écouteurs, premier dessin) ;
  - `leave()` est appelé quand on quitte l'outil (arrêt des écouteurs globaux).
- **Aucune variable globale** autre que cet objet ; aucun identifiant ni classe CSS sans préfixe : tout commence par `sp-`.
- **Actions par délégation** : attribut `data-sp="action:valeur"` et un seul écouteur de clic, pas de `onclick` dans le HTML.
- **Thème sombre** par les variables CSS de JamHit, sans couleur de fond ou de texte en dur hors du dessin :
  `--bg`, `--card`, `--text`, `--muted`, `--line`, `--accent`, `--accent-text`, `--soft`, `--danger`.
  En développement autonome, définir ces variables dans la page hôte avec les valeurs de JamHit :
  `--bg:#14111d; --card:#1f1b2c; --text:#eeeaf6; --muted:#a39db5; --line:#37314a; --accent:#a586f5; --accent-text:#15101f; --soft:#2c2540; --danger:#ef7b6e`.
- **Données injectées, pas lues en dur** : l'outil reçoit ses entrées par une fonction (`StagePlot.setInput(data)` au format `stage-input`)
  et rend ses plans par une fonction de rappel (`StagePlot.onChange = plans => …`). En développement autonome, la page hôte charge
  `exemple-entree.json` (ou un fichier choisi par l'utilisateur) et enregistre les plans dans `localStorage` sous la clé `stageplot:v1`.
  Dans JamHit, ces deux points seront branchés sur les données du groupe et sur la synchronisation.
- **Tactile et petits écrans** : cibles d'au moins 40 px, glisser-déposer par événements `pointer*` (pas l'API drag-and-drop HTML5, inutilisable au doigt),
  mise en page utilisable à 380 px de large et confortable sur tablette en paysage.
- **Français** pour toute l'interface. Texte échappé avant insertion dans le HTML (les noms viennent des utilisateurs).
- **Hors ligne** : fonctionne en ouvrant simplement la page servie en HTTPS ou en local ; pas de service worker à écrire (JamHit a le sien).

## Livrables du projet séparé

| Fichier | Rôle |
|---|---|
| `stageplot.js` | Le module (`StagePlot`), sans dépendance |
| `stageplot.css` | Les styles, tous préfixés `sp-`, basés sur les variables du thème |
| `index.html` | Page hôte de développement : définit les variables de thème, charge les données d'exemple, monte l'outil |
| `exemple-entree.json` | Données d'entrée d'exemple (copie de celui de ce dossier) |
| `README.md` | Fonctionnement, formats `stage-input` / `stage-plan`, règles de câblage automatique, limites connues |

## Hors périmètre de la première version

- Édition collaborative en temps réel, comptes utilisateurs.
- Plan de feu détaillé (l'éclairage n'apparaît que dans la liste de matériel).
- Calculs acoustiques ou électriques normatifs : les puissances et longueurs sont des aides, pas une étude technique.
- Modification des musiciens ou du matériel depuis l'outil (cela reste dans JamHit).

## Intégration ultérieure dans JamHit (pour mémoire)

1. Copier `stageplot.js` et `stageplot.css` dans `app/`, les déclarer dans `app/index.html` et dans la liste hors ligne de `app/sw.js`.
2. Ajouter le sous-onglet « Plan de scène » dans `app/tools.js` (tableau `SUBS`) et y appeler `StagePlot.view / mount / leave`.
3. Brancher `StagePlot.setInput` sur l'état de JamHit (même structure que l'export `stage-input`) et `StagePlot.onChange` sur un nouveau
   type de fiche synchronisée (`stageplan`), à ajouter à la liste des types acceptés par `api/index.php`.
4. Afficher sur la page d'un set le ou les plans qui lui sont associés.
