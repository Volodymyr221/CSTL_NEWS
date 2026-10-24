import React from 'react';
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { Phone, Shot, T, clamp, rand } from './kit';
import { at, segF, TOTAL } from './timing';
import { useSq, mapT, toMap } from './format';
import MAP from './map.json';

// ── ЖИВА КАРТА ГРОМАДИ ──────────────────────────────────────────────────────
// Точки — справжні координати 17 населених пунктів (data/settlements-geo.json,
// OpenStreetMap), спроєктовані на кадр. Лінії між ними — ЗВʼЯЗКИ, не дороги:
// реальної дорожньої мережі в проєкті немає, тож і малювати її не беремось.
type P = { name: string; x: number; y: number };
const PTS = MAP as P[];
const OLYKA = PTS.find((p) => p.name === 'Олика')!;
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
const HIDE_LABEL = new Set(['Горянівка', 'Залісоче']); // впритул до Олики — підписи злипаються

// Звʼязки: кожне село — з двома найближчими сусідами, без дублів.
const LINKS: [P, P][] = (() => {
  const seen = new Set<string>(); const out: [P, P][] = [];
  PTS.forEach((a) => {
    PTS.filter((b) => b !== a).sort((u, v) => dist(a, u) - dist(a, v)).slice(0, 2).forEach((b) => {
      const key = [a.name, b.name].sort().join('|');
      if (!seen.has(key)) { seen.add(key); out.push([a, b]); }
    });
  });
  return out.sort((l1, l2) => dist(OLYKA, l1[0]) + dist(OLYKA, l1[1]) - dist(OLYKA, l2[0]) - dist(OLYKA, l2[1]));
})();

const outQuint = Easing.bezier(0.22, 1, 0.36, 1);
const pop = Easing.bezier(0.34, 1.56, 0.64, 1);
const AV_COLORS = ['#7FD8C9', '#9B7BD4', '#F08A5D', '#6CC07A', '#E8B04B', '#6FA8DC', '#E07A9A'];

// Аватарки біля сіл — та сама форма, що в застосунку (кружок з ініціалом).
const PEOPLE = [
  { at: 'Дерно', l: 'Н' }, { at: 'Жорнище', l: 'С' }, { at: 'Метельне', l: 'О' }, { at: 'Покащів', l: 'А' },
  { at: 'Мощаниця', l: 'М' }, { at: 'Чемерин', l: 'Т' }, { at: 'Котів', l: 'І' },
];
const EVENTS = [
  { at: 'Ставок', t: 'Толока · сб' }, { at: 'Носовичі', t: 'Ярмарок · нд' }, { at: 'Одеради', t: 'Концерт · пт' },
];
// Картки новин стоять на вільних краях карти (не біля конкретного села) — інакше злипаються.
const NEWS = [
  { x: 70, y: 470, cat: 'ОЛИЦЬКА ГРОМАДА', t: 'Початок опалювального сезону' },
  { x: 720, y: 770, cat: 'ОГОЛОШЕННЯ', t: 'У середу не буде води' },
  { x: 80, y: 1420, cat: 'АВТОБУСИ', t: 'Новий рейс до Луцька' },
];
const pt = (name: string) => PTS.find((p) => p.name === name)!;

/** Кадри появи кожного шару — від слів у фразах 0 і 1. */
const cues = () => ({
  dots: at(0, 'олика'), people: at(1, 'люди'), streets: at(1, 'вулиці'), events: at(1, 'події'), news: at(1, 'новини'),
});

