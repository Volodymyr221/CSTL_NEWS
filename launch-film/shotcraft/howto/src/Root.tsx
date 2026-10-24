import React from 'react';
import { Composition } from 'remotion';
import { HowTo, TOTAL } from './HowTo';

export const RemotionRoot: React.FC = () => (
  <Composition id="HowTo" component={HowTo} durationInFrames={TOTAL} fps={30} width={1080} height={1920} />
);
