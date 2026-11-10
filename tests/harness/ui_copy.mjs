/* Urban Outlaw — interface layer (HUD, main menu, dialogs, smartphone).
   Pure DOM, no framework and no external assets. main.js owns the game; this file only draws
   and reports intent through the callbacks passed to createUI(). */

const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  mission: '<svg viewBox="0 0 24 24"><path d="M6 3v18M6 4h11l-2 4 2 4H6"/></svg>',
  garage: '<svg viewBox="0 0 24 24"><path d="M3 20V9l9-5 9 5v11"/><path d="M7 20v-6h10v6"/></svg>',
  phone: '<svg viewBox="0 0 24 24"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10.5 18.5h3"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.6v.1"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
  map: '<svg viewBox="0 0 24 24"><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/></svg>',
  user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 21c1.2-4 4-6 7.5-6s6.3 2 7.5 6"/></svg>',
  contacts: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="3"/><circle cx="12" cy="10" r="2.6"/><path d="M8 17c.8-2 2.2-3 4-3s3.2 1 4 3"/></svg>',
  sound: '<svg viewBox="0 0 24 24"><path d="M4 10v4h3l4 3V7L7 10z"/><path d="M16 9a4 4 0 010 6"/></svg>',
  rotate: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1114 5"/><path d="M18 4v5h-5"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};
const $ = (/** @type {string} */ id) => /** @type {HTMLElement|null} */ (document.getElementById(id));

