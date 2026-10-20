# Guide pas à pas — Atelier d'Écriture de Mme Granger

## Ce que vous allez faire (environ 20 minutes)

Vous avez 4 fichiers à mettre en ligne. Voici les étapes dans l'ordre.

---

## ÉTAPE 1 — Créer un compte GitHub (gratuit)

GitHub est l'endroit où vous allez stocker les fichiers.

1. Allez sur https://github.com
2. Cliquez sur "Sign up" (s'inscrire)
3. Choisissez un nom d'utilisateur, un email, un mot de passe
4. Vérifiez votre email
5. Vous êtes connecté(e)

---

## ÉTAPE 2 — Créer un "dépôt" (dossier en ligne)

1. Sur GitHub, cliquez sur le "+" en haut à droite
2. Choisissez "New repository"
3. Nom du dépôt : atelier-ecriture
4. Cochez "Public"
5. Cliquez "Create repository"

---

## ÉTAPE 3 — Ajouter les fichiers

Cliquez sur "uploading an existing file" (ou "Add file" > "Upload files")

Glissez-déposez ces 4 fichiers :
- index.html
- netlify.toml
- .gitignore
- netlify/functions/gemini.js

Pour le dernier (gemini.js), vous devrez d'abord créer le dossier :
cliquez "Create new file", tapez : netlify/functions/gemini.js
puis copiez-collez le contenu du fichier.

Cliquez "Commit changes" à chaque fois.

---

## ÉTAPE 4 — Créer un compte Netlify (gratuit)

Netlify va mettre votre site en ligne et garder la clé API secrète.

1. Allez sur https://netlify.com
2. Cliquez "Sign up"
3. Choisissez "Sign up with GitHub" (plus simple)
4. Autorisez la connexion

---

## ÉTAPE 5 — Connecter votre site GitHub à Netlify

1. Sur Netlify, cliquez "Add new site"
2. Choisissez "Import an existing project"
3. Choisissez "Deploy with GitHub"
4. Sélectionnez votre dépôt : atelier-ecriture
5. Laissez tous les paramètres par défaut
6. Cliquez "Deploy site"

Votre site va se déployer. Netlify vous donne une URL du type :
https://quelque-chose.netlify.app

---

## ÉTAPE 6 — Ajouter votre clé API Gemini (la partie secrète)

1. Dans Netlify, allez dans votre site
2. Cliquez "Site configuration" (ou "Site settings")
3. Dans le menu gauche, cliquez "Environment variables"
4. Cliquez "Add a variable"
5. Key (clé) : GEMINI_API_KEY
   Value (valeur) : votre clé API Gemini (commence par AIzaSy...)
6. Cliquez "Create variable"
7. Retournez dans "Deploys" et cliquez "Trigger deploy" > "Deploy site"

---

## ÉTAPE 7 — Tester

Ouvrez l'URL Netlify dans votre navigateur.
Entrez un prénom, choisissez un thème, écrivez une phrase.
Si ça répond : tout fonctionne ! 🎉

---

## Comment obtenir une clé API Gemini ?

1. Allez sur https://aistudio.google.com/app/apikey
2. Connectez-vous avec votre compte Google
3. Cliquez "Create API key"
4. Copiez la clé (elle commence par AIzaSy...)
5. Collez-la dans Netlify à l'étape 6

---

## En cas de problème

- Le site ne s'affiche pas → vérifiez que index.html est bien à la racine du dépôt
- "Erreur serveur" dans l'app → vérifiez que la clé API est bien saisie dans Netlify
- La clé ne fonctionne pas → vérifiez sur aistudio.google.com qu'elle est active

---

## Partager l'app avec vos élèves

Donnez-leur simplement l'URL Netlify :
https://votre-site.netlify.app

Ils n'ont pas besoin de créer de compte. Ils ouvrent, ils écrivent.
