import React from 'react';
import { AbsoluteFill, Audio, Easing, Img, interpolate, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { AppBackdrop, Cam, Phone, Shot, T, clamp, kf, liftShadow, tex } from './kit';
import TAPS from '../public/textures/taps.json';

// «СТРІЧКА — СПІЛЬНОТИ ГРОМАДИ». Один код — два формати:
//   story 1080×1920 (Stories / Reels) · post 1080×1350 (допис Instagram і Facebook, 4:5).
// Прийоми video-shotcraft: orbit-ring-title-open (спільноти кружляють довкола назви),
// 2.5D-камера над справжніми знімками, палець показує натиск.
type Box = { x: number; y: number; w: number; h: number };
const TP = TAPS as Record<string, Box>;
export const FMT = { story: { W: 1080, H: 1920 }, post: { W: 1080, H: 1350 } };
type Fmt = keyof typeof FMT;
const FmtCtx = React.createContext<Fmt>('story');
const useFmt = () => { const f = React.useContext(FmtCtx); return { f, ...FMT[f], post: f === 'post' }; };

// Кольори кружечків — заміряні з кадру застосунку (F0.png), не вигадані.
const PAGES = [
  { l: 'ОГ', n: 'Олицька громада', c: '#6B4AA0' },
  { l: 'OC', n: 'Olyka Castle', c: '#3F6F80' },
  { l: 'ОЛ', n: 'Олицький ліцей', c: '#B5473A' },
  { l: 'ІГ', n: 'Історія Громади', c: '#7A3E62' },
  { l: 'СО', n: 'Спортивна Олика', c: '#5F7A2F' },
];
const ease = { out: Easing.bezier(0.22, 1, 0.36, 1), apple: Easing.bezier(0.32, 0.72, 0, 1), cam: Easing.bezier(0.45, 0, 0.2, 1) };

// ── палець ─────────────────────────────────────────────────────────────
const Tap: React.FC<{ box: Box; at: number; f: number }> = ({ box, at, f }) => {
  const rel = f - at;
  if (rel < -16 || rel > 16) return null;
  const x = box.x + box.w / 2, y = box.y + box.h / 2;
  const appear = interpolate(rel, [-16, -8], [0, 1], clamp);
  const press = interpolate(rel, [-3, 0, 4], [1, 0.82, 1], clamp);
  const gone = interpolate(rel, [8, 16], [1, 0], clamp);
  const ring = interpolate(rel, [0, 14], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <>
      <div style={{ position: 'absolute', left: x - 22, top: y - 22, width: 44, height: 44, borderRadius: 22, border: `2px solid rgba(138,34,51,${0.7 * (1 - ring)})`, transform: `scale(${1 + 1.6 * ring})`, opacity: rel >= 0 ? 1 : 0 }} />
      <div style={{ position: 'absolute', left: x - 20, top: y - 20, width: 40, height: 40, borderRadius: 20, background: 'rgba(255,255,255,0.55)', border: '2.5px solid rgba(74,18,28,0.85)', boxShadow: '0 4px 14px rgba(40,10,16,0.35)', opacity: appear * gone, transform: `scale(${(1.4 - 0.4 * appear) * press})` }} />
    </>
  );
};

// ── мітка-заголовок сцени ───────────────────────────────────────────────
const Label: React.FC<{ kicker: string; text: string; dur: number }> = ({ kicker, text, dur }) => {
  const f = useCurrentFrame(); const { post, H } = useFmt();
  const scrim = (post ? 330 : 470) / H * 100;
  const i = interpolate(f, [2, 14], [0, 1], { ...clamp, easing: ease.out });
  const o = interpolate(f, [dur - 7, dur], [1, 0], clamp);
  return (
    <>
    <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: `${scrim + 6}%`, background: `linear-gradient(180deg, rgba(236,238,241,0.98) 0%, rgba(236,238,241,0.94) ${scrim * 0.72 / (scrim + 6) * 100}%, rgba(236,238,241,0) 100%)` }} />
    <div style={{ position: 'absolute', left: 70, right: 70, top: post ? 70 : 150, opacity: i * o, transform: `translateY(${(1 - i) * 22}px)` }}>
      <div style={{ fontFamily: T.sans, fontWeight: 700, fontSize: post ? 26 : 30, letterSpacing: '0.2em', color: T.brandHi }}>{kicker}</div>
      <div style={{ fontFamily: T.display, fontWeight: 800, fontSize: post ? 64 : 78, lineHeight: 1.04, letterSpacing: '-0.03em', color: T.ink, marginTop: 12, filter: `blur(${(1 - i) * 10}px)` }}>{text}</div>
    </div>
    </>
  );
};

