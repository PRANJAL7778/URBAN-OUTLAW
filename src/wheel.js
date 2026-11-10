/* Quick wheel for Urban Outlaw: an original circular menu (Map, Phone, Vehicles, Missions) drawn with SVG + canvas.
   It pauses the game while open, is opened from a small round HUD button and closes with the centre button, a tap outside, or Back.
   Pure DOM: it knows nothing about Three.js; main.js passes in an `api` object. */

const CSS = `
#uow{position:fixed;inset:0;z-index:1100;display:none;background:rgba(9,16,28,.58);font-family:Nunito,system-ui,-apple-system,sans-serif;color:#fff;-webkit-user-select:none;user-select:none;touch-action:manipulation}
#uow *{box-sizing:border-box}
#uow .ring{position:absolute;left:50%;top:50%;width:min(86vh,330px);height:min(86vh,330px);transform:translate(-50%,-50%)}
#uow .wedge{cursor:pointer}
#uow .wedge path.bg{fill:rgba(26,42,66,.92);stroke:rgba(255,255,255,.18);stroke-width:2;transition:fill .12s}
#uow .wedge:active path.bg,#uow .wedge.hot path.bg{fill:#1689ef}
#uow .wedge text{fill:#fff;font-weight:800;font-size:13px;text-anchor:middle;pointer-events:none}
#uow .wedge .ico{pointer-events:none;fill:none;stroke:#fff;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
#uow .hub{cursor:pointer}
#uow .hub circle{fill:rgba(14,24,40,.96);stroke:rgba(255,255,255,.3);stroke-width:2}
#uow .hub text{fill:#cfe3ff;font-weight:800;font-size:12px;text-anchor:middle;pointer-events:none}
#uow .panel{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(94vw,600px);max-height:min(94vh,372px);overflow:auto;background:rgba(18,30,48,.97);border:2px solid rgba(255,255,255,.18);border-radius:18px;padding:12px 14px;display:none;-webkit-overflow-scrolling:touch}
#uow .panel h2{margin:0 0 8px;font-size:17px;font-weight:900;display:flex;align-items:center;gap:8px}
#uow .panel h2 .back{margin-left:auto}
#uow button.b{font:800 13px Nunito,system-ui,sans-serif;color:#fff;background:#1689ef;border:0;border-radius:11px;padding:8px 13px;min-height:38px;box-shadow:0 3px 0 rgba(0,0,0,.3);touch-action:manipulation}
#uow button.b.g{background:#2fa84f}#uow button.b.o{background:#e8892b}#uow button.b.r{background:#c0392b}#uow button.b.d{background:#4a5568;color:#aab6c6}
#uow button.b:disabled{opacity:.5}
#uow .row{display:flex;gap:12px;align-items:flex-start}
#uow .card{background:rgba(255,255,255,.07);border-radius:12px;padding:9px 11px;margin-bottom:8px}
#uow .card .t{font-weight:900;font-size:14px}#uow .card .s{font-size:12px;color:#b9c8dc;margin:2px 0 6px}
#uow .leg{font-size:12px;line-height:1.7;color:#cfe0f5}
#uow .dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;vertical-align:-1px}
#uow canvas{border-radius:12px;border:2px solid rgba(255,255,255,.2);background:#7ccf7f;flex:none}
#uow .phone{width:228px;flex:none;background:#0d1522;border:3px solid #34445c;border-radius:26px;padding:10px 10px 12px;min-height:0}
#uow .phone .bar{display:flex;justify-content:space-between;font-size:11px;font-weight:800;color:#9fb4d0;padding:0 6px 6px}
#uow .apps{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:10px 4px}
#uow .app{text-align:center;font-size:11px;font-weight:800;color:#dbe8fa}
#uow .app i{display:block;width:46px;height:46px;border-radius:13px;margin:0 auto 4px;font-style:normal;font-size:22px;line-height:46px}
#uow .bub{background:#233752;border-radius:14px 14px 14px 4px;padding:7px 9px;font-size:11.5px;line-height:1.3;margin:4px 2px}
#uow .small{font-size:11px;color:#9fb4d0}
`;

/**
 * @param {{
 *  isPlaying:()=>boolean, onOpen:()=>void, onClose:()=>void,
 *  getInfo:()=>any, world:{half:number,colliders:{minX:number,maxX:number,minZ:number,maxZ:number}[],scale:number},
 *  actions:{startCourier:()=>void,abortCourier:()=>void,callVehicle:(k:string)=>string,switchVehicle:(k:string)=>string}
 * }} api
 */
