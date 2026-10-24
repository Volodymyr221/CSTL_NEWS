import React from 'react';
import { AbsoluteFill, Audio, Easing, Img, interpolate, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { AppBackdrop, Caption, Phone, Shot, T, clamp, kf, lerp, liftShadow, tex } from './kit';
import CUTS from '../public/textures/cuts.json';

// ── СІТКА БІТІВ (analysis/grid.json, трек Cat Walk — Arulo, Mixkit Free License) ──
// Фітовано по справжніх ударах бочки (40–120 Гц), а не по beat_track:
// той зачепився за хай-хет і стояв на 0.4 біта поруч.
export const FPS = 30;
export const BEAT = 0.46195;            // с, 129.9 BPM
export const DROP = 29.6388;            // с у треку — перший удар після наростання
export const PRE = 8;                   // скільки бітів наростання до дропу в ролику
export const AUDIO_START = DROP - PRE * BEAT; // 25.943 с — з цього місця вирізано bgm.mp3
export const beatT = (b: number) => (b + PRE) * BEAT;      // біт (0 = дроп) → секунди ролика
export const beatF = (b: number) => Math.round(beatT(b) * FPS);

export const SHOTS = {
  hook: { from: beatF(-8), to: beatF(0) },
  drop: { from: beatF(0), to: beatF(4) },
  wall: { from: beatF(4), to: beatF(12) },
  search: { from: beatF(12), to: beatF(24) },
  bus: { from: beatF(24), to: beatF(32) },
  brk: { from: beatF(32), to: beatF(36) },   // у треку брейк: бочки немає 4 біти
  outro: { from: beatF(36), to: beatF(44) + 18 },
};
export const TOTAL = SHOTS.outro.to;
const lb = (shotFrom: number, b: number) => beatF(b) - shotFrom; // біт → локальний кадр

type Box = { x: number; y: number; w: number; h: number };
const C = CUTS as Record<string, Box>;
const Sprite: React.FC<{ name: string; box: Box; style?: React.CSSProperties }> = ({ name, box, style }) => (
  <Img src={tex(`cut-${name}.png`)} style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, ...style }} />
);

const outQuint = Easing.bezier(0.22, 1, 0.36, 1);