/** Камера телефона під формат: у дописі телефон менший і нижче заголовка. */
const useCam = () => {
  const { post } = useFmt();
  const base = post ? { z: 0.56, fy: 820 } : { z: 0.8, fy: 1180 };
  return (z: number, cy = 422, extra: Partial<Cam> = {}): Cam => ({ cx: 195, cy, fy: base.fy, ...extra, z: z * base.z / 0.8 });
};
const camKeys = (f: number, keys: [number, Cam][]): Cam => {
  const k = (n: keyof Cam) => kf(f, keys.map(([fr, c]) => [fr, (c[n] as number) ?? 0] as [number, number]), ease.cam);
  return { z: k('z'), cx: k('cx'), cy: k('cy'), fy: k('fy'), rotX: k('rotX'), rotY: k('rotY'), dy: k('dy') };
};

// ═══ 1 · Спільноти кружляють довкола назви ═══════════════════════════════
const Orbit: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame(); const { W, H, post } = useFmt();
  const cy = H / 2 - (post ? 10 : 40);
  const rx = 410, ry = post ? 235 : 310;
  const spin = interpolate(f, [0, dur], [-0.25, 0.55]) * Math.PI * 2;
  const title = interpolate(f, [14, 30], [0, 1], { ...clamp, easing: ease.out });
  const sub = interpolate(f, [30, 44], [0, 1], { ...clamp, easing: ease.out });
  const out = interpolate(f, [dur - 10, dur], [1, 0], clamp);
  const items = PAGES.map((p, i) => {
    const a = spin + (i / PAGES.length) * Math.PI * 2;
    const depth = (Math.sin(a) + 1) / 2;         // 0 — далеко, 1 — близько
    const appear = interpolate(f, [2 + i * 3, 14 + i * 3], [0, 1], { ...clamp, easing: Easing.bezier(0.34, 1.56, 0.64, 1) });
    return { p, x: W / 2 + Math.cos(a) * rx, y: cy + Math.sin(a) * ry, depth, appear };
  });
  const circle = (it: typeof items[number]) => {
    const s = (0.62 + 0.5 * it.depth) * it.appear;
    return (
      <div key={it.p.l} style={{ position: 'absolute', left: it.x - 70, top: it.y - 70, width: 140, height: 140, borderRadius: 70, background: it.p.c, color: '#fff', fontFamily: T.display, fontWeight: 700, fontSize: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '5px solid rgba(255,255,255,0.9)', boxShadow: `0 ${12 + 20 * it.depth}px ${30 + 30 * it.depth}px rgba(0,0,0,${0.25 + 0.2 * it.depth})`, transform: `scale(${s})`, filter: `blur(${(1 - it.depth) * 2.5}px) brightness(${0.75 + 0.25 * it.depth})`, zIndex: Math.round(it.depth * 10) }}>{it.p.l}</div>
    );
  };
  return (
    <AbsoluteFill style={{ background: T.brandGrad, opacity: out }}>
      {items.filter((it) => it.depth < 0.5).map(circle)}
      <div style={{ position: 'absolute', left: 0, right: 0, top: cy - 110, textAlign: 'center', zIndex: 5 }}>
        <div style={{ fontFamily: T.display, fontWeight: 800, fontSize: post ? 150 : 170, color: '#fff', letterSpacing: '-0.035em', opacity: title, transform: `scale(${1.15 - 0.15 * title})`, filter: `blur(${(1 - title) * 14}px)`, textShadow: '0 10px 40px rgba(0,0,0,0.35)' }}>Стрічка</div>
        <div style={{ fontFamily: T.sans, fontWeight: 600, fontSize: post ? 40 : 46, color: 'rgba(255,255,255,0.9)', marginTop: 6, opacity: sub, transform: `translateY(${(1 - sub) * 14}px)` }}>спільноти громади</div>
      </div>
      <div style={{ position: 'absolute', inset: 0, zIndex: 10 }}>{items.filter((it) => it.depth >= 0.5).map(circle)}</div>
    </AbsoluteFill>
  );
};

