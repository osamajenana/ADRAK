import './index.css';
import { Composition } from 'remotion';
import { AdrakVideo, DURATION } from './adrak/Video';

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Adrak"
    component={AdrakVideo}
    durationInFrames={DURATION}
    fps={30}
    width={1920}
    height={1080}
  />
);
