# Plan de scène — module autonome pour JamHit

Concepteur de plan de scène : on pose les musiciens et le matériel sur une scène, l'outil propose le câblage,
calcule les longueurs de câble, numérote le patch et dresse la liste de matériel (apporté, au groupe, à louer / manquant).

Cahier des charges d'origine : `docs/plan-de-scene/README.md`.
**Branché dans JamHit** : sous-onglet Outils → « Plan de scène » (`app/tools.js`) et rubrique « Plan de scène » de chaque set (`app/app.js`).
Les plans sont stockés dans `state.stagePlans` et synchronisés comme fiches `stageplan` (`app/sync.js`, `api/index.php`).
Depuis un set : nouveau plan, « Dupliquer pour ce set » (copie propre au set, l'original garde ses autres sets), association d'un plan existant, retrait.
La page `index.html` de ce dossier reste la page de développement autonome.

## Fichiers

| Fichier | Rôle |
|---|---|
| `stageplot.js` | Le module `StagePlot`, sans dépendance |
| `stageplot.css` | Les styles, tous préfixés `sp-`, basés sur les variables du thème JamHit |
| `index.html` | Page hôte de développement : variables du thème, chargement des données, enregistrement dans `localStorage` |
| `exemple-entree.json` | Données d'exemple (groupe fictif Nova Station) |

## Lancer en développement

```sh
cd app/stageplot && python3 -m http.server 8000
# puis ouvrir http://localhost:8000/
```

Ouverte directement en `file://`, la page fonctionne, mais le navigateur refuse de lire `exemple-entree.json` :
utiliser alors « Charger un export ». Les plans sont enregistrés dans `localStorage` sous la clé `stageplot:v1`,
le dernier export chargé sous `stageplot:input:v1` (clé propre à la page de développement).

## Interface du module

```js
StagePlot.setInput(data);          // données JamHit au format stage-input (lecture seule, copiées)
StagePlot.setPlans(plans);         // plans enregistrés (tableau de stage-plan)
StagePlot.onChange = plans => {};  // appelé à chaque modification, avec une copie de tous les plans
el.innerHTML = StagePlot.view();   // HTML de l'outil (un conteneur #sp-root)
StagePlot.mount(planId);           // après insertion : écouteurs et premier dessin (planId facultatif)
StagePlot.leave();                 // en quittant l'outil : retire les écouteurs globaux
StagePlot.getPlans();              // copie des plans
```

Le module n'expose que `StagePlot`. Il ne fait aucun appel réseau, et son HTML ne contient ni `onclick` ni identifiant
ou classe sans le préfixe `sp-`. Les actions passent par `data-sp="action:valeur"` : un écouteur `click` et un écouteur
`change` délégués sur `#sp-root`. Les déplacements utilisent les événements `pointer*`. Tout texte venant des données
est échappé.

## Interface

- **En-tête** : choix du plan, annuler / rétablir, menu (nouveau plan, imprimer / PDF, export et import JSON,
  CSV, dupliquer, supprimer).
- **Onglet Plan**
  - Bibliothèque : colonne de gauche sur tablette en paysage, tiroir « ＋ Ajouter » sur téléphone.
  - Scène : au centre.
  - Propriétés : colonne de droite, ou bouton « Options » sur téléphone.
  - Sans élément sélectionné, le panneau de propriétés montre les réglages du plan : nom, dimensions, grille,
    aimantation, marge sur les câbles, sets associés, notes.
- **Onglet Câblage** : scène avec les liaisons colorées par type de câble et leur longueur ; liste des liaisons
  modifiables, patch, sorties de la table, câbles nécessaires.
- **Onglet Matériel** : trois listes (apporté par les musiciens, disponible au groupe, à louer ou manquant), câbles,
  besoin électrique, ajout de besoins à la main.
- **Poser un élément** :
  - toucher une ligne de la bibliothèque le pose à un emplacement libre ;
  - glisser par le symbole le pose à l'endroit voulu ; à la souris, toute la ligne se glisse.
- **Sur la scène** :
  - glisser un élément le déplace ;
  - glisser le fond fait défiler la scène quand elle est zoomée ;
  - pincer zoome.
- **Musicien posé** : un bandeau propose de poser aussi son matériel autour de lui (ampli derrière, micro devant,
  clavier ou batterie devant). Seul le matériel scénique est concerné : pas le tambourin, ni les harmonicas.
- **Sélection** : tourner (pas de 45°), Relier (puis toucher l'autre élément), dupliquer (dans la limite de la quantité
  en inventaire), Options, supprimer.
- **Clavier** : Suppr, Ctrl+Z, Ctrl+Y, Échap.
- **Set associé au plan** : la bibliothèque ne montre d'abord que les musiciens de ce set ; les autres restent
  accessibles sous « Hors set ».
- **Repérage sur la scène** :
  - le bord de scène est souligné en couleur d'accent et la mention « PUBLIC » est placée en bas ;
  - autour de la scène, une marge de 1 m sur les côtés et de 2 m côté salle accueille la façade et la table.

## Format `stage-input` (reçu de JamHit)

Inchangé : voir `docs/plan-de-scene/README.md`. Le module tolère un export partiel ou ancien : un musicien, un matériel
ou un set référencé par un plan mais absent du nouvel export est signalé par un bandeau. L'élément reste sur le plan,
dessiné en pointillé rouge et marqué « ? », et il est compté comme manquant dans la liste de matériel.

## Format `stage-plan` (produit par l'outil)

Conforme au cahier des charges, avec ces **champs facultatifs ajoutés** (validés avec le porteur du projet) :

| Champ | Contenu |
|---|---|
| `items[].opts` | Réglages de l'élément, par exemple `{ "pickup": "mic", "mains": true, "watts": 40 }` — voir ci-dessous |
| `items[].name`, `items[].type` | Copiés aussi pour le matériel (`kind: "gear"`), pour pouvoir l'afficher même s'il disparaît de l'export |
| `links[].channel` | Numéro de voie du patch (liaisons vers la table) |
| `links[].fixed` | `true` si la longueur a été saisie à la main (elle n'est plus recalculée) |
| `needs[].ref` | Identifiant du matériel commun quand le besoin vient de l'inventaire |
| `settings` | `{ "margin": 20, "grid": true, "snap": true }` : marge sur les câbles en %, grille, aimantation |

Les coordonnées `x` et `y` sont en mètres. L'origine est au fond de scène, côté jardin vu du public (en haut à gauche
du plan) ; `y` augmente vers le public. Les valeurs peuvent sortir de la scène (coulisses, salle) : de −1 à
`width + 1` en `x`, de −0,5 à `depth + 2` en `y`. `rot` est en degrés.

Clés de `opts` selon le rôle de l'élément :

| Rôle | Clés |
|---|---|
| Micro | `use` (`voix` / `inst`), `phantom`, `stand` (sur pied), `channels` (nombre de voies, pour un kit) |
| Ampli | `pickup` (`mic` / `di` / `none`), `mains` |
| Clavier | `stereo`, `mains` |
| Instrument | `mode` (`none` / `amp` / `di`) |
| Enceinte, retour | `powered` |
| Table de mixage | `inputs`, `mains` |
| Tous | `watts` |

L'export JSON ajoute en tête `"app": "jamhit", "format": "stage-plan", "version": 1`. À l'import, ces trois champs
sont retirés ; un plan dont l'identifiant existe déjà est importé comme copie.

## Rôle d'un élément

Le rôle se déduit du **type** de matériel :

| Type | Rôle |
|---|---|
| Micro | micro |
| Ampli | ampli |
| Clavier | clavier |
| Pédales / effets | pédalier |
| Sonorisation | enceinte |
| Retour | retour |
| Table de mixage | table |
| Pied / support | pied |
| Instrument | instrument, ou batterie si le nom contient « batterie » |
| Accessoire | DI si le nom contient « DI » ou « boîtier de direct » |

Le **nom** et la **note** ne servent qu'à pré-cocher les réglages, toujours modifiables dans les propriétés :

| Mot trouvé | Réglage pré-coché |
|---|---|
| « secteur » | branché sur le secteur |
| « DI » | ampli en sortie DI, instrument passant par une DI |
| « fantôme », « 48 V » | alimentation fantôme |
| « stéréo » | clavier stéréo |
| « électro-acoustique » | instrument passant par une DI |
| « chant » | micro de voix |
| « pince » | micro sans pied |
| « 5 micros » | kit de 5 voies |
| « 40 W » | puissance de 40 W |
| « passif » | enceinte non amplifiée |

## Règles de câblage automatique

« Proposer le câblage » remplace les liaisons `auto: true` et ne touche jamais aux liaisons créées à la main. Modifier
le câble, la longueur ou la remarque d'une liaison automatique la rend manuelle. Les identifiants et numéros de voie
des liaisons recalculées sont conservés quand c'est possible. Changer un réglage d'élément relance le calcul si des
liaisons automatiques existent.

| Élément | Liaisons proposées |
|---|---|
| Micro | → table, XLR (une liaison par voie pour un kit : grosse caisse, caisse claire, tom aigu, tom basse, overhead) |
| Ampli repiqué au micro | Prend le micro « instrument » libre le plus proche, à 1,5 m au plus et pas celui d'un autre musicien ; sans micro, → table en XLR avec « micro à prévoir » |
| Ampli en sortie DI | → table, XLR |
| Clavier, instrument « par une DI » | → DI la plus proche (jack instrument) → table (XLR) ; deux fois pour un clavier stéréo ; sans DI libre, → table avec « DI à prévoir » |
| Guitare ou basse électrique (mode « vers l'ampli ») | → pédalier du même musicien → son ampli, jack instrument ; sinon → l'ampli le plus proche à 2 m au plus |
| Table de mixage | → chaque enceinte (XLR si amplifiée, jack enceinte / Speakon sinon), → chaque retour sur un départ auxiliaire numéroté de gauche à droite |
| Tout élément branché sur le secteur (enceintes et retours amplifiés compris) | → arrivée électrique la plus proche, câble secteur |
| Instrument acoustique, pied, praticable | Aucune liaison |

Une liaison créée à la main avec « Relier » reçoit un câble par défaut : secteur vers une arrivée électrique, XLR
depuis un micro ou une DI, jack instrument depuis un instrument ou un pédalier.

**Longueur** = (|Δx| + |Δy|) × (1 + marge), soit un cheminement le long des axes plutôt qu'en diagonale. Elle est
arrondie à la longueur standard supérieure : 1, 3, 5, 10, 15 ou 20 m. Au-delà de 20 m, la liaison est signalée et
arrondie aux 5 m supérieurs. La longueur se recalcule quand un élément bouge, sauf si elle a été saisie à la main ;
vider le champ revient au calcul.

**Patch** : à la première proposition, les voies sont numérotées dans l'ordre batterie, basse, guitares, claviers,
autres instruments, voix. Ensuite, les numéros existants sont conservés et les nouvelles voies prennent les numéros
suivants. « Renuméroter » rétablit l'ordre type, et chaque numéro reste modifiable dans le tableau. Un avertissement
s'affiche si le nombre de voies dépasse les entrées de la table (réglage « Entrées de la table », pré-rempli d'après
« 16 voies » dans le nom).

## Liste de matériel

1. Chaque musicien posé apporte **tout** son matériel personnel, posé ou non. Le matériel non posé sert d'abord aux
   besoins calculés.
2. Le matériel commun posé est « au groupe » ou « à louer » selon `owner`. Un exemplaire posé en trop par rapport à
   l'inventaire est compté comme manquant.
3. Besoins calculés, pris dans l'inventaire non posé puis comptés comme manquants pour le reste :

   | Besoin | Comptage |
   |---|---|
   | Pieds de micro | Un par micro sur pied et par ampli repiqué, moins les pieds de micro posés |
   | DI | Une par instrument relié à la table sans DI sur le plan |
   | Micros de repiquage | Un par ampli repiqué sans micro proche |
   | Multiprises | Une par tranche de 6 appareils sur une même arrivée, dès 2 appareils |

4. Câbles : le besoin est regroupé par type et longueur, puis rapproché de l'inventaire.
   - Le type et la longueur d'un câble en inventaire sont lus dans son nom (« Câbles XLR 10 m »).
   - Un câble plus long que nécessaire convient.
   - Les liaisons les plus longues sont servies en premier.
   - Exemple : 15 XLR 10 m nécessaires et 10 au groupe, donc 5 à prévoir.
5. Les éléments libres (sauf l'arrivée électrique) sont « hors inventaire », donc à prévoir. Les besoins ajoutés à la
   main gardent leur état : un besoin pris dans l'inventaire suit le propriétaire du matériel.
6. **Besoin électrique** : nombre de prises par arrivée et somme des puissances renseignées. C'est une indication, pas
   une consommation réelle.

## Impression et exports

- **Imprimer / PDF** : passe par l'impression du navigateur, sur fond blanc. Le document comporte trois sections, chacune
  commençant sur une nouvelle page : plan avec légende et notes ; patch, sorties, câbles et liaisons ; matériel et
  électricité. Avec beaucoup de liaisons, la section câblage occupe deux pages.
- **CSV** (séparateur « ; », UTF-8 avec BOM pour Excel) : liste de matériel (quantité, matériel, type, état, qui,
  remarque) et liste de câbles (quantité, type, longueur, à l'inventaire, à prévoir).

## Vérifié dans Chromium (Playwright), avec les données d'exemple

- Bureau 1280 × 800 :
  - pose des 6 musiciens avec leur matériel, du matériel commun et d'une arrivée électrique ;
  - glisser à la souris d'un élément et depuis la bibliothèque ;
  - annuler / rétablir ;
  - câblage proposé (39 liaisons, 16 voies dont 2 pour le piano stéréo) ;
  - patch, liste de matériel ;
  - rechargement de la page (plans relus depuis `localStorage`) ;
  - impression en PDF A4 : 4 pages, fond blanc.
- Téléphone 380 × 740 en émulation tactile :
  - tiroir de bibliothèque ;
  - glisser au doigt d'un élément sur la scène et depuis la poignée du tiroir, qui se referme ;
  - pincement pour zoomer ;
  - aucun défilement horizontal de la page, toutes les cibles font au moins 40 px.
- Remarque saisie puis appui direct sur un onglet : la saisie est enregistrée et l'appui n'est pas perdu.
- Export puis import JSON ; exports CSV ; suppression d'un plan ; `leave()` puis nouveau `mount()`.
- Données disparues d'un nouvel export (un musicien, la table) : signalées, sans erreur.
- Nom contenant du HTML : affiché comme du texte.
- Aucune erreur dans la console.

## Non vérifié

- Tactile sur un appareil réel (seulement émulé), Safari iOS et Firefox.
- Rendu de l'impression dans d'autres navigateurs que Chromium.
- Intégration dans JamHit (thème, onglet Outils, synchronisation).

## Limites connues

- Pas de liaisons directes entre DI et micros d'un même musicien au-delà des règles ci-dessus : cas particuliers
  (in-ears, multipaires, splitter, sonorisation de la salle) à saisir à la main.
- Les longueurs ne tiennent pas compte des obstacles ni de la hauteur (pied de micro, perche, régie en hauteur).
- Les étiquettes peuvent se chevaucher quand les éléments sont très serrés : les micros, DI, pieds et pédaliers ne sont
  étiquetés que sélectionnés ou renommés.
- L'éclairage n'apparaît pas sur le plan : il s'ajoute comme besoin dans l'onglet Matériel.
- Historique d'annulation limité à 60 étapes par plan et perdu au rechargement.

## Intégration dans JamHit (à faire si l'outil convient)

1. Déclarer `stageplot/stageplot.css` et `stageplot/stageplot.js` dans `app/index.html` et dans la liste `ASSETS` de
   `app/sw.js`.
2. Ajouter `['stage', 'Plan de scène']` au tableau `SUBS` de `app/tools.js`, rendre `StagePlot.view()` pour ce
   sous-onglet, appeler `StagePlot.mount()` après insertion et `StagePlot.leave()` en le quittant.
3. Appeler `StagePlot.setInput()` avec l'état du groupe (même structure que l'export « Plan de scène (JSON) ») et
   `StagePlot.setPlans()` avec les plans synchronisés. Brancher `StagePlot.onChange` sur un type de fiche `stageplan`
   accepté par `api/index.php`.
4. Montrer sur la page d'un set les plans dont `setIds` le contient.
