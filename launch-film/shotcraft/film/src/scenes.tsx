import React from 'react';
import { AbsoluteFill, Easing, Img, interpolate, useCurrentFrame } from 'remotion';
import { AppBackdrop, Caption, Phone, Shot, T, clamp, kf, lerp, liftShadow, rand, tex } from './kit';
import CUTS from '../public/textures/cuts.json';

type Box = { x: number; y: number; w: number; h: number };
const C = CUTS as Record<string, Box>;

const Sprite: React.FC<{ name: string; box: Box; style?: React.CSSProperties }> = ({ name, box, style }) => (
  <Img src={tex(`cut-${name}.png`)} style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, ...style }} />
);

// ═══ 1 · ВІДКРИТТЯ: знак + словесний знак «ГРОМАДА» ══════════════════════
export const SceneOpen: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const icon = interpolate(f, [6, 22], [0, 1], { ...clamp, easing: Easing.bezier(0.2, 1.25, 0.3, 1) });
  const iconO = interpolate(f, [6, 14], [0, 1], clamp);
  const letters = 'ГРОМАДА'.split('');
  const rule = interpolate(f, [50, 64], [0, 1], { ...clamp, easing: Easing.bezier(0.3, 0, 0.2, 1) });
  const sub = interpolate(f, [58, 72], [0, 1], { ...clamp, easing: Easing.bezier(0.25, 0.46, 0.45, 0.94) });
  const out = interpolate(f, [dur - 10, dur], [0, 1], { ...clamp, easing: Easing.bezier(0.4, 0, 1, 1) });
  const breathe = interpolate(f, [62, dur], [0, 0.012], clamp);
  return (
    <AbsoluteFill style={{ background: T.brandGrad, overflow: 'hidden' }}>
      {/* тонкий зерновий відблиск зверху */}
      <AbsoluteFill style={{ background: 'radial-gradient(700px 520px at 50% 44%, rgba(255,214,222,0.10), rgba(0,0,0,0) 70%)' }} />
      <AbsoluteFill style={{
        justifyContent: 'center', alignItems: 'center', flexDirection: 'column',
        transform: `scale(${1 + breathe - out * 0.06})`, opacity: 1 - out, filter: `blur(${out * 10}px)`,
      }}>
        <Img src={tex('castle-icon.png')} style={{
          width: 210, height: 262, opacity: iconO, marginBottom: 58,
          transform: `scale(${1.35 - 0.35 * icon})`, filter: `blur(${(1 - iconO) * 10}px) drop-shadow(0 18px 30px rgba(0,0,0,0.35))`,
        }} />
        <div style={{ display: 'flex', fontFamily: T.serif, fontWeight: 700, fontSize: 138, color: '#fff', letterSpacing: '0.10em', marginRight: '-0.10em' }}>
          {letters.map((l, i) => {
            const d = 24 + i * 3;
            const t = interpolate(f, [d, d + 9], [0, 1], { ...clamp, easing: Easing.bezier(0.2, 0.75, 0.3, 1) });
            return <span key={i} style={{ display: 'inline-block', opacity: t, transform: `translateY(${(1 - t) * -26}px) scale(${1.3 - 0.3 * t})`, filter: `blur(${(1 - t) * 8}px)` }}>{l}</span>;
          })}
        </div>
        <div style={{ width: 560, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.75)', marginTop: 40, transform: `scaleX(${rule})` }} />
        <div style={{ fontFamily: T.sans, fontWeight: 500, fontSize: 40, color: 'rgba(255,255,255,0.86)', marginTop: 38, opacity: sub, transform: `translateY(${(1 - sub) * 12}px)`, letterSpacing: '0.01em' }}>
          Олицька громада — у твоєму смартфоні
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ═══ 2 · ГРОМАДА: телефон виринає, камера наїжджає на капсули, вони злітають ═══
export const SceneHome: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const rise = Easing.bezier(0.16, 1, 0.3, 1);
  const cam = {
    z: kf(f, [[0, 0.86], [52, 0.86], [74, 1.38]]),
    cx: kf(f, [[0, 195], [52, 195], [74, 205]]),
    cy: kf(f, [[0, 422], [52, 422], [74, 330]]),
    rotX: kf(f, [[0, 26], [36, 6], [52, 5], [74, 3]], rise),
    rotY: kf(f, [[0, -16], [36, -6], [52, -5], [74, -11]], rise),
    dy: kf(f, [[0, 1500], [36, 0]], rise),
    fy: 1010,
  };
  // приглушення екрана навколо капсул (кадр-«прожектор», лише один раз за ролик)
  const dim = kf(f, [[60, 0], [80, 0.58], [128, 0.58], [150, 0]]);
  const lifts = [0, 1].map((i) => {
    const s = 78 + i * 8;
    const up = interpolate(f, [s, s + 10], [0, 1], { ...clamp, easing: Easing.bezier(0.2, 1.25, 0.3, 1) });
    const down = interpolate(f, [132 + i * 3, 150 + i * 3], [0, 1], { ...clamp, easing: Easing.bezier(0.4, 0, 0.2, 1) });
    const bob = Math.sin(((f - s) / 40) * Math.PI * 2) * 1.6 * up * (1 - down);
    const lift = up * (1 - down);
    return { lift, bob };
  });
  return (
    <AbsoluteFill>
      <AppBackdrop />
      <Phone cam={cam}>
        <Shot src="01-gromada.png" />
        <div style={{ position: 'absolute', inset: 0, background: `rgba(14,10,12,${dim})` }} />
        {(['cap1', 'cap2'] as const).map((n, i) => {
          const { lift, bob } = lifts[i];
          return (
            <Sprite key={n} name={n} box={C[n]} style={{
              borderRadius: 29,
              transform: `translate(${-14 * lift}px, ${-10 * lift + bob}px) scale(${1 + 0.07 * lift})`,
              boxShadow: lift > 0.01 ? liftShadow(lift) : undefined,
            }} />
          );
        })}
      </Phone>
      <Caption text="Усе важливе — на одному екрані" from={40} dur={dur - 40} />
    </AbsoluteFill>
  );
};

// ═══ 4 · АВТОБУСИ: довгий розклад пролітає й різко гальмує на автобусі в дорозі ═══
export const SceneBuses: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const SCROLL = 1240; // css px — від кінця розкладу до верху
  const brake = Easing.bezier(0.45, 0, 0.06, 1);
  const pos = (fr: number) => SCROLL * (1 - brake(interpolate(fr, [8, 58], [0, 1], clamp)));
  const v = Math.abs(pos(f) - pos(f - 1));
  const blur = Math.min(v * 0.32 * 0.33, 7); // направлене розмиття від швидкості (css px)
  const stopped = interpolate(f, [58, 66], [0, 1], { ...clamp, easing: Easing.bezier(0.2, 1.25, 0.3, 1) });
  const cam = {
    z: kf(f, [[0, 0.86], [66, 0.86], [92, 1.22]]),
    cx: 195, cy: kf(f, [[0, 422], [66, 422], [92, 300]]),
    rotX: kf(f, [[0, 3], [92, 2]]), rotY: kf(f, [[0, 4], [66, 4], [92, -4]]),
    fy: 1010,
  };
  const hero = C.bus;
  return (
    <AbsoluteFill>
      <AppBackdrop />
      <Phone cam={cam}>
        <div style={{ position: 'absolute', inset: 0, background: '#ECEEF1' }} />
        <div style={{ position: 'absolute', left: 0, top: 0, width: 390, height: 2600, transform: `translateY(${-pos(f)}px)`, filter: blur > 0.2 ? `blur(${blur}px)` : undefined }}>
          <Shot src="07-avtobusy-tall.png" h={2600} />
        </div>
        {/* решта рядків відступає у тінь, автобус у дорозі піднімається */}
        <div style={{ position: 'absolute', inset: 0, background: `rgba(236,238,241,${0.62 * stopped})` }} />
        <Sprite name="bus" box={hero} style={{
          opacity: stopped, borderRadius: 16,
          transform: `scale(${1 + 0.03 * stopped})`,
          boxShadow: `${liftShadow(stopped * 0.8)}, 0 0 0 ${2 * stopped}px ${T.brandHi}`,
        }} />
        <Img src={tex('cut-header.png')} style={{ position: 'absolute', left: 0, top: 0, width: 390, height: 58 }} />
        <Img src={tex('cut-tabbar-bus.png')} style={{ position: 'absolute', left: 0, top: 770, width: 390, height: 74 }} />
      </Phone>
      <Caption text="Автобуси громади — наживо" from={4} dur={dur - 4} />
    </AbsoluteFill>
  );
};