// Один шар карти; `fly` (0..1) — політ елементів у телефон (сцена «в одному місці»).
export const MapLayer: React.FC<{ fly?: number; target?: { x: number; y: number }; noise?: number; dim?: number; only?: 'dots' }> = ({ fly = 0, target = { x: 540, y: 980 }, noise = 0, dim = 0, only }) => {
  const f = useCurrentFrame(); const c = cues();
  const toward = (x: number, y: number, i: number) => {
    // кожен елемент летить зі своєю затримкою — політ читається як потік, а не як стрибок
    const t = Math.max(0, Math.min(1, fly * 1.6 - (i % 7) * 0.09));
    const e = Easing.bezier(0.55, 0, 0.7, 0.2)(t);
    return { x: x + (target.x - x) * e, y: y + (target.y - y) * e, s: 1 - 0.85 * e, o: 1 - interpolate(t, [0.8, 1], [0, 1], clamp) };
  };
  const jitter = (i: number) => noise * 6 * Math.sin(f * 0.9 + i * 1.7);
  return (
    <AbsoluteFill style={{ opacity: 1 - dim, filter: noise > 0 ? `blur(${noise * 10}px)` : undefined }}>
      {/* звʼязки */}
      {only ? null : (
        <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
          {LINKS.map(([a, b], i) => {
            const st = c.streets + i * 1.2;
            const t = interpolate(f, [st, st + 12], [0, 1], { ...clamp, easing: Easing.bezier(0.45, 0, 0.2, 1) });
            if (t <= 0) return null;
            const L = dist(a, b);
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(255,200,210,0.55)" strokeWidth={2.5} strokeLinecap="round" strokeDasharray={`${L} ${L}`} strokeDashoffset={L * (1 - t)} opacity={1 - fly} />;
          })}
        </svg>
      )}
      {/* села — хвиля від Олики назовні */}
      {PTS.map((p, i) => {
        const d0 = c.dots + 4 + dist(OLYKA, p) / 26;
        const t = interpolate(f, [d0, d0 + 10], [0, 1], { ...clamp, easing: pop });
        const isO = p === OLYKA;
        const pulse = isO ? (f % 45) / 45 : 0;
        const label = interpolate(f, [d0 + 6, d0 + 16], [0, 1], clamp);
        return (
          <React.Fragment key={p.name}>
            {isO ? <div style={{ position: 'absolute', left: p.x - 30, top: p.y - 30, width: 60, height: 60, borderRadius: 30, border: '2px solid rgba(255,214,222,0.7)', transform: `scale(${t * (1 + pulse * 1.6)})`, opacity: t * (1 - pulse) * (1 - fly) }} /> : null}
            <div style={{ position: 'absolute', left: p.x - (isO ? 13 : 8), top: p.y - (isO ? 13 : 8), width: isO ? 26 : 16, height: isO ? 26 : 16, borderRadius: 13, background: isO ? '#fff' : '#FFD4DC', boxShadow: `0 0 ${isO ? 26 : 14}px rgba(255,190,205,0.8)`, transform: `scale(${t})`, opacity: 1 - fly }} />
            {HIDE_LABEL.has(p.name) || only ? null : (
              <div style={{ position: 'absolute', left: p.x + (isO ? 22 : 16), top: p.y - 14, fontFamily: T.sans, fontWeight: isO ? 700 : 500, fontSize: isO ? 30 : 22, color: isO ? '#fff' : 'rgba(255,225,232,0.72)', opacity: label * (1 - fly), whiteSpace: 'nowrap', transform: isO && p.x > 760 ? 'translateX(-150px) translateY(32px)' : undefined }}>{p.name}</div>
            )}
          </React.Fragment>
        );
      })}
      {only ? null : (
        <>
          {/* люди */}
          {PEOPLE.map((q, i) => {
            const p = pt(q.at); const a = c.people + i * 2;
            const t = interpolate(f, [a, a + 10], [0, 1], { ...clamp, easing: pop });
            if (t <= 0) return null;
            const m = toward(p.x - 46, p.y - 58, i);
            return <div key={q.l + i} style={{ position: 'absolute', left: m.x - 28, top: m.y - 28 + jitter(i), width: 56, height: 56, borderRadius: 28, background: AV_COLORS[i % AV_COLORS.length], color: '#fff', fontFamily: T.display, fontWeight: 700, fontSize: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '3px solid #fff', boxShadow: '0 8px 20px rgba(0,0,0,0.35)', transform: `scale(${t * m.s})`, opacity: m.o }}>{q.l}</div>;
          })}
          {/* події */}
          {EVENTS.map((ev, i) => {
            const p = pt(ev.at); const a = c.events + i * 3;
            const t = interpolate(f, [a, a + 10], [0, 1], { ...clamp, easing: pop });
            if (t <= 0) return null;
            const m = toward(p.x + 10, p.y - 70, i + 3);
            return (
              <div key={ev.t} style={{ position: 'absolute', left: m.x - 20, top: m.y - 30 + jitter(i + 9), display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px 10px 12px', borderRadius: 18, background: T.brandHi, color: '#fff', fontFamily: T.sans, fontWeight: 600, fontSize: 24, boxShadow: '0 10px 24px rgba(0,0,0,0.35)', transform: `scale(${t * m.s})`, transformOrigin: '20px 100%', opacity: m.o, whiteSpace: 'nowrap' }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
                {ev.t}
              </div>
            );
          })}
          {/* новини */}
          {NEWS.map((n, i) => {
            const a = c.news + i * 3;
            const t = interpolate(f, [a, a + 12], [0, 1], { ...clamp, easing: outQuint });
            if (t <= 0) return null;
            const m = toward(n.x, n.y, i + 5);
            return (
              <div key={n.t} style={{ position: 'absolute', left: m.x, top: m.y + (1 - t) * 30 + jitter(i + 17), width: 310, padding: '16px 20px', borderRadius: 18, background: '#fff', boxShadow: '0 14px 34px rgba(0,0,0,0.4)', opacity: t * m.o, transform: `scale(${m.s})`, transformOrigin: '0 0' }}>
                <div style={{ fontFamily: T.sans, fontWeight: 700, fontSize: 16, letterSpacing: '0.12em', color: T.brandHi }}>{n.cat}</div>
                <div style={{ fontFamily: T.display, fontWeight: 700, fontSize: 26, lineHeight: 1.15, color: T.ink, marginTop: 6 }}>{n.t}</div>
              </div>
            );
          })}
        </>
      )}
    </AbsoluteFill>
  );
};

// ═══ Фрази 0–2: карта оживає, потім стає «шумом» і питанням ═══
export const MapStory: React.FC = () => {
  const f = useCurrentFrame(); const c = cues(); const sq = useSq();
  const s2 = segF(2), s3 = segF(3);
  if (f > s3.from + 4) return null;
  const head = interpolate(f, [c.dots, c.dots + 12], [0, 1], { ...clamp, easing: outQuint });
  const sub = interpolate(f, [at(0, 'не просто'), at(0, 'не просто') + 12], [0, 1], { ...clamp, easing: outQuint });
  const headOut = interpolate(f, [c.people - 8, c.people], [1, 0], clamp);
  const noise = interpolate(f, [s2.from, s2.from + 20], [0, 1], { ...clamp, easing: Easing.bezier(0.4, 0, 0.2, 1) });
  const q = interpolate(f, [at(2, 'як'), at(2, 'як') + 14], [0, 1], { ...clamp, easing: outQuint });
  const cam = interpolate(f, [0, s2.from], [1.0, 1.08], clamp);
  const kw = [['люди', c.people], ['вулиці', c.streets], ['події', c.events], ['новини', c.news]] as const;
  const fadeAll = interpolate(f, [s3.from - 6, s3.from + 4], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ background: T.brandGrad, opacity: fadeAll }}>
      <AbsoluteFill style={{ background: 'radial-gradient(700px 800px at 70% 55%, rgba(255,180,195,0.10), rgba(0,0,0,0) 70%)' }} />
      <AbsoluteFill style={{ transform: `scale(${cam})`, transformOrigin: sq ? '780px 640px' : '780px 1050px' }}>
        <div style={mapT(sq)}><MapLayer noise={noise} dim={noise * 0.55} /></div>
      </AbsoluteFill>
      {/* «Олика — не просто місце…» */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: sq ? 46 : 210, textAlign: 'center', opacity: headOut }}>
        <div style={{ fontFamily: T.serif, fontWeight: 700, fontSize: sq ? 112 : 150, color: '#fff', letterSpacing: '0.06em', opacity: head, transform: `translateY(${(1 - head) * 40}px)`, filter: `blur(${(1 - head) * 14}px)` }}>Олика</div>
        <div style={{ fontFamily: T.display, fontWeight: 600, fontSize: sq ? 38 : 50, color: 'rgba(255,255,255,0.88)', marginTop: sq ? 6 : 14, opacity: sub, transform: `translateY(${(1 - sub) * 14}px)` }}>не просто місце, де ми живемо</div>
      </div>
      {/* ключове слово фрази 1 — одне за раз, велике */}
      {kw.map(([w, a], i) => {
        const next = i < 3 ? kw[i + 1][1] : s2.from;
        const t = interpolate(f, [a, a + 9, next - 2, next + 4], [0, 1, 1, 0], clamp);
        if (t <= 0) return null;
        return <div key={w} style={{ position: 'absolute', left: 0, right: 0, top: sq ? 50 : 230, textAlign: 'center', fontFamily: T.display, fontWeight: 800, fontSize: sq ? 120 : 150, color: '#fff', letterSpacing: '-0.03em', opacity: t, transform: `translateY(${(1 - Math.min(1, t * 1.5)) * 50}px)`, filter: `blur(${(1 - t) * 12}px)` }}>{w}</div>;
      })}
      {/* питання поверх «шуму» */}
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: 80, opacity: q }}>
        <div style={{ textAlign: 'center', fontFamily: T.display, fontWeight: 800, fontSize: sq ? 86 : 104, lineHeight: 1.08, color: '#fff', letterSpacing: '-0.025em', transform: `translateY(${(1 - q) * 40}px)`, filter: `blur(${(1 - q) * 14}px)`, textShadow: '0 8px 40px rgba(0,0,0,0.5)' }}>
          Як бути в курсі<br />всього, що<br />відбувається<br /><span style={{ color: '#FFB9C4' }}>у громаді?</span>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ═══ Фраза 5: «Усе… — в одному місці» — усе з карти злітається в телефон ═══
