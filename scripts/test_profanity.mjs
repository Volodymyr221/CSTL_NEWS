// Тести фільтра матюків (containsProfanity) — має блокувати мати (укр/рос/англ/leet/обходи)
// і НЕ чіпати легальні слова. Запуск: node scripts/test_profanity.mjs
import { containsProfanity } from '../src/core/utils.js';

// МАЄ блокувати (true)
const BLOCK = [
  // укр/рос
  'йди на хуй', 'ти підор', 'сука', 'мудак', 'пізда', 'хуйло', 'гандон',
  'дебіл', 'ідіот', 'курва тупа', 'залупа', 'долбойоб', 'сволоч',
  'иди нахуй', 'мразь',
  // leet / обходи
  'сук4', 'п1зда', 'хyйло', 'b1yat', 'sh1t', 'f4ggot', 'n1gger',
  'х у й', 'b l y a t', 'м у д а к',
  // англ.
  'fuck you', 'you bitch', 'asshole', 'motherfucker', 'faggot',
  'what a retard', 'dumbass', 'go to hell bitch',
  // трансліт
  'pishov nahyi', 'blyat', 'pidor', 'pidoras', 'mudak', 'huylo', 'dolboeb',
  'nahui idi', 'pohuy',
  // форми 'еб' (стем звужено до довших — ці мають далі ловитись)
  'ебало завали', 'ебан якийсь', 'ебать як довго', 'ебуть і не морщаться', 'ебнутий на всю',
];

// НЕ має блокувати (false) — легальні слова
const PASS = [
  // укр легальні
  'художник малює', 'худий кіт', 'хустка бабусі', 'хутро тепле', 'хуліган втік',
  'мандарин', 'мандат депутата', 'педикюр і манікюр', 'корабель у морі', 'сучок на гілці',
  'гнідий кінь', 'ідіома мови', 'шлюб зареєстровано', 'лоша біжить', 'лохина смачна',
  'сукня гарна', 'обладнання нове', 'на хуторі тихо', 'Херсон', 'скотч клейкий',
  'документ готовий', 'громада Олика', 'дякую всім', 'привіт друзі', 'зустріч о 5',
  'скотар пасе', 'ситуація складна', 'аналіз даних',
  // англ легальні
  'class assignment', 'please assist me', 'I assume so', 'country road',
  'this hit the target', 'rapid order please', 'grass field', 'pass the ball',
  'analysis report', 'bassoon music', 'hello world', 'great job everyone',
  'assessment done', 'passport ready',
  // e+b слова: гомогліфи (e→е, b→б) робили «ебоок/ебау…» → хибне блокування стемом 'еб'
  'ebook reader', 'ebay auction', 'ebola virus', 'ebony wood', 'read an ebook',
];

let fails = 0;
for (const t of BLOCK) {
  if (!containsProfanity(t)) { console.log(`  ✗ НЕ заблокував (мало б): "${t}"`); fails++; }
}
for (const t of PASS) {
  if (containsProfanity(t)) { console.log(`  ✗ ХИБНО заблокував (легальне): "${t}"`); fails++; }
}
console.log(fails === 0
  ? `\n✅ УСЕ ЗЕЛЕНЕ — ${BLOCK.length} блок + ${PASS.length} легальних`
  : `\n❌ ПРОВАЛІВ: ${fails}`);
process.exit(fails ? 1 : 0);
