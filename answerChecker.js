/**
 * answerChecker.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Vérification intelligente des réponses pour le quiz IQLET.
 *
 * Règles :
 *   - Réponse numérique courte → chiffre(s) obligatoire(s)
 *   - Réponse courte (≤5 kws)  → 75 % des mots-clés requis
 *   - Réponse moyenne (6-10)   → 45 % OU ≥3 mots-clés corrects
 *   - Réponse longue (>10)     → 30 % OU ≥4 mots-clés corrects
 */

const STOPWORDS = new Set([
  'le','la','les','un','une','des','du','de','et','ou','est','son','ses','sa',
  'leur','leurs','dans','par','pour','sur','avec','qui','que','dont','mais',
  'donc','car','ni','en','au','aux','il','elle','ils','elles','on','se','si',
  'ce','cette','ces','cet','plus','moins','tres','bien','aussi','comme','tout',
  'toute','tous','toutes','peut','lors','entre','vers','apres','avant','sous',
  'sans','chez','pas','non','ne','quand','ainsi','afin','cela','puis','soit',
  'via','notamment','cest','sont','avoir','etre','fait','faire','meme','cela',
  'cette','lors','donc','dont','afin','puis','soit','via','notamment',
]);

function normalize(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractKeywords(text) {
  const words = normalize(text).split(' ');
  const kws = [];
  for (const w of words) {
    if (w.length > 3 && !STOPWORDS.has(w)) kws.push(w);
  }
  return [...new Set(kws)];
}

function extractNumbers(text) {
  const matches = text.match(/\d+(?:[.,]\d+)?/g);
  return matches ? matches.map(n => n.replace(',', '.')) : [];
}

/**
 * @param {string} userAnswer
 * @param {string} officialAnswer
 * @returns {boolean}
 */
function checkAnswer(userAnswer, officialAnswer) {
  if (!userAnswer || !officialAnswer) return false;

  const normUser     = normalize(userAnswer);
  const normOfficial = normalize(officialAnswer);

  // 1. Match parfait
  if (normUser === normOfficial) return true;
  if (normUser.includes(normOfficial)) return true;

  // 2. Réponse numérique (ex: "4 kcal", "1.6 2.2 g/kg")
  const offNums  = extractNumbers(officialAnswer);
  const userNums = extractNumbers(userAnswer);
  if (offNums.length >= 1 && offNums.length <= 3) {
    if (offNums.every(n => userNums.includes(n))) return true;
  }

  // 3. Mots-clés
  const keywords = extractKeywords(officialAnswer);
  if (keywords.length === 0) return false;

  const found = keywords.filter(kw => normUser.includes(kw));
  const score = found.length / keywords.length;

  if (keywords.length <= 3)  return score >= 1.0;
  if (keywords.length <= 5)  return score >= 0.75;
  if (keywords.length <= 10) return score >= 0.40 || found.length >= 2;
  // > 10 mots-clés : réponses encyclopédiques, 2 mots-clés suffisent
  return score >= 0.20 || found.length >= 2;
}

module.exports = { checkAnswer };
