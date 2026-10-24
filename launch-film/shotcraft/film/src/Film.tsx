import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import { TitleCard } from './kit';
import { SceneBoard, SceneBuses, SceneHome, SceneOpen, SceneOutro, SceneQuestions } from './scenes';

// ── ЄДИНЕ ДЖЕРЕЛО ЧАСУ. Субтитри, звуки й стики рахуються від нього. ──
export const SHOTS = {
  open: { from: 0, dur: 100 },
  home: { from: 100, dur: 165 },
  t1: { from: 265, dur: 55 },
  buses: { from: 320, dur: 150 },
  t2: { from: 470, dur: 55 },
  board: { from: 525, dur: 120 },
  qa: { from: 645, dur: 105 },
  outro: { from: 750, dur: 150 },
};
export const TOTAL = SHOTS.outro.from + SHOTS.outro.dur; // 900 кадрів = 30 с

const S = SHOTS;
type Sfx = { from: number; src: string; volume: number; dur?: number };
// Кожен рядок — під конкретну дію на екрані (video-shotcraft, sound-design).
export const SFX: Sfx[] = [
  { from: S.open.from + 4, src: 'transition-soft', volume: 0.35 },
  { from: S.open.from + 8, src: 'hit-weak', volume: 0.45 },           // знак лягає
  { from: S.open.from + 26, src: 'typewriter-hit-soft', volume: 0.3 }, // перша літера
  { from: S.open.from + 50, src: 'shimmer-sparkle-sweep', volume: 0.22, dur: 40 }, // лінія
  { from: S.home.from - 4, src: 'whoosh-big', volume: 0.45 },         // телефон виринає
  { from: S.home.from + 52, src: 'click-camera', volume: 0.4 },        // наїзд камери
  { from: S.home.from + 76, src: 'swoosh-quick', volume: 0.35 },       // капсули злітають
  { from: S.home.from + 132, src: 'switch-tap', volume: 0.3 },         // лягають на місце
  { from: S.t1.from, src: 'transition-soft', volume: 0.4 },
  { from: S.buses.from + 6, src: 'swoosh-slow', volume: 0.4, dur: 54 },  // розклад летить
  { from: S.buses.from + 58, src: 'hit-weak', volume: 0.55 },          // гальмо
  { from: S.buses.from + 66, src: 'click-camera', volume: 0.35 },
  { from: S.t2.from, src: 'transition-soft', volume: 0.4 },
  // стос оголошень: гучність сходинками, щоб не було «кулемета»
  { from: S.board.from + 34, src: 'paper-slide', volume: 0.40 },
  { from: S.board.from + 46, src: 'paper-move-quick', volume: 0.33 },
  { from: S.board.from + 58, src: 'paper-slide', volume: 0.27 },
  { from: S.board.from + 70, src: 'paper-move-quick', volume: 0.22 },
  { from: S.board.from + 80, src: 'pop', volume: 0.35 },              // кнопка «Подати»
  { from: S.qa.from, src: 'swoosh-quick', volume: 0.4 },               // свайп між вкладками
  { from: S.qa.from + 70, src: 'switch-tap', volume: 0.35 },           // натиск «Запитати»
  // фінал: riser → impact → sparkle
  { from: S.outro.from + 4, src: 'riser-cine', volume: 0.45, dur: 40 },
  { from: S.outro.from + 42, src: 'impact-cine-big', volume: 0.55, dur: 100 },
  { from: S.outro.from + 60, src: 'sparkle', volume: 0.35, dur: 80 },
];

export const Film: React.FC = () => (
  <AbsoluteFill style={{ background: '#000' }}>
    <Sequence from={S.open.from} durationInFrames={S.open.dur}><SceneOpen dur={S.open.dur} /></Sequence>
    <Sequence from={S.home.from} durationInFrames={S.home.dur}><SceneHome dur={S.home.dur} /></Sequence>
    <Sequence from={S.t1.from} durationInFrames={S.t1.dur}>
      <TitleCard duration={S.t1.dur} words={[{ text: 'Автобус' }, { text: '—' }, { text: 'без' }, { text: 'чекання.', accent: true }]} sub="розклад · у дорозі · скасовано" />
    </Sequence>
    <Sequence from={S.buses.from} durationInFrames={S.buses.dur}><SceneBuses dur={S.buses.dur} /></Sequence>
    <Sequence from={S.t2.from} durationInFrames={S.t2.dur}>
      <TitleCard duration={S.t2.dur} words={[{ text: 'Потрібне' }, { text: '—' }, { text: 'поруч.', accent: true }]} sub="дошка · питання · стрічка" />
    </Sequence>
    <Sequence from={S.board.from} durationInFrames={S.board.dur}><SceneBoard dur={S.board.dur} /></Sequence>
    <Sequence from={S.qa.from} durationInFrames={S.qa.dur}><SceneQuestions dur={S.qa.dur} /></Sequence>
    <Sequence from={S.outro.from} durationInFrames={S.outro.dur}><SceneOutro dur={S.outro.dur} /></Sequence>
    {SFX.map((s, i) => (
      <Sequence key={i} from={s.from} durationInFrames={s.dur ?? 60}>
        <Audio src={staticFile(`audio/${s.src}.mp3`)} volume={s.volume} />
      </Sequence>
    ))}
  </AbsoluteFill>
);