// ═══ 6 · ДОШКА: оголошення злітають знизу й лягають стосом (list-stack-press) ═══
export const SceneBoard: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const CUES = [16, 28, 40, 52];
  const fly = Easing.bezier(0.45, 0.05, 0.25, 1.12);
  // кожна нова картка притискає вже покладені на 3px і відпускає за 8 кадрів
  const press = CUES.map((c) => interpolate(f, [c + 18, c + 22, c + 26], [0, 3, 0], clamp));
  const cam = { z: kf(f, [[0, 0.9], [90, 0.96]]), cx: 195, cy: kf(f, [[0, 422], [90, 440]]), fy: 1010 };
  const glaze = interpolate(f, [82, 96], [-260, 640], clamp);
  const fab = interpolate(f, [80, 92], [0, 1], { ...clamp, easing: Easing.bezier(0.34, 1.56, 0.64, 1) });
  return (
    <AbsoluteFill>
      <AppBackdrop />
      <Phone cam={cam}>
        <Shot src="05-doshka-empty.png" />
        {[1, 2, 3, 4].map((n, i) => {
          const c = CUES[i];
          const t = interpolate(f, [c, c + 22], [0, 1], { ...clamp, easing: fly });
          const after = press.slice(i + 1).reduce((a, b) => a + b, 0);
          const tilt = (i % 2 ? 2 : -2) * (1 - t);
          const air = 1 - interpolate(f, [c + 14, c + 22], [0, 1], clamp);
          const box = C[`board${n}`];
          return (
            <Sprite key={n} name={`board${n}`} box={box} style={{
              opacity: t > 0 ? 1 : 0, borderRadius: 12,
              transform: `translateY(${lerp(560, 0, t) + after}px) rotate(${tilt}deg) scale(${1.06 - 0.06 * t})`,
              boxShadow: liftShadow(0.08 + 0.9 * air),
            }} />
          );
        })}
        {/* один проблиск по всьому стосу — і тільки раз */}
        <div style={{ position: 'absolute', left: 12, top: 181, width: 366, height: 540, overflow: 'hidden', borderRadius: 12, mixBlendMode: 'soft-light', pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', top: -200, left: glaze, width: 150, height: 1000, transform: 'rotate(14deg)', background: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.85), rgba(255,255,255,0))' }} />
        </div>
        <Sprite name="fab" box={C.fab} style={{ opacity: fab > 0 ? Math.min(1, fab * 1.4) : 0, transform: `scale(${0.85 + 0.15 * fab})`, transformOrigin: '70% 50%' }} />
        <Img src={tex('cut-tabbar-board.png')} style={{ position: 'absolute', left: 0, top: 770, width: 390, height: 74 }} />
      </Phone>
      <Caption text="Продай, купи, віддай — поруч" from={4} dur={dur - 4} />
    </AbsoluteFill>
  );
};

