/* Pixelfork screen (platform file: the AI reads it, never changes it).
   The game fills the screen; sharp on every phone without drawing more pixels than a phone can handle (pixel ratio up to 2).

     const view = SCREEN.canvas2d();          // 2D: a full-screen canvas; draw in CSS pixels: view.ctx, view.width, view.height
     SCREEN.onResize(({ width, height, dpr }) => renderer.setSize(width, height));   // 3D: size the three.js renderer
     SCREEN.safeArea()                        // the phone's notch and home bar: { top, right, bottom, left } in CSS pixels
*/
const MAX_DPR = 2;
/** @type {Array<(s: { width: number, height: number, dpr: number }) => void>} */ const subs = [];
const size = () => ({ width: innerWidth, height: innerHeight, dpr: Math.min(MAX_DPR, devicePixelRatio || 1) });
addEventListener("resize", () => { const s = size(); subs.forEach((f) => f(s)); });

export const SCREEN = {
  get width() { return innerWidth; },
  get height() { return innerHeight; },
  get dpr() { return Math.min(MAX_DPR, devicePixelRatio || 1); },
  /** @param {(s: { width: number, height: number, dpr: number }) => void} fn called now and on every resize */
  onResize(fn) { subs.push(fn); fn(size()); return () => { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); }; },
  /** a full-screen 2D canvas that stays sharp and sized; draw in CSS pixels */
  canvas2d() {
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;display:block;touch-action:none";
    (document.getElementById("game") || document.body).appendChild(canvas);
    const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
    const view = { canvas, ctx, width: 0, height: 0, dpr: 1 };
    SCREEN.onResize(({ width, height, dpr }) => {
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      view.width = width; view.height = height; view.dpr = dpr;
    });
    return view;
  },
  /** the notch and home bar, in CSS pixels */
  safeArea() {
    const p = document.createElement("div");
    p.style.cssText = "position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
    document.body.appendChild(p);
    const cs = getComputedStyle(p), r = { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
    p.remove();
    return r;
  },
};
