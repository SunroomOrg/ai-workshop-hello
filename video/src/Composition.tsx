import { Audio, interpolate, staticFile } from "remotion";
import { loadFont } from "@remotion/google-fonts/PressStart2P";
import { IntroScene } from "./scenes/IntroScene";

loadFont();

// Composition is 450 frames @ 30fps (15s). The baked WAV is 15.5s so the
// fade-out at frames 440-450 lands well before the file runs dry. Volume
// peaks at 0.6 so the chiptune sits under the visuals like a soundtrack
// rather than slamming the foreground.
export const XeosCapsuleIntro = () => {
  return (
    <>
      <Audio
        src={staticFile("chiptune.wav")}
        volume={(f) =>
          interpolate(f, [0, 10, 440, 450], [0, 0.6, 0.6, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
        }
      />
      <IntroScene />
    </>
  );
};