// ═══ 2 · Стрічка гортається ══════════════════════════════════════════════
const Scroll: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame(); const cam = useCam();
  const rise = Easing.bezier(0.16, 1, 0.3, 1);
  const c = camKeys(f, [[0, { ...cam(0.8), rotX: 22, rotY: -12, dy: 1400 }], [30, { ...cam(0.8), rotX: 4, rotY: -4, dy: 0 }], [dur, { ...cam(0.84), rotX: 2, rotY: 3, dy: 0 }]]);
  const sc = kf(f, [[34, 0], [dur - 14, 330]], ease.cam);
  return (
    <AbsoluteFill>
      <AppBackdrop />
      <Phone cam={{ ...c, rotX: kf(f, [[0, 22], [30, 4], [dur, 2]], rise) }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: 390, height: 2400, transform: `translateY(${-sc}px)` }}><Shot src="F5-tall.png" h={2400} /></div>
        <Img src={tex('F0.png')} style={{ position: 'absolute', left: 0, top: 0, width: 390, height: 844, clipPath: 'inset(0 0 783px 0)' }} />
        <Img src={tex('F0.png')} style={{ position: 'absolute', left: 0, top: 0, width: 390, height: 844, clipPath: 'inset(774px 0 0 0)' }} />
      </Phone>
      <Label kicker="01 · СТРІЧКА" text="Дописи всіх спільнот — в одній стрічці" dur={dur} />
    </AbsoluteFill>
  );
};

// ═══ 3 · Спільнота — своя сторінка ════════════════════════════════════════
const Community: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame(); const cam = useCam();
  const TAP = 26;
  const c = camKeys(f, [[0, cam(0.84)], [18, cam(1.0, 330)], [TAP + 8, cam(1.0, 330)], [TAP + 24, cam(0.86)], [dur, cam(0.88)]]);
  const slide = interpolate(f, [TAP + 4, TAP + 16], [0, 1], { ...clamp, easing: ease.apple });
  const bell = interpolate(f, [70, 80, 110], [0, 1, 0.7], clamp);
  return (
    <AbsoluteFill>
      <AppBackdrop />
      <Phone cam={c}>
        <Shot src="F0.png" />
        {f >= TAP + 4 ? <div style={{ position: 'absolute', inset: 0, transform: `translateX(${(1 - slide) * 390}px)`, boxShadow: '-20px 0 40px rgba(0,0,0,0.18)' }}><Shot src="F4-page.png" /></div> : null}
        {/* дзвіночок спільноти: лише підсвітка, натиску не показуємо (див. звіт) */}
        <div style={{ position: 'absolute', left: 350 - 6, top: 8 - 6, width: 52, height: 52, borderRadius: 26, boxShadow: `0 0 0 ${3 * bell}px rgba(255,255,255,0.95), 0 0 24px ${8 * bell}px rgba(255,200,210,${0.5 * bell})`, opacity: bell > 0 ? 1 : 0 }} />
        <Tap box={TP.circle2} at={TAP} f={f} />
      </Phone>
      <Label kicker="02 · СПІЛЬНОТИ" text="Кожна спільнота — своя сторінка" dur={dur} />
    </AbsoluteFill>
  );
};

