# Prompt de démarrage — concepteur de plan de scène

À copier tel quel dans une nouvelle session, dans un dépôt vide, en joignant les fichiers `README.md` et `exemple-entree.json` de ce dossier.

---

Je veux créer un **concepteur de plan de scène dynamique** pour groupes de musique, sous la forme d'un outil web autonome
que j'intégrerai plus tard dans mon application existante, JamHit. Le fichier `README.md` joint est le cahier des charges :
lis-le en entier avant de commencer, il fait référence. Le fichier `exemple-entree.json` joint contient des données d'exemple
au format que mon application exporte (groupe fictif, musiciens, instruments, matériel personnel et commun, sets).

**Ce que l'outil doit faire**

1. Charger les données d'entrée (nom du groupe, musiciens, instruments, matériel de chacun, matériel commun « au groupe » ou « à louer », sets).
2. Permettre de composer un plan de scène en glissant sur une scène aux dimensions réglables les musiciens, leur matériel,
   le matériel commun et quelques éléments libres (arrivée électrique, pied de micro, DI, retour…).
3. Proposer automatiquement le câblage à partir du type de matériel, modifiable à la main, avec pour chaque liaison le type de câble
   et la longueur (distance sur le plan, marge, arrondi à une longueur standard).
4. Produire le patch (voies de la table), la liste de câbles regroupée par type et longueur, et la liste complète de matériel et d'accessoires
   en trois états : apporté par un musicien, disponible au groupe, à louer ou manquant (en comparant le besoin à l'inventaire reçu).
5. Associer chaque plan à un ou plusieurs sets (concert live ou répétition) ; gérer plusieurs plans par groupe.
6. Imprimer / exporter en PDF (plan, patch et câblage, matériel), exporter et importer le plan en JSON, exporter les listes en CSV.

**Contraintes à respecter strictement** (détaillées dans le README, section « Contraintes d'intégration à JamHit »)

- HTML, CSS et JavaScript natifs uniquement : aucune dépendance, aucune étape de compilation, aucun appel réseau.
- Tout le code dans un seul module `const StagePlot = (() => { … return { view, mount, leave, setInput }; })();`, sans autre variable globale.
- Identifiants et classes CSS préfixés `sp-` ; actions par attribut `data-sp="action:valeur"` et délégation d'événements.
- Couleurs d'interface par les variables CSS du thème sombre listées dans le README (définies dans la page hôte de développement).
- Entrées reçues par `StagePlot.setInput(data)`, plans rendus par `StagePlot.onChange` ; en autonome, la page hôte charge
  `exemple-entree.json` et enregistre dans `localStorage` (clé `stageplot:v1`).
- Tactile d'abord : événements `pointer*`, cibles d'au moins 40 px, utilisable à 380 px de large et sur tablette en paysage.
- Interface en français ; tout texte venant des données est échappé avant insertion dans le HTML.
- Les données reçues sont en lecture seule ; un musicien ou un matériel disparu d'un nouvel export est signalé sans erreur.

**Façon de travailler**

- Commence par me proposer en quelques lignes le découpage de l'écran (bibliothèque, scène, panneau de propriétés, onglets Plan / Câblage / Matériel)
  sur téléphone et sur tablette, et les règles de câblage automatique que tu comptes appliquer. Attends mon accord avant de coder.
- Livre ensuite une première version qui fonctionne de bout en bout avec les données d'exemple (poser les éléments, câblage proposé, listes, impression),
  puis affine.
- Teste dans un navigateur à chaque étape (glisser-déposer, calcul des longueurs, listes, impression, rechargement de la page) et dis-moi précisément
  ce qui a été vérifié et ce qui ne l'a pas été, notamment le tactile sur un appareil réel.
- Tiens à jour un `README.md` du projet : fonctionnement, formats `stage-input` et `stage-plan`, règles de câblage, limites connues.
- Ne change pas les formats de données décrits dans le README sans me le signaler : c'est par eux que l'outil sera branché sur JamHit.

**Livrables** : `stageplot.js`, `stageplot.css`, `index.html` (page hôte de développement), `exemple-entree.json`, `README.md`.
