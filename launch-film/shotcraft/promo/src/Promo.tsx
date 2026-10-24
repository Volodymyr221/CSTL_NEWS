import React from 'react';
import { AbsoluteFill, Audio, Easing, Img, interpolate, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { Phone, Shot, T, clamp, kf } from './kit';

import { FPS, S, TOTAL, fr, at, segF } from './timing';
import { MapStory, Converge, FinalBrand } from './MapScenes';
import { Fmt, useSq } from './format';
export { TOTAL };
// Назва на екрані. У голосі Вови — «Castle Life», але застосунок з 04.10 — «Громада»
// (слово Вови 24.10: «додаток тепер Громада»), тож на екрані — назва застосунку.
export const BRAND = 'ГРОМАДА';
const outQuint = Easing.bezier(0.22, 1, 0.36, 1);
const apple = Easing.bezier(0.32, 0.72, 0, 1);

// Фото з повільним наїздом (Ken Burns), обрізане під вертикаль.
// ── Субтитри: фраза ділиться на рядки ≤ 34 символи, кожен показується у свій час ──
const Subtitles: React.FC = () => {
  const f = useCurrentFrame();
  const chunks: { text: string; from: number; to: number }[] = [];
  S.forEach((s) => {
    const words = s.text.split(' '); let line = ''; const lines: string[] = [];
    words.forEach((w) => { if ((line + ' ' + w).trim().length > 34) { lines.push(line.trim()); line = w; } else line += ' ' + w; });
    if (line.trim()) lines.push(line.trim());
    let pos = 0; const L = s.text.length;
    lines.forEach((ln) => {
      const a = s.start + (pos / L) * (s.end - s.start); pos += ln.length + 1;
      const b = s.start + (Math.min(pos, L) / L) * (s.end - s.start);
      chunks.push({ text: ln, from: fr(a), to: fr(b) + 6 });
    });
  });
  const c = chunks.find((k) => f >= k.from && f < k.to);
  if (!c) return null;
  const o = interpolate(f, [c.from, c.from + 4], [0, 1], clamp);
  return (
    <div style={{ position: 'absolute', left: 60, right: 60, bottom: 150, display: 'flex', justifyContent: 'center', opacity: o }}>
      <span style={{ fontFamily: T.sans, fontWeight: 600, fontSize: 44, lineHeight: 1.25, color: '#fff', background: 'rgba(20,6,10,0.62)', padding: '12px 26px', borderRadius: 16, textAlign: 'center' }}>{c.text}</span>
    </div>
  );
};

// ═══ Сцени ═══════════════════════════════════════════════════════════════
const Reveal: React.FC = () => {
  // 3: «Ми створили Castle Life.» — знак падає на назву
  const f = useCurrentFrame(); const s = segF(3);
  const hit = at(3, 'castle');
  const bg = interpolate(f, [s.from - 4, s.from + 6], [0, 1], clamp);
  const pre = interpolate(f, [s.from, hit], [0, 1], clamp);
  const slam = f < hit ? 0 : 1;
  const sc = f < hit ? 1.6 : interpolate(f, [hit, hit + 4, hit + 10], [1, 0.965, 1], { ...clamp, easing: Easing.bezier(0.2, 1.4, 0.4, 1) });
  const flash = interpolate(f, [hit, hit + 2, hit + 9], [0, 0.55, 0], clamp);
  return (
    <AbsoluteFill style={{ background: T.brandGrad, opacity: bg, justifyContent: 'center', alignItems: 'center', flexDirection: 'column' }}>
      <div style={{ fontFamily: T.display, fontWeight: 600, fontSize: 48, color: 'rgba(255,255,255,0.8)', marginBottom: 50, opacity: pre }}>Ми створили</div>
      <Img src={staticFile('textures/castle-icon.png')} style={{ width: 180, height: 225, opacity: slam, transform: `scale(${sc})`, filter: 'drop-shadow(0 16px 30px rgba(0,0,0,0.4))' }} />
      <div style={{ fontFamily: T.serif, fontWeight: 700, fontSize: 132, color: '#fff', letterSpacing: '0.06em', marginTop: 36, opacity: slam, transform: `scale(${sc})`, whiteSpace: 'nowrap' }}>{BRAND}</div>
      <AbsoluteFill style={{ background: '#fff', opacity: flash }} />
    </AbsoluteFill>
  );
};

const FEATURES = [
  { word: 'новини', label: 'Місцеві новини', shot: '01-gromada.png', cy: 560 },
  { word: 'оголошення', label: 'Оголошення', shot: '05-doshka.png', cy: 420 },
  { word: 'автобусів', label: 'Розклад автобусів', shot: '06-avtobusy.png', cy: 360 },
  { word: 'події', label: 'Події та інформація', shot: '03-strichka.png', cy: 420 },
];
const Features: React.FC = () => {
  // 4: «Тут ти можеш читати місцеві новини, переглядати оголошення, дізнаватися розклад автобусів, знаходити події та потрібну інформацію.»
  const f = useCurrentFrame(); const s = segF(4); const sq = useSq();
  const k = FEATURES.map((x) => at(4, x.word));
  const rise = Easing.bezier(0.16, 1, 0.3, 1);
  const cam = {
    z: sq ? kf(f, [[s.from - 8, 0.5], [k[0], 0.5], [k[0] + 18, 0.55]]) : kf(f, [[s.from - 8, 0.76], [k[0], 0.76], [k[0] + 18, 0.84]]),
    cx: 195, cy: 422, fy: sq ? 610 : 1000,
    rotX: kf(f, [[s.from - 8, 24], [s.from + 20, 4]], rise), rotY: kf(f, [[s.from - 8, -14], [s.from + 20, -4], [s.to, 3]], rise),
    dy: kf(f, [[s.from - 8, 1500], [s.from + 20, 0]], rise),
  };
  const end = segF(5).from;
  if (f < s.from - 10 || f > end) return null;
  return (
    <AbsoluteFill style={{ background: 'radial-gradient(1000px 900px at 50% 40%, #ffffff, #E6E8EC 75%)', opacity: interpolate(f, [end - 6, end], [1, 0], clamp) }}>
      <Phone cam={cam}>
        {FEATURES.map((x, i) => {
          const t = interpolate(f, [k[i], k[i] + 12], [0, 1], { ...clamp, easing: apple });
          if (i > 0 && f < k[i]) return null;
          return <div key={x.shot} style={{ position: 'absolute', inset: 0, transform: i === 0 ? undefined : `translateX(${(1 - t) * 390}px)` }}><Shot src={x.shot} /></div>;
        })}
      </Phone>
      {/* мітка поточної можливості */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: sq ? 40 : 150, display: 'flex', justifyContent: 'center' }}>
        {FEATURES.map((x, i) => {
          const a = k[i]; const t = interpolate(f, [a, a + 10], [0, 1], { ...clamp, easing: outQuint });
          const out = i < 3 ? interpolate(f, [k[i + 1] - 2, k[i + 1] + 6], [1, 0], clamp) : 1;
          if (f < a) return null;
          return (
            <div key={x.label} style={{ position: 'absolute', opacity: t * out, transform: `translateY(${(1 - t) * 20 - (1 - out) * 20}px)`, display: 'flex', alignItems: 'center', gap: 18, padding: '22px 38px', borderRadius: 999, background: T.brandGrad, color: '#fff', fontFamily: T.display, fontWeight: 700, fontSize: 52, boxShadow: '0 16px 40px rgba(74,18,28,0.35)', whiteSpace: 'nowrap' }}>
              <span style={{ fontFamily: T.sans, fontSize: 30, opacity: 0.75 }}>{i + 1}/4</span>{x.label}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

export const Promo: React.FC<{ voice?: string; square?: boolean }> = ({ voice = 'audio/voice-vova-norm.wav', square = false }) => {
  const sfx = [
    { f: segF(3).from - 10, src: 'air-woosh-quick', v: 0.25 },
    { f: at(3, 'castle'), src: 'impact-cine-big', v: 0.3, d: 70 },
    { f: segF(4).from - 8, src: 'whoosh-big', v: 0.25 },
    { f: at(6, 'castle'), src: 'shimmer-sparkle-sweep', v: 0.22, d: 70 },
    { f: segF(6).to, src: 'sparkle', v: 0.2, d: 70 },
  ];
  return (
    <Fmt.Provider value={{ sq: square }}>
    <AbsoluteFill style={{ background: '#000' }}>
      <MapStory />
      <ReveaLayer />
      <Features />
      <Converge />
      <FinalBrand brand={BRAND} />
      {/* субтитри прибрано на прохання Вови 24.10 — компонент Subtitles лишився, вмикається одним рядком */}
      <Audio src={staticFile(voice)} />
      {sfx.map((s, i) => <Sequence key={i} from={s.f} durationInFrames={s.d ?? 40}><Audio src={staticFile(`audio/${s.src}.mp3`)} volume={s.v} /></Sequence>)}
    </AbsoluteFill>
    </Fmt.Provider>
  );
};

// Сцена знака видима лише від фрази 3 до початку фрази 4.
const ReveaLayer: React.FC = () => {
  const f = useCurrentFrame();
  if (f < segF(3).from - 6 || f > segF(4).from + 2) return null;
  return <Reveal />;
};
