import SEG from './segments.json';

// ── ЧАС БЕРЕТЬСЯ З ГОЛОСУ ──────────────────────────────────────────────────
// segments.json робить align.py із будь-якого запису: 7 фраз, межі — за паузами.
// Час окремого слова — частка його позиції у фразі (за кількістю літер).
// Тому заміна голосу = новий segments.json, і весь монтаж сам сідає на новий темп.
export const FPS = 30;
export type Seg = { start: number; end: number; text: string };
export const S = (SEG as { segments: Seg[]; duration: number }).segments;
export const TOTAL = Math.round(((SEG as { duration: number }).duration + 1.6) * FPS);
export const fr = (t: number) => Math.round(t * FPS);
/** кадр, коли у фразі i звучить слово word (n-те входження) */
// Якщо dtw_align.py переніс точний час слова із зразка (anchors) — беремо його.
const ANCH = ((SEG as { anchors?: Record<string, number | null> }).anchors) || {};
export const at = (i: number, word: string, n = 0): number => {
  const a = ANCH[`${i}:${word.toLowerCase()}`];
  if (n === 0 && typeof a === 'number') return fr(a);
  const s = S[i]; const low = s.text.toLowerCase();
  let p = -1; for (let k = 0; k <= n; k++) p = low.indexOf(word.toLowerCase(), p + 1);
  if (p < 0) throw new Error(`слово «${word}» не знайдено у фразі ${i}`);
  return fr(s.start + (p / s.text.length) * (s.end - s.start));
};
export const segF = (i: number) => ({ from: fr(S[i].start), to: fr(S[i].end) });
