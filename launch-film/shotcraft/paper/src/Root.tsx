import React from 'react';
import { Composition } from 'remotion';
import { PaperFilm, TOTAL, W, H } from './Paper';

export const RemotionRoot: React.FC = () => (
  <Composition id="Paper" component={PaperFilm} durationInFrames={TOTAL} fps={30} width={W} height={H} />
);
