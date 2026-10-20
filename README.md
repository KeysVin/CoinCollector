# CoinCollector — refonte

Interface publique moderne et espace d’administration statique connecté à l’API GitHub.

Lis d’abord [GUIDE_INSTALLATION.md](GUIDE_INSTALLATION.md).

## Ajout de plusieurs pièces

Dans l’administration, **Ajout multiple** permet d’importer plusieurs photos en une fois. Une fiche est proposée pour chaque paire de photos ; les photos associées sont visibles à côté de chaque fiche, même dans un grand lot. Chaque photo peut ensuite être déplacée vers une autre fiche, rognée ou tournée de 90° à gauche ou à droite avant publication. Chaque fiche peut aussi rechercher une adresse et enregistrer sa position sur la carte. Renseigne au minimum un nom et une année pour chaque fiche contenant des photos, puis publie le lot.

L’ajout multiple conserve automatiquement un **brouillon local** (fiches et photos) dans le navigateur de l’appareil. Après avoir ouvert l’administration une première fois avec une connexion, tu peux reprendre ce lot même si le réseau coupe. Si la session GitHub de l’onglet a disparu, utilise **Reprendre le brouillon local sans connexion** sur l’écran d’accueil ; reconnecte GitHub pour publier. La publication vers GitHub se fait manuellement lorsque la connexion revient. Le brouillon n’est pas synchronisé entre appareils ; vider les données du navigateur peut le supprimer. Le bouton **Effacer le brouillon** retire les fiches et photos non publiées de cet appareil.

Le bouton **Proposer avec l’IA** utilise jusqu’à trois photos de la fiche, recherche des informations sur le web et complète les champs encore vides. Les propositions et leurs sources sont à vérifier avant publication. Une photo peut aussi être rognée ou tournée dans le formulaire d’ajout classique.

Pour activer l’IA sur Netlify, ajoute `OPENAI_API_KEY` dans les variables d’environnement disponibles pour les **Functions**, puis redéploie le site. La clé reste côté serveur. `OPENAI_MODEL` permet de choisir un autre modèle compatible avec les images, la recherche web et les sorties structurées ; par défaut, `gpt-5.4-mini` est utilisé. La fonction vérifie que le token GitHub connecté permet de modifier `KeysVin/CoinCollector`. Pour un fork, configure aussi `COINCOLLECTOR_OWNER` et `COINCOLLECTOR_REPO` dans Netlify.

Le serveur local `python -m http.server` sert l’interface, mais pas les fonctions Netlify : l’identification par IA fonctionne sur le déploiement Netlify ou avec `netlify dev`.

Cette archive ne remplace pas `data/coins-meta.json` ni `data/images/` : les données et photos existantes doivent rester dans le dépôt original.