// ═══ 4 · Подія з датою ════════════════════════════════════════════════════
const EventScene: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame(); const cam = useCam();
  const ev = TP.event;
  const c = camKeys(f, [[0, cam(0.88)], [26, cam(1.12, ev.y + 110)], [dur, cam(1.15, ev.y + 110)]]);
  const back = interpolate(f, [0, 12], [0, 1], { ...clamp, easing: ease.apple });
  const lift = interpolate(f, [30, 42], [0, 1], { ...clamp, easing: Easing.bezier(0.2, 1.25, 0.3, 1) });
  const ring = interpolate(f, [50, 62, 90], [0, 1, 0.6], clamp);
  return (
    <AbsoluteFill>
      <AppBackdrop />
      <Phone cam={c}>
        <Shot src="F0.png" />
        <div style={{ position: 'absolute', inset: 0, transform: `translateX(${back * 390}px)` }}><Shot src="F4-page.png" /></div>
        <div style={{ position: 'absolute', inset: 0, background: `rgba(20,10,14,${0.22 * lift})`, clipPath: `polygon(0 0, 100% 0, 100% ${ev.y}px, 0 ${ev.y}px, 0 0, 0 ${ev.y + ev.h}px, 100% ${ev.y + ev.h}px, 100% 100%, 0 100%)` }} />
        <div style={{ position: 'absolute', left: ev.x + 1, top: ev.y, width: ev.w - 2, height: ev.h, borderRadius: 18, boxShadow: lift > 0.01 ? liftShadow(lift * 0.7) : undefined, transform: `scale(${1 + 0.02 * lift})` }} />
        <div style={{ position: 'absolute', left: TP.remind.x - 6, top: TP.remind.y - 6, width: TP.remind.w + 12, height: TP.remind.h + 12, borderRadius: 30, boxShadow: `0 0 0 ${3 * ring}px ${T.brandHi}, 0 0 20px ${6 * ring}px rgba(138,34,51,${0.35 * ring})` }} />
      </Phone>
      <Label kicker="03 · ПОДІЇ" text="Дата, час і місце — у дописі" dur={dur} />
    </AbsoluteFill>
  );
};

// ═══ 5 · Вподобай і обговорюй ═════════════════════════════════════════════
const Talk: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame(); const cam = useCam();
  const LIKE = 24, COM = 70;
  const c = camKeys(f, [[0, cam(1.15, TP.event.y + 110)], [16, cam(1.12, 330)], [COM - 4, cam(1.12, 330)], [COM + 20, cam(0.88)], [dur, cam(0.9)]]);
  const sheet = interpolate(f, [COM + 4, COM + 18], [0, 1], { ...clamp, easing: ease.apple });
  return (
    <AbsoluteFill>
      <AppBackdrop />
      <Phone cam={c}>
        <Shot src={f >= LIKE + 2 ? 'F1-like.png' : 'F0.png'} />
        {f >= COM + 4 ? (
          <>
            <div style={{ position: 'absolute', inset: 0, opacity: sheet }}><Img src={tex('F3-comments.png')} style={{ position: 'absolute', left: 0, top: 0, width: 390, height: 844, clipPath: 'inset(0 0 690px 0)' }} /></div>
            <Img src={tex('F3-comments.png')} style={{ position: 'absolute', left: 0, top: 0, width: 390, height: 844, clipPath: 'inset(150px 0 0 0)', transform: `translateY(${(1 - sheet) * 700}px)` }} />
          </>
        ) : null}
        <Tap box={TP.like1} at={LIKE} f={f} />
        <Tap box={TP.cbtn2} at={COM} f={f} />
      </Phone>
      <Label kicker="04 · РАЗОМ" text="Вподобай і обговорюй із сусідами" dur={dur} />
    </AbsoluteFill>
  );
};

