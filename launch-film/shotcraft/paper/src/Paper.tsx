import React from 'react';
import { AbsoluteFill, Audio, Easing, Img, interpolate, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { Phone, Shot, T, clamp } from './kit';

// «З ПАПЕРУ — В СМАРТФОН» · 4:5 (1080×1350) для стрічки Instagram.
// Ліворуч від повзунка — паперовий світ громади (ризографія двома фарбами),
// праворуч — той самий запит у «Громаді» (справжні знімки застосунку).
// Прийоми video-shotcraft: before-after-slider-scrub (швидкий кидок + повільний
// перегляд) і riso-print-hits (зсув друкарських форм, що «клацає» в збіг) — один раз.
export const W = 1080, H = 1350;

// Фарби ризографа виведено з бренду: бордо застосунку + друкарський синій.
const INK = { red: '#9B2335', blue: '#2F5AA8', paper: '#F2EDE1', dark: '#2A2520' };
const ease = { out: Easing.bezier(0.16, 1, 0.3, 1), smooth: Easing.bezier(0.45, 0, 0.2, 1) };

// Папір: тон + дрібне зерно (SVG-шум, детермінований) — без цього «друк» читається як заливка.
const Paper: React.FC<{ seed?: number }> = ({ seed = 3 }) => (
  <AbsoluteFill style={{ background: INK.paper }}>
    <svg width={W} height={H} style={{ position: 'absolute', inset: 0, opacity: 0.55, mixBlendMode: 'multiply' }}>
      <filter id={`g${seed}`}><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={seed} /><feColorMatrix values="0 0 0 0 0.45  0 0 0 0 0.40  0 0 0 0 0.33  0 0 0 0.35 0" /></filter>
      <rect width={W} height={H} filter={`url(#g${seed})`} />
    </svg>
  </AbsoluteFill>
);

// Друк двома формами: та сама розмітка двічі, кожна своєю фарбою, multiply.
const Riso: React.FC<{ off?: [number, number]; children: (ink: string) => React.ReactNode; style?: React.CSSProperties }> = ({ off = [0, 0], children, style }) => (
  <div style={{ position: 'relative', ...style }}>
    <div style={{ mixBlendMode: 'multiply', transform: `translate(${off[0]}px, ${off[1]}px)` }}>{children(INK.blue)}</div>
    <div style={{ position: 'absolute', inset: 0, mixBlendMode: 'multiply', transform: `translate(${-off[0]}px, ${-off[1]}px)` }}>{children(INK.red)}</div>
  </div>
);

// ── Паперові «раніше» ─────────────────────────────────────────────────────
const Notice: React.FC = () => (
  // Стовп + приклеєний аркуш із відривними номерами (два вже відірвані)
  <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H }}>
    {/* дерев'яний стовп: синя форма тоном + волокна, червона — металевий хомут */}
    <div style={{ position: 'absolute', left: 455, top: 290, width: 170, height: H - 290, mixBlendMode: 'multiply', background: `linear-gradient(90deg, ${INK.blue}55, ${INK.blue}33 35%, ${INK.blue}44 70%, ${INK.blue}66), repeating-linear-gradient(90deg, transparent 0 13px, ${INK.blue}0D 13px 15px)` }} />
    <div style={{ position: 'absolute', left: 448, top: 330, width: 184, height: 26, mixBlendMode: 'multiply', background: `${INK.red}88` }} />
    <div style={{ position: 'absolute', left: 300, top: 360, width: 480, height: 620, background: '#FBF8F0', transform: 'rotate(-2.5deg)', boxShadow: '0 18px 30px rgba(40,30,20,0.18)' }}>
      <div style={{ position: 'absolute', left: 170, top: -14, width: 140, height: 34, background: 'rgba(230,220,180,0.75)', transform: 'rotate(3deg)' }} />
      <div style={{ padding: '54px 40px 0', fontFamily: '"JetBrains Mono", monospace', color: INK.dark }}>
        <div style={{ fontSize: 50, fontWeight: 800, letterSpacing: '0.03em', lineHeight: 1.05 }}>РЕМОНТ<br />ТЕХНІКИ</div>
        <div style={{ fontSize: 30, fontWeight: 600, marginTop: 16, lineHeight: 1.25 }}>Телефони, ноутбуки,<br />пральні машини</div>
        <div style={{ fontSize: 24, marginTop: 16, opacity: 0.8 }}>діагностика безкоштовно</div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 170, display: 'flex', borderTop: `2px dashed ${INK.dark}66` }}>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} style={{ flex: '1 1 0', minWidth: 0, overflow: 'hidden', borderLeft: i ? `2px dashed ${INK.dark}55` : undefined, opacity: i === 2 || i === 5 ? 0 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ transform: 'rotate(-90deg)', whiteSpace: 'nowrap', fontFamily: '"JetBrains Mono", monospace', fontSize: 19, color: INK.dark }}>067 ··· 12 34</div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const BusSheet: React.FC = () => {
  const rows = [['6:40', 'Луцьк'], ['8:15', 'Луцьк'], ['?:??', 'Рівне'], ['12:30', 'Жорнище'], ['15:20', 'Луцьк'], ['17:—', '—']];
  return (
    <div style={{ position: 'absolute', left: 240, top: 330, width: 600, height: 720, background: '#FBF8F0', transform: 'rotate(1.8deg)', boxShadow: '0 18px 30px rgba(40,30,20,0.18)', fontFamily: '"JetBrains Mono", monospace', color: INK.dark }}>
      <div style={{ position: 'absolute', left: -12, top: 30, width: 90, height: 30, background: 'rgba(230,220,180,0.75)', transform: 'rotate(-30deg)' }} />
      <div style={{ position: 'absolute', right: -12, top: 30, width: 90, height: 30, background: 'rgba(230,220,180,0.75)', transform: 'rotate(30deg)' }} />
      <div style={{ padding: '60px 50px 0' }}>
        <div style={{ fontSize: 46, fontWeight: 800, letterSpacing: '0.06em' }}>РОЗКЛАД</div>
        <div style={{ fontSize: 22, opacity: 0.7, marginTop: 6 }}>станом на весну (?)</div>
        <div style={{ marginTop: 34 }}>
          {rows.map(([t, d], i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 38, padding: '12px 0', borderBottom: `2px solid ${INK.dark}22`, opacity: i === 5 ? 0.35 : 1, textDecoration: i === 3 ? 'line-through' : undefined }}>
              <span style={{ fontWeight: 700 }}>{t}</span><span>{d}</span>
            </div>
          ))}
        </div>
      </div>
      {/* пляма від дощу */}
      <div style={{ position: 'absolute', left: 330, top: 470, width: 220, height: 180, borderRadius: '50%', background: `radial-gradient(${INK.blue}22, transparent 70%)` }} />
    </div>
  );
};