export function createWheel(api) {
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const root = document.createElement('div'); root.id = 'uow';
  const R = 144, r = 60, C = 150, gap = 4;
  const pt = (/** @type {number} */ rad, /** @type {number} */ a) => [C + rad * Math.cos(a * Math.PI / 180), C + rad * Math.sin(a * Math.PI / 180)];
  const wedge = (/** @type {number} */ a0, /** @type {number} */ a1) => {
    const [x0, y0] = pt(R, a0 + gap), [x1, y1] = pt(R, a1 - gap), [x2, y2] = pt(r, a1 - gap), [x3, y3] = pt(r, a0 + gap);
    return `M${x0},${y0} A${R},${R} 0 0 1 ${x1},${y1} L${x2},${y2} A${r},${r} 0 0 0 ${x3},${y3} Z`;
  };
  const ICON = {
    map: '<path d="M-11 -8 L-4 -11 L4 -8 L11 -11 L11 8 L4 11 L-4 8 L-11 11 Z"/><path d="M-4 -11 V8 M4 -8 V11"/>',
    phone: '<rect x="-7" y="-12" width="14" height="24" rx="3"/><path d="M-2 8 H2"/>',
    vehicles: '<path d="M-13 3 L-10 -4 Q-9 -7 -5 -7 H5 Q9 -7 10 -4 L13 3 V7 H-13 Z"/><circle cx="-7" cy="8" r="3"/><circle cx="7" cy="8" r="3"/>',
    missions: '<path d="M-8 12 V-12 M-8 -11 H9 L5 -5 L9 1 H-8"/>',
  };
  const slots = [['map', 'Map', -135, -45], ['phone', 'Phone', -45, 45], ['vehicles', 'Vehicles', 45, 135], ['missions', 'Missions', 135, 225]];
  const wedges = slots.map(([k, label, a0, a1]) => {
    const mid = (/** @type {number} */ (a0) + /** @type {number} */ (a1)) / 2, [ix, iy] = pt(104, mid);
    return `<g class="wedge" data-k="${k}"><path class="bg" d="${wedge(/** @type {number} */ (a0), /** @type {number} */ (a1))}"/><g class="ico" transform="translate(${ix},${iy - 7})">${/** @type {any} */ (ICON)[/** @type {string} */ (k)]}</g><text x="${ix}" y="${iy + 20}">${label}</text></g>`;
  }).join('');
  root.innerHTML = `<div class="ring"><svg viewBox="0 0 300 300" width="100%" height="100%">${wedges}<g class="hub" data-k="close"><circle cx="150" cy="150" r="50"/><text x="150" y="146">QUICK</text><text x="150" y="162">WHEEL</text></g></svg></div><div class="panel" id="uow-panel"></div>`;
  document.body.appendChild(root);
  const panel = /** @type {HTMLElement} */ (root.querySelector('#uow-panel')), ring = /** @type {HTMLElement} */ (root.querySelector('.ring'));
  let openState = false, tab = '', phoneApp = '', note = '';

  const fmtT = (/** @type {number} */ t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const dist = (/** @type {any} */ a, /** @type {any} */ b) => Math.round(Math.hypot(a.x - b.x, a.z - b.z));

  function drawMap(/** @type {HTMLCanvasElement} */ cv, /** @type {any} */ info) {
    const g = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d')), S = cv.width, half = api.world.half + 4, sc = S / (half * 2);
    const X = (/** @type {number} */ x) => (x + half) * sc, Z = (/** @type {number} */ z) => (z + half) * sc, s = api.world.scale;
    g.fillStyle = '#7ccf7f'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#e9d9b0'; g.fillRect(X(-56), Z(-56), 112 * sc, 112 * sc); g.fillStyle = '#7ccf7f'; g.fillRect(X(-54), Z(-54), 108 * sc, 108 * sc);
    for (const bx of [-16, 16]) for (const bz of [-16, 16]) { g.fillStyle = bx === 16 && bz === 16 ? '#69c46f' : '#dfe5e6'; g.fillRect(X(bx * s - 12 * s), Z(bz * s - 12 * s), 24 * s * sc, 24 * s * sc); }
    g.fillStyle = '#4d5967'; for (const a of [-32, 0, 32]) { g.fillRect(X(a * s - 4), Z(-51), 8 * sc, 102 * sc); g.fillRect(X(-51), Z(a * s - 4), 102 * sc, 8 * sc); }
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.setLineDash([3, 4]); g.lineWidth = 1; for (const a of [-32, 0, 32]) { g.beginPath(); g.moveTo(X(a * s), Z(-51)); g.lineTo(X(a * s), Z(51)); g.moveTo(X(-51), Z(a * s)); g.lineTo(X(51), Z(a * s)); g.stroke(); } g.setLineDash([]);
    g.fillStyle = '#6aa8e8'; g.beginPath(); g.arc(X(16 * s), Z(16 * s), 2.2 * sc, 0, 7); g.fill();
    g.fillStyle = '#8a97a6'; for (const c of api.world.colliders) { const w = c.maxX - c.minX, d = c.maxZ - c.minZ; if (w * d > 14 && w < 60 && d < 60) g.fillRect(X(c.minX), Z(c.minZ), w * sc, d * sc); }
    const dot = (/** @type {number} */ x, /** @type {number} */ z, /** @type {string} */ col, /** @type {number} */ rad, /** @type {boolean} */ ring) => { g.beginPath(); g.arc(X(x), Z(z), rad, 0, 7); if (ring) { g.strokeStyle = col; g.lineWidth = 2.5; g.stroke(); } else { g.fillStyle = col; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke(); } };
    if (info.token) dot(info.token.x, info.token.z, '#ffca38', 3.5, false);
    for (const v of info.vehicles) { g.fillStyle = v.kind === 'car' ? '#2fa84f' : '#e8892b'; g.fillRect(X(v.x) - 4.5, Z(v.z) - 4.5, 9, 9); g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.strokeRect(X(v.x) - 4.5, Z(v.z) - 4.5, 9, 9); }
    if (info.objective) { dot(info.objective.x, info.objective.z, info.objective.color, 9, true); dot(info.objective.x, info.objective.z, info.objective.color, 3, false); }
    const p = info.player; g.save(); g.translate(X(p.x), Z(p.z)); g.rotate(Math.atan2(p.dz, p.dx)); g.fillStyle = '#ff3b6b'; g.strokeStyle = '#fff'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(8, 0); g.lineTo(-6, 5.5); g.lineTo(-3, 0); g.lineTo(-6, -5.5); g.closePath(); g.fill(); g.stroke(); g.restore();
  }

  function render() {
    const info = api.getInfo(); const back = '<button class="b d back" data-a="back">Back</button>';
    if (tab === 'map') {
      panel.innerHTML = `<h2>City map ${back}</h2><div class="row"><canvas id="uow-map" width="270" height="270"></canvas><div class="leg"><div><span class="dot" style="background:#ff3b6b"></span>You</div><div><span class="dot" style="background:#2fa84f;border-radius:2px"></span>Lamborghini</div><div><span class="dot" style="background:#e8892b;border-radius:2px"></span>Bobber</div><div><span class="dot" style="background:#ffca38"></span>Street token</div><div><span class="dot" style="background:${info.objective ? info.objective.color : '#38e8ff'}"></span>Objective</div><div class="card" style="margin-top:8px"><div class="t">${info.objective ? info.objective.title : 'No active mission'}</div><div class="s">${info.objective ? info.objective.text + ' · ' + dist(info.player, info.objective) + ' m away' : 'Enter a vehicle to start a delivery run, or take a job from your phone.'}</div></div></div></div>`;
      drawMap(/** @type {HTMLCanvasElement} */ (panel.querySelector('#uow-map')), info);
    } else if (tab === 'phone') {
      const st = `<div class="bar"><span>${fmtT(info.clock)}</span><span>▮▮▮ ▭</span></div>`;
      let body;
      if (!phoneApp) body = `<div class="apps"><div class="app" data-app="dispatch"><i style="background:#1689ef">✉</i>Dispatch</div><div class="app" data-app="garage"><i style="background:#2fa84f">🚗</i>Garage</div><div class="app" data-app="stats"><i style="background:#8e5bd6">★</i>Stats</div></div><div class="small" style="padding:6px">1 new message</div>`;
      else if (phoneApp === 'dispatch') {
        const c = info.courier; body = `<div class="bub"><b>Mara · Dispatch</b><br>Need a courier tonight. Grab the package at the fountain on foot, get it across town in a vehicle, then make the final run before they close the gates. ${c.reward} pts.</div>
        <div style="padding:2px 4px;display:flex;gap:8px">${c.state === 'idle' ? '<button class="b g" data-a="startCourier">Accept job</button>' : '<button class="b r" data-a="abortCourier">Drop the job</button>'}<button class="b d" data-app="">Home</button></div><div class="small" style="padding:4px 6px">${note}</div>`;
      } else if (phoneApp === 'garage') body = `<div style="padding:0 2px">${info.vehicles.map((/** @type {any} */ v) => `<div class="card"><div class="t">${v.name}</div><div class="s">${v.inUse ? 'You are using it' : v.distance + ' m away'}</div>${v.inUse ? '' : `<button class="b ${v.kind === 'car' ? 'g' : 'o'}" data-a="call:${v.kind}">Call to me</button>`}</div>`).join('')}<div class="small">${note}</div><button class="b d" data-app="">Home</button></div>`;
      else body = `<div style="padding:4px 8px;font-size:12px;line-height:1.8"><b>Score</b> ${info.score}<br><b>Best score</b> ${info.best}<br><b>Courier runs done</b> ${info.courier.done}<br><b>Best courier time</b> ${info.courier.best ? fmtT(info.courier.best) : '—'}</div><div style="padding:4px"><button class="b d" data-app="">Home</button></div>`;
      panel.innerHTML = `<h2>Phone ${back}</h2><div class="row"><div class="phone">${st}${body}</div><div class="leg" style="padding-top:6px">Your phone: take jobs from Dispatch, call a vehicle from the Garage, or check your stats.</div></div>`;
    } else if (tab === 'vehicles') {
      panel.innerHTML = `<h2>Vehicles ${back}</h2>${info.vehicles.map((/** @type {any} */ v) => `<div class="card"><div class="t"><span class="dot" style="background:${v.kind === 'car' ? '#2fa84f' : '#e8892b'}"></span>${v.name}</div><div class="s">${v.inUse ? 'Currently driving' : 'Parked ' + v.distance + ' m away'} · ${v.blurb}</div>${v.inUse ? '<span class="small">In use</span>' : `<button class="b ${v.kind === 'car' ? 'g' : 'o'}" data-a="${info.player.driving ? 'switch' : 'call'}:${v.kind}">${info.player.driving ? 'Switch to this' : 'Call to me'}</button>`}</div>`).join('')}<div class="small">${note}</div>`;
    } else if (tab === 'missions') {
      const d = info.delivery, c = info.courier;
      panel.innerHTML = `<h2>Missions ${back}</h2>
      <div class="card"><div class="t">Delivery Run <span class="small">· +${d.reward} pts</span></div><div class="s">Start any vehicle and reach the cyan checkpoint before the timer (${d.time} s) runs out. A new run begins automatically while you drive.</div><span class="small">${d.state === 'active' ? 'In progress · ' + Math.ceil(d.t) + ' s left' : 'Ready'}</span></div>
      <div class="card"><div class="t">Courier Run <span class="small">· +${c.reward} pts (100 + 300 + 400)</span></div><div class="s">1 Pick up the package at the fountain on foot · 2 Deliver it by vehicle within ${c.t2} s · 3 Make the final run within ${c.t3} s. Replay anytime.</div>
      <div class="small" style="margin-bottom:6px">${c.state === 'idle' ? 'Completed ' + c.done + '×' + (c.best ? ' · best ' + fmtT(c.best) : '') : 'Stage ' + c.stage + '/3 · ' + c.text}</div>${c.state === 'idle' ? '<button class="b g" data-a="startCourier">Start Courier Run</button>' : '<button class="b r" data-a="abortCourier">Abort</button>'}</div><div class="small">${note}</div>`;
    }
  }

  function show(/** @type {string} */ t) { tab = t; phoneApp = ''; note = ''; ring.style.display = t ? 'none' : ''; panel.style.display = t ? 'block' : 'none'; if (t) render(); }
  function open() { if (openState || !api.isPlaying()) return; openState = true; root.style.display = 'block'; show(''); api.onOpen(); }
  function close() { if (!openState) return; openState = false; root.style.display = 'none'; show(''); api.onClose(); }

  root.addEventListener('click', e => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (t === root) { close(); return; }
    const w = t.closest('[data-k]'); if (w) { const k = /** @type {HTMLElement} */ (w).dataset.k; if (k === 'close') close(); else show(/** @type {string} */ (k)); return; }
    const app = t.closest('[data-app]'); if (app) { phoneApp = /** @type {HTMLElement} */ (app).dataset.app || ''; note = ''; render(); return; }
    const b = t.closest('[data-a]'); if (!b) return; const a = /** @type {string} */ (/** @type {HTMLElement} */ (b).dataset.a);
    if (a === 'back') { show(''); return; }
    if (a === 'startCourier') { api.actions.startCourier(); close(); return; }
    if (a === 'abortCourier') { api.actions.abortCourier(); note = 'Job dropped.'; render(); return; }
    if (a.startsWith('call:')) { note = api.actions.callVehicle(a.slice(5)); render(); return; }
    if (a.startsWith('switch:')) { const m = api.actions.switchVehicle(a.slice(7)); if (m) { note = m; render(); } else close(); }
  });
  return { open, close, isOpen: () => openState, show };
}