// ═══ 7 · ПИТАННЯ: екран заїжджає збоку, питання падають по черзі ═══
export const SceneQuestions: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const slide = interpolate(f, [0, 14], [1, 0], { ...clamp, easing: Easing.bezier(0.32, 0.72, 0, 1) });
  const cam = { z: kf(f, [[0, 0.96], [dur, 1.04]]), cx: 195, cy: kf(f, [[0, 440], [dur, 430]]), fy: 1010 };
  const tap = interpolate(f, [70, 74, 82], [0, 1, 0], clamp);
  return (
    <AbsoluteFill>
      <AppBackdrop />
      <Phone cam={cam}>
        <div style={{ position: 'absolute', inset: 0, transform: `translateX(${-390 * (1 - slide)}px)` }}>
          <Shot src="05-doshka.png" />
        </div>
        <div style={{ position: 'absolute', inset: 0, transform: `translateX(${390 * slide}px)` }}>
          <Shot src="04-pytannia-empty.png" />
          {[1, 2, 3].map((n, i) => {
            const s = 14 + i * 7;
            const t = interpolate(f, [s, s + 14], [0, 1], { ...clamp, easing: Easing.bezier(0.25, 0.46, 0.45, 0.94) });
            return <Sprite key={n} name={`qa${n}`} box={C[`qa${n}`]} style={{ opacity: t, transform: `translateY(${(1 - t) * 26}px)`, borderRadius: 16, boxShadow: liftShadow(0.06) }} />;
          })}
          <Sprite name="qafab" box={C.qafab} style={{ transform: `scale(${1 - 0.06 * tap})`, transformOrigin: '50% 50%' }} />
        </div>
        <Img src={tex('cut-tabbar-qa.png')} style={{ position: 'absolute', left: 0, top: 770, width: 390, height: 74, opacity: interpolate(f, [4, 10], [0, 1], clamp) }} />
      </Phone>
      <Caption text="Спитай сусідів — підкажуть" from={6} dur={dur - 6} />
    </AbsoluteFill>
  );
};

