import { cancelRender, continueRender, delayRender } from "remotion";
import { loadFont } from "@remotion/google-fonts/PressStart2P";

const { fontFamily, waitUntilDone } = loadFont();

const handle = delayRender("Loading Press Start 2P");
waitUntilDone()
  .then(() => continueRender(handle))
  .catch((err: unknown) => {
    cancelRender(err instanceof Error ? err : new Error(String(err)));
  });

/**
 * The actual loaded family name is `'Press Start TwoP'`. Use this stack
 * everywhere instead of the literal `"Press Start 2P"`.
 */
export const PIXEL_FONT_STACK = `"${fontFamily}", "Press Start 2P", system-ui, monospace`;