export const Converge: React.FC = () => {
  const f = useCurrentFrame(); const s = segF(5); const s6 = segF(6); const sq = useSq();
  if (f < s.from - 10 || f > s6.from + 10) return null;
  const o = interpolate(f, [s.from - 10, s.from, s6.from, s6.from + 10], [0, 1, 1, 0], clamp);
  const fly = interpolate(f, [s.from + 4, at(5, 'в одному') + 6], [0, 1], { ...clamp, easing: Easing.linear });
  const ph = interpolate(f, [s.from - 6, s.from + 14], [0, 1], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) });
  const glow = interpolate(f, [at(5, 'в одному'), at(5, 'в одному') + 6, at(5, 'в одному') + 20], [0, 1, 0.3], clamp);
  const w = at(5, 'в одному');
  const t = interpolate(f, [w, w + 12], [0, 1], { ...clamp, easing: outQuint });
  return (
    <AbsoluteFill style={{ background: T.brandGrad, opacity: o }}>
      <AbsoluteFill style={{ opacity: 0.5 }}><div style={mapT(sq)}><MapLayer only="dots" /></div></AbsoluteFill>
      <Phone cam={{ z: sq ? 0.44 : 0.58, cx: 195, cy: 422, fy: sq ? 650 : 1080, dy: (1 - ph) * 900, rotX: 0, rotY: 0 }} shadow={1.4}>
        <Shot src="01-gromada.png" />
        <div style={{ position: 'absolute', inset: 0, borderRadius: 50, boxShadow: `inset 0 0 0 ${4 * glow}px rgba(255,210,220,${glow})` }} />
      </Phone>
      <div style={mapT(sq)}><MapLayer fly={fly} target={toMap(sq, 540, sq ? 650 : 1080)} /></div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: sq ? 34 : 170, textAlign: 'center', fontFamily: T.display, fontWeight: 800, fontSize: sq ? 72 : 104, lineHeight: 1.05, color: '#fff', letterSpacing: '-0.03em', opacity: t, transform: `translateY(${(1 - t) * 30}px)`, filter: `blur(${(1 - t) * 12}px)` }}>
        Усе —<br /><span style={{ color: '#FFB9C4' }}>в одному місці</span>
      </div>
    </AbsoluteFill>
  );
};

