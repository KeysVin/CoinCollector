# Installation de la refonte CoinCollector

## Important avant de commencer

Le ZIP ne contient volontairement pas tes dizaines de mégaoctets de photos ni ton fichier réel `data/coins-meta.json`.
Ils sont déjà dans ton dépôt GitHub et doivent être conservés.

Ne supprime donc jamais ces éléments de ton dépôt :

- `data/coins-meta.json`
- `data/images/`

Le nouveau site sait directement lire leur format actuel.

## Méthode recommandée : GitHub Desktop

1. Sur ton ordinateur, installe GitHub Desktop et connecte le compte `KeysVin`.
2. Dans GitHub Desktop, choisis **File > Clone repository** puis clone `KeysVin/CoinCollector`.
3. Fais une copie de sauvegarde du dossier cloné.
4. Décompresse `CoinCollector_refonte.zip`.
5. Copie tous les fichiers de la refonte dans le dossier cloné et accepte le remplacement des fichiers existants.
6. Vérifie que le dossier original `data/images/` et le fichier original `data/coins-meta.json` sont toujours présents.
7. Dans GitHub Desktop, écris par exemple `Refonte complète du site et ajout de l'administration`.
8. Clique sur **Commit to main**, puis sur **Push origin**.

Netlify redéploiera automatiquement le site si le dépôt est déjà connecté.

## Configuration Netlify

Dans Netlify :

- Build command : laisser vide
- Publish directory : `.`
- Le fichier `netlify.toml` configure déjà la publication et plusieurs en-têtes de sécurité.

## Accéder à l’administration

L’adresse est :

`https://ADRESSE-DE-TON-SITE.netlify.app/admin/`

L’administration est séparée du site public. Aucun bouton de modification n’apparaît sur les fiches publiques.

## Créer le token GitHub

Dans GitHub, crée un token personnel **fine-grained** :

1. Ouvre les paramètres de ton compte GitHub.
2. Va dans **Developer settings > Personal access tokens > Fine-grained tokens**.
3. Limite le token au dépôt `CoinCollector`.
4. Dans les permissions du dépôt, règle **Contents** sur **Read and write**.
5. Donne une date d’expiration raisonnable.
6. Copie le token immédiatement.

Dans `/admin/`, renseigne :

- Propriétaire : `KeysVin`
- Dépôt : `CoinCollector`
- Branche : `main`
- Token : le token créé

Le token est stocké uniquement dans `sessionStorage`, donc dans l’onglet actuel. Il disparaît lorsque la session du navigateur est fermée. Ne l’envoie à personne et évite d’utiliser l’administration sur un ordinateur public.

## Fonctions disponibles

- galerie publique responsive ;
- recherche et filtres ;
- tri par nom, date et année ;
- fiches détaillées et photos ;
- carte basée sur les coordonnées déjà présentes ;
- statistiques ;
- création, modification et suppression des pièces ;
- création, renommage et suppression des collections ;
- ajout et compression automatique de nouvelles photos ;
- champs supplémentaires : pays, valeur, métal, état, atelier, quantité, estimation, acquisition et tags ;
- application installable grâce au manifest et au service worker.

## Tester localement

Un double-clic sur `index.html` ne suffit pas, car le navigateur bloque parfois la lecture du JSON local.

Depuis le dossier du projet, lance :

```bash
python -m http.server 8080
```

Puis ouvre :

`http://localhost:8080`

L’administration peut aussi être ouverte localement à l’adresse :

`http://localhost:8080/admin/`

## Retour arrière

En cas de problème, GitHub conserve l’historique des commits. Tu peux revenir au commit précédent depuis GitHub Desktop ou l’interface GitHub.
