import React from 'react';
import { Composition } from 'remotion';
import { Teaser, TOTAL } from './Teaser';

export const RemotionRoot: React.FC = () => (
  <Composition id="Teaser" component={Teaser} durationInFrames={TOTAL} fps={30} width={1080} height={1920} defaultProps={{ bgm: true }} />
);
