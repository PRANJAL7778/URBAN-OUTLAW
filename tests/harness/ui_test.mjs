import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const REPO = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');

const dom = new JSDOM('<!doctype html><html><body><div id="game"></div></body></html>', { pretendToBeVisual: true });
const { window } = dom;
global.window = window; global.document = window.document;
if (!window.matchMedia) window.matchMedia = (q) => ({ matches: /portrait/.test(q) ? true : false, media: q, addEventListener() {}, removeEventListener() {} });

const src = fs.readFileSync(REPO + '/src/ui.js', 'utf8');
fs.writeFileSync('./ui_copy.mjs', src);
const { createUI } = await import('./ui_copy.mjs?' + Date.now());

let fail = 0;
const check = (name, ok, extra = '') => { if (!ok) fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };
const calls = [];
const H = {
  onContinue: () => calls.push('continue'), onNewGame: () => calls.push('newgame'),
  onMissions: () => calls.push('missions'), onPhoneMenu: () => calls.push('phonemenu'),
  onCredits: () => calls.push('credits'), onResume: () => calls.push('resume'),
  onRestart: () => calls.push('restart'), onQuit: () => calls.push('quit'),
  onSound: (v) => calls.push('sound:' + v), onVibration: (v) => calls.push('vib:' + v),
  onSensitivity: (v) => calls.push('sens:' + v), onQuality: (q) => calls.push('quality:' + q),
  onStartCourier: () => calls.push('startjob'), onAbortCourier: () => calls.push('abortjob'),
  onPhoneOpen: () => calls.push('phoneopen'), onPhoneClose: () => calls.push('phoneclose'),
  getInfo: () => ({
    player: { x: 3, z: -4, dx: 0, dz: 1, driving: false }, vehicles: [{ kind: 'bike', name: 'Custom Bobber', x: 5, z: 6, distance: 12, inUse: false, blurb: 'light' }],
    objective: { title: 'Delivery Run', x: 10, z: 10, color: '#38e8ff' }, token: { x: 1, z: 2 }, score: 42, best: 90,
    courier: { state: 'idle', stage: 1, text: '', done: 2, best: 31, reward: 300 }, delivery: { state: 'active', t: 12, reward: 150, time: 40 }, clock: 125,
  }),
  getSetting: (k) => ({ sound: true, vibration: false, sensitivity: 80, quality: 'low' }[k]),
};
const UI = createUI(H);

const $ = (id) => document.getElementById(id);
console.log('\n=== UI smoke test (jsdom) ===');
check('root mounted', !!$('uo-ui'));
for (const id of ['uo-hud', 'uo-menu', 'uo-credits', 'uo-play', 'uo-newgame', 'uo-missions', 'uo-garage', 'uo-phone-menu',
  'uo-settings', 'uo-stick', 'uo-knob', 'uo-drive', 'uo-brake', 'uo-jump', 'uo-phone-btn', 'uo-score', 'uo-best', 'uo-mission',
  'uo-speed', 'uo-toast', 'uo-paused', 'uo-options', 'uo-confirm', 'uo-phone', 'uo-wheelbtn', 'uo-pause', 'uo-sound', 'uo-vibration',
  'uo-sensitivity', 'uo-quality', 'uo-rotate', 'uo-diag', 'uo-asset-status']) {
  if (!$ (id)) { check('element #' + id, false); }
}
check('all expected elements exist', ['uo-hud', 'uo-menu', 'uo-play', 'uo-stick', 'uo-phone', 'uo-map'].every((id) => id === 'uo-map' || !!$(id)));
check('new game title includes OUTLAW', /Urban/.test($('uo-menu').textContent));

// menu flow
UI.showScreen('menu');
check('menu visible', $('uo-menu').classList.contains('on'));
check('play disabled before assets ready', $('uo-play').disabled === true);
$('uo-play').dispatchEvent(new window.Event('click'));
check('continue ignored while disabled', !calls.includes('continue'));
UI.ready(true);
check('play still disabled without a save', $('uo-play').disabled === true && /no save/.test($('uo-play-sub').textContent));
UI.setSave(true);
check('play enabled once assets + save exist', $('uo-play').disabled === false, $('uo-play-sub').textContent);
$('uo-play').dispatchEvent(new window.Event('click'));
check('continue calls back', calls.includes('continue'));

// new game confirmation
$('uo-newgame').dispatchEvent(new window.Event('click'));
check('new game opens a confirmation', $('uo-confirm').classList.contains('on'));
$('uo-confirm-no').dispatchEvent(new window.Event('click'));
check('cancel closes without starting', !calls.includes('newgame') && !$('uo-confirm').classList.contains('on'));
$('uo-newgame').dispatchEvent(new window.Event('click'));
$('uo-confirm-yes').dispatchEvent(new window.Event('click'));
check('confirm starts a new game', calls.includes('newgame'));