// ═══ ГАЧОК: «Де знайти [___]?» — слово в капсулі міняється на кожен біт ═══
const HOOK_WORDS = ['новини', 'автобус', 'дрова', 'відповідь', 'усе разом'];
const SceneHook: React.FC = () => {
  const f = useCurrentFrame();
  const F = SHOTS.hook.from;
  const lineIn = interpolate(f, [0, 10], [0, 1], { ...clamp, easing: outQuint });
  // слова на бітах −6, −5, −4, −3, −2 (останнє тримається до дропу)
  const at = [-6, -5, -4, -3, -2].map((b) => lb(F, b));
  let idx = -1;
  at.forEach((a, i) => { if (f >= a) idx = i; });
  const since = idx >= 0 ? f - at[idx] : 0;
  const roll = idx >= 0 ? outQuint(interpolate(since, [0, 8], [0, 1], clamp)) : 0;
  const pillIn = interpolate(f, [at[0], at[0] + 8], [0, 1], { ...clamp, easing: Easing.bezier(0.34, 1.56, 0.64, 1) });
  const charge = interpolate(f, [lb(F, -2), lb(F, 0)], [0, 1], clamp); // наростання перед дропом
  return (
    <AbsoluteFill style={{ background: T.brandGrad, justifyContent: 'center', alignItems: 'center' }}>
      <AbsoluteFill style={{ background: `radial-gradient(700px 500px at 50% 50%, rgba(255,210,220,${0.06 + 0.12 * charge}), rgba(0,0,0,0) 70%)` }} />
      <div style={{ textAlign: 'center', transform: `scale(${1 + 0.05 * charge})` }}>
        <div style={{ fontFamily: T.display, fontWeight: 700, fontSize: 118, color: '#fff', letterSpacing: '-0.02em', opacity: lineIn, transform: `translateY(${(1 - lineIn) * 0.38 * 118}px)`, filter: `blur(${(1 - lineIn) * 18}px)` }}>
          Де знайти
        </div>
        <div style={{ marginTop: 34, height: 168, display: 'flex', justifyContent: 'center', alignItems: 'center', opacity: pillIn, transform: `scale(${0.6 + 0.4 * pillIn})` }}>
          <div style={{ position: 'relative', height: 158, padding: '0 56px', borderRadius: 999, background: '#fff', boxShadow: '0 24px 60px rgba(0,0,0,0.35)', overflow: 'hidden', display: 'flex', alignItems: 'center', minWidth: 300 }}>
            {/* невидимий замір ширини поточного слова — капсула тягнеться під нього */}
            <span style={{ fontFamily: T.display, fontWeight: 800, fontSize: 104, opacity: 0, letterSpacing: '-0.02em' }}>{HOOK_WORDS[Math.max(0, idx)]}?</span>
            {HOOK_WORDS.map((w, i) => {
              const y = i === idx ? (1 - roll) * 140 : i === idx - 1 ? -roll * 140 : 9999;
              return (
                <span key={w} style={{ position: 'absolute', left: 0, right: 0, textAlign: 'center', fontFamily: T.display, fontWeight: 800, fontSize: 104, color: T.brandHi, letterSpacing: '-0.02em', transform: `translateY(${y}px)`, filter: i === idx ? `blur(${(1 - roll) * 6}px)` : `blur(${roll * 6}px)` }}>
                  {w}?
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ═══ ДРОП: телефон влітає з перспективи і встає рівно на удар (kanada-perspective-snap) ═══
const SceneDrop: React.FC = () => {
  const f = useCurrentFrame();
  const settle = interpolate(f, [0, 10], [0, 1], { ...clamp, easing: Easing.bezier(0.2, 1.4, 0.4, 1) });
  const cam = {
    z: lerp(1.5, 0.9, settle) + interpolate(f, [10, 60], [0, 0.05], clamp),
    cx: 195, cy: 422, fy: 1000,
    rotX: lerp(38, 4, settle), rotY: lerp(-24, -4, settle), rotZ: lerp(-10, 0, settle),
  };
  const flash = interpolate(f, [0, 2, 8], [0.0, 0.7, 0], clamp);
  return (
    <AbsoluteFill>
      <AppBackdrop />
      <Phone cam={cam}><Shot src="01-gromada.png" /></Phone>
      <AbsoluteFill style={{ background: '#fff', opacity: flash }} />
      <Caption text="Громада — застосунок Олицької громади" from={6} dur={SHOTS.drop.to - SHOTS.drop.from - 6} />
    </AbsoluteFill>
  );
};

// ═══ СТІНА: справжні екрани стікають колонами по нахиленій 3D-стіні (page-waterfall-wall) ═══
const COLS = [
  ['01-gromada.png', '05-doshka.png', '06-avtobusy.png', '04-pytannia.png'],
  ['03-strichka.png', '06-avtobusy.png', '01-gromada.png', '05-doshka.png'],
  ['04-pytannia.png', '01-gromada.png', '03-strichka.png', '06-avtobusy.png'],
];
const SceneWall: React.FC = () => {
  const f = useCurrentFrame();
  const F = SHOTS.wall.from;
  const CW = 390 * 0.95, CH = 844 * 0.95, GAP = 34;
  const words = ['Новини.', 'Автобуси.', 'Дошка.', 'Питання.'];
  return (
    <AbsoluteFill style={{ background: '#1a0a0e', overflow: 'hidden' }}>
      <AbsoluteFill style={{ perspective: 1700, perspectiveOrigin: '50% 40%' }}>
        <div style={{ position: 'absolute', left: 540 - (3 * CW + 2 * GAP) / 2, top: -500, width: 3 * CW + 2 * GAP, height: 3200, transform: 'rotateX(32deg) rotateZ(-14deg) scale(1.18)', transformStyle: 'preserve-3d' }}>
          {COLS.map((col, ci) => {
            const dir = ci % 2 ? 1 : -1;
            const off = dir * f * 7 + (ci === 1 ? -420 : 0);
            return (
              <div key={ci} style={{ position: 'absolute', left: ci * (CW + GAP), top: 0, width: CW, transform: `translateY(${off}px)` }}>
                {[...col, ...col].map((s, i) => (
                  <Img key={i} src={tex(s)} style={{ position: 'absolute', left: 0, top: i * (CH + GAP) - 600, width: CW, height: CH, borderRadius: 34, boxShadow: '0 30px 60px rgba(0,0,0,0.5)' }} />
                ))}
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(26,10,14,0.85) 0%, rgba(26,10,14,0.2) 30%, rgba(26,10,14,0.2) 62%, rgba(26,10,14,0.92) 100%)' }} />
      <div style={{ position: 'absolute', left: 80, bottom: 220 }}>
        {words.map((w, i) => {
          const a = lb(F, 6 + i);
          const t = interpolate(f, [a, a + 8], [0, 1], { ...clamp, easing: outQuint });
          return (
            <div key={w} style={{ fontFamily: T.display, fontWeight: 800, fontSize: 112, lineHeight: 1.04, color: i === 3 ? '#FFB9C4' : '#fff', letterSpacing: '-0.025em', opacity: t, transform: `translateY(${(1 - t) * 0.38 * 112}px)`, filter: `blur(${(1 - t) * 18}px)` }}>{w}</div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ═══ ПОШУК: «дрова» набирається по вісімках, список сам стискається до одного оголошення ═══
const SceneSearch: React.FC = () => {
  const f = useCurrentFrame();
  const F = SHOTS.search.from;
  const keys = [13, 13.5, 14, 14.5, 15].map((b) => lb(F, b));
  let typed = 0;
  keys.forEach((k, i) => { if (f >= k) typed = i + 1; });
  const collapse = lb(F, 15.5), rise = lb(F, 16), swap = lb(F, 17);
  const push0 = lb(F, 18), push1 = lb(F, 20);
  const cam = {
    z: kf(f, [[0, 0.92], [push0, 0.92], [push1, 1.55]], Easing.bezier(0.33, 0, 0.15, 1)),
    cx: 195, cy: kf(f, [[0, 422], [push0, 422], [push1, 252]]), fy: 1010,
    rotY: kf(f, [[0, 0], [push0, 0], [push1, -5]]), rotX: kf(f, [[0, 0], [push0, 0], [push1, 3]]),
  };
  const wideFab = interpolate(f, [keys[0], keys[0] + 6], [1, 0], clamp);
  return (
    <AbsoluteFill>
      <AppBackdrop />
      <Phone cam={cam}>
        {f < swap ? (
          <>
            <Shot src="05-doshka-empty.png" />
            {[1, 2, 3].map((n, i) => {
              const t = interpolate(f, [collapse + i * 2, collapse + i * 2 + 7], [0, 1], { ...clamp, easing: Easing.bezier(0.4, 0, 1, 1) });
              return <Sprite key={n} name={`board${n}`} box={C[`board${n}`]} style={{ opacity: 1 - t, transform: `scale(${1 - 0.06 * t}) translateY(${-10 * t}px)`, borderRadius: 12, filter: `blur(${t * 4}px)` }} />;
            })}
            {(() => {
              const t = interpolate(f, [rise, rise + 10], [0, 1], { ...clamp, easing: Easing.bezier(0.34, 1.3, 0.64, 1) });
              const b = { x: 12, y: C.board4.y, w: 366, h: 143 };
              const lift = interpolate(f, [rise - 2, rise + 2, rise + 12], [0, 1, 0], clamp);
              // знайдене оголошення — зі справжнього кадру пошуку (з рядком «знайдено за»)
              return <Sprite name="found" box={b} style={{ transform: `translateY(${(181 - b.y) * t}px) scale(${1 + 0.03 * lift})`, borderRadius: 12, boxShadow: liftShadow(0.1 + 0.7 * lift) }} />;
            })()}
            <Sprite name="fab" box={C.fab} style={{ opacity: wideFab }} />
            <Sprite name="fab-round" box={{ x: 308, y: 710, w: 72, h: 72 }} style={{ opacity: 1 - wideFab }} />
          </>
        ) : (
          <Shot src="s5-fixed.png" />
        )}
        <Img src={tex(`cut-head-s${typed}.png`)} style={{ position: 'absolute', left: 0, top: 0, width: 390, height: 175 }} />
      </Phone>
      <Caption text="Набери — і знайдеш поруч" from={lb(F, 12.5)} dur={SHOTS.search.to - SHOTS.search.from - lb(F, 12.5)} />
    </AbsoluteFill>
  );
};

// ═══ АВТОБУС: три жорсткі стрибки ближче, кожен на біт (jump-cut-punch-in) ═══
const SceneBus: React.FC = () => {
  const f = useCurrentFrame();
  const F = SHOTS.bus.from;
  const step = f >= lb(F, 28) ? 2 : f >= lb(F, 26) ? 1 : 0;
  const cams = [
    { z: 0.92, cx: 195, cy: 422 },
    { z: 1.45, cx: 195, cy: 282 },
    { z: 2.35, cx: 160, cy: 250 },
  ];
  const c = cams[step];
  const drift = interpolate(f, [0, SHOTS.bus.to - F], [0, 0.03], clamp);
  const tag = interpolate(f, [lb(F, 29), lb(F, 29) + 8], [0, 1], { ...clamp, easing: outQuint });
  return (
    <AbsoluteFill>
      <AppBackdrop />
      <Phone cam={{ ...c, z: c.z * (1 + drift), fy: 960 }}><Shot src="06-avtobusy.png" /></Phone>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 180, textAlign: 'center', opacity: tag, transform: `translateY(${(1 - tag) * 40}px)` }}>
        <span style={{ display: 'inline-block', fontFamily: T.display, fontWeight: 800, fontSize: 92, color: '#fff', background: T.brandHi, padding: '18px 44px', borderRadius: 26, letterSpacing: '-0.02em', boxShadow: '0 24px 50px rgba(74,18,28,0.4)' }}>
          Автобус уже в дорозі
        </span>
      </div>
    </AbsoluteFill>
  );
};

// ═══ БРЕЙК: музика стихає — слова по одному на біт ═══
const SceneBreak: React.FC = () => {
  const f = useCurrentFrame();
  const F = SHOTS.brk.from;
  const words = [['Твоя', 32], ['громада', 33], ['—', 34], ['у кишені.', 34.5]] as const;
  return (
    <AbsoluteFill style={{ background: 'radial-gradient(900px 800px at 50% 45%, #ffffff, #F1F2F4 70%)', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ textAlign: 'center', fontFamily: T.display, fontWeight: 800, fontSize: 132, lineHeight: 1.06, letterSpacing: '-0.03em', color: T.ink, maxWidth: 940 }}>
        {words.map(([w, b], i) => {
          const a = lb(F, b);
          const t = interpolate(f, [a, a + 9], [0, 1], { ...clamp, easing: outQuint });
          return <span key={i} style={{ display: 'inline-block', margin: '0 0.12em', opacity: t, color: i === 3 ? T.brandHi : undefined, transform: `translateY(${(1 - t) * 0.38 * 132}px)`, filter: `blur(${(1 - t) * 18}px)` }}>{w}</span>;
        })}
      </div>
    </AbsoluteFill>
  );
};

// ═══ ФІНАЛ: знак падає рівно на повернення бочки ═══
const OUTRO_LEAD = 6;
const SceneOutro: React.FC = () => {
  const f = useCurrentFrame() - OUTRO_LEAD;
  const F = SHOTS.outro.from;
  const slam = interpolate(f, [-5, 0, 6], [0, 1, 1], clamp);
  const s = f < 0 ? interpolate(f, [-OUTRO_LEAD, 0], [1.7, 1], { ...clamp, easing: Easing.bezier(0.5, 0, 1, 1) }) : interpolate(f, [0, 3, 8], [1, 0.96, 1], { ...clamp, easing: Easing.bezier(0.2, 1.4, 0.4, 1) });
  const url = interpolate(f, [lb(F, 38), lb(F, 38) + 10], [0, 1], { ...clamp, easing: outQuint });
  const sub = interpolate(f, [lb(F, 39), lb(F, 39) + 10], [0, 1], { ...clamp, easing: outQuint });
  const flash = interpolate(f, [0, 2, 9], [0.85, 0.5, 0], clamp);
  const end = interpolate(f, [SHOTS.outro.to - F - 10, SHOTS.outro.to - F], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ background: T.brandGrad, justifyContent: 'center', alignItems: 'center', flexDirection: 'column' }}>
      <Img src={tex('castle-icon.png')} style={{ width: 168, height: 210, marginBottom: 40, opacity: slam, transform: `scale(${s})`, filter: 'drop-shadow(0 16px 30px rgba(0,0,0,0.4))' }} />
      <div style={{ fontFamily: T.serif, fontWeight: 700, fontSize: 150, color: '#fff', letterSpacing: '0.10em', marginRight: '-0.10em', transform: `scale(${s})`, opacity: slam }}>ГРОМАДА</div>
      <div style={{ fontFamily: T.sans, fontWeight: 600, fontSize: 58, color: '#fff', marginTop: 46, opacity: url, transform: `translateY(${(1 - url) * 22}px)` }}>castlelife.org</div>
      <div style={{ fontFamily: T.sans, fontWeight: 600, fontSize: 30, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)', marginTop: 22, opacity: sub }}>Олицька громада</div>
      <AbsoluteFill style={{ background: '#fff', opacity: flash }} />
      <AbsoluteFill style={{ background: '#000', opacity: end }} />
    </AbsoluteFill>
  );
};

type Sfx = { b: number; src: string; volume: number; dur?: number; df?: number };
// Барабани вже дає музика — звуки лише на дії, яких у музиці немає.
const SFX: Sfx[] = [
  { b: -1, src: 'whoosh-fast', volume: 0.35, df: -4 },
  { b: 0, src: 'impact-cine-big', volume: 0.32, dur: 50 },
  { b: 13, src: 'typewriter-hit-soft', volume: 0.28 }, { b: 13.5, src: 'typewriter-hit-soft', volume: 0.25 },
  { b: 14, src: 'typewriter-hit-soft', volume: 0.25 }, { b: 14.5, src: 'typewriter-hit-soft', volume: 0.22 },
  { b: 15, src: 'typewriter-hit-soft', volume: 0.22 },
  { b: 16, src: 'swoosh-quick', volume: 0.25 },
  { b: 26, src: 'click-camera', volume: 0.4 }, { b: 28, src: 'click-camera', volume: 0.45 },
  { b: 36, src: 'impact-cine-big', volume: 0.45, dur: 80 },
  { b: 38, src: 'sparkle', volume: 0.3, dur: 70 },
];

export const Teaser: React.FC<{ bgm?: boolean }> = ({ bgm = true }) => {
  const seq = (k: keyof typeof SHOTS, el: React.ReactNode, lead = 0) => (
    <Sequence from={SHOTS[k].from - lead} durationInFrames={SHOTS[k].to - SHOTS[k].from + lead}>{el}</Sequence>
  );
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {seq('hook', <SceneHook />)}
      {seq('drop', <SceneDrop />)}
      {seq('wall', <SceneWall />)}
      {seq('search', <SceneSearch />)}
      {seq('bus', <SceneBus />)}
      {seq('brk', <SceneBreak />)}
      <Sequence from={SHOTS.outro.from - OUTRO_LEAD} durationInFrames={SHOTS.outro.to - SHOTS.outro.from + OUTRO_LEAD}><SceneOutro /></Sequence>
      {bgm ? (
        <Audio src={staticFile('audio/bgm.mp3')} volume={(fr) => 0.8 * interpolate(fr, [0, 4, TOTAL - 40, TOTAL - 4], [0, 1, 1, 0], clamp)} />
      ) : null}
      {SFX.map((s, i) => (
        <Sequence key={i} from={beatF(s.b) + (s.df ?? 0)} durationInFrames={s.dur ?? 30}>
          <Audio src={staticFile(`audio/${s.src}.mp3`)} volume={s.volume} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
