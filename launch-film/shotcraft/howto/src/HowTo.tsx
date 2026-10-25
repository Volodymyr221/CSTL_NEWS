import React from 'react';
import { AbsoluteFill, Audio, Easing, Img, interpolate, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { AppBackdrop, Cam, Phone, Shot, T, clamp, kf, tex } from './kit';
import TAPS from '../public/textures/taps.json';
import VO from '../public/audio/vo/durations.json';

type Box = { x: number; y: number; w: number; h: number };
const TP = TAPS as unknown as Record<string, Box> & { scrolls: number[]; geo: { headBottom: number } };
const HB = TP.geo.headBottom;
const ease = Easing.bezier(0.32, 0.72, 0, 1); // крива iOS — як рухається сам застосунок

// ── Палець: зʼявляється, натискає, лишає хвилю ─────────────────────────────
const Tap: React.FC<{ box: Box; at: number; f: number; dx?: number; dy?: number }> = ({ box, at, f, dx = 0, dy = 0 }) => {
  const rel = f - at;
  if (rel < -16 || rel > 16) return null;
  const x = box.x + box.w / 2 + dx, y = box.y + box.h / 2 + dy;
  const appear = interpolate(rel, [-16, -8], [0, 1], { ...clamp, easing: Easing.bezier(0.25, 0.46, 0.45, 0.94) });
  const press = interpolate(rel, [-3, 0, 4], [1, 0.82, 1], clamp);
  const gone = interpolate(rel, [8, 16], [1, 0], clamp);
  const ring = interpolate(rel, [0, 14], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <>
      <div style={{ position: 'absolute', left: x - 22, top: y - 22, width: 44, height: 44, borderRadius: 22,
        border: `2px solid rgba(138,34,51,${0.7 * (1 - ring)})`, transform: `scale(${1 + 1.6 * ring})`, opacity: rel >= 0 ? 1 : 0 }} />
      <div style={{ position: 'absolute', left: x - 20, top: y - 20, width: 40, height: 40, borderRadius: 20,
        background: 'rgba(255,255,255,0.55)', border: '2.5px solid rgba(74,18,28,0.85)', boxShadow: '0 4px 14px rgba(40,10,16,0.35)',
        opacity: appear * gone, transform: `scale(${(1.4 - 0.4 * appear) * press})` }} />
    </>
  );
};

// Шар екрана, що в’їжджає: справа (нова сторінка) або знизу (аркуш).
const Enter: React.FC<{ f: number; at: number; from: 'right' | 'bottom' | 'fade'; children: React.ReactNode; clipTop?: number }> = ({ f, at, from, children, clipTop }) => {
  if (f < at) return null;
  const t = interpolate(f, [at, at + 12], [0, 1], { ...clamp, easing: ease });
  const tr = from === 'right' ? `translateX(${(1 - t) * 390}px)` : from === 'bottom' ? `translateY(${(1 - t) * 760}px)` : 'none';
  return <div style={{ position: 'absolute', inset: 0, transform: tr, opacity: from === 'fade' ? t : 1, clipPath: clipTop ? `inset(${clipTop}px 0 0 0)` : undefined }}>{children}</div>;
};

// ── Мітка кроку вгорі ────────────────────────────────────────────────────
const StepLabel: React.FC<{ n: number; text: string; hint?: string; dur: number }> = ({ n, text, hint, dur }) => {
  const f = useCurrentFrame();
  const i = interpolate(f, [0, 10], [0, 1], { ...clamp, easing: Easing.bezier(0.25, 0.46, 0.45, 0.94) });
  const o = interpolate(f, [dur - 6, dur], [1, 0], clamp);
  const h = interpolate(f, [8, 18], [0, 1], clamp);
  return (
    <div style={{ position: 'absolute', left: 60, right: 60, top: 96, opacity: i * o, transform: `translateY(${(1 - i) * 16}px)` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <div style={{ flex: 'none', width: 84, height: 84, borderRadius: 42, background: T.brandGrad, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.display, fontWeight: 800, fontSize: 46, boxShadow: '0 10px 26px rgba(74,18,28,0.35)' }}>{n}</div>
        <div style={{ fontFamily: T.display, fontWeight: 700, fontSize: 54, lineHeight: 1.1, color: T.ink, letterSpacing: '-0.02em' }}>{text}</div>
      </div>
      {hint ? <div style={{ marginTop: 16, marginLeft: 108, fontFamily: T.sans, fontWeight: 500, fontSize: 34, color: T.inkSoft, opacity: h }}>{hint}</div> : null}
    </div>
  );
};

// Камера телефона: спокійний загальний план і наїзд на місце дії.
const WIDE = { z: 0.8, cx: 195, cy: 422, fy: 1120 };
const near = (box: Box, z = 1.3, fy = 1150): Cam => ({ z, cx: 195, cy: Math.min(Math.max(box.y + box.h / 2, 300), 560), fy });
const camAt = (f: number, keys: [number, Cam][]): Cam => {
  const pick = (k: keyof Cam) => kf(f, keys.map(([fr, c]) => [fr, (c[k] as number) ?? 0] as [number, number]), Easing.bezier(0.45, 0, 0.2, 1));
  return { z: pick('z'), cx: pick('cx'), cy: pick('cy'), fy: pick('fy') };
};

// ═══ Кроки ═══════════════════════════════════════════════════════════════
type Step = { n: number; label: string; hint?: string; dur: number; sfx?: { at: number; src: string; v: number; d?: number }[]; render: (f: number) => React.ReactNode };

const typed = (prefix: string, count: number, f: number, start: number, perChar: number) => {
  const k = Math.max(0, Math.min(count, Math.floor((f - start) / perChar) + 1));
  return k;
};

const TITLE_LEN = 28;
const PART1: Step[] = [
  { n: 1, label: 'Відкрий «Дошку»', hint: 'кнопка внизу екрана', dur: 78,
    sfx: [{ at: 34, src: 'switch-click-quick', v: 0.5 }],
    render: (f) => (
      <Phone cam={camAt(f, [[0, WIDE], [70, { ...WIDE, z: 0.82 }]])}>
        <Shot src="A0.png" />
        <Enter f={f} at={38} from="fade"><Shot src="A1.png" /></Enter>
        <Tap box={TP.tabBoard} at={34} f={f} />
      </Phone>) },
  { n: 2, label: 'Натисни «Подати оголошення»', hint: 'кругла кнопка справа внизу', dur: 104,
    sfx: [{ at: 26, src: 'switch-click-quick', v: 0.5 }, { at: 96, src: 'switch-click-quick', v: 0.5 }, { at: 100, src: 'swoosh-quick', v: 0.3 }],
    render: (f) => (
      <Phone cam={camAt(f, [[0, { ...WIDE, z: 0.82 }], [24, { z: 1.15, cx: 195, cy: 560, fy: 1150 }], [106, { z: 1.15, cx: 195, cy: 560, fy: 1150 }], [126, { z: 0.82, cx: 195, cy: 422, fy: 1120 }]])}>
        <Shot src="A1.png" />
        <Enter f={f} at={30} from="fade"><Shot src="A2.png" /></Enter>
        <Enter f={f} at={100} from="fade"><Shot src="A3.png" /></Enter>
        <Enter f={f} at={100} from="bottom" clipTop={84}><Shot src="A3.png" /></Enter>
        <Tap box={{ x: 316, y: 718, w: 56, h: 56 }} at={26} f={f} />
        <Tap box={TP.fabPost} at={96} f={f} />
      </Phone>) },
  { n: 3, label: 'Обери категорію', hint: 'Продам, Куплю, Віддам, Послуги…', dur: 74,
    sfx: [{ at: 64, src: 'switch-click-quick', v: 0.5 }],
    render: (f) => (
      <Phone cam={camAt(f, [[0, { ...WIDE, z: 0.82 }], [22, near(TP.chip, 1.35)], [74, near(TP.chip, 1.35)]])}>
        <Shot src="A3.png" />
        <Enter f={f} at={67} from="fade"><Shot src="A4.png" /></Enter>
        <Tap box={TP.chip} at={64} f={f} />
      </Phone>) },
  { n: 4, label: 'Напиши заголовок', hint: 'коротко: що саме пропонуєш', dur: 96,
    sfx: [{ at: 10, src: 'switch-click-quick', v: 0.4 }, { at: 16, src: 'keyboard', v: 0.16, d: TITLE_LEN * 2 }],
    render: (f) => {
      const k = typed('T', TITLE_LEN, f, 16, 2);
      return (
        <Phone cam={camAt(f, [[0, near(TP.chip, 1.35)], [14, near(TP.title, 1.45)], [96, near(TP.title, 1.45)]])}>
          <Shot src="A4.png" />
          {f >= 16 ? <Shot src={`T${k}.png`} /> : null}
          <Tap box={TP.title} at={10} f={f} />
        </Phone>);
    } },
  { n: 5, label: 'Вкажи ціну', hint: 'або постав «Договірна» чи «Безкоштовно»', dur: 70,
    sfx: [{ at: 12, src: 'switch-click-quick', v: 0.4 }, { at: 18, src: 'keyboard', v: 0.16, d: 16 }],
    render: (f) => {
      const k = typed('P', 4, f, 18, 4);
      return (
        <Phone cam={camAt(f, [[0, near(TP.title, 1.45)], [12, near(TP.price, 1.45)], [70, near(TP.price, 1.45)]])}>
          <Shot src="T28.png" />
          {f >= 18 ? <Shot src={`P${k}.png`} /> : null}
          <Tap box={TP.price} at={12} f={f} />
        </Phone>);
    } },
  { n: 6, label: 'Опиши подробиці', hint: 'стан, розмір, коли можна забрати', dur: 74,
    sfx: [{ at: 12, src: 'switch-click-quick', v: 0.4 }, { at: 18, src: 'keyboard', v: 0.16, d: 36 }],
    render: (f) => {
      const k = typed('D', 3, f, 18, 12);
      return (
        <Phone cam={camAt(f, [[0, near(TP.price, 1.45)], [14, near({ ...TP.text, y: 560 }, 1.3)], [74, near({ ...TP.text, y: 560 }, 1.3)]])}>
          <Shot src="P4.png" />
          {f >= 18 ? <Shot src={`D${k}.png`} /> : null}
          <Tap box={TP.text} at={12} f={f} />
        </Phone>);
    } },
  { n: 7, label: 'Фото й телефон — за бажанням', hint: 'а внизу видно, як виглядатиме оголошення', dur: 120,
    sfx: [{ at: 10, src: 'paper-slide', v: 0.25 }, { at: 66, src: 'paper-slide', v: 0.22 }],
    render: (f) => {
      const sc = kf(f, [[8, 0], [34, 330], [62, 330], [92, 694]], ease);
      return (
        <Phone cam={camAt(f, [[0, near({ ...TP.text, y: 560 }, 1.3)], [16, { ...WIDE, z: 0.84 }], [120, { ...WIDE, z: 0.86 }]])}>
          <Shot src="S0.png" />
          <div style={{ position: 'absolute', left: 0, top: HB, width: 390, height: 844 - HB, overflow: 'hidden' }}>
            <Img src={tex('form-strip.png')} style={{ position: 'absolute', left: 0, top: -sc, width: 390, height: 1360 }} />
          </div>
          <Img src={tex(sc > 2 ? 'form-head-scrolled.png' : 'form-head.png')} style={{ position: 'absolute', left: 0, top: 0, width: 390, height: HB }} />
        </Phone>);
    } },
  { n: 8, label: 'Натисни «Опублікувати»', hint: 'модератор перевірить — і оголошення з’явиться на Дошці', dur: 104,
    sfx: [{ at: 24, src: 'switch-click-quick', v: 0.5 }, { at: 34, src: 'pop', v: 0.4 }],
    render: (f) => (
      <Phone cam={camAt(f, [[0, { ...WIDE, z: 0.86 }], [18, { z: 1.2, cx: 195, cy: 560, fy: 1150 }], [40, { z: 1.2, cx: 195, cy: 560, fy: 1150 }], [62, { z: 1.25, cx: 195, cy: 300, fy: 1150 }], [104, { z: 1.25, cx: 195, cy: 300, fy: 1150 }]])}>
        <Shot src="S694.png" />
        <Enter f={f} at={30} from="fade"><Shot src="A9.png" /></Enter>
        <Tap box={TP.submit} at={24} f={f} />
      </Phone>) },
];

const PART2: Step[] = [
  { n: 1, label: 'Відкрий оголошення', hint: 'натисни на картку', dur: 74,
    sfx: [{ at: 62, src: 'switch-click-quick', v: 0.5 }, { at: 66, src: 'swoosh-quick', v: 0.25 }],
    render: (f) => (
      <Phone cam={camAt(f, [[0, { ...WIDE, z: 0.84 }], [74, { ...WIDE, z: 0.86 }]])}>
        <Shot src="B0.png" />
        <Enter f={f} at={66} from="right"><Shot src="B1.png" /></Enter>
        <Tap box={TP.card} at={62} f={f} />
      </Phone>) },
  { n: 2, label: 'Натисни «Написати»', hint: 'відкриється розмова з автором', dur: 74,
    sfx: [{ at: 30, src: 'switch-click-quick', v: 0.5 }, { at: 34, src: 'swoosh-quick', v: 0.25 }],
    render: (f) => (
      <Phone cam={camAt(f, [[0, { ...WIDE, z: 0.86 }], [20, { z: 1.15, cx: 195, cy: 560, fy: 1150 }], [44, { z: 1.15, cx: 195, cy: 560, fy: 1150 }], [70, { ...WIDE, z: 0.86 }]])}>
        <Shot src="B1.png" />
        <Enter f={f} at={34} from="right"><Shot src="B2.png" /></Enter>
        <Tap box={TP.write} at={30} f={f} />
      </Phone>) },
  { n: 3, label: 'Спитай одним дотиком', hint: 'готові питання — або напиши своє', dur: 90,
    sfx: [{ at: 34, src: 'switch-click-quick', v: 0.5 }, { at: 38, src: 'pop', v: 0.35 }],
    render: (f) => (
      <Phone cam={camAt(f, [[0, { ...WIDE, z: 0.86 }], [20, { z: 1.3, cx: 195, cy: 500, fy: 1150 }], [52, { z: 1.3, cx: 195, cy: 500, fy: 1150 }], [80, { z: 1.2, cx: 195, cy: 300, fy: 1150 }]])}>
        <Shot src="B2.png" />
        <Enter f={f} at={38} from="fade"><Shot src="B3.png" /></Enter>
        <Tap box={TP.qchip} at={34} f={f} />
      </Phone>) },
  { n: 4, label: 'Відповідь прийде сюди ж', hint: 'усі розмови — у «Повідомленнях»', dur: 80,
    sfx: [{ at: 18, src: 'pop', v: 0.4 }],
    render: (f) => (
      <Phone cam={camAt(f, [[0, { z: 1.2, cx: 195, cy: 300, fy: 1150 }], [80, { z: 1.24, cx: 195, cy: 300, fy: 1150 }]])}>
        <Shot src="B3.png" />
        <Enter f={f} at={16} from="fade"><Shot src="B4.png" /></Enter>
      </Phone>) },
  { n: 5, label: 'І на головній теж', hint: 'капсула покаже, хто відповів', dur: 84,
    render: (f) => {
      const glow = interpolate(f, [20, 32, 70], [0, 1, 0.6], clamp);
      return (
        <Phone cam={camAt(f, [[0, { ...WIDE, z: 0.86 }], [24, { z: 1.3, cx: 195, cy: 330, fy: 1150 }], [84, { z: 1.32, cx: 195, cy: 330, fy: 1150 }]])}>
          <Shot src="H1.png" />
          <div style={{ position: 'absolute', left: 34, top: 261, width: 322, height: 58, borderRadius: 29, boxShadow: `0 0 0 ${3 * glow}px rgba(255,255,255,0.95), 0 0 24px ${8 * glow}px rgba(255,200,210,${0.45 * glow})` }} />
        </Phone>);
    } },
];

// ── Титри розділів і обгортки ───────────────────────────────────────────
const Chapter: React.FC<{ part: string; title: string; dur: number }> = ({ part, title, dur }) => {
  const f = useCurrentFrame();
  const a = interpolate(f, [0, 12], [0, 1], { ...clamp, easing: Easing.bezier(0.22, 1, 0.36, 1) });
  const b = interpolate(f, [6, 18], [0, 1], { ...clamp, easing: Easing.bezier(0.22, 1, 0.36, 1) });
  const o = interpolate(f, [dur - 8, dur], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ background: T.brandGrad, justifyContent: 'center', alignItems: 'center', opacity: o }}>
      <div style={{ fontFamily: T.sans, fontWeight: 600, fontSize: 34, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', opacity: a, transform: `translateY(${(1 - a) * 14}px)` }}>{part}</div>
      <div style={{ fontFamily: T.display, fontWeight: 800, fontSize: 104, lineHeight: 1.06, color: '#fff', textAlign: 'center', maxWidth: 900, marginTop: 26, letterSpacing: '-0.025em', opacity: b, transform: `translateY(${(1 - b) * 0.38 * 104}px)`, filter: `blur(${(1 - b) * 14}px)` }}>{title}</div>
    </AbsoluteFill>
  );
};

const Intro: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const a = interpolate(f, [4, 18], [0, 1], { ...clamp, easing: Easing.bezier(0.22, 1, 0.36, 1) });
  const rows = [0, 1].map((i) => interpolate(f, [26 + i * 8, 38 + i * 8], [0, 1], { ...clamp, easing: Easing.bezier(0.22, 1, 0.36, 1) }));
  const o = interpolate(f, [dur - 8, dur], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ background: 'radial-gradient(900px 800px at 50% 45%, #ffffff, #F1F2F4 70%)', justifyContent: 'center', alignItems: 'center', opacity: o }}>
      <Img src={tex('castle-icon.png')} style={{ width: 120, height: 150, opacity: a, marginBottom: 40 }} />
      <div style={{ fontFamily: T.display, fontWeight: 800, fontSize: 112, color: T.ink, letterSpacing: '-0.03em', opacity: a, transform: `translateY(${(1 - a) * 40}px)`, filter: `blur(${(1 - a) * 14}px)` }}>Дошка оголошень</div>
      <div style={{ fontFamily: T.sans, fontWeight: 600, fontSize: 40, color: T.inkSoft, marginTop: 18, opacity: a }}>коротка інструкція</div>
      <div style={{ marginTop: 70, display: 'flex', flexDirection: 'column', gap: 22 }}>
        {['Як подати оголошення', 'Як написати продавцю'].map((t, i) => (
          <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 24, opacity: rows[i], transform: `translateX(${(1 - rows[i]) * -30}px)` }}>
            <div style={{ width: 70, height: 70, borderRadius: 35, background: T.brandGrad, color: '#fff', fontFamily: T.display, fontWeight: 800, fontSize: 38, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</div>
            <div style={{ fontFamily: T.display, fontWeight: 700, fontSize: 52, color: T.ink }}>{t}</div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

const Outro: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const a = interpolate(f, [0, 12], [0, 1], { ...clamp, easing: Easing.bezier(0.2, 1.25, 0.3, 1) });
  const b = interpolate(f, [14, 26], [0, 1], { ...clamp, easing: Easing.bezier(0.22, 1, 0.36, 1) });
  return (
    <AbsoluteFill style={{ background: T.brandGrad, justifyContent: 'center', alignItems: 'center', flexDirection: 'column' }}>
      <div style={{ fontFamily: T.display, fontWeight: 800, fontSize: 96, color: '#fff', letterSpacing: '-0.025em', textAlign: 'center', lineHeight: 1.08, opacity: a, transform: `scale(${1.15 - 0.15 * a})` }}>Продай, купи,<br />віддай — поруч.</div>
      <Img src={tex('castle-icon.png')} style={{ width: 120, height: 150, marginTop: 70, opacity: b }} />
      <div style={{ fontFamily: T.serif, fontWeight: 700, fontSize: 92, color: '#fff', letterSpacing: '0.1em', marginTop: 24, opacity: b }}>ГРОМАДА</div>
      <div style={{ fontFamily: T.sans, fontWeight: 600, fontSize: 46, color: 'rgba(255,255,255,0.9)', marginTop: 22, opacity: b }}>castlelife.org</div>
      <AbsoluteFill style={{ background: '#000', opacity: interpolate(f, [dur - 10, dur], [0, 1], clamp) }} />
    </AbsoluteFill>
  );
};

// ── Таймлайн (одне джерело часу) ────────────────────────────────────────
type Block = { kind: 'intro' | 'chapter' | 'step' | 'outro'; dur: number; step?: Step; part?: string; title?: string; vo?: number };
const BLOCKS: Block[] = [
  { kind: 'intro', dur: 100 },
  { kind: 'chapter', dur: 50, part: 'Частина 1', title: 'Як подати оголошення' },
  ...PART1.map((s) => ({ kind: 'step' as const, dur: s.dur, step: s })),
  { kind: 'chapter', dur: 50, part: 'Частина 2', title: 'Як написати продавцю' },
  ...PART2.map((s) => ({ kind: 'step' as const, dur: s.dur, step: s })),
  { kind: 'outro', dur: 96 },
];
// Озвучка: фраза №i стартує через VO_START кадрів після початку блоку;
// блок триває не менше, ніж звучить фраза, плюс коротка пауза.
const VO_START = 6, VO_TAIL = 14;
BLOCKS.forEach((b, i) => { b.vo = i; b.dur = Math.max(b.dur, VO_START + Math.ceil((VO as number[])[i] * 30) + VO_TAIL); });
let acc = 0;
const PLACED = BLOCKS.map((b) => { const from = acc; acc += b.dur; return { ...b, from }; });
export const TOTAL = acc;

const StepScene: React.FC<{ s: Step; dur: number }> = ({ s, dur }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill>
      <AppBackdrop />
      {s.render(f)}
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(236,238,241,0.97) 0%, rgba(236,238,241,0.9) 16%, rgba(236,238,241,0) 26%)' }} />
      <StepLabel n={s.n} text={s.label} hint={s.hint} dur={dur} />
    </AbsoluteFill>
  );
};

export const HowTo: React.FC = () => (
  <AbsoluteFill style={{ background: '#000' }}>
    {PLACED.map((b, i) => (
      <Sequence key={i} from={b.from} durationInFrames={b.dur}>
        {b.kind === 'intro' ? <Intro dur={b.dur} /> : b.kind === 'chapter' ? <Chapter part={b.part!} title={b.title!} dur={b.dur} /> : b.kind === 'outro' ? <Outro dur={b.dur} /> : <StepScene s={b.step!} dur={b.dur} />}
      </Sequence>
    ))}
    {PLACED.map((b, i) => b.kind === 'chapter' ? (
      <Sequence key={'c' + i} from={b.from} durationInFrames={40}><Audio src={staticFile('audio/transition-soft.mp3')} volume={0.4} /></Sequence>
    ) : null)}
    {PLACED.map((b, i) => (
      <Sequence key={'vo' + i} from={b.from + VO_START} durationInFrames={b.dur - VO_START}><Audio src={staticFile(`audio/vo/${String(b.vo).padStart(2, '0')}.wav`)} volume={0.8} /></Sequence>
    ))}
    <Sequence from={PLACED[PLACED.length - 1].from} durationInFrames={90}><Audio src={staticFile('audio/sparkle.mp3')} volume={0.3} /></Sequence>
    {PLACED.flatMap((b, i) => (b.step?.sfx || []).map((s, j) => (
      <Sequence key={`s${i}-${j}`} from={b.from + s.at} durationInFrames={s.d ?? 30}><Audio src={staticFile(`audio/${s.src}.mp3`)} volume={s.v} /></Sequence>
    )))}
  </AbsoluteFill>
);
