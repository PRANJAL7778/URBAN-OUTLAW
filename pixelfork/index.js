/* Pixelfork platform: one import for the game's code.
     import { defineConfig, startLoop, ASSETS, SCREEN, INPUT, AUDIO, HAPTICS, SAVE } from "../pixelfork/index.js";
   3D models: import { MODELS } from "../pixelfork/assets-3d.js"; */
export { defineConfig } from "./config.js";
export { startLoop } from "./loop.js";
export { ASSETS } from "./assets.js";
export { SCREEN } from "./screen.js";
export { INPUT } from "./input.js";
export { AUDIO } from "./audio.js";
export { HAPTICS } from "./haptics.js";
export { SAVE } from "./save.js";
