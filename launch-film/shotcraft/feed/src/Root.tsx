import React from 'react';
import { Composition } from 'remotion';
import { FeedVid, FMT, TOTAL } from './FeedVid';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="FeedStory" component={FeedVid} durationInFrames={TOTAL} fps={30} width={FMT.story.W} height={FMT.story.H} defaultProps={{ fmt: 'story' as const }} />
    <Composition id="FeedPost" component={FeedVid} durationInFrames={TOTAL} fps={30} width={FMT.post.W} height={FMT.post.H} defaultProps={{ fmt: 'post' as const }} />
  </>
);