// ═══ Фраза 6: знак, слоган, адреса; на фоні — ледь видна та сама карта ═══
export const FinalBrand: React.FC<{ brand: string }> = ({ brand }) => {
  const f = useCurrentFrame(); const s = segF(6); const sq = useSq();
  if (f < s.from - 10) return null;
  const b = s.from + 2; const tag = at(6, 'твоя');
  const bg = interpolate(f, [s.from - 10, s.from], [0, 1], clamp);
  const lock = interpolate(f, [b, b + 10], [0, 1], { ...clamp, easing: Easing.bezier(0.2, 1.25, 0.3, 1) });
  const tg = interpolate(f, [tag, tag + 12], [0, 1], { ...clamp, easing: outQuint });
  const url = interpolate(f, [s.to, s.to + 12], [0, 1], { ...clamp, easing: outQuint });
  const end = interpolate(f, [TOTAL - 10, TOTAL], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ background: T.brandGrad, opacity: bg }}>
      <AbsoluteFill style={{ opacity: 0.22 }}><div style={mapT(sq)}><MapLayer only="dots" /></div></AbsoluteFill>
      {/* дрібний пил — детермінований */}
      {Array.from({ length: 18 }, (_, i) => {
        const x = 100 + rand(i * 5 + 1) * 880, y0 = 600 + rand(i * 5 + 2) * 900;
        return <div key={i} style={{ position: 'absolute', left: x, top: y0 - (f - s.from) * (0.4 + rand(i * 5 + 3)), width: 3, height: 3, borderRadius: 2, background: '#FFE3E8', opacity: 0.25 + 0.3 * Math.sin(f / 7 + i), boxShadow: '0 0 8px 2px rgba(255,200,215,0.5)' }} />;
      })}
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', flexDirection: 'column' }}>
        <Img src={staticFile('textures/castle-icon.png')} style={{ width: 150, height: 187, opacity: lock, transform: `scale(${1.3 - 0.3 * lock})`, filter: 'drop-shadow(0 14px 26px rgba(0,0,0,0.5))' }} />
        <div style={{ fontFamily: T.serif, fontWeight: 700, fontSize: 132, color: '#fff', letterSpacing: '0.1em', marginRight: '-0.1em', marginTop: 28, opacity: lock, transform: `scale(${1.15 - 0.15 * lock})`, whiteSpace: 'nowrap' }}>{brand}</div>
        <div style={{ width: 520, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.8)', marginTop: 34, transform: `scaleX(${tg})` }} />
        <div style={{ fontFamily: T.display, fontWeight: 700, fontSize: 58, color: '#fff', marginTop: 34, textAlign: 'center', lineHeight: 1.15, opacity: tg, transform: `translateY(${(1 - tg) * 16}px)` }}>Твоя громада<br />у твоєму смартфоні</div>
        <div style={{ fontFamily: T.sans, fontWeight: 600, fontSize: 46, color: 'rgba(255,255,255,0.92)', marginTop: 50, opacity: url, letterSpacing: '0.02em' }}>castlelife.org</div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: '#000', opacity: end }} />
    </AbsoluteFill>
  );
};