const Rumors: React.FC = () => {
  const b = [
    { x: 120, y: 330, t: 'Чули? Кажуть, воду вимкнуть…', c: INK.red },
    { x: 380, y: 520, t: 'Коли? Завтра чи в середу?', c: INK.blue },
    { x: 160, y: 710, t: 'Сусідка казала — на тиждень 😱', c: INK.red },
    { x: 400, y: 900, t: 'А на якій вулиці?', c: INK.blue },
  ];
  return (
    <>
      {b.map((q, i) => (
        <div key={i} style={{ position: 'absolute', left: q.x, top: q.y, maxWidth: 560, padding: '26px 34px', borderRadius: 36, border: `5px solid ${q.c}`, background: '#FBF8F0', fontFamily: T.display, fontWeight: 700, fontSize: 40, lineHeight: 1.2, color: INK.dark, mixBlendMode: 'multiply', transform: `rotate(${i % 2 ? 1.5 : -1.5}deg)` }}>{q.t}</div>
      ))}
    </>
  );
};

// ── Одна пара «раніше → тепер» з повзунком ────────────────────────────────
type Pair = { tag: string; before: string; after: string; art: React.ReactNode; shot: string; cy: number };

const PAIRS: Pair[] = [
  { tag: 'ОГОЛОШЕННЯ', before: 'Папірець на стовпі', after: 'Дошка оголошень', art: <Notice />, shot: '05-doshka-v2.png', cy: 400 },
  { tag: 'АВТОБУСИ', before: 'Розклад на зупинці', after: 'Розклад наживо', art: <BusSheet />, shot: '06-avtobusy.png', cy: 380 },
  { tag: 'СТРІЧКА', before: '«Сусідка казала…»', after: 'Спільноти громади', art: <Rumors />, shot: '03-strichka-v2.png', cy: 330 },
];