// ═══ 6 · Фінал ════════════════════════════════════════════════════════════
const Outro: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame(); const { post } = useFmt();
  const a = interpolate(f, [8, 20], [0, 1], { ...clamp, easing: Easing.bezier(0.2, 1.25, 0.3, 1) });
  const b = interpolate(f, [22, 36], [0, 1], { ...clamp, easing: ease.out });
  const end = interpolate(f, [dur - 10, dur], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ background: T.brandGrad, justifyContent: 'center', alignItems: 'center', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 14, marginBottom: post ? 44 : 64 }}>
        {PAGES.map((p, i) => {
          const t = interpolate(f, [i * 2, i * 2 + 10], [0, 1], { ...clamp, easing: Easing.bezier(0.34, 1.56, 0.64, 1) });
          return <div key={p.l} style={{ width: 96, height: 96, borderRadius: 48, background: p.c, color: '#fff', fontFamily: T.display, fontWeight: 700, fontSize: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '4px solid rgba(255,255,255,0.9)', transform: `scale(${t})`, boxShadow: '0 10px 24px rgba(0,0,0,0.3)' }}>{p.l}</div>;
        })}
      </div>
      <Img src={tex('castle-icon.png')} style={{ width: 120, height: 150, opacity: a, transform: `scale(${1.3 - 0.3 * a})`, filter: 'drop-shadow(0 12px 22px rgba(0,0,0,0.45))' }} />
      <div style={{ fontFamily: T.serif, fontWeight: 700, fontSize: 120, color: '#fff', letterSpacing: '0.1em', marginRight: '-0.1em', marginTop: 20, opacity: a, transform: `scale(${1.12 - 0.12 * a})` }}>ГРОМАДА</div>
      <div style={{ fontFamily: T.display, fontWeight: 700, fontSize: 50, color: '#fff', marginTop: 28, textAlign: 'center', lineHeight: 1.15, opacity: b, transform: `translateY(${(1 - b) * 16}px)` }}>Стрічка — спільноти<br />твоєї громади</div>
      <div style={{ fontFamily: T.sans, fontWeight: 600, fontSize: 42, color: 'rgba(255,255,255,0.92)', marginTop: 40, opacity: b }}>castlelife.org</div>
      <AbsoluteFill style={{ background: '#000', opacity: end }} />
    </AbsoluteFill>
  );
};

const SHOTS: { C: React.FC<{ dur: number }>; dur: number }[] = [
  { C: Orbit, dur: 105 }, { C: Scroll, dur: 140 }, { C: Community, dur: 120 },
  { C: EventScene, dur: 105 }, { C: Talk, dur: 140 }, { C: Outro, dur: 110 },
];
let acc = 0;
const PLACED = SHOTS.map((s) => { const from = acc; acc += s.dur; return { ...s, from }; });
export const TOTAL = acc;
const at = (i: number, off: number) => PLACED[i].from + off;

export const FeedVid: React.FC<{ fmt: Fmt }> = ({ fmt }) => {
  const sfx = [
    { f: 0, src: 'air-woosh-quick', v: 0.3 }, { f: 16, src: 'shimmer-sparkle-sweep', v: 0.2, d: 60 },
    { f: at(1, -4), src: 'whoosh-big', v: 0.35 },
    { f: at(2, 26), src: 'switch-click-quick', v: 0.45 }, { f: at(2, 30), src: 'swoosh-quick', v: 0.25 },
    { f: at(3, 0), src: 'swoosh-quick', v: 0.25 }, { f: at(3, 32), src: 'pop', v: 0.3 },
    { f: at(4, 24), src: 'switch-click-quick', v: 0.45 }, { f: at(4, 26), src: 'pop', v: 0.3 },
    { f: at(4, 70), src: 'switch-click-quick', v: 0.45 }, { f: at(4, 74), src: 'swoosh-quick', v: 0.25 },
    { f: at(5, 8), src: 'impact-cine-big', v: 0.3, d: 70 }, { f: at(5, 24), src: 'sparkle', v: 0.28, d: 70 },
  ];
  return (
    <FmtCtx.Provider value={fmt}>
      <AbsoluteFill style={{ background: T.appBg }}>
        {PLACED.map(({ C, dur, from }, i) => <Sequence key={i} from={from} durationInFrames={dur}><C dur={dur} /></Sequence>)}
        {sfx.map((s, i) => <Sequence key={'a' + i} from={s.f} durationInFrames={s.d ?? 40}><Audio src={staticFile(`audio/${s.src}.mp3`)} volume={s.v} /></Sequence>)}
      </AbsoluteFill>
    </FmtCtx.Provider>
  );
};