/** @param {any} handlers */
export function createUI(handlers) {
  const h = handlers;
  const root = document.createElement('div');
  root.id = 'uo-ui';

  root.innerHTML = `
  <!-- ============ HUD ============ -->
  <div class="uo-screen" id="uo-hud">
    <div class="uo-top">
      <div class="uo-badge"><span style="color:var(--uo-accent)">URBAN OUTLAW</span></div>
      <div class="uo-stats">
        <div class="uo-stat"><b id="uo-score">0</b><span>TOKENS</span></div>
        <div class="uo-stat"><b id="uo-best">0</b><span>BEST</span></div>
        <button class="uo-icon uo-hit" id="uo-pause" aria-label="Pause">${ICON.pause}</button>
      </div>
    </div>
    <div id="uo-mission"></div>
    <div id="uo-speed">0<small>KM/H</small></div>
    <div class="uo-bottom">
      <div id="uo-stick" class="hidden" aria-label="Move"><svg viewBox="0 0 128 128">
        <circle cx="64" cy="64" r="58" fill="rgba(255,255,255,.05)" stroke="rgba(255,255,255,.16)" stroke-width="1.5"/>
        <circle id="uo-knob" cx="64" cy="64" r="22"/></svg></div>
      <button class="uo-btn uo-hit round" id="uo-wheelbtn" aria-label="Quick wheel">
        <svg viewBox="-12 -12 24 24" width="22" height="22" style="fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round">
          <circle r="9"/><circle r="2.4" fill="currentColor"/><path d="M0 -9V-3M9 0H3M0 9V3M-9 0H-3"/></svg>
      </button>
      <div class="uo-actions">
        <button class="uo-btn uo-hit wide" id="uo-drive" hidden><span>DRIVE</span><small>E</small></button>
        <button class="uo-btn uo-hit" id="uo-brake" hidden><span>BRAKE</span><small>HOLD</small></button>
        <button class="uo-btn uo-hit round" id="uo-jump" aria-label="Jump"><span>JUMP</span></button>
        <button class="uo-btn uo-hit primary" id="uo-phone-btn"><span>PHONE</span><small>MAP · JOBS</small></button>
      </div>
    </div>
    <div id="uo-toast"></div>
    <div id="uo-rotate">${ICON.rotate}<span>ROTATE FOR THE FULL VIEW</span></div>
  </div>

  <!-- ============ MAIN MENU ============ -->
  <div class="uo-screen" id="uo-menu">
    <div class="uo-wrap">
      <div class="uo-brand">
        <div class="uo-kicker">Free roam · chapter one</div>
        <h1>Urban<em>Outlaw</em></h1>
        <div class="uo-tag">Ride the city on foot, in the supercar or on the bobber. Collect tokens, run deliveries, and stay moving.</div>
      </div>
      <div class="uo-menu-list">
        <button class="uo-item go" id="uo-play" disabled>
          <span class="ico">${ICON.play}</span><span class="lbl">Continue<span class="sub" id="uo-play-sub">loading world…</span></span>
        </button>
        <button class="uo-item" id="uo-newgame">
          <span class="ico">${ICON.plus}</span><span class="lbl">New Game<span class="sub">start a fresh run</span></span>
        </button>
        <button class="uo-item" id="uo-missions">
          <span class="ico">${ICON.mission}</span><span class="lbl">Missions<span class="sub">delivery &amp; courier jobs</span></span>
        </button>
        <button class="uo-item soon" id="uo-garage" disabled>
          <span class="ico">${ICON.garage}</span><span class="lbl">Garage</span><span class="chip">SOON</span>
        </button>
        <button class="uo-item" id="uo-phone-menu">
          <span class="ico">${ICON.phone}</span><span class="lbl">Smartphone<span class="sub">map, jobs, profile</span></span>
        </button>
        <button class="uo-item" id="uo-settings">
          <span class="ico">${ICON.gear}</span><span class="lbl">Settings<span class="sub">sound · camera · graphics</span></span>
        </button>
      </div>
    </div>
    <div class="uo-foot">
      <span><b>WASD</b> move · <b>Space</b> jump · <b>E</b> drive · <b>Q</b> wheel</span>
      <span id="uo-version">v3</span>
    </div>
    <div id="uo-boot-status" class="uo-boot" style="left:var(--uo-safe-l);right:auto"><span>Preparing city…</span></div>
  </div>

  <!-- ============ CREDITS ============ -->
  <div class="uo-screen" id="uo-credits">
    <div class="uo-wrap" style="grid-template-columns:1fr">
      <div class="uo-brand">
        <div class="uo-kicker">Credits</div>
        <h1 style="font-size:clamp(24px,4.6vw,40px)">Built with<br>Pixelfork</h1>
        <div class="uo-tag" style="max-width:62ch" id="uo-asset-status">Checking models…</div>
        <div class="uo-tag" style="max-width:62ch;font-size:11px;margin-top:12px">
          Character: “Casual Portrait Of A Man In A Black T‑Shirt” by restore50 · Motorcycle: “Harley‑Davidson Custom Bobber” by Tulio Portela.
          Both CC BY 4.0 — reduced detail, colours baked in, character rigged, motorcycle split into wheels and fork.
        </div>
        <div class="uo-menu-list" style="margin-top:16px;max-width:260px">
          <button class="uo-item" id="uo-credits-back"><span class="ico">${ICON.close}</span><span class="lbl">Back</span></button>
        </div>
        <div id="uo-diag" style="margin-top:12px;font:11px/1.4 ui-monospace,Menlo,monospace;color:#7f93ab;white-space:pre-wrap;max-height:120px;overflow:auto"></div>
      </div>
    </div>
  </div>

  <!-- ============ DIALOGS ============ -->
  <div class="uo-dialog-root" id="uo-paused">
    <div class="uo-dialog">
      <h2>Paused</h2>
      <button class="uo-btnline" id="uo-resume"><span class="lbl">Resume</span></button>
      <button class="uo-btnline" id="uo-pause-settings"><span class="lbl">Settings</span></button>
      <button class="uo-btnline" id="uo-restart"><span class="lbl">Restart run</span></button>
      <button class="uo-btnline warn" id="uo-main-menu"><span class="lbl">Main menu</span></button>
    </div>
  </div>

  <div class="uo-dialog-root" id="uo-options">
    <div class="uo-dialog">
      <h2>Settings</h2>
      <div class="uo-set"><span class="k">Sound</span><button class="uo-switch" id="uo-sound"><i></i></button></div>
      <div class="uo-set"><span class="k">Vibration</span><button class="uo-switch" id="uo-vibration"><i></i></button></div>
      <div class="uo-set"><span class="k">Camera sensitivity<i>drag to look around</i></span>
        <span class="uo-range"><input type="range" id="uo-sensitivity" min="20" max="100" step="5" value="100"><b id="uo-sensitivity-val">100%</b></span></div>
      <div class="uo-set"><span class="k">Graphics<i>lower this on a slow phone</i></span>
        <span class="uo-seg" id="uo-quality"><button data-q="auto" class="on">AUTO</button><button data-q="low">LOW</button><button data-q="high">HIGH</button></span></div>
      <div class="row"><button class="uo-btnline" id="uo-options-back" style="width:auto;padding:0 18px">Back</button></div>
    </div>
  </div>

  <div class="uo-dialog-root" id="uo-confirm">
    <div class="uo-dialog">
      <h2 id="uo-confirm-title">New game</h2>
      <p id="uo-confirm-text">Start a fresh run? Your best score and courier records stay saved.</p>
      <div class="row">
        <button class="uo-btnline" id="uo-confirm-no" style="width:auto;padding:0 18px">Cancel</button>
        <button class="uo-btnline warn" id="uo-confirm-yes" style="width:auto;padding:0 18px">Start</button>
      </div>
    </div>
  </div>

  <!-- ============ SMARTPHONE ============ -->
  <div id="uo-phone">
    <div class="uo-phone-body">
      <div class="uo-phone-status">
        <span id="uo-phone-clock">--:--</span>
        <span class="sig"><span id="uo-phone-net">UO · 5G</span><span class="bat"></span></span>
      </div>
      <div class="uo-phone-main">
        <div class="uo-phone-dock" id="uo-phone-dock"></div>
        <div class="uo-phone-pane" id="uo-phone-pane"></div>
      </div>
      <button class="uo-close" id="uo-phone-close" aria-label="Close phone">✕</button>
    </div>
  </div>
  `;

  document.body.appendChild(root);

  /* ---------------- element handles ---------------- */
  const el = {
    hud: $('uo-hud'), menu: $('uo-menu'), credits: $('uo-credits'),
    score: $('uo-score'), best: $('uo-best'), mission: $('uo-mission'), speed: $('uo-speed'),
    toast: $('uo-toast'), stick: $('uo-stick'), knob: $('uo-knob'),
    drive: $('uo-drive'), brake: $('uo-brake'), jump: $('uo-jump'), phoneBtn: $('uo-phone-btn'),
    play: $('uo-play'), playSub: $('uo-play-sub'), boot: $('uo-boot-status'),
    paused: $('uo-paused'), options: $('uo-options'), confirm: $('uo-confirm'),
    phone: $('uo-phone'), dock: $('uo-phone-dock'), pane: $('uo-phone-pane'),
    rotate: $('uo-rotate'), sensitivity: $('uo-sensitivity'), sensVal: $('uo-sensitivity-val'),
    quality: $('uo-quality'), sound: $('uo-sound'), vibration: $('uo-vibration'),
  };

  let screen = 'menu';
  let phoneOpen = false;
  let phoneApp = 'home';
  let ready = false;
  let hasSave = false;
  let goalVisible = false;
  let brakeVisible = false;
  let jumpVisible = false;
  let driveLabel = '';
  let toastTimer = 0;
  let confirmCb = /** @type {null|(() => void)} */ (null);

  /* ---------------- helpers ---------------- */
  const show = (/** @type {HTMLElement|null} */ node, /** @type {boolean} */ on) => {
    if (!node) return;
    if (on) node.classList.add('on'); else node.classList.remove('on');
  };
  const setText = (/** @type {HTMLElement|null} */ node, /** @type {string} */ text) => {
    if (node && node.textContent !== text) node.textContent = text;
  };

  /* ---------------- screens ---------------- */
  function showScreen(/** @type {'menu'|'hud'|'credits'|'none'} */ name) {
    screen = name;
    show(el.menu, name === 'menu');
    show(el.hud, name === 'hud');
    show(el.credits, name === 'credits');
    if (name !== 'hud') { el.drive.hidden = true; el.brake.hidden = true; el.speed.style.display = 'none'; el.mission.style.display = 'none'; }
    el.stick.classList.toggle('hidden', name !== 'hud');
    updateRotateHint();
  }

  function updateRotateHint() {
    const portrait = window.matchMedia('(orientation: portrait)').matches;
    show(el.rotate, portrait && (screen === 'hud' || screen === 'menu'));
  }
  window.addEventListener('resize', updateRotateHint);
  window.addEventListener('orientationchange', updateRotateHint);

  /* ---------------- menu wiring ---------------- */
  el.play?.addEventListener('click', () => { if (!ready || !hasSave) return; h.onContinue?.(); });
  $('uo-newgame')?.addEventListener('click', () => {
    confirmCb = () => h.onNewGame?.();
    show(el.confirm, true);
  });
  $('uo-missions')?.addEventListener('click', () => h.onMissions?.());
  $('uo-phone-menu')?.addEventListener('click', () => { h.onPhoneMenu?.(); openPhone('home'); });
  $('uo-settings')?.addEventListener('click', () => { syncSettings(); show(el.options, true); h.onOptions?.(); });
  $('uo-credits-button')?.addEventListener('click', () => h.onCredits?.());
  $('uo-credits-back')?.addEventListener('click', () => showScreen('menu'));

  /* ---------------- pause dialog ---------------- */
  $('uo-resume')?.addEventListener('click', () => { show(el.paused, false); h.onResume?.(); });
  $('uo-pause-settings')?.addEventListener('click', () => { syncSettings(); show(el.options, true); });
  $('uo-restart')?.addEventListener('click', () => { show(el.paused, false); h.onRestart?.(); });
  $('uo-main-menu')?.addEventListener('click', () => { show(el.paused, false); h.onQuit?.(); });
  el.paused?.addEventListener('pointerdown', (e) => { if (e.target === el.paused) { show(el.paused, false); h.onResume?.(); } });

  /* ---------------- settings ---------------- */
  const toggle = (/** @type {HTMLElement|null} */ node, /** @type {boolean} */ on) => node?.classList.toggle('on', on);
  el.sound?.addEventListener('click', () => {
    const on = !el.sound.classList.contains('on');
    toggle(el.sound, on); h.onSound?.(on);
  });
  el.vibration?.addEventListener('click', () => {
    const on = !el.vibration.classList.contains('on');
    toggle(el.vibration, on); h.onVibration?.(on);
  });
  el.sensitivity?.addEventListener('input', () => {
    const v = Number(/** @type {HTMLInputElement} */ (el.sensitivity).value);
    setText(el.sensVal, v + '%');
    h.onSensitivity?.(v);
  });
  el.quality?.addEventListener('click', (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('button[data-q]');
    if (!b) return;
    for (const n of el.quality.querySelectorAll('button')) n.classList.toggle('on', n === b);
    h.onQuality?.(/** @type {string} */ (b.getAttribute('data-q')));
  });
  $('uo-options-back')?.addEventListener('click', () => { show(el.options, false); h.onOptionsClose?.(); });
  el.options?.addEventListener('pointerdown', (e) => { if (e.target === el.options) show(el.options, false); });

  $('uo-confirm-yes')?.addEventListener('click', () => { show(el.confirm, false); confirmCb?.(); confirmCb = null; });
  $('uo-confirm-no')?.addEventListener('click', () => { show(el.confirm, false); confirmCb = null; });

  function syncSettings() {
    toggle(el.sound, h.getSetting?.('sound') !== false);
    toggle(el.vibration, h.getSetting?.('vibration') !== false);
    const sens = Number(h.getSetting?.('sensitivity') ?? 100);
    if (el.sensitivity) /** @type {HTMLInputElement} */ (el.sensitivity).value = String(sens);
    setText(el.sensVal, sens + '%');
    const q = String(h.getSetting?.('quality') ?? 'auto');
    for (const n of el.quality?.querySelectorAll('button') ?? []) n.classList.toggle('on', n.getAttribute('data-q') === q);
  }

  /* ---------------- HUD ---------------- */
  function toast(/** @type {string} */ text, /** @type {number} */ ms = 2200) {
    if (!el.toast) return;
    el.toast.textContent = text;
    el.toast.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => el.toast.classList.remove('on'), ms);
  }

  /* ---------------- the phone ---------------- */
  const APPS = [
    { id: 'map', label: 'Map', icon: ICON.map },
    { id: 'missions', label: 'Missions', icon: ICON.mission },
    { id: 'contacts', label: 'Contacts', icon: ICON.contacts, soon: true },
    { id: 'garage', label: 'Garage', icon: ICON.garage, soon: true },
    { id: 'settings', label: 'Settings', icon: ICON.gear },
    { id: 'profile', label: 'Profile', icon: ICON.user },
  ];
  el.dock.innerHTML = APPS.map((a) => `
    <button class="uo-app-btn" data-app="${a.id}">
      ${a.icon}<span>${a.label}</span>${a.soon ? '<span class="chip">SOON</span>' : ''}
    </button>`).join('');
  el.dock.addEventListener('click', (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('button[data-app]');
    if (!b) return;
    const app = APPS.find((a) => a.id === b.getAttribute('data-app'));
    if (!app) return;
    if (app.soon) { renderPhone('soon', app); return; }
    renderPhone(app.id, app);
  });
  $('uo-phone-close')?.addEventListener('click', () => closePhone());
  el.phone?.addEventListener('pointerdown', (e) => { if (e.target === el.phone) closePhone(); });

  function renderPhone(/** @type {string} */ id, /** @type {any} */ app) {
    phoneApp = id;
    for (const n of el.dock.querySelectorAll('button[data-app]')) n.classList.toggle('on', n.getAttribute('data-app') === id);
    const info = h.getInfo?.() || {};
    const setMarkup = (/** @type {string} */ html) => { el.pane.innerHTML = html; };
    if (id === 'map') {
      setMarkup(`
        <h3>City map</h3><div class="meta">${info.player?.driving ? 'On the road' : 'On foot'} · live position</div>
        <div class="uo-mapwrap">
          <canvas id="uo-map" width="640" height="560"></canvas>
          <div class="uo-list">
            <div class="uo-card"><div class="t">Objective</div><div class="s" id="uo-map-obj">${info.objective ? info.objective.title : 'Free roam'}</div></div>
            <div class="uo-card"><div class="t">Tokens</div><div class="v">${info.score ?? 0}</div><div class="s">next token marked</div></div>
            ${(info.vehicles || []).map((/** @type {any} */ v) => `<div class="uo-listrow"><span class="dot" style="background:${v.kind === 'bike' ? '#ffb13a' : '#46f0a0'}"></span><span class="who">${v.name}</span><span class="what">${v.distance} m${v.inUse ? ' · in use' : ''}</span></div>`).join('')}
          </div>
        </div>`);
      drawMap(info);
    } else if (id === 'missions') {
      const c = info.courier || {}, d = info.delivery || {};
      setMarkup(`
        <h3>Jobs</h3><div class="meta">Deliveries and courier runs</div>
        <div class="uo-card" style="margin-bottom:8px">
          <div class="t">Courier run</div>
          <div class="s">${c.state === 'active' ? `Stage ${c.stage}/3 · ${c.text}` : `Three-leg package run · ${c.reward} tokens · records ${c.done} done${c.best ? `, best ${c.best}s` : ''}`}</div>
          <div style="display:flex;gap:8px;margin-top:8px">
            ${c.state === 'active'
              ? '<button class="uo-btnline warn" id="uo-abort-job" style="width:auto;padding:0 14px;height:38px">Drop job</button>'
              : '<button class="uo-btnline" id="uo-start-job" style="width:auto;padding:0 14px;height:38px;background:rgba(255,106,31,.18);border-color:rgba(255,106,31,.45)">Start courier</button>'}
          </div>
        </div>
        <div class="uo-card">
          <div class="t">Delivery run</div>
          <div class="s">${d.state === 'active' ? `Checkpoint ${info.objective ? Math.round(Math.hypot((info.objective.x ?? 0) - (info.player?.x ?? 0), (info.objective.z ?? 0) - (info.player?.z ?? 0))) : '?'} m · ${Math.ceil(d.t ?? 0)} s left` : `Reach checkpoints while driving · ${d.reward || 0} tokens · ${d.time || 0}s limit`}</div>
        </div>
        <div class="uo-card" style="margin-top:8px"><div class="t">Coming soon</div><div class="s">Story contracts and side jobs arrive in a later build.</div></div>`);
      $('uo-start-job')?.addEventListener('click', () => { h.onStartCourier?.(); closePhone(); });
      $('uo-abort-job')?.addEventListener('click', () => { h.onAbortCourier?.(); renderPhone('missions'); });
    } else if (id === 'soon') {
      setMarkup(`<h3>${app?.label || 'App'}</h3><div class="meta">Not in this build</div>
        <div class="uo-card"><div class="t">Coming soon</div><div class="s">This app is planned but has no working feature yet, so it stays switched off instead of shipping something broken.</div></div>`);
    } else if (id === 'garage') {
      setMarkup(`<h3>Garage</h3><div class="meta">Vehicle collection</div>
        ${(info.vehicles || []).map((/** @type {any} */ v) => `<div class="uo-card" style="margin-bottom:8px"><div class="t">${v.name}</div><div class="s">${v.blurb || ''} · ${v.distance} m away</div></div>`).join('')}
        <div class="uo-card"><div class="t">Coming soon</div><div class="s">Buying, tuning and paint will be added later.</div></div>`);
    } else if (id === 'settings') {
      setMarkup(`
        <h3>Settings</h3><div class="meta">Same options as the pause menu</div>
        <div class="uo-set"><span class="k">Sound</span><button class="uo-switch" id="uo-psound"><i></i></button></div>
        <div class="uo-set"><span class="k">Vibration</span><button class="uo-switch" id="uo-pvib"><i></i></button></div>
        <div class="uo-set"><span class="k">Camera sensitivity</span>
          <span class="uo-range"><input type="range" id="uo-psens" min="20" max="100" step="5"><b id="uo-psens-val">100%</b></span></div>
        <div class="uo-set"><span class="k">Graphics</span>
          <span class="uo-seg" id="uo-pquality"><button data-q="auto">AUTO</button><button data-q="low">LOW</button><button data-q="high">HIGH</button></span></div>`);
      const ps = /** @type {HTMLInputElement|null} */ ($('uo-psens'));
      const sens = Number(h.getSetting?.('sensitivity') ?? 100);
      if (ps) ps.value = String(sens);
      setText($('uo-psens-val'), sens + '%');
      toggle($('uo-psound'), h.getSetting?.('sound') !== false);
      toggle($('uo-pvib'), h.getSetting?.('vibration') !== false);
      const q = String(h.getSetting?.('quality') ?? 'auto');
      for (const n of $('uo-pquality')?.querySelectorAll('button') ?? []) n.classList.toggle('on', n.getAttribute('data-q') === q);
      $('uo-psound')?.addEventListener('click', () => {
        const on = !$('uo-psound')?.classList.contains('on');
        toggle($('uo-psound'), on); toggle(el.sound, on); h.onSound?.(on);
      });
      $('uo-pvib')?.addEventListener('click', () => {
        const on = !$('uo-pvib')?.classList.contains('on');
        toggle($('uo-pvib'), on); toggle(el.vibration, on); h.onVibration?.(on);
      });
      ps?.addEventListener('input', () => {
        const v = Number(ps.value);
        setText($('uo-psens-val'), v + '%');
        if (el.sensitivity) /** @type {HTMLInputElement} */ (el.sensitivity).value = String(v);
        setText(el.sensVal, v + '%');
        h.onSensitivity?.(v);
      });
      $('uo-pquality')?.addEventListener('click', (e) => {
        const b = /** @type {HTMLElement} */ (e.target).closest('button[data-q]');
        if (!b) return;
        for (const n of $('uo-pquality').querySelectorAll('button')) n.classList.toggle('on', n === b);
        h.onQuality?.(/** @type {string} */ (b.getAttribute('data-q')));
      });
    } else if (id === 'profile') {
      const c = info.courier || {};
      setMarkup(`
        <h3>Profile</h3><div class="meta">Your run so far</div>
        <div class="grid2">
          <div class="uo-card"><div class="t">Tokens this run</div><div class="v">${info.score ?? 0}</div></div>
          <div class="uo-card"><div class="t">Best score</div><div class="v">${info.best ?? 0}</div></div>
          <div class="uo-card"><div class="t">Courier runs</div><div class="v">${c.done ?? 0}</div><div class="s">${c.best ? `best ${c.best}s` : 'no record yet'}</div></div>
          <div class="uo-card"><div class="t">Session</div><div class="v">${Math.floor((info.clock ?? 0) / 60)}:${String(Math.floor((info.clock ?? 0) % 60)).padStart(2, '0')}</div><div class="s">minutes:seconds</div></div>
        </div>`);
    } else {
      setMarkup(`
        <h3>Urban Outlaw</h3><div class="meta">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        <div class="grid2">
          <div class="uo-card"><div class="t">Tokens</div><div class="v">${info.score ?? 0}</div></div>
          <div class="uo-card"><div class="t">Best</div><div class="v">${info.best ?? 0}</div></div>
        </div>
        <div class="uo-card" style="margin-top:8px"><div class="t">Tip</div><div class="s">Swipe the screen to look around. Press PHONE any time to check the map.</div></div>`);
    }
    if (id === 'map') {
      // keep the map ticking while it is open
      window.clearInterval(mapTimer);
      mapTimer = window.setInterval(() => { if (phoneOpen && phoneApp === 'map') drawMap(h.getInfo?.() || {}); }, 400);
    } else { window.clearInterval(mapTimer); }
  }

  let mapTimer = 0;
  function drawMap(/** @type {any} */ info) {
    const cv = /** @type {HTMLCanvasElement|null} */ ($('uo-map'));
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const W = cv.width, H = cv.height, half = info.half || 55;
    const sx = (/** @type {number} */ x) => (x / half * 0.5 + 0.5) * W;
    const sz = (/** @type {number} */ z) => (z / half * 0.5 + 0.5) * H;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0b1220'; ctx.fillRect(0, 0, W, H);
    // roads
    ctx.fillStyle = '#16202f';
    const scale = info.scale || 8;
    for (const r of [-4, 0, 4]) {
      ctx.fillRect(sx(r * scale - 3.2), 0, sx(6.4) - sx(0), H);
      ctx.fillRect(0, sz(r * scale - 3.2), W, sz(6.4) - sz(0));
    }
    // blocks
    ctx.fillStyle = '#1e2a3b';
    for (const b of info.colliders || []) {
      const x = sx(b.minX), z = sz(b.minZ), w = sx(b.maxX) - x, h = sz(b.maxZ) - z;
      if (w > 0.5 && h > 0.5) ctx.fillRect(x, z, w, h);
    }
    // objective
    const o = info.objective || info.token;
    if (o && typeof o.x === 'number') {
      ctx.strokeStyle = info.objective ? (info.objective.color || '#38e8ff') : '#ffc44d';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(sx(o.x), sz(o.z), 9, 0, Math.PI * 2); ctx.stroke();
    }
    // vehicles
    for (const v of info.vehicles || []) {
      ctx.fillStyle = v.inUse ? '#ffffff' : v.kind === 'bike' ? '#ffb13a' : '#46f0a0';
      ctx.beginPath(); ctx.arc(sx(v.x), sz(v.z), 5, 0, Math.PI * 2); ctx.fill();
    }
    // player arrow
    const p = info.player || { x: 0, z: 0, dx: 0, dz: 1 };
    ctx.save();
    ctx.translate(sx(p.x), sz(p.z));
    ctx.rotate(Math.atan2(p.dx, p.dz));
    ctx.fillStyle = '#ff6a1f';
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7, 7); ctx.lineTo(0, 3); ctx.lineTo(-7, 7); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function openPhone(/** @type {string} */ app = 'home') {
    phoneOpen = true;
    show(el.phone, true);
    renderPhone(app, APPS.find((a) => a.id === app));
    setText($('uo-phone-clock'), new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    h.onPhoneOpen?.();
  }
  function closePhone() {
    if (!phoneOpen) return;
    phoneOpen = false;
    show(el.phone, false);
    window.clearInterval(mapTimer);
    h.onPhoneClose?.();
  }

  /* ---------------- keyboard shortcuts while menus are up ---------------- */
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (phoneOpen) { closePhone(); e.preventDefault(); return; }
    if (el.options?.classList.contains('on')) { show(el.options, false); e.preventDefault(); return; }
    if (el.confirm?.classList.contains('on')) { show(el.confirm, false); confirmCb = null; e.preventDefault(); }
  });

  /* ---------------- public API (SC-compatible helpers) ---------------- */
  const api = {
    root, el,
    phoneOpen: () => phoneOpen,
    openPhone, closePhone,
    showScreen,
    toast,
    ready(/** @type {boolean} */ on, /** @type {string} */ note = '') {
      ready = on;
      if (el.play) { el.play.disabled = !on || !hasSave; }
      if (el.playSub) setText(el.playSub, on ? (hasSave ? 'your last run' : 'no save yet — New Game') : note || 'loading world…');
      if (el.boot) setText(el.boot.firstElementChild, on ? 'Ready' : (note || 'Preparing city…'));
    },
    bootNote(/** @type {string} */ text) { if (!ready && el.boot) setText(el.boot.firstElementChild, text); },
    setSave(/** @type {boolean} */ on) { hasSave = on; api.ready(ready); },
    setScore(/** @type {number} */ v) { setText(el.score, String(v)); },
    setBest(/** @type {number} */ v) { setText(el.best, String(v)); },
    setMission(/** @type {string} */ text) {
      if (!el.mission) return;
      const on = !!text;
      el.mission.style.display = on ? 'block' : 'none';
      if (on) setText(el.mission, text);
    },
    setSpeed(/** @type {number|null} */ kmh) {
      if (!el.speed) return;
      if (kmh === null) { el.speed.style.display = 'none'; return; }
      el.speed.style.display = 'block';
      el.speed.innerHTML = `${kmh}<small>KM/H</small>`;
    },
    setDrive(/** @type {string|null} */ label) {
      if (!el.drive) return;
      el.drive.hidden = label === null;
      if (label !== null) { driveLabel = label; const s = el.drive.firstElementChild; if (s) setText(s, label.toUpperCase()); }
    },
    setBrake(/** @type {boolean} */ on) { brakeVisible = on; if (el.brake) el.brake.hidden = !on; },
    setJump(/** @type {boolean} */ on) { jumpVisible = on; if (el.jump) el.jump.hidden = !on; },
    pause(/** @type {boolean} */ on) { show(el.paused, on); },
    settings(/** @type {boolean} */ on) { if (on) syncSettings(); show(el.options, on); },
    confirm(/** @type {string} */ title, /** @type {string} */ text, /** @type {() => void} */ cb) {
      setText($('uo-confirm-title'), title);
      setText($('uo-confirm-text'), text);
      confirmCb = cb;
      show(el.confirm, true);
    },
    syncSettings,
    hint(/** @type {HTMLElement|null} */ node) { node?.classList.add('uo-hint'); },
    clearHint() { for (const n of document.querySelectorAll('.uo-hint')) n.classList.remove('uo-hint'); },
    setAssetStatus(/** @type {string} */ text) { setText($('uo-asset-status'), text); },
    // SC-compatible shims so main.js reads clearly
    value(/** @type {string} */ id, /** @type {number|string} */ v) { setText($(id), String(v)); },
    label(/** @type {string} */ id, /** @type {string} */ text) { setText($(id), text); },
    screen(id) {
      if (id === 'uo-menu') showScreen('menu');
      else if (id === 'uo-hud') showScreen('hud');
      else if (id === 'uo-credits') showScreen('credits');
    },
    toggleSet(/** @type {string} */ id, /** @type {boolean} */ on) { toggle($(id), on); },
    toggleGet(/** @type {string} */ id) { return !!$(id)?.classList.contains('on'); },
    sliderSet(/** @type {string} */ id, /** @type {number} */ v) {
      const n = /** @type {HTMLInputElement|null} */ ($(id));
      if (n) n.value = String(v);
      setText(el.sensVal, Math.round(v) + '%');
      setText($('uo-psens-val'), Math.round(v) + '%');
    },
    sliderGet(/** @type {string} */ id) { return Number(/** @type {HTMLInputElement|null} */ ($(id))?.value || 100); },
    get driveLabel() { return driveLabel; },
    get goalVisible() { return goalVisible; },
    set goalVisible(/** @type {boolean} */ v) { goalVisible = v; },
    get isPhoneOpen() { return phoneOpen; },
    get brakeVisible() { return brakeVisible; },
    get jumpVisible() { return jumpVisible; },
  };
  // the game boots into the menu: establish the initial screen and settings state here,
  // so the menu is visible immediately (main.js only calls screen() on transitions)
  showScreen('menu');
  syncSettings();

  return api;
}

export default createUI;
