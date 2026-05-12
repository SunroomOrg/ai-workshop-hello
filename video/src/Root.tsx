import { Composition } from "remotion";
import { XeosCapsuleIntro } from "./Composition";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="XeosCapsuleIntro"
      component={XeosCapsuleIntro}
      durationInFrames={450}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
