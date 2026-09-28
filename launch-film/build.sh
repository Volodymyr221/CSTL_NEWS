#!/usr/bin/env bash
# launch-film/build.sh — ЗВОДИТЬ КАРТИНКУ ЗІ ЗВУКОМ І ПЕРЕВІРЯЄ РЕЗУЛЬТАТ.
#
# Очікує, що вже пройшли:
#   node launch-film/render.mjs                              → out/…-без-звуку.mp4
#   vendor/openmontage/.venv/bin/python launch-film/audio.py → out/…-30s.wav
set -euo pipefail

# 🔴 ЗМІННІ ТУТ ЛАТИНИЦЕЮ — І ЦЕ НЕ СМАК. Спершу вони звались `ТУТ`, `ВІДЕО`,
# `ЗВУК`, як заведено в цьому проєкті. Скрипт упав одразу:
#     build.sh: line 9: ТУТ=/home/user/CSTL_NEWS/launch-film: No such file
# Bash дозволяє в іменах змінних лише латиницю, цифри й підкреслення; рядок
# `ТУТ=...` він розбирає не як присвоєння, а як спробу ЗАПУСТИТИ команду з
# такою назвою. Помилка при цьому показує шлях і слово «No such file», тобто
# виглядає як проблема зі шляхом, а не з іменем змінної.
# ⚠️ У проєкті це вже коштувало 20 годин: 07.08 деплой поклав рядок `РОЗМІР=…`
# у `.github/workflows/deploy.yml` — 24 прогони поспіль падали з `exit 127`.
# 🔑 Кирилиця в коментарях і в тексті на екран — будь ласка. В іменах змінних
# оболонки — ніколи.

HERE="$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")"
OUT="$HERE/out"
VIDEO="$OUT/cstl-life-30s-без-звуку.mp4"
AUDIO_WAV="$OUT/cstl-life-30s.wav"
FINAL="$OUT/cstl-life-30s.mp4"

for f in "$VIDEO" "$AUDIO_WAV"; do
  [ -f "$f" ] || { echo "❌ немає $f — спершу прожени render.mjs і audio.py"; exit 1; }
done

echo "── зводжу картинку зі звуком ──"
# 🔑 -shortest НЕ ставимо навмисно: обидва потоки рівно по 30 с, і якби один
# виявився коротшим на кадр, -shortest мовчки обрізав би ролик. Краще побачити
# розбіжність у перевірці нижче, ніж отримати 29.97 с і не помітити.
ffmpeg -y -v error \
  -i "$VIDEO" -i "$AUDIO_WAV" \
  -map 0:v:0 -map 1:a:0 \
  -c:v copy \
  -c:a aac -b:a 192k -ar 48000 -ac 2 \
  -movflags +faststart \
  "$FINAL"

echo "── перевірка ──"
# 🔬 Перевіряємо саме те, через що ролики завертають майданчики: розмір, частоту
# кадрів, формат пікселя, наявність звуку і тривалість обох потоків.
# ⚠️ КОЖНЕ ПОЛЕ — ОКРЕМИМ ЗАПИТОМ. Перша редакція брала всі чотири одним
# `-show_entries stream=width,height,r_frame_rate,pix_fmt` і розкладала по
# порядку. ffprobe віддав їх у СВОЄМУ порядку (pix_fmt раніше за r_frame_rate),
# і перевірка збрехала: заявила «не 30 кадрів/с» і «не yuv420p» на файлі, де
# і те, і те правильне. Прилад, який бракує справний файл, гірший за відсутній.
_pv() { ffprobe -v error -select_streams v:0 -show_entries "stream=$1" -of "default=nw=1:nk=1" "$FINAL"; }
W=$(_pv width); H=$(_pv height); FPS=$(_pv r_frame_rate); PIXFMT=$(_pv pix_fmt)
DUR_V=$(ffprobe -v error -select_streams v:0 -show_entries stream=duration -of csv=p=0 "$FINAL")
DUR_A=$(ffprobe -v error -select_streams a:0 -show_entries stream=duration -of csv=p=0 "$FINAL")
AINFO=$(ffprobe -v error -select_streams a:0 -show_entries stream=codec_name,channels,sample_rate -of csv=p=0 "$FINAL")
SIZE=$(du -h "$FINAL" | cut -f1)

echo "  розмір кадру : ${W}×${H}"
echo "  кадрів/с     : ${FPS}"
echo "  формат пікс. : ${PIXFMT}"
echo "  відео        : ${DUR_V} с"
echo "  звук         : ${AINFO} · ${DUR_A} с"
echo "  файл         : ${SIZE}"

ERRORS=0
[ "$W" = "1080" ] && [ "$H" = "1920" ] || { echo "❌ не 1080×1920"; ERRORS=1; }
[ "$FPS" = "30/1" ] || { echo "❌ не 30 кадрів/с"; ERRORS=1; }
[ "$PIXFMT" = "yuv420p" ] || { echo "❌ формат пікселя не yuv420p — Instagram і Telegram покажуть зелений кадр"; ERRORS=1; }
awk -v v="$DUR_V" -v a="$DUR_A" 'BEGIN { exit (v>29.8 && v<30.2 && a>29.8 && a<30.2) ? 0 : 1 }' \
  || { echo "❌ тривалість не 30 с"; ERRORS=1; }
awk -v v="$DUR_V" -v a="$DUR_A" 'BEGIN { d=v-a; if(d<0)d=-d; exit (d<0.08) ? 0 : 1 }' \
  || { echo "❌ картинка і звук розʼїхались більш ніж на 80 мс"; ERRORS=1; }

if [ "$ERRORS" = "0" ]; then
  echo "✅ $FINAL"
else
  echo "❌ є зауваження — див. вище"; exit 1
fi
