import React from 'react';
import { Composition } from 'remotion';
import { Film, TOTAL } from './Film';

export const RemotionRoot: React.FC = () => (
  <Composition id="Gromada" component={Film} durationInFrames={TOTAL} fps={30} width={1080} height={1920} />
);