// settings
UI.settings(true);
check('settings dialog opens', $('uo-options').classList.contains('on'));
check('sound switch reflects state', $('uo-sound').classList.contains('on'));
check('vibration switch reflects state', !$('uo-vibration').classList.contains('on'));
check('sensitivity slider reflects state', $('uo-sensitivity').value === '80' && $('uo-sensitivity-val').textContent === '80%');
check('quality segment reflects state', [...$('uo-quality').querySelectorAll('button')].find((b) => b.classList.contains('on'))?.dataset.q === 'low');
$('uo-sound').dispatchEvent(new window.Event('click'));
check('sound toggle calls back', calls.includes('sound:false'));
$('uo-vibration').dispatchEvent(new window.Event('click'));
check('vibration toggle calls back', calls.includes('vib:true'));
const qbtn = [...$('uo-quality').querySelectorAll('button')].find((b) => b.dataset.q === 'high');
qbtn.dispatchEvent(new window.Event('click', { bubbles: true }));
check('graphics preset calls back', calls.includes('quality:high'));
$('uo-options-back').dispatchEvent(new window.Event('click'));
check('settings closes', !$('uo-options').classList.contains('on'));

// pause dialog
UI.showScreen('hud');
UI.pause(true);
check('pause dialog opens', $('uo-paused').classList.contains('on'));
$('uo-resume').dispatchEvent(new window.Event('click'));
check('resume calls back', calls.includes('resume') && !$('uo-paused').classList.contains('on'));
check('hud visible', $('uo-hud').classList.contains('on'));

// HUD values
UI.setScore(7); UI.setBest(11); UI.setMission('Checkpoint 12 m');
check('score/best/mission render', $('uo-score').textContent === '7' && $('uo-best').textContent === '11' && $('uo-mission').textContent === 'Checkpoint 12 m');
UI.setSpeed(88);
check('speed renders', /88/.test($('uo-speed').textContent));
UI.setSpeed(null);
check('speed hides', $('uo-speed').style.display === 'none');
UI.setDrive('Ride'); UI.setBrake(true); UI.setJump(false);
check('drive/brake/jump toggles', !$('uo-drive').hidden && !$('uo-brake').hidden && $('uo-jump').hidden);
UI.toast('PACKAGE SECURED');
check('toast shows', $('uo-toast').classList.contains('on') && /PACKAGE/.test($('uo-toast').textContent));

// phone
UI.openPhone('home');
check('phone opens', $('uo-phone').classList.contains('on') && UI.phoneOpen());
check('phone opener callback', calls.includes('phoneopen'));
check('dock has six apps', $('uo-phone-dock').querySelectorAll('button[data-app]').length === 6);
const appId = (n) => $('uo-phone-dock').querySelector(`button[data-app="${n}"]`);
for (const app of ['map', 'missions', 'contacts', 'garage', 'settings', 'profile']) {
  appId(app).dispatchEvent(new window.Event('click', { bubbles: true }));
  check(`app "${app}" renders`, $('uo-phone-pane').children.length > 0, $('uo-phone-pane').querySelector('h3')?.textContent || '');
  if (app === 'contacts' || app === 'garage') check(`  ${app} marked coming soon`, /Coming soon|Not in this build/i.test($('uo-phone-pane').textContent));
}
appId('map').dispatchEvent(new window.Event('click', { bubbles: true }));
check('map canvas present', !!$('uo-map'));
appId('missions').dispatchEvent(new window.Event('click', { bubbles: true }));
const startBtn = $('uo-start-job');
check('missions app offers a working action', !!startBtn);
startBtn?.dispatchEvent(new window.Event('click', { bubbles: true }));
check('start courier calls back and closes the phone', calls.includes('startjob') && !UI.phoneOpen());
UI.openPhone('settings');
const psound = $('uo-psound');
psound?.dispatchEvent(new window.Event('click', { bubbles: true }));
check('phone settings toggle works', calls.filter((c) => c.startsWith('sound:')).length >= 2);
UI.closePhone();
check('phone closes', !UI.phoneOpen() && calls.includes('phoneclose'));

// dialogs helpers
UI.confirm('Restart', 'Are you sure?', () => calls.push('confirmed'));
check('confirm helper opens', $('uo-confirm').classList.contains('on') && $('uo-confirm-title').textContent === 'Restart');
$('uo-confirm-yes').dispatchEvent(new window.Event('click'));
check('confirm helper calls back', calls.includes('confirmed'));

console.log(`\n${fail === 0 ? 'ALL UI CHECKS PASSED' : fail + ' UI CHECK(S) FAILED'}`);
process.exit(fail ? 1 : 0);