// ═══ 8 · ФІНАЛ: усе побачене злітається навколо знака (outro-group-photo-launch) ═══
type Piece = { name: string; x: number; y: number; rot: number; from: [number, number] };
const PIECES: Piece[] = [
  { name: 'bus', x: 540, y: 300, rot: -2.5, from: [0, -620] },
  { name: 'cap1', x: 330, y: 540, rot: 3, from: [-560, -120] },
  { name: 'cap2', x: 765, y: 610, rot: -3.5, from: [560, -60] },
  { name: 'board1', x: 360, y: 1370, rot: -3, from: [-560, 140] },
  { name: 'qa1', x: 740, y: 1540, rot: 2.5, from: [560, 200] },
  { name: 'board2', x: 400, y: 1730, rot: 2, from: [-200, 620] },
];
const PK = 1.55;

export const SceneOutro: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const crane = interpolate(f, [0, 40], [0, 1], { ...clamp, easing: Easing.bezier(0.25, 0.46, 0.45, 0.94) });
  const push = interpolate(f, [36, dur], [0, 0.035], { ...clamp, easing: Easing.inOut(Easing.sin) });
  const back = interpolate(f, [42, 50], [0, 1], clamp);
  const icon = interpolate(f, [38, 46], [0, 1], { ...clamp, easing: Easing.bezier(0.2, 1.25, 0.3, 1) });
  const rule = interpolate(f, [58, 70], [0, 1], { ...clamp, easing: Easing.bezier(0.3, 0, 0.2, 1) });
  const url = interpolate(f, [64, 78], [0, 1], { ...clamp, easing: Easing.bezier(0.25, 0.46, 0.45, 0.94) });
  const stage = kf(f, [[42, 0], [50, 0.55], [58, 0.3]]);
  const band = interpolate(f, [2, 14], [-700, 1500], clamp);
  return (
    <AbsoluteFill style={{ background: T.brandGrad, overflow: 'hidden' }}>
      {/* світлова смуга на вході */}
      <div style={{ position: 'absolute', top: -400, left: band, width: 600, height: 2800, transform: 'rotate(16deg)', background: 'linear-gradient(90deg, rgba(255,230,236,0), rgba(255,230,236,0.12), rgba(255,230,236,0))' }} />
      <AbsoluteFill style={{ transform: `perspective(1400px) rotateX(${4 * (1 - crane)}deg) scale(${1.06 - 0.06 * crane + push})` }}>
        {PIECES.map((p, i) => {
          const cue = 4 + i * 3;
          const t = interpolate(f, [cue, cue + 12], [0, 1], { ...clamp, easing: Easing.bezier(0.34, 1.4, 0.44, 1) });
          const t1 = interpolate(f - 1, [cue, cue + 12], [0, 1], { ...clamp, easing: Easing.bezier(0.34, 1.4, 0.44, 1) });
          const sp = Math.hypot(p.from[0], p.from[1]) * Math.abs(t - t1);
          const mb = Math.min(sp * 0.3 * 0.25, 10);
          const land = interpolate(f, [cue + 9, cue + 16], [0, 1], clamp);
          const squash = interpolate(f, [cue + 11, cue + 13, cue + 16], [1, 0.985, 1], clamp);
          const b = C[p.name];
          const w = b.w * PK, h = b.h * PK;
          return (
            <Img key={p.name} src={tex(`cut-${p.name}.png`)} style={{
              position: 'absolute', left: p.x - w / 2, top: p.y - h / 2, width: w, height: h,
              opacity: t > 0 ? (1 - 0.14 * back) : 0,
              transform: `translate(${p.from[0] * (1 - t)}px, ${p.from[1] * (1 - t)}px) rotate(${p.rot * (2 - t)}deg) scale(${(1.12 - 0.12 * t) * squash})`,
              filter: `${mb > 0.3 ? `blur(${mb}px) ` : ''}saturate(${1 - 0.08 * back})`,
              borderRadius: p.name.startsWith('cap') ? h / 2 : 22,
              boxShadow: `0 ${30 - 20 * land}px ${70 - 40 * land}px rgba(10,2,5,${0.45 - 0.1 * land})`,
            }} />
          );
        })}
      </AbsoluteFill>
      {/* сценічне світло за знаком */}
      <AbsoluteFill style={{ background: `radial-gradient(560px 360px at 50% 51%, rgba(20,4,8,${0.85 * Math.min(1, back * 1.4)}), rgba(20,4,8,0) 100%)` }} />
      <AbsoluteFill style={{ background: `radial-gradient(420px 260px at 50% 50%, rgba(255,220,228,${stage * 0.35}), rgba(255,220,228,0) 100%)` }} />
      {/* золотий пил — детермінований */}
      {Array.from({ length: 20 }, (_, i) => {
        const x = 120 + rand(i * 7 + 1) * 840;
        const y0 = 700 + rand(i * 7 + 2) * 600;
        const s = 2.4 + rand(i * 7 + 3) * 1.8;
        const sp = 0.6 + rand(i * 7 + 4) * 0.9;
        const tw = 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(f / (6 + rand(i * 7 + 5) * 6) + i));
        const o = interpolate(f, [20, 40], [0, 1], clamp) * tw;
        return <div key={i} style={{ position: 'absolute', left: x, top: y0 - f * sp, width: s, height: s, borderRadius: '50%', background: '#FFE7C2', opacity: o, boxShadow: '0 0 8px 2px rgba(255,214,160,0.55)' }} />;
      })}
      {/* знак */}
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', flexDirection: 'column' }}>
        <Img src={tex('castle-icon.png')} style={{ width: 150, height: 187, marginBottom: 34, opacity: Math.min(1, icon * 1.5), transform: `scale(${1.35 - 0.35 * icon})`, filter: 'drop-shadow(0 14px 26px rgba(0,0,0,0.45))' }} />
        <div style={{ display: 'flex', fontFamily: T.serif, fontWeight: 700, fontSize: 150, color: '#fff', letterSpacing: `${0.10 + 0.012 * interpolate(f, [62, 66, 70], [0, 1, 0], clamp)}em`, marginRight: '-0.10em', textShadow: '0 10px 40px rgba(0,0,0,0.45)' }}>
          {'ГРОМАДА'.split('').map((l, i) => {
            const d = 42 + i * 1.8;
            const t = interpolate(f, [d, d + 8], [0, 1], { ...clamp, easing: Easing.bezier(0.2, 0.75, 0.3, 1) });
            return <span key={i} style={{ display: 'inline-block', opacity: t, transform: `scale(${1.3 - 0.3 * t})`, filter: `blur(${(1 - t) * 8}px)` }}>{l}</span>;
          })}
        </div>
        <div style={{ position: 'relative', width: 560, height: 4, marginTop: 34 }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: 2, background: 'rgba(255,255,255,0.85)', transform: `scaleX(${rule})` }} />
        </div>
        <div style={{ fontFamily: T.sans, fontWeight: 600, fontSize: 52, color: '#fff', marginTop: 34, opacity: url, transform: `translateY(${(1 - url) * 14}px)`, letterSpacing: '0.02em', textShadow: '0 6px 24px rgba(0,0,0,0.5)' }}>
          castlelife.org
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