const PAIR_DUR = 178;           // 5.9 с на пару
// Повзунок за взірцем before-after-slider-scrub: стоїть → замах → швидкий кидок
// з перельотом → відскок → пауза → повільний перегляд до кінця.
const posAt = (f: number) => {
  const r = (a: number, b: number, e = ease.smooth) => e(interpolate(f, [a, b], [0, 1], clamp));
  if (f < 56) return 0 - 1.5 * r(48, 56);                       // глядач читає «раніше»
  if (f < 68) return -1.5 + (76 + 1.5) * r(56, 68, ease.out);  // кидок 12 кадрів
  if (f < 80) return 76 - 6 * r(68, 80);                        // відскок до 70
  if (f < 102) return 70;                                       // пауза
  return 70 + 30 * r(102, 150);                                 // повільно — до кінця (48 кадрів)
};

const PairScene: React.FC<{ p: Pair; idx: number }> = ({ p, idx }) => {
  const f = useCurrentFrame();
  const pos = Math.max(0, posAt(f));
  const x = (pos / 100) * W;
  const v = Math.abs(posAt(f) - posAt(f - 1)) * W / 100;
  const squish = 1 + Math.min(v / 110, 1) * 0.18;
  const inT = interpolate(f, [0, 14], [0, 1], { ...clamp, easing: ease.out });
  const out = interpolate(f, [PAIR_DUR - 8, PAIR_DUR], [1, 0], clamp);
  const Head: React.FC<{ text: string; dark?: boolean }> = ({ text, dark }) => (
    <div style={{ position: 'absolute', left: 70, top: 80 }}>
      <div style={{ fontFamily: T.sans, fontWeight: 700, fontSize: 28, letterSpacing: '0.2em', color: dark ? INK.red : T.brandHi }}>{String(idx + 1).padStart(2, '0')} · {p.tag}</div>
      <div style={{ fontFamily: T.display, fontWeight: 800, fontSize: 76, letterSpacing: '-0.03em', color: dark ? INK.dark : T.ink, marginTop: 12, lineHeight: 1.02 }}>{dark ? 'Раніше:' : 'Тепер:'}<br />{dark ? p.before : p.after}</div>
    </div>
  );
  return (
    <AbsoluteFill style={{ opacity: out }}>
      {/* РАНІШЕ — папір */}
      <AbsoluteFill>
        <Paper seed={idx + 2} />
        <div style={{ position: 'absolute', inset: 0, transform: `translateY(${(1 - inT) * 40}px)`, opacity: inT }}>{p.art}</div>
        <Head text={p.before} dark />
      </AbsoluteFill>
      {/* ТЕПЕР — застосунок, відкривається зліва за повзунком */}
      <AbsoluteFill style={{ clipPath: `inset(0 ${W - x}px 0 0)` }}>
        <AbsoluteFill style={{ background: 'radial-gradient(900px 900px at 50% 45%, #ffffff, #E6E8EC 80%)' }} />
        <Phone cam={{ z: 0.66, cx: 195, cy: 422, fy: 840, rotY: 0, rotX: 0 }}>
          <Shot src={p.shot} />
        </Phone>
        <Head text={p.after} />
      </AbsoluteFill>
      {/* межа + ручка */}
      {pos > 0.2 && pos < 99.8 ? (
        <>
          <div style={{ position: 'absolute', left: x - 2, top: 0, width: 4, height: H, background: '#fff', boxShadow: '0 0 0 1px rgba(40,20,25,0.12), 0 0 26px rgba(40,20,25,0.28)', filter: v > 8 ? `blur(${Math.min(v * 0.04, 3)}px)` : undefined }} />
          <div style={{ position: 'absolute', left: x - 44, top: H / 2 - 44, width: 88, height: 88, borderRadius: 44, background: T.brandGrad, border: '4px solid #fff', boxShadow: '0 10px 30px rgba(40,10,16,0.35)', transform: `scaleX(${squish})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 34, fontWeight: 800, fontFamily: T.sans }}>‹ ›</div>
        </>
      ) : null}
    </AbsoluteFill>
  );
};

// ── Відкриття: заголовок друкується двома формами, що «клацають» у збіг ──
const Intro: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const HIT = 12, REG = 52;
  const inT = interpolate(f, [4, HIT], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  const t = f - HIT;
  const env = f < HIT ? 0 : f >= REG ? 0 : Math.cos((2 * Math.PI * t) / 18) * Math.exp(-t / 40);
  const off: [number, number] = [22 * env, 9 * env];
  const pulse = interpolate(f, [REG, REG + 4], [1.03, 1], clamp);
  const sub = interpolate(f, [REG + 6, REG + 18], [0, 1], { ...clamp, easing: ease.out });
  const out = interpolate(f, [dur - 8, dur], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <Paper seed={1} />
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', flexDirection: 'column' }}>
        <div style={{ transform: `translateY(${(1 - inT) * -900}px) scale(${f >= REG ? pulse : 1})` }}>
          <Riso off={off}>
            {(ink) => (
              <div style={{ fontFamily: T.display, fontWeight: 900, fontSize: 168, lineHeight: 0.92, letterSpacing: '-0.045em', color: ink, textAlign: 'center' }}>
                З ПАПЕРУ —<br />В СМАРТ<span style={{ letterSpacing: '-0.055em' }}>Ф</span>ОН.
              </div>
            )}
          </Riso>
        </div>
        <div style={{ marginTop: 50, fontFamily: T.sans, fontWeight: 600, fontSize: 38, color: INK.dark, opacity: sub, transform: `translateY(${(1 - sub) * 14}px)` }}>Як громада жила раніше — і як тепер</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Outro: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const a = interpolate(f, [0, 12], [0, 1], { ...clamp, easing: Easing.bezier(0.2, 1.25, 0.3, 1) });
  const b = interpolate(f, [16, 30], [0, 1], { ...clamp, easing: ease.out });
  const end = interpolate(f, [dur - 10, dur], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ background: T.brandGrad, justifyContent: 'center', alignItems: 'center', flexDirection: 'column' }}>
      <Img src={staticFile('textures/castle-icon.png')} style={{ width: 150, height: 187, opacity: a, transform: `scale(${1.3 - 0.3 * a})`, filter: 'drop-shadow(0 14px 26px rgba(0,0,0,0.45))' }} />
      <div style={{ fontFamily: T.serif, fontWeight: 700, fontSize: 128, color: '#fff', letterSpacing: '0.1em', marginRight: '-0.1em', marginTop: 26, opacity: a, transform: `scale(${1.12 - 0.12 * a})` }}>ГРОМАДА</div>
      <div style={{ fontFamily: T.display, fontWeight: 700, fontSize: 54, color: '#fff', marginTop: 34, textAlign: 'center', lineHeight: 1.15, opacity: b, transform: `translateY(${(1 - b) * 16}px)` }}>Без папірців.<br />Усе — у твоєму смартфоні.</div>
      <div style={{ fontFamily: T.sans, fontWeight: 600, fontSize: 44, color: 'rgba(255,255,255,0.92)', marginTop: 46, opacity: b }}>castlelife.org</div>
      <AbsoluteFill style={{ background: '#000', opacity: end }} />
    </AbsoluteFill>
  );
};

const INTRO = 100, OUTRO = 120;
export const TOTAL = INTRO + PAIRS.length * PAIR_DUR + OUTRO;

export const PaperFilm: React.FC = () => {
  const sfx: { f: number; src: string; v: number; d?: number }[] = [
    { f: 12, src: 'hit-weak', v: 0.5 }, { f: 52, src: 'paper-slide', v: 0.35 },
    ...PAIRS.flatMap((_, i) => {
      const s = INTRO + i * PAIR_DUR;
      return [
        { f: s, src: i === 2 ? 'paper-crumple-quick' : 'paper-page-turn', v: 0.35 },
        { f: s + 56, src: 'whoosh-fast', v: 0.4 },
        { f: s + 70, src: 'switch-tap', v: 0.3 },
      ];
    }),
    { f: INTRO + PAIRS.length * PAIR_DUR, src: 'impact-cine-big', v: 0.32, d: 70 },
    { f: INTRO + PAIRS.length * PAIR_DUR + 16, src: 'sparkle', v: 0.3, d: 70 },
  ];
  return (
    <AbsoluteFill style={{ background: INK.paper }}>
      <Sequence durationInFrames={INTRO}><Intro dur={INTRO} /></Sequence>
      {PAIRS.map((p, i) => (
        <Sequence key={p.tag} from={INTRO + i * PAIR_DUR} durationInFrames={PAIR_DUR}><PairScene p={p} idx={i} /></Sequence>
      ))}
      <Sequence from={INTRO + PAIRS.length * PAIR_DUR} durationInFrames={OUTRO}><Outro dur={OUTRO} /></Sequence>
      {sfx.map((s, i) => <Sequence key={i} from={s.f} durationInFrames={s.d ?? 40}><Audio src={staticFile(`audio/${s.src}.mp3`)} volume={s.v} /></Sequence>)}
    </AbsoluteFill>
  );
};
