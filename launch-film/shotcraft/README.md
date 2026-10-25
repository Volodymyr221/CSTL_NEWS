# launch-film/shotcraft — відео «Громади» на скілі video-shotcraft (24.10.2026)

Тут лише **вихідний код** чотирьох роликів і інструменти. Картинки, звуки, `node_modules`
і готові `.mp4` не комітимо — вони перегенеровуються. На сайт тека не потрапляє:
`launch-film` вирізає крок `Trim artifact` у `.github/workflows/deploy.yml`.

| тека | ролик | формат |
|---|---|---|
| `film/` | спокійний огляд: знак → Громада → Автобуси → Дошка → Питання → фінал | 9:16, 30 с, лише звуки |
| `teaser/` | тизер під музику, монтаж у біт (Cat Walk, Mixkit) | 9:16, 24 с, з музикою і без |
| `howto/` | інструкція: як подати оголошення і як написати продавцю | 9:16, 69 с, озвучка |
| `promo/` | промо під текст і голос Вови, «жива карта громади» | 9:16 **і** 1:1, 36 с |
| `paper/` | «З паперу — в смартфон»: раніше (ризографія, папір) → тепер (застосунок), повзунок «до/після» | **4:5**, 25 с, лише звуки |

## Як підняти з нуля (≈10 хв)

```bash
SP=<scratchpad>
git clone --depth 1 https://github.com/Vincentwei1021/video-shotcraft $SP/ext/video-shotcraft
cp -r launch-film/shotcraft/promo $SP/promo && cd $SP/promo && npm i   # remotion 4.0.484
# remotion.config.ts уже вказує браузер контейнера:
#   /opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
npx remotion render src/index.ts Promo out/promo.mp4          # 9:16
npx remotion render src/index.ts PromoSquare out/promo-1x1.mp4 # 1:1
```

Звуки — з `video-shotcraft/assets/audio/sfx/<категорія>/` у `public/audio/`
(імена файлів — у коді, напр. `whoosh-big`, `impact-cine-big`).

## Знімки застосунку — `tools/mk.py`

Обгортка над `launch-film/shoot.mjs` (сервер стендів, заглушка бази `mockSupabase`,
прапорець заслінки `cstl_dev_ok`). Пишеш тіло сценарію в `.mjs`, а `mk.py` вклеює його:

```bash
cd launch-film
OUTDIR=public/textures THREADS="[...]" MSGS="[...]" python3 shotcraft/tools/mk.py $SP my-steps.mjs
node _vs-shoot.mjs && rm _vs-shoot.mjs
```

- ⚠️ `import 'playwright'` в ESM не бачить глобальний пакет — `mk.py` підставляє
  `/opt/node22/lib/node_modules/playwright/index.mjs`.
- `mk.py` логінить вигаданого жителя «Олег Коваль» (`opts.user` у заглушці).
- 🔴 Новини фільтруються регуляркою від загибелей/війни — на головній буває траурна новина.
- «Написати» на оголошенні з заглушкою **мовчки не відкриває чат**: вставка в заглушці не
  повертає рядок, тож `getOrCreateThread` падає. Ліки — покласти готову розмову в `THREADS`.
- Для капсули повідомлення в розмові має бути `last_message_text`, інакше «📷 Фото».
- Набір по букві = окремий `screenshot` після кожного `keyboard.type` (`howto/cap.mjs`).
- Довгий аркуш форми — 4 кадри на різних глибинах прокрутки, склеєні в одну смугу.

## Озвучка українською — `tools/say.py`

Нейроголос **robinhad/ukrainian-tts v6.0.0** (голоси: tetiana, mykyta, lada, dmytro, oleksa).

```bash
uv venv -p 3.11 $SP/tts/venv311 && uv pip install -p $SP/tts/venv311/bin/python ukrainian-tts  # 5.3 ГБ
cd $SP/tts/ut && ../venv311/bin/python say.py фрази.json tetiana вихід/
```

- HuggingFace у цьому оточенні **закритий**: пакет при імпорті тягне `stanza.download('uk')`
  звідти. `say.py` глушить це і вимикає словникові наголоси; наголоси ставить вбудована
  модель `accentor-lite.pt`. Модель голосу сама качається з GitHub-релізу (відкритий).
- Хибні наголоси правимо `+` перед голосною: `відпов+ів`, `одн+им`, `куп+и`, `+Олика`.
- Python 3.10 не підходить (scipy ≥ 1.16). ElevenLabs, Whisper, Silero — недосяжні.

## Монтаж під голос — `promo/`

`src/timing.ts`: кожна зміна кадру — `at(фраза, 'слово')`, не секунда.
1. `align.py запис.wav text.json segments.json` — межі 7 фраз за паузами. Працює на
   «людському» записі з паузами між реченнями.
2. Якщо пауз між реченнями немає (голос ElevenLabs Вови) — **`dtw_align.py`**: зразковий
   голос того самого тексту, синтезований шматками з розрізами на словах-сигналах
   (`chunks.json` → `guide2.json`), накладається на запис DTW по MFCC; переносяться і межі
   фраз, і моменти слів (`anchors`). Перевірка: перенесені межі мусять лягти на паузи запису.
3. Гучність голосу — до −16 LUFS (`loudnorm`), запис Вови був −28.

## Монтаж у біт — `teaser/`

`beat.py` дав сітку, але `beat_track` зачепився за хай-хет і стояв на 0.4 біта поруч —
сітку фітовано по ударах бочки 40–120 Гц (`grid.json`). Після рендеру — звірка стиків з
ударами у готовому файлі (було ±1.1 кадру).
