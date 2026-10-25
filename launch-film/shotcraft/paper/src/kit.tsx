import React from 'react';
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';

// ── Дизайн-токени «Громади» (з style/tokens.css) ──────────────────────────
export const T = {
  brandInk: '#4A121C',
  brandHi: '#8A2233',
  brandGrad:
    'radial-gradient(130% 80% at 26% 0%, rgba(150,32,50,0.30) 0%, rgba(150,32,50,0) 60%), linear-gradient(162deg, #5E1723 0%, #4A121C 48%, #2E0C14 100%)',
  ink: '#2A2520',
  inkSoft: '#5F5448',
  appBg: '#ECEEF1',
  sans: 'Inter, "Inter Display", system-ui, sans-serif',
  display: '"Inter Display", Inter, system-ui, sans-serif',
  serif: '"DejaVu Serif", "FreeSerif", Georgia, serif',
};

export const W = 1080;
export const H = 1920;
export const PHONE_K = 1.75; // CSS px екрана телефона → px кадру при zoom=1

export const tex = (n: string) => staticFile(`textures/${n}`);
export const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Ключі анімації з кривою: [[кадр, значення], ...] */
export const kf = (f: number, keys: [number, number][], ease: (t: number) => number = Easing.bezier(0.33, 0, 0.15, 1)) => {
  if (f <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [f0, v0] = keys[i];
    const [f1, v1] = keys[i + 1];
    if (f <= f1) return lerp(v0, v1, ease(interpolate(f, [f0, f1], [0, 1], clamp)));
  }
  return keys[keys.length - 1][1];
};

