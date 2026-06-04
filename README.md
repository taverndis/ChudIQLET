# 🏋️ IQLET Quiz Bot — Guide d'installation

Bot Discord pour le quiz musculation IQLET : 300 questions, scores DM, leaderboard.

---

## 📋 Fonctionnalités

| Commande | Qui | Description |
|---|---|---|
| `!question` | Admin seulement | Pose une question aléatoire dans le salon quiz |
| `!réponse` | Tout le monde | Affiche le leaderboard |
| `!stop` | Admin seulement | Annule la question en cours |
| `!reset` | Admin seulement | Remet tous les scores à zéro |

**Répondre à une question** : Les participants envoient leur réponse **en DM au bot**.

**Système de points :**
- ✅ Bonne réponse → **+1 pt**
- ⚡ Première bonne réponse (dans les 15 premières secondes) → **+2 pts**
- ❌ Mauvaise réponse → **0 pt**
- Chaque user ne peut répondre qu'une seule fois par question

**Vérification des réponses :**
Le bot analyse les mots-clés de ta réponse. Inutile d'écrire l'intégralité — les termes principaux suffisent (seuil : 60 % des mots-clés).

---

## 🚀 Installation

### 1. Créer le bot Discord

1. Va sur [discord.com/developers/applications](https://discord.com/developers/applications)
2. **New Application** → donne-lui un nom
3. Onglet **Bot** → **Add Bot**
4. Copie le **Token** (tu en auras besoin plus tard)
5. Active ces **Privileged Gateway Intents** :
   - ✅ Message Content Intent
   - ✅ Server Members Intent
6. Onglet **OAuth2 → URL Generator** :
   - Scopes : `bot`
   - Permissions : `Send Messages`, `Read Message History`, `Embed Links`
7. Copie l'URL générée et invite le bot sur ton serveur

### 2. Récupérer les IDs nécessaires

- **QUIZ_CHANNEL_ID** : Clic droit sur le salon quiz → "Copier l'identifiant"
- **ADMIN_USER_ID** : Clic droit sur toi-même → "Copier l'identifiant"
  *(Active le mode développeur dans Paramètres Discord → Avancé → Mode développeur)*

### 3. Déploiement sur Railway

1. Push ce dossier sur un repo GitHub (sans le fichier `.env` ni `quiz.db`)
2. Va sur [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
3. Sélectionne ton repo
4. Dans **Variables** (onglet Settings de ton service), ajoute :

```
DISCORD_TOKEN     = ton_token_bot
QUIZ_CHANNEL_ID   = id_du_salon_quiz
ADMIN_USER_ID     = ton_id_discord
QUESTION_TIMEOUT_SEC = 60
SPEED_BONUS_SEC   = 15
```

5. Railway va détecter le `package.json` et lancer `npm start` automatiquement ✅

---

## 📁 Structure du projet

```
iqlet-bot/
├── index.js           → Bot principal (commandes, logique de jeu)
├── answerChecker.js   → Vérification intelligente des réponses
├── data/
│   └── questions.json → Les 300 questions (extraites du HTML)
├── package.json
├── .gitignore
├── .env.example       → Modèle de variables d'environnement
└── README.md
```

---

## ⚙️ Configuration avancée

| Variable | Défaut | Description |
|---|---|---|
| `QUESTION_TIMEOUT_SEC` | `60` | Secondes avant fermeture auto d'une question |
| `SPEED_BONUS_SEC` | `15` | Fenêtre de temps pour le bonus vitesse |

---

## 🔍 Comment fonctionne la vérification des réponses ?

Le `answerChecker.js` :
1. Normalise les textes (minuscules, sans accents, sans ponctuation)
2. Extrait les **mots-clés** de la réponse officielle (tokens > 3 lettres, hors stopwords)
3. Vérifie si ≥ 60 % des mots-clés se retrouvent dans la réponse du participant
4. Cas spécial : si la réponse est purement numérique (ex: "4 kcal"), le chiffre doit être correct

**Exemple :**
- Question : "Combien de calories contient 1g de protéines ?"
- Réponse officielle : "4 kcal par gramme de protéines."
- ✅ "4 kcal" → correct (chiffre présent)
- ✅ "4 calories" → correct (chiffre présent)
- ❌ "9" → incorrect

---

## 🔄 Réinitialisation

- `!reset` remet les scores **et** la liste des questions utilisées à zéro.
- Sans reset, les 300 questions tournent sans répétition. Quand toutes ont été posées, le bot recommence automatiquement depuis le début.