// mulberry32 — детермінований псевдовипадок (жодного Math.random)
export const rand = (seed: number) => {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export type Cam = { z: number; cx: number; cy: number; rotX?: number; rotY?: number; rotZ?: number; fy?: number; dy?: number };

/**
 * Телефон зі справжнім екраном «Громади» у 2.5D-камері.
 * Збільшення йде через CSS `zoom` (а не transform: scale) — так текстури
 * растеризуються вже на збільшеному розмірі й текст лишається різким
 * (video-shotcraft, aesthetic-rules Q2). Координати дітей — CSS px екрана 390×844.
 */
/**
 * Те, що iPhone малює поверх застосунку: смуга статусу (час, звʼязок, батарея),
 * «острівець» камери і нижня риска. Знімки мають безпечні зони (mk.py, верх 47 · низ 34),
 * тож застосунок сам лишає під це місце — як на справжньому телефоні (25.10, скарга Вови:
 * «скрін… зверху по кутах трішки обрізається… має бути геть як в телефоні»).
 */
export const IOSChrome: React.FC<{ dark?: boolean }> = ({ dark = false }) => {
  const c = dark ? '#111' : '#fff';
  return (
    <>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 47, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', left: 38, top: 15, fontFamily: '-apple-system, "Inter", sans-serif', fontWeight: 600, fontSize: 16.5, color: c, letterSpacing: '-0.01em' }}>9:41</div>
        <div style={{ position: 'absolute', left: 195 - 62, top: 11, width: 124, height: 36, borderRadius: 18, background: '#000' }} />
        <svg style={{ position: 'absolute', right: 30, top: 17 }} width="70" height="13" viewBox="0 0 70 13">
          {[0, 1, 2, 3].map((i) => <rect key={i} x={i * 5} y={10 - i * 3} width="3.4" height={3 + i * 3} rx="0.9" fill={c} />)}
          <path d="M30 4.3a8.6 8.6 0 0 1 11.6 0l-1.2 1.3a6.9 6.9 0 0 0-9.2 0zM32.4 6.8a5.2 5.2 0 0 1 6.8 0l-1.2 1.3a3.5 3.5 0 0 0-4.4 0zM34.6 9.4l1.2-1.2 1.2 1.2-1.2 1.3z" fill={c} />
          <rect x="46.5" y="1.5" width="20" height="10" rx="3" fill="none" stroke={c} strokeOpacity="0.45" />
          <rect x="48.3" y="3.3" width="14" height="6.4" rx="1.6" fill={c} />
          <rect x="67.6" y="4.8" width="1.6" height="3.6" rx="0.8" fill={c} fillOpacity="0.45" />
        </svg>
      </div>
      <div style={{ position: 'absolute', left: 195 - 67, bottom: 8, width: 134, height: 5, borderRadius: 3, background: '#111', opacity: 0.85 }} />
    </>
  );
};

export const Phone: React.FC<{ cam: Cam; children: React.ReactNode; shadow?: number; chrome?: boolean }> = ({ cam, children, shadow = 1, chrome = true }) => {
  const Z = PHONE_K * cam.z;
  const fy = cam.fy ?? 960;
  const tx = 540 / Z - cam.cx;
  const ty = fy / Z - cam.cy + (cam.dy ?? 0) / Z;
  return (
    <AbsoluteFill style={{ perspective: 2400, perspectiveOrigin: `540px ${fy}px` }}>
      <div
        style={{
          position: 'absolute', left: 0, top: 0, width: 390, height: 844, zoom: Z,
          transform: `translate(${tx}px, ${ty}px) rotateY(${cam.rotY ?? 0}deg) rotateX(${cam.rotX ?? 0}deg) rotateZ(${cam.rotZ ?? 0}deg)`,
          transformOrigin: `${cam.cx}px ${cam.cy}px`,
          transformStyle: 'preserve-3d',
        }}
      >
        {/* корпус */}
        <div style={{
          position: 'absolute', left: -11, top: -11, width: 412, height: 866, borderRadius: 60,
          background: 'linear-gradient(150deg, #3a3434 0%, #121011 40%, #050405 100%)',
          boxShadow: `0 ${30 * shadow}px ${70 * shadow}px rgba(30,10,14,${0.28 * shadow}), 0 ${8 * shadow}px ${18 * shadow}px rgba(30,10,14,${0.18 * shadow}), inset 0 0 0 1.2px rgba(255,255,255,0.14)`,
        }} />
        {/* екран */}
        <div style={{ position: 'absolute', left: 0, top: 0, width: 390, height: 844, borderRadius: 50, overflow: 'hidden', background: '#fff' }}>
          {children}
          {chrome ? <IOSChrome /> : null}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const Shot: React.FC<{ src: string; y?: number; h?: number; style?: React.CSSProperties }> = ({ src, y = 0, h = 844, style }) => (
  <Img src={tex(src)} style={{ position: 'absolute', left: 0, top: y, width: 390, height: h, ...style }} />
);

/** Підпис угорі кадру: біла плашка, бордовий квадратик — мова інтерфейсу «Громади». */
export const Caption: React.FC<{ text: string; from: number; dur: number; top?: number }> = ({ text, from, dur, top = 138 }) => {
  const f = useCurrentFrame() - from;
  if (f < 0 || f > dur) return null;
  const i = interpolate(f, [0, 10], [0, 1], { ...clamp, easing: Easing.bezier(0.25, 0.46, 0.45, 0.94) });
  const o = interpolate(f, [dur - 8, dur], [1, 0], clamp);
  return (
    <div style={{
      position: 'absolute', left: '50%', top, transform: `translate(-50%, ${(1 - i) * 14}px)`, opacity: i * o,
      display: 'flex', alignItems: 'center', gap: 18, padding: '22px 34px', borderRadius: 999,
      background: 'rgba(255,255,255,0.94)', boxShadow: '0 10px 34px rgba(42,37,32,0.16), 0 0 0 1px rgba(60,50,30,0.08)',
      fontFamily: T.sans, fontWeight: 600, fontSize: 40, color: T.ink, whiteSpace: 'nowrap', letterSpacing: '-0.005em',
    }}>
      <span style={{ width: 14, height: 14, borderRadius: 4, background: T.brandHi, flex: 'none' }} />
      {text}
    </div>
  );
};

/** Фон сцен із телефоном: фон застосунку + мʼяка бордова підсвітка. */
export const AppBackdrop: React.FC = () => (
  <AbsoluteFill style={{
    background: `radial-gradient(900px 700px at 50% 38%, rgba(255,255,255,0.9), rgba(255,255,255,0) 70%), radial-gradient(1200px 900px at 50% 110%, rgba(138,34,51,0.10), rgba(138,34,51,0) 70%), ${T.appBg}`,
  }} />
);

/** Титр-«подих» між розділами (paper-title-card, перебарвлений у токени «Громади»). */
export const TitleCard: React.FC<{ duration: number; words: { text: string; accent?: boolean }[]; sub?: string }> = ({ duration, words, sub }) => {
  const frame = useCurrentFrame();
  const fadeOut = interpolate(frame, [duration - 8, duration], [1, 0], clamp);
  const underline = interpolate(frame, [16, 34], [0, 1], { ...clamp, easing: Easing.bezier(0.3, 0, 0.2, 1) });
  const subT = interpolate(frame, [12, 24], [0, 1], clamp);
  return (
    <AbsoluteFill style={{
      justifyContent: 'center', alignItems: 'center', opacity: fadeOut,
      background: 'radial-gradient(900px 800px at 50% 45%, #ffffff, #F1F2F4 70%)',
    }}>
      <div style={{ textAlign: 'center', maxWidth: 940 }}>
        <div style={{
          fontFamily: T.display, fontSize: 112, fontWeight: 700, lineHeight: 1.1, color: T.ink, letterSpacing: '-0.025em',
          display: 'flex', flexWrap: 'wrap', justifyContent: 'center', columnGap: '0.24em',
        }}>
          {words.map((w, i) => {
            const d = 4 + i * 4;
            const t = interpolate(frame, [d, d + 9], [0, 1], { ...clamp, easing: Easing.bezier(0.2, 0.75, 0.3, 1) });
            return (
              <span key={i} style={{
                opacity: t, transform: `scale(${1.28 - 0.28 * t})`, filter: `blur(${(1 - t) * 7}px)`,
                display: 'inline-block', color: w.accent ? T.brandHi : undefined,
              }}>{w.text}</span>
            );
          })}
        </div>
        <div style={{ height: 8, width: 200, margin: '44px auto 0', borderRadius: 4, background: T.brandHi, transform: `scaleX(${underline})` }} />
        {sub ? (
          <div style={{ fontFamily: T.sans, fontWeight: 600, fontSize: 30, letterSpacing: '0.16em', color: T.inkSoft, marginTop: 36, opacity: subT, textTransform: 'uppercase' }}>{sub}</div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

/** М'яка двошарова тінь, що росте з висотою (спільна мова для всіх підйомів). */
export const liftShadow = (lift: number) =>
  `0 ${2 + 10 * lift}px ${6 + 26 * lift}px rgba(40,12,18,${0.10 + 0.14 * lift}), 0 ${1 + 30 * lift}px ${2 + 60 * lift}px rgba(40,12,18,${0.06 + 0.12 * lift})`;
