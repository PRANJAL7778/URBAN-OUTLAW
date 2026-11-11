import * as THREE from 'three';
import RAGDOLL from 'ragdoll';
import VFX from 'vfx';
import CONFIG from './config.js';
import { createCity } from './city.js';
import { startLoop, SCREEN, INPUT, SAVE, HAPTICS, AUDIO } from '../pixelfork/index.js';
import { MODELS } from '../pixelfork/assets-3d.js';
import { rigidBody, box, MotionType } from 'crashcat';
import { createCar } from './car.js';
import { createWheel } from './wheel.js';
import { prepareCharacter, prepareScanCharacter, prepareSuitCharacter } from './character.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { createUI } from './ui.js';
import { createCameraRig } from './camera.js';
import { measureBike, createHeroPose } from './pose.js';
import { createRiderPose, measureSaddle } from './riderpose.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55,1,0.1,180);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.shadowMap.enabled = true; renderer.shadowMap.type=THREE.PCFShadowMap;
renderer.domElement.style.cssText='display:block;touch-action:none';
const host=document.getElementById('game');
if (host) host.appendChild(renderer.domElement);
const view={width:1,height:1,dpr:1,cap:CONFIG.quality.maxPixelRatio};
function applySize() { renderer.setPixelRatio(Math.min(view.dpr,view.cap)); renderer.setSize(view.width,view.height); camera.aspect=view.width/view.height; camera.updateProjectionMatrix(); }
SCREEN.onResize(({width,height,dpr}) => { view.width=width; view.height=height; view.dpr=dpr; applySize(); });
scene.background=new THREE.Color(CONFIG.palette.sky); CONFIG.on('palette.sky',()=> { scene.background=new THREE.Color(CONFIG.palette.sky); });
scene.add(new THREE.HemisphereLight('#eff9ff','#65864d',2));
const sun=new THREE.DirectionalLight('#fff1d8',2.5); sun.position.set(15,35,12); sun.castShadow=true;
sun.shadow.mapSize.set(1024,1024); Object.assign(sun.shadow.camera,{left:-38,right:38,top:38,bottom:-38,near:1,far:100}); sun.shadow.normalBias=0.04; scene.add(sun); scene.add(sun.target);
const physics=RAGDOLL.createPhysics({gravity:[0,-9.81,0]});
/** The ragdoll's visual root: 'ragdoll-model' when a real model was supplied, 'ragdoll' for the
 *  built-in boxy body. Both are the object the riding pose can take over. */
const ragdollRoot=()=>scene.getObjectByName('ragdoll-model')||scene.getObjectByName('ragdoll');
/** @type {{office: THREE.Object3D|null, apartment: THREE.Object3D|null}} */
const importedBuildings={office:null,apartment:null};
const city=createCity(scene,physics,importedBuildings);
const diag={car:'loading',bike:'loading',char:'loading',seat:'',rider:'',arms:''};
/** @type {THREE.Object3D|null} */ let charModel=null;
/** One place that creates the hero: the uploaded character when it is usable, otherwise the original boxy hero. */
function makeHero(/** @type {number[]} */ position) {
  /** @type {any} */ const o={scene,physics,position,color:CONFIG.palette.hoodie};
  if(charModel && CONFIG.character.useModel) o.model=charModel;
  try { return RAGDOLL.create(o); } catch(error) {
    if(o.model) { console.warn('[character] model failed, using the boxy hero:',error); charModel=null; diag.char='boxy fallback - create failed: '+(/** @type {Error} */ (error)).message; delete o.model; return RAGDOLL.create(o); }
    throw error;
  }
}
/** @type {ReturnType<typeof makeHero>|null} */ let hero=makeHero(city.spawn.toArray());
/** Disposes the hero and frees the skeleton textures the ragdoll leaves behind (keeps GPU memory flat over many mounts/dismounts). */
function disposeHero() {
  if(!hero) return;
  /** @type {THREE.Skeleton[]} */ const skeletons=[]; const rm=ragdollRoot(); if(rm) rm.traverse(n=> { const sm=/** @type {THREE.SkinnedMesh} */ (n); if(sm.isSkinnedMesh) skeletons.push(sm.skeleton); });
  hero.dispose(); hero=null; for(const sk of skeletons) sk.dispose();
}

/** Procedural arm pose for the walking hero (see src/pose.js). Rebuilt whenever the ragdoll model is replaced. */
let heroPose=/** @type {any} */ (null),heroPoseModel=/** @type {THREE.Object3D|null} */ (null);
function poseHeroFrame(/** @type {number} */ dt) {
  if(!hero||state!=='play') return;
  const m=ragdollRoot();
  if(!m) return;
  if(m!==heroPoseModel) {
    heroPoseModel=m;
    const c=CONFIG.character;
    heroPose=createHeroPose(m,hero,{swing:c.armSwing??1,out:c.armOut??1,handRoll:c.armRoll??0.25});
    diag.arms=heroPose.ok?'procedural arm swing (both arms)':'arm rig not found - ragdoll clips only';
    if(!heroPose.ok) heroPose=null;
  }
  if(heroPose) heroPose.update(dt);
}
function wireHero() {
  if(!hero) return;
  hero.on('jump',()=>SFX.play('move.jump',{volume:0.4}));
  hero.on('land',()=> { if (state==='play' && hero) { HAPTICS.bump(); SFX.play('move.land',{volume:0.3}); VFX.play('move.land',{position:hero.position,size:0.5}); } });
}
function swapHero() { if(!hero) return; const at=hero.position; disposeHero(); hero=makeHero(at); wireHero(); }
CONFIG.on('palette.hoodie',swapHero); CONFIG.on('character.useModel',swapHero);
VFX.useScene({scene,camera,renderer,characterHeight:1.8,manual:true}); VFX.attach(); SFX.load('casual'); SFX.attach();

const $=(/** @type {string} */id)=>/** @type {HTMLElement} */(document.getElementById(id));
let state='menu',score=0,elapsed=0,best=SAVE.get('best',0),before=best,targetIndex=0;
let mode='walk',yawOffset=0,dragging=false,brakeHeld=false;
let moveX=0,moveY=0,yaw=0,dragX=0,dragY=0;
let lookLevel=THREE.MathUtils.clamp(Number(SAVE.get('lookLevel',100)),0,100);
let qualityMode=SAVE.get('quality','auto');
let qualityLevel=0;
const camRig=createCameraRig(camera,city,{
  sensitivity:1,
  walkDist:CONFIG.camera.distance, carDist:CONFIG.camera.carDistance ?? 6.2, bikeDist:CONFIG.camera.bikeDistance ?? 5.0,
});
/** graphics preset from the settings panel */
function setQualityLevel(/** @type {string} */ q) {
  qualityMode=q; SAVE.set('quality',q);
  if(q==='low') { view.cap=Math.min(0.85,CONFIG.quality.maxPixelRatio); sun.castShadow=false; qualityLevel=2; }
  else if(q==='high') { view.cap=CONFIG.quality.maxPixelRatio; sun.castShadow=true; qualityLevel=0; }
  else { view.cap=CONFIG.quality.maxPixelRatio; sun.castShadow=true; qualityLevel=0; }
  applySize();
}
const UI=createUI({
  onContinue:()=>start(),
  onNewGame:()=>start(),
  onMissions:()=> { if(state!=='play') start(); if(state==='play') UI.openPhone('missions'); },
  onPhoneMenu:()=> { if(state!=='play') start(); if(state==='play') UI.openPhone('home'); },
  onCredits:()=>only('uo-credits'),
  onOptions:()=> { if(state!=='play'||loop.paused) return; loop.pause(); ui.playing=false; refreshDriveUi(); },
  onOptionsClose:()=> { if(state!=='play') return; loop.resume(); refreshDriveUi(); },
  onResume:()=> { if(state==='play') { loop.resume(); refreshDriveUi(); } },
  onRestart:()=>start(),
  onQuit:()=>finish(),
  onSound:(/** @type {boolean} */ on)=>AUDIO.mute(!on),
  onVibration:(/** @type {boolean} */ on)=>HAPTICS.on(on),
  onSensitivity:(/** @type {number} */ v)=> { lookLevel=v; camRig.state.sensitivity=lookSensitivity(); SAVE.set('lookLevel',v); },
  onQuality:setQualityLevel,
  onStartCourier:()=> { void startCourier(); },
  onAbortCourier:()=> { if(courier.s==='active') courierEnd(false,'Job dropped'); },
  onPhoneOpen:()=> { moveX=moveY=0; brakeHeld=false; dragging=false; ui.playing=false; car.input.throttle=0; car.input.steer=0; car.input.brake=true; release(); refreshDriveUi(); },
  onPhoneClose:()=> { car.input.brake=false; refreshDriveUi(); },
  getInfo:()=>wheelInfo(),
  getSetting:(/** @type {string} */ k)=>k==='sound'?!AUDIO.muted:k==='vibration'?HAPTICS.enabled:k==='sensitivity'?lookLevel:qualityMode,
});
/** look sensitivity in radians per pixel, from the settings slider */
function lookSensitivity() { return CONFIG.camera.sensitivity*(CONFIG.camera.minimumLookFactor+(1-CONFIG.camera.minimumLookFactor)*lookLevel/100); }
camRig.state.sensitivity=lookSensitivity();
UI.setBest(best);
AUDIO.onChange(()=>UI.syncSettings());
setQualityLevel(qualityMode);
wireHero();
function only(/** @type {string} */ id) {
  UI.clearHint(); VFX.stopAll();
  UI.screen(id);
  ui.playing=false; refreshDriveUi();
}
UI.setBest(best);
const tokenMat=new THREE.MeshStandardMaterial({color:CONFIG.palette.gold,metalness:0.4,roughness:0.3});
const token=new THREE.Mesh(new THREE.TorusGeometry(1,0.24,8,20),tokenMat); scene.add(token);
const beam=new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.08,1,6),new THREE.MeshBasicMaterial({color:'#ffdf72',transparent:true,opacity:0.5})); scene.add(beam);
function relocate() {
  const prev=city.spots[targetIndex];
  const choices=city.spots.map((p,i)=>({i,d:p.distanceTo(prev)})).filter(p=>p.d>8);
  targetIndex=choices[Math.floor(Math.random()*choices.length)]?.i ?? 0;
}
/** Adds points through the existing score, best-score, saving, haptics and sound path (used by tokens and the mission). */
function award(/** @type {number} */ points,/** @type {number} */ x,/** @type {number} */ z) {
  score+=points;UI.setScore(score);PF.report('score',{score});
  const firstBest=score>before && best===before;
  if(score>best) { best=score; SAVE.set('best',best); UI.setBest(best); }
  if(firstBest) HAPTICS.success(); else HAPTICS.bump();
  SFX.play('pickup.coin',{volume:0.4});VFX.play('pickup.coin',{position:[x,1,z]});
}

/* ---------------- Vehicles: Lamborghini (car) + custom bobber (bike) ---------------- */
const CAR_MODELS={lite:'aiprintgen_light_blue_lamborghini_inspired_supercar_prev_lite',full:'aiprintgen_light_blue_lamborghini_inspired_supercar_prev'}, BIKE_MODEL='bobber_lite';
const FORK_AXIS=new THREE.Vector3(0.423,0.906,0).normalize();
/** one record per drivable vehicle: its own controller, meshes, parked collider and marker */
function makeVeh(/** @type {'car'|'bike'} */ kind,/** @type {string} */ markerColor,/** @type {string} */ label) {
  const root=new THREE.Group(), tilt=new THREE.Group(); root.add(tilt); root.visible=false; scene.add(root);
  const blob=new THREE.Mesh(new THREE.CircleGeometry(1,20),new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:0.32,depthWrite:false}));
  blob.rotation.x=-Math.PI/2; blob.position.y=0.16; root.add(blob);
  const marker=new THREE.Mesh(new THREE.ConeGeometry(0.5,1,4),new THREE.MeshBasicMaterial({color:markerColor})); marker.rotation.x=Math.PI; marker.visible=false; scene.add(marker);
  return { kind, ctrl:createCar(), root, tilt, blob, marker, label, ready:false, /** @type {{id:number}|null} */ parked:null, /** @type {THREE.Object3D|null} */ source:null, /** @type {THREE.Object3D|null} */ wrap:null,
    pv:{x:0,z:0,h:0}, wheel:0, /** @type {THREE.Vector3|null} */ seat:null, /** @type {THREE.Object3D|null} */ rider:null, /** @type {any} */ riderPose:null, /** @type {THREE.Object3D|null} */ inner:null, /** @type {any} */ bikeGeom:null, steerAngle:0, /** @type {{rear:THREE.Object3D,front:THREE.Object3D,fork:THREE.Object3D,r:number}|null} */ parts:null, key:/** @type {'car'|'bike'} */ (kind) };
}
const V={car:makeVeh('car','#46f0a0','Drive'),bike:makeVeh('bike','#ffb13a','Ride')}, VLIST=[V.car,V.bike];
/** the vehicle being driven (or last driven); `car` always points at its controller */
let cur=V.car, car=cur.ctrl;
const P=(/** @type {{key:'car'|'bike'}} */ v)=>CONFIG[v.key];
function mountVeh(/** @type {typeof V.car} */ v) {
  if(v.wrap) { v.tilt.remove(v.wrap); v.wrap=null; } v.parts=null;
  const wrap=new THREE.Group(); v.wrap=wrap; const p=P(v);
  if(v.source) {
    const inner=v.source.clone(true); wrap.add(inner);
    const size=new THREE.Box3().setFromObject(inner).getSize(new THREE.Vector3()), k=p.length/size.x;
    inner.scale.multiplyScalar(k); inner.rotation.y=(v.kind==='bike'?Math.PI/2:-Math.PI/2)+(p.flipFront?Math.PI:0);
    wrap.updateMatrixWorld(true);
    const b=new THREE.Box3().setFromObject(wrap), c=b.getCenter(new THREE.Vector3());
    inner.position.set(-c.x,-b.min.y,-c.z);
    inner.traverse(o=> { const m=/** @type {THREE.Mesh} */ (o); if(m.isMesh) { m.castShadow=false; m.receiveShadow=false; } });
    if(v.kind==='bike') { // seat, handlebar grips and foot pegs are measured off the model itself
      inner.updateMatrixWorld(true);
      v.seat=inner.localToWorld(new THREE.Vector3(0.34,0.20,0));
      v.inner=inner;
      try {
        const raw=measureBike(inner);
        /* measureBike()'s seat rule (40% of the wheelbase) lands on the TANK of this bobber, so the
           saddle is re-measured from the up-facing surface. Everything is expressed in the tilt
           group's space, which is the rider's parent. */
        const saddle=measureSaddle(v.tilt,inner);
        const forkNode=inner.getObjectByName('fork');
        const toTilt=(p)=>v.tilt.worldToLocal(forkNode?p.clone().applyMatrix4(forkNode.matrixWorld):p.clone().applyMatrix4(inner.matrixWorld));
        v.bikeGeom={ seat:saddle.seat, profile:saddle.profile,
          grips:raw.gripsFork.map(toTilt),
          pegs:raw.pegsInner.map((q)=>v.tilt.worldToLocal(q.clone().applyMatrix4(inner.matrixWorld))) };
        diag.seat=`saddle ${saddle.seat.y.toFixed(2)}m@z${saddle.seat.z.toFixed(2)} · grips ${v.bikeGeom.grips.length} · pegs ${v.bikeGeom.pegs.length}`;
      } catch(error) { v.bikeGeom=null; console.warn('[bike] geometry measure failed:',error); }
    }
    if(v.kind==='bike') { const rear=inner.getObjectByName('rearWheel'), front=inner.getObjectByName('frontWheel'), fork=inner.getObjectByName('fork'); if(rear&&front&&fork) v.parts={rear,front,fork,r:0.283*k}; }
  } else if(v.kind==='car') { // simple box car so driving still works if the GLB can not load
    const L=p.length, mat=(/** @type {string} */ col)=>new THREE.MeshStandardMaterial({color:col,roughness:0.6});
    const body=new THREE.Mesh(new THREE.BoxGeometry(L*0.42,0.5,L),mat('#3d8bff')); body.position.y=0.6;
    const cab=new THREE.Mesh(new THREE.BoxGeometry(L*0.34,0.45,L*0.45),mat('#1c2430')); cab.position.set(0,1.05,-L*0.05);
    wrap.add(body,cab);
    for(const sx of [-1,1]) for(const sz of [-1,1]) { const w=new THREE.Mesh(new THREE.CylinderGeometry(0.38,0.38,0.3,12),mat('#15191f')); w.rotation.z=Math.PI/2; w.position.set(sx*L*0.22,0.38,sz*L*0.3); wrap.add(w); }
  } else { // simple box bike fallback
    const L=p.length, mat=(/** @type {string} */ col)=>new THREE.MeshStandardMaterial({color:col,roughness:0.6});
    const body=new THREE.Mesh(new THREE.BoxGeometry(0.3,0.35,L*0.55),mat('#2b2f3a')); body.position.y=0.62; wrap.add(body);
    for(const sz of [-1,1]) { const w=new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.3,0.14,12),mat('#15191f')); w.rotation.z=Math.PI/2; w.position.set(0,0.3,sz*L*0.38); wrap.add(w); }
  }
  v.tilt.add(wrap); v.blob.scale.set(v.kind==='bike'?p.length*0.16:p.length*0.27,p.length*(v.kind==='bike'?0.5:0.56),1);
}
for(const k of /** @type {const} */ (['car','bike'])) { CONFIG.on(k+'.length',()=> { if(V[k].ready) mountVeh(V[k]); }); CONFIG.on(k+'.flipFront',()=> { if(V[k].ready) mountVeh(V[k]); }); }
function removeParked(/** @type {typeof V.car} */ v) { if(!v.parked) return; const b=rigidBody.get(physics.world,v.parked.id); if(b) rigidBody.remove(physics.world,b); v.parked=null; }
function parkBody(/** @type {typeof V.car} */ v) { // solid while parked so the walking hero cannot pass through the vehicle
  removeParked(v); const s=v.ctrl.s, L=P(v).length, hw=v.kind==='bike'?0.4:L*0.22;
  v.parked=rigidBody.create(physics.world,{ shape:box.create({halfExtents:[hw,0.6,L*0.5]}), motionType:MotionType.STATIC, objectLayer:physics.layers.static, position:[s.x,0.6,s.z], quaternion:[0,Math.sin(s.h/2),0,Math.cos(s.h/2)], friction:0.6 });
}
function drawVeh(/** @type {typeof V.car} */ v,/** @type {number} */ alpha,/** @type {number} */ dtf) {
  const s=v.ctrl.s, M=THREE.MathUtils, pv=v.pv;
  v.root.position.set(pv.x+(s.x-pv.x)*alpha,0.04,pv.z+(s.z-pv.z)*alpha); v.root.rotation.y=pv.h+(s.h-pv.h)*alpha;
  if(v.kind==='bike') { // lean into the turn, wheels roll, the fork steers
    /* Lean is a function of how hard the bike is actually turning (lateral acceleration), so it is
       zero when stationary — a stopped bike with a leaning rider looked like it was falling over.
       The roll also grows with speed, then saturates: the bike is not thrown sideways on a crawl. */
    const sp=Math.abs(s.speed), spF=M.clamp(sp/16,0,1);
    const targetRoll=M.clamp(s.yawRate*sp*0.022,-0.42,0.42)*M.clamp(0.35+spF*1.35,0,1);
    v.tilt.rotation.z+=(targetRoll-v.tilt.rotation.z)*Math.min(1,0.15+dtf*4);
    const targetPitch=-M.clamp(s.accel*0.004,-0.06,0.06)*(0.4+spF*0.9);
    v.tilt.rotation.x+=(targetPitch-v.tilt.rotation.x)*0.12;
    if(v.parts) { v.parts.rear.rotation.z=v.wheel; v.parts.front.rotation.z=v.wheel; v.parts.fork.quaternion.setFromAxisAngle(FORK_AXIS,v.steerAngle=M.clamp(-s.steer*0.9,-0.6,0.6)); }
  } else {
    v.tilt.rotation.z+=(-M.clamp(s.yawRate*s.speed*0.004,-0.08,0.08)-v.tilt.rotation.z)*0.12;
    v.tilt.rotation.x+=(-M.clamp(s.accel*0.0035,-0.05,0.05)-v.tilt.rotation.x)*0.12;
  }
}
/** nearest vehicle the walking hero can get into, or null */
function nearVeh() {
  if(!hero) return null; const p=hero.position; /** @type {typeof V.car|null} */ let best=null, bd=1e9;
  for(const v of VLIST) { if(!v.ready) continue; const d=Math.hypot(p[0]-v.ctrl.s.x,p[2]-v.ctrl.s.z); if(d<P(v).enterRadius+P(v).length*0.4 && d<bd) { bd=d; best=v; } }
  return best;
}
function enterVeh(/** @type {typeof V.car} */ target=undefined,/** @type {boolean} */ force=false) {
  if(state!=='play'||(!force&&loop.paused)||mode!=='walk') return;
  /* stepping straight from one vehicle into another: finish the pending dismount now, otherwise
     there is no walking hero to hand to the next vehicle */
  if(dismountVeh) { dismountT=0; updateDismount(1); }
  if(!hero) return;
  const v=target||nearVeh(); if(!v) return;
  hero.move(0,0); hero.sprint(false);
  /* Hand the walking body over to the rider: dispose the ragdoll (it detaches its root) and then
     move that same object onto the bike, so there is exactly one character in the scene. */
  const model=ragdollRoot();
  disposeHero();                      // safe: nothing is riding yet
  const riding=showRider(v,true,model);
  mode='drive'; cur=v; car=v.ctrl;
  removeParked(v); car.input.throttle=car.input.steer=0; car.input.brake=false; car.s.vx=car.s.vz=car.s.speed=0;
  v.pv.x=car.s.x; v.pv.z=car.s.z; v.pv.h=car.s.h;
  yawOffset=0; camRig.jump(car.s.h+Math.PI, 0.30); yaw=camRig.state.yaw;
  HAPTICS.tap(); firstMove();
  if(riding) { v.mountT=0; diag.rider='mounting'; }
  if(CONFIG.mission.enabled && mission.s==='idle' && courier.s==='idle') startMission();
  ui.playing=false; refreshDriveUi();
}
function exitVeh() {
  if(mode!=='drive') return; const v=cur;
  const s=car.s, c=Math.cos(s.h), n=Math.sin(s.h), side=v.kind==='bike'?1.7:2.6;
  const cands=[[c*side,-n*side],[-c*side,n*side],[-n*4.2,-c*4.2],[n*4.2,c*4.2]]; let at=cands[0];
  for(const o of cands) { const x=s.x+o[0], z=s.z+o[1]; if(!city.colliders.some(b=>x>b.minX-0.6&&x<b.maxX+0.6&&z>b.minZ-0.6&&z<b.maxZ+0.6)) { at=o; break; } }
  s.vx=s.vz=s.speed=0; car.input.throttle=car.input.steer=0; car.input.brake=false; brakeHeld=false;
  /* the rider is removed and the walking hero created next frame, after DISMOUNT_TIME of the
     dismount blend has played — see updateDismount() */
  mode='walk'; dismountVeh=v; dismountT=DISMOUNT_TIME;
  parkBody(v); camRig.jump(s.h+Math.PI, 0.34); yaw=camRig.state.yaw;
  HAPTICS.tap(); ui.playing=false; refreshDriveUi();
}
function resetDriving() {
  mode='walk'; cur=V.car; car=cur.ctrl;
  for(const v of VLIST) { removeParked(v); showRider(v,false); const sp=v.kind==='bike'?city.bikeSpawn:city.carSpawn; v.ctrl.reset(sp.x,sp.z,sp.heading);
    v.ctrl.input.throttle=v.ctrl.input.steer=0; v.ctrl.input.brake=false; v.pv.x=sp.x; v.pv.z=sp.z; v.pv.h=sp.heading; if(v.ready) parkBody(v); }
  brakeHeld=false; resetMission(); resetCourier(); ui.playing=false; refreshDriveUi();
}
/** The player rides the bobber. The player character IS the rider, so there is no model swap on
 *  mount: the walking hero steps off the physics body and the same rig is re-parented onto the
 *  bike and posed by src/riderpose.js. The pose is the verified one (hips on the saddle, hands on
 *  the measured grips, feet on the measured pegs, knees forward around the tank) with a small
 *  speed/lean layer on top; mount and dismount are a 0..1 blend of that same pose. */
const riderTune={};
/** pull the tuning knobs from CONFIG (applied live from the mechanics panel) */
function syncRiderTune() {
  const r=CONFIG.bike, t=riderTune;
  t.lean=(r.riderLean??0.42); t.speedLean=r.riderSpeedLean??0.30; t.turnLean=r.riderTurnLean??1.0;
  t.elbowOut=r.elbowOut||0.55; t.kneeOut=r.kneeOut??0.30; t.seatFwd=r.seatFwd??0.24;
  t.ankleLift=r.ankleLift??0.08; t.seatGap=r.hipLift??0.045; t.headHold=r.riderHeadHold??0.55;
}
for(const k of ['bike.riderLean','bike.riderSpeedLean','bike.riderTurnLean','bike.elbowOut','bike.kneeOut','bike.seatFwd','bike.ankleLift','bike.hipLift','bike.riderHeadHold']) CONFIG.on(k,syncRiderTune);
syncRiderTune();

/**
 * Restores the character's bones to the bind pose it shipped in.
 *
 * The rider is the same object as the walking body, so when it comes back for a second ride its
 * bones still hold whatever the last pose left them in. createRiderPose() captures the *current*
 * transforms as its rest pose, so without this the second mount calibrates against an already
 * seated body and needs a much bigger lean (measured: 0.84 rad instead of 0.40 — a 48 degree tuck,
 * which is exactly the "lying on the bike" look this pose exists to avoid). `charModel` is the
 * pristine clone the ragdoll copies from, so it is always the T-pose reference.
 */
let bindPose=/** @type {Map<string,{p:THREE.Vector3,q:THREE.Quaternion,s:THREE.Vector3}>|null} */ (null);
/** Snapshot the character's T-pose once, when it is first built. `charModel` is the object the
 *  ragdoll clones from and is *not* modified by posing, but taking an explicit copy means the
 *  reference can never be affected by anything that does touch it later. */
function captureBindPose(/** @type {THREE.Object3D} */ model) {
  bindPose=new Map();
  model.traverse(o=> {
    if(!o.isBone) return;
    bindPose.set(o.name,{ p:o.position.clone(), q:o.quaternion.clone(), s:o.scale.clone() });
  });
  return bindPose.size;
}
function adoptBindPose(/** @type {THREE.Object3D} */ model) {
  if(!bindPose) return 0;
  const src=bindPose;
  let restored=0;
  model.traverse(o=> {
    if(!o.isBone) return;
    const b=src.get(o.name);
    if(!b) return;
    o.position.copy(b.p); o.quaternion.copy(b.q); o.scale.copy(b.s);
    restored++;
  });
  model.updateMatrixWorld(true);
  return restored;
}

/**
 * Takes the character off the bike. The ragdoll that supplied the model still holds a reference to
 * it (`hero.dispose()` re-detaches its root from wherever it is), so the hero record is disposed
 * here *before* the model is reparented — otherwise a later dispose would silently pull the rider
 * back out of the bike, and the disconnected graph would keep a whole character alive.
 */
function dropRider(/** @type {typeof V.car} */ v) {
  if(!v.rider){ v.riderPose=null; return null; }
  const model=v.rider;
  if(v.riderPose) v.riderPose.unmount();
  v.rider=null; v.riderPose=null; v.mountT=0;
  return model;
}

/**
 * Move the walking hero onto the bike (or back off it). Returns true when the rider is on the bike.
 * `on` only starts the blend — the pose itself is driven every frame by poseRider(), so mounting
 * is an animation rather than a teleport.
 */
function showRider(/** @type {typeof V.car} */ v,/** @type {boolean} */ on,/** @type {THREE.Object3D|null|undefined} */ model) {
  if(v.kind!=='bike') return false;
  if(on===false) { const m=dropRider(v); if(m) m.removeFromParent(); return false; }
  if(v.rider) return true;
  if(!v.bikeGeom||!charModel||charKind!=='suit') return false;
  try {
    /* The character that was just walking is reused as the rider — same rig, same face, same
       outfit, no second copy of a 12 MB model. `model` is passed in because by now it has already
       been detached from the ragdoll. */
    const r=model||ragdollRoot();
    if(!r) { console.warn('[bike] no character model to ride with'); return false; }
    r.removeFromParent();
    r.position.set(0,0,0); r.rotation.set(0,0,0); r.scale.setScalar(1);
    try { adoptBindPose(r); } catch(error) { console.warn('[bike] bind-pose restore failed:',error); }
    v.tilt.add(r);
    r.traverse(o=> { const m=/** @type {THREE.Mesh} */ (o); if(m.isMesh) { m.frustumCulled=false; m.castShadow=charKind==='suit'; m.receiveShadow=false; } });
    syncRiderTune();
    const pose=createRiderPose(r,v.bikeGeom,riderTune);
    if(!pose.ok) { r.removeFromParent(); scene.add(r); console.warn('[bike] rider rig missing bones:',pose.missing); return false; }
    pose.calibrate();
    pose.update(undefined,0,0);
    v.rider=r; v.riderPose=pose; v.mountT=0;
    diag.rider=`seated (lean ${pose.leanNow().toFixed(2)} rad), mounting`;
    return true;
  } catch(error) { console.warn('[bike] rider unavailable, riding without one:',error); v.rider=null; v.riderPose=null; v.mountT=0; return false; }
}

/** Mount / dismount progress 0..1, and the per-frame riding pose. */
const MOUNT_TIME=0.55;      // seconds to step on and settle into the saddle
const DISMOUNT_TIME=0.42;   // seconds to rise off the saddle before the walker takes over
/** @type {typeof V.car|null} */ let dismountVeh=null; let dismountT=0;
/** Runs the dismount blend, then hands the character back to the walking ragdoll. */
function updateDismount(/** @type {number} */ dt) {
  if(!dismountVeh) return;
  const v=dismountVeh;
  if(v.riderPose&&v.rider) {
    /* drive the blend straight from the countdown so the pose and the hand-over cannot disagree */
    v.mountT=Math.max(0,Math.min(1,dismountT/DISMOUNT_TIME));
    v.riderPose.ride(dt,{ mix:v.mountT, speed:0, accel:0, roll:v.tilt.rotation.z, steer:0 });
  }
  dismountT-=dt;
  if(dismountT>0) return;
  // the blend has played: take the model back off the bike and hand it to the ragdoll
  const s=v.ctrl.s, c=Math.cos(s.h), n=Math.sin(s.h), side=1.7;
  const cands=[[c*side,-n*side],[-c*side,n*side],[-n*4.2,-c*4.2],[n*4.2,c*4.2]]; let at=cands[0];
  for(const o of cands) { const x=s.x+o[0], z=s.z+o[1]; if(!city.colliders.some(b=>x>b.minX-0.6&&x<b.maxX+0.6&&z>b.minZ-0.6&&z<b.maxZ+0.6)) { at=o; break; } }
  /* take the character off the bike and give the walking body a fresh ragdoll. RAGDOLL.create()
     clones whatever model it is given, so the posed model is not handed over: the clone comes from
     the same source and therefore looks identical. */
  const model=dropRider(v);
  if(model) model.removeFromParent();
  hero=makeHero([s.x+at[0],0.3,s.z+at[1]]); wireHero();
  dismountVeh=null; diag.rider='on foot';
}
function poseRider(/** @type {typeof V.car} */ v,/** @type {number} */ dt,/** @type {boolean} */ mounting) {
  if(!v.rider||!v.riderPose) return;
  const step=dt/MOUNT_TIME;
  if(mounting) {
    const wasMounted=v.mountT>=1;
    v.mountT=Math.min(1,v.mountT+step);
    if(!wasMounted&&v.mountT>=1) diag.rider=`seated (lean ${v.riderPose.leanNow().toFixed(2)} rad), hands on grips`;
  }
  const s=v.ctrl.s;
  v.riderPose.ride(dt,{ mix:v.mountT, speed:s.speed, accel:s.accel, roll:v.tilt.rotation.z, steer:v.steerAngle });
}

const ui={near:/** @type {typeof V.car|null} */ (null),playing:false,label:'',kmh:-1};
function setShown(/** @type {HTMLElement} */ el,/** @type {boolean} */ on,/** @type {string} */ shown='block') { const v=on?shown:'none'; if(el.style.display!==v) el.style.display=v; }
function refreshDriveUi() {
  const playing=state==='play'&&!loop.paused, driving=playing&&mode==='drive';
  const nv=playing&&mode==='walk'?nearVeh():null, showDrive=driving||!!nv;
  ui.playing=playing; ui.near=nv;
  UI.setDrive(showDrive?(driving?'Exit':nv?nv.label:'Drive'):null);
  UI.setBrake(driving); UI.setJump(!driving&&playing);
  if(!driving) UI.setSpeed(null);
  setShown($('uo-wheelbtn'),playing);
  if(!playing) UI.setMission('');
}
$('uo-drive').addEventListener('click',()=> { if(mode==='drive') exitVeh(); else enterVeh(); });
const holdBrake=(/** @type {boolean} */ on)=> () => { brakeHeld=on; };
$('uo-brake').addEventListener('pointerdown',holdBrake(true)); $('uo-brake').addEventListener('pointerup',holdBrake(false));
$('uo-brake').addEventListener('pointercancel',holdBrake(false)); $('uo-brake').addEventListener('pointerleave',holdBrake(false));
INPUT.onKey('KeyE',()=> { if(state!=='play'||loop.paused) return; if(mode==='drive') exitVeh(); else enterVeh(); });

/* ---------------- Driving mission: reach the checkpoint in time ---------------- */
const mission={s:'idle',t:0,wait:0,idx:0,txt:'',urgent:false};
const cpMat=new THREE.MeshBasicMaterial({color:'#38e8ff',transparent:true,opacity:0.6,depthWrite:false});
const cpRing=new THREE.Mesh(new THREE.TorusGeometry(1,0.1,8,36),cpMat); cpRing.rotation.x=Math.PI/2; cpRing.position.y=0.4;
const cpBeam=new THREE.Mesh(new THREE.CylinderGeometry(1,1,1,16,1,true),new THREE.MeshBasicMaterial({color:'#38e8ff',transparent:true,opacity:0.22,depthWrite:false,side:THREE.DoubleSide})); cpBeam.position.y=9;
const cp=new THREE.Group(); cp.add(cpRing,cpBeam); cp.visible=false; scene.add(cp);
let toastTimer=0;
function toast(/** @type {string} */ text) { const el=$('uo-toast'); el.textContent=text; el.style.opacity='1'; clearTimeout(toastTimer); toastTimer=window.setTimeout(()=> { el.style.opacity='0'; },2200); }
function resetMission() { mission.s='idle'; mission.wait=0; mission.txt=''; cp.visible=false; setShown($('uo-mission'),false); $('uo-toast').style.opacity='0'; }
function startMission() {
  const pts=city.missionPoints; if(!pts.length||!CONFIG.mission.enabled||courier.s!=='idle') return;
  const far=pts.filter(q=>Math.hypot(q.x-car.s.x,q.z-car.s.z)>40), pool=far.length?far:pts;
  mission.idx=pts.indexOf(pool[Math.floor(Math.random()*pool.length)]);
  mission.s='active'; mission.t=CONFIG.mission.time; mission.txt='';
  const q=pts[mission.idx]; cp.position.set(q.x,0,q.z); cpBeam.scale.set(CONFIG.mission.radius*0.9,18,CONFIG.mission.radius*0.9); cp.visible=true;
  toast('MISSION: reach the checkpoint!');
}
function updateMission(/** @type {number} */ dt,/** @type {number} */ px,/** @type {number} */ pz) {
  if(!CONFIG.mission.enabled||courier.s!=='idle') { if(mission.s!=='idle') resetMission(); return; }
  const el=$('uo-mission');
  if(mission.s==='active') {
    mission.t-=dt; const q=city.missionPoints[mission.idx], d=Math.hypot(px-q.x,pz-q.z), r=CONFIG.mission.radius;
    cpRing.scale.setScalar(r*(1+0.05*Math.sin(elapsed*6)));
    if(mode==='drive' && d<r) {
      award(CONFIG.mission.reward,q.x,q.z); toast('CHECKPOINT! +'+CONFIG.mission.reward);
      mission.s='cooldown'; mission.wait=3.5; cp.visible=false; setShown(el,false);
    } else if(mission.t<=0) {
      toast('TIME’S UP!'); HAPTICS.bump(); mission.s='cooldown'; mission.wait=3.5; cp.visible=false; setShown(el,false);
    } else {
      const txt=(mode==='drive'?`Checkpoint ${Math.round(d)} m`:'Get back in the car!')+` · ${Math.ceil(mission.t)} s`;
      if(txt!==mission.txt) { mission.txt=txt; el.textContent=txt; }
      const urgent=mission.t<10; if(urgent!==mission.urgent) { mission.urgent=urgent; el.style.color=urgent?'#ff8a7a':'#fff'; }
      setShown(el,true);
    }
  } else if(mission.s==='cooldown') {
    mission.wait-=dt; if(mission.wait<=0) { mission.s='idle'; if(mode==='drive') startMission(); }
  }
}

/* ---------------- Courier Run: a second, replayable mission (pick up on foot -> deliver by vehicle -> final run) ---------------- */
const courier={s:'idle',stage:0,t:0,route:0,wait:0,clock:0,txt:''};
const cp2Mat=new THREE.MeshBasicMaterial({color:'#ff4fd8',transparent:true,opacity:0.6,depthWrite:false});
const cp2Ring=new THREE.Mesh(new THREE.TorusGeometry(1,0.1,8,36),cp2Mat); cp2Ring.rotation.x=Math.PI/2; cp2Ring.position.y=0.4;
const cp2Beam=new THREE.Mesh(new THREE.CylinderGeometry(1,1,1,16,1,true),new THREE.MeshBasicMaterial({color:'#ff4fd8',transparent:true,opacity:0.22,depthWrite:false,side:THREE.DoubleSide})); cp2Beam.position.y=9;
const cp2=new THREE.Group(); cp2.add(cp2Ring,cp2Beam); cp2.visible=false; scene.add(cp2);
const parcel=new THREE.Mesh(new THREE.BoxGeometry(0.6,0.45,0.6),new THREE.MeshStandardMaterial({color:'#c99a5b',roughness:0.8})); parcel.visible=false; scene.add(parcel);
function courierTarget() { const rt=city.courierRoutes[courier.route]; return courier.stage===0?city.pickup:courier.stage===1?rt.drop:rt.fin; }
function courierPlace() { const q=courierTarget(), r=courier.stage===0?CONFIG.courier.pickupRadius:CONFIG.courier.radius; cp2.position.set(q.x,0,q.z); cp2Ring.scale.set(r,r,r); cp2Beam.scale.set(r*0.9,18,r*0.9); cp2.visible=true; parcel.visible=courier.stage===0; parcel.position.set(q.x,1.0,q.z); }
function resetCourier() { courier.s='idle'; courier.stage=0; courier.wait=0; courier.txt=''; cp2.visible=false; parcel.visible=false; }
function startCourier() {
  if(state!=='play'||courier.s!=='idle'||!CONFIG.courier.enabled) return false;
  resetMission(); courier.s='active'; courier.stage=0; courier.route=Math.floor(Math.random()*city.courierRoutes.length); courier.t=0; courier.clock=0; courier.txt='';
  courierPlace(); toast('COURIER RUN: pick up the package at the fountain, on foot'); HAPTICS.tap(); return true;
}
function courierEnd(/** @type {boolean} */ won,/** @type {string} */ msg) {
  courier.s='cooldown'; courier.wait=4; cp2.visible=false; parcel.visible=false; setShown($('uo-mission'),false); toast(msg); if(!won) HAPTICS.bump();
}
function updateCourier(/** @type {number} */ dt,/** @type {number} */ px,/** @type {number} */ pz) {
  const C=CONFIG.courier;
  if(courier.s==='active') {
    courier.clock+=dt; const q=courierTarget(), d=Math.hypot(px-q.x,pz-q.z), el=$('uo-mission'); let text='';
    if(courier.stage===0) {
      if(mode==='walk' && d<C.pickupRadius) { award(C.pickup,q.x,q.z); courier.stage=1; courier.t=C.time2; courierPlace(); toast('PACKAGE SECURED! +'+C.pickup+' — deliver it by vehicle'); }
      else text=mode==='walk'?`Pick up the package · ${Math.round(d)} m`:'Get out and pick up the package on foot';
    } else {
      courier.t-=dt;
      if(mode==='drive' && d<C.radius) {
        if(courier.stage===1) { award(C.deliver,q.x,q.z); courier.stage=2; courier.t=C.time3; courierPlace(); toast('DELIVERED! +'+C.deliver+' — now the final run!'); }
        else {
          award(C.finish,q.x,q.z); const st=SAVE.get('courier',{done:0,best:0}); st.done=(st.done||0)+1; const secs=Math.round(courier.clock); if(!st.best||secs<st.best) st.best=secs; SAVE.set('courier',st);
          courierEnd(true,'COURIER RUN COMPLETE! +'+(C.pickup+C.deliver+C.finish)+' total');
        }
      } else if(courier.t<=0) courierEnd(false,'COURIER RUN FAILED — package lost');
      else text=courier.stage===1?(mode==='drive'?`Deliver · ${Math.round(d)} m`:'Deliver it in a vehicle!')+` · ${Math.ceil(courier.t)} s`:`Final run · ${Math.round(d)} m · ${Math.ceil(courier.t)} s`;
    }
    if(courier.s==='active') { const t=`COURIER ${courier.stage+1}/3 · ${text}`; if(t!==courier.txt) { courier.txt=t; el.textContent=t; el.style.color=courier.stage>0&&courier.t<10?'#ff8a7a':'#fff'; } setShown(el,true);
      const r=(courier.stage===0?C.pickupRadius:C.radius)*(1+0.05*Math.sin(elapsed*6)); cp2Ring.scale.set(r,r,r); parcel.position.y=1.0+Math.sin(elapsed*3)*0.15; parcel.rotation.y+=dt*1.5; }
  } else if(courier.s==='cooldown') { courier.wait-=dt; if(courier.wait<=0) { courier.s='idle'; if(mode==='drive' && mission.s==='idle') startMission(); } }
}

/* ---------------- calling / switching vehicles (used by the quick wheel and the phone) ---------------- */
const VEH_NAME={car:'Lamborghini',bike:'Custom Bobber'};
function callVeh(/** @type {'car'|'bike'} */ kind) {
  const v=V[kind]; if(!v.ready) return 'Not available yet.'; if(mode==='drive'&&cur===v) return 'You are already riding it.'; if(!hero) return 'Get out of your vehicle first.';
  const hp=hero.position, pr=P(v), clear=(pr.span||1.35)+(pr.radius||1.05)+0.2; /** @type {number[]|null} */ let best=null;
  for(const dd of [5,7,9,12,15]) { for(let k=0;k<8&&!best;k++) { const a=k*Math.PI/4+0.4, x=hp[0]+Math.cos(a)*dd, z=hp[2]+Math.sin(a)*dd;
    if(Math.abs(x)>50||Math.abs(z)>50||!city.isRoad(x,z)) continue;
    if(city.colliders.some(b=>{ const cx=Math.min(Math.max(x,b.minX),b.maxX), cz=Math.min(Math.max(z,b.minZ),b.maxZ); return Math.hypot(x-cx,z-cz)<clear; })) continue;
    if(VLIST.some(o=>o!==v&&o.ready&&Math.hypot(x-o.ctrl.s.x,z-o.ctrl.s.z)<4.5)) continue;
    // park along the road, nose pointing away from the player
    const s2=CONFIG.world.scale, onZRoad=[-32,0,32].some(r=>Math.abs(x-r*s2)<4.4), h=onZRoad?(z>hp[2]?0:Math.PI):(x>hp[0]?Math.PI/2:-Math.PI/2); best=[x,z,h]; } if(best) break; }
  if(!best) return 'No clear spot nearby — walk to a road and try again.';
  removeParked(v); v.ctrl.reset(best[0],best[1],best[2]); v.pv.x=best[0]; v.pv.z=best[1]; v.pv.h=best[2]; v.wheel=0; parkBody(v); HAPTICS.tap();
  return `Your ${VEH_NAME[kind]} is parked nearby.`;
}
function switchVeh(/** @type {'car'|'bike'} */ kind) {
  if(mode!=='drive') return callVeh(kind);
  if(cur===V[kind]) return 'You are already riding it.';
  exitVeh(); const msg=callVeh(kind); if(!msg.startsWith('Your')) return msg;
  enterVeh(V[kind],true); return '';
}

/* ---------------- diagnostics + frame-rate guard (phone friendly) ---------------- */
let emaMs=16.7,lastFrame=performance.now(),slowMs=0,sunX=1e9,sunZ=1e9;
function applyQuality() { if(qualityLevel>=1) view.cap=Math.min(view.cap,1); if(qualityLevel>=2) { view.cap=Math.min(view.cap,0.85); sun.castShadow=false; } applySize(); }
function diagText() {
  const L=[]; L.push('Car: '+diag.car); L.push('Bike: '+diag.bike); L.push('Character: '+diag.char);
  L.push('Bike fit: '+(diag.seat||'-')+(diag.rider?' · rider '+diag.rider:'')); L.push('Arms: '+(diag.arms||'-'));
  L.push(`FPS ${(1000/emaMs).toFixed(0)} · pixel ratio ${renderer.getPixelRatio().toFixed(2)} · shadows ${sun.castShadow?'on':'off'} · quality level ${qualityLevel}`);
  L.push(`Draw calls ${renderer.info.render.calls} · triangles ${renderer.info.render.triangles}`);
  L.push('Buildings (stack = tall, single = whole model, box = fallback):');
  for(const r of city.report) L.push(` ${r.kind}@${r.slot.join(',')}: ${r.path} floors ${r.floors} fit ${r.k} stretch ${r.stretch} size ${r.size.join('x')}${r.reason?' - '+r.reason:''}`);
  if(!city.report.length) L.push(' none imported - procedural boxes in use');
  return L.join('\n');
}
window.setInterval(()=> { const el=document.getElementById('uo-diag'); const cr=document.getElementById('uo-credits'); if(el && cr && !cr.hidden) el.textContent=diagText(); },700);

function start() {
  if(state==='play') PF.report('gameover',{score});
  release();
  disposeHero();
  resetDriving();
  hero=makeHero(city.spawn.toArray()); wireHero();
  score=elapsed=0;before=best;targetIndex=0;moveX=moveY=0;state='play';
  UI.setScore(0); only('uo-hud'); loop.resume(); PF.report('started'); SAVE.set('started',true); UI.setSave(true);
  if(!SAVE.get('tutorialDone',false)) UI.hint($('uo-stick'));
}
function firstMove() { UI.clearHint(); SAVE.set('tutorialDone',true); }
function finish() {
  if(state==='play') PF.report('gameover',{score});
  state='menu'; release(); resetMission(); resetCourier();
  if(mode==='drive') { resetDriving(); hero=makeHero(city.spawn.toArray()); wireHero(); }
  if(hero) { hero.move(0,0); hero.sprint(false); }
  UI.setBest(best);
  UI.pause(false); only('uo-menu'); loop.resume();
}
$('uo-pause').addEventListener('click',()=>{ firstMove(); moveX=moveY=0;brakeHeld=false;release();loop.pause();ui.playing=false;refreshDriveUi();UI.pause(true); });
$('uo-phone-btn').addEventListener('click',()=>{ if(state==='play'&&!loop.paused) UI.openPhone('home'); });
function jump() { if(state!=='play'||loop.paused||mode==='drive'||!hero||UI.phoneOpen())return; firstMove();HAPTICS.tap();hero.jump(); }
$('uo-jump').addEventListener('pointerdown',jump);
const stick=$('uo-stick');
/** @param {PointerEvent} e */
function steer(e) {
  const r=stick.getBoundingClientRect(),dx=e.clientX-r.left-64,dy=e.clientY-r.top-64;
  const l=Math.max(44,Math.hypot(dx,dy)); moveX=dx/l;moveY=dy/l;
  $('uo-knob').setAttribute('cx',String(64+moveX*40));$('uo-knob').setAttribute('cy',String(64+moveY*40));
}
stick.addEventListener('pointerdown',e=>{ if(loop.paused)return;firstMove();HAPTICS.tap();stick.setPointerCapture(e.pointerId);steer(e); });
stick.addEventListener('pointermove',e=>{if(stick.hasPointerCapture(e.pointerId))steer(e);});
function release() {moveX=moveY=0;$('uo-knob').setAttribute('cx','64');$('uo-knob').setAttribute('cy','64');}
stick.addEventListener('pointerup',release);stick.addEventListener('pointercancel',release);
INPUT.onDrag((dx,dy,phase)=> {
  if(state!=='play'||loop.paused||UI.phoneOpen())return;
  firstMove();
  if(phase==='start'){dragX=dx;dragY=dy;dragging=true;return;}
  if(phase==='end'){dragging=false;return;}
  // sensitivity comes from the settings slider, so a slow phone does not spin the camera
  const ddx=(dx-dragX)*camRig.state.sensitivity, ddy=(dy-dragY)*camRig.state.sensitivity;
  if(mode==='drive') yawOffset-=ddx; else camRig.drag(dx-dragX, 0, elapsed*1000);
  camRig.pitchTilt(dy-dragY);
  dragX=dx;dragY=dy;
});
INPUT.onKey('Space',jump);
/* ---------------- quick wheel ---------------- */
function wheelInfo() {
  const driving=mode==='drive', hp=hero?hero.position:[0,0,0], px=driving?car.s.x:hp[0], pz=driving?car.s.z:hp[2];
  const dx=driving?Math.sin(car.s.h):-Math.sin(yaw), dz=driving?Math.cos(car.s.h):-Math.cos(yaw), cst=SAVE.get('courier',{done:0,best:0});
  const C=CONFIG.courier, q=courier.s==='active'?courierTarget():mission.s==='active'?city.missionPoints[mission.idx]:null;
  return {
    player:{x:px,z:pz,dx,dz,driving}, clock:elapsed, score, best, token:city.spots[targetIndex],
    vehicles:VLIST.map(v=>({kind:v.kind,name:VEH_NAME[v.kind],x:v.ctrl.s.x,z:v.ctrl.s.z,inUse:driving&&cur===v,distance:Math.round(Math.hypot(v.ctrl.s.x-px,v.ctrl.s.z-pz)),blurb:v.kind==='car'?'fast and grippy roadster':'light, quick, leans into turns'})),
    objective:q?(courier.s==='active'?{title:'Courier Run',text:courier.txt.replace(/^COURIER \d\/3 · /,''),x:q.x,z:q.z,color:'#ff4fd8'}:{title:'Delivery Run',text:`Reach the checkpoint · ${Math.ceil(mission.t)} s left`,x:q.x,z:q.z,color:'#38e8ff'}):null,
    delivery:{state:mission.s,t:mission.t,reward:CONFIG.mission.reward,time:CONFIG.mission.time},
    courier:{state:courier.s==='active'?'active':'idle',stage:courier.stage+1,text:courier.txt.replace(/^COURIER \d\/3 · /,''),done:cst.done||0,best:cst.best||0,reward:C.pickup+C.deliver+C.finish,t2:C.time2,t3:C.time3},
  };
}
const wheel=createWheel({
  isPlaying:()=>state==='play'&&!loop.paused,
  onOpen:()=> { moveX=moveY=0; brakeHeld=false; loop.pause(); ui.playing=false; refreshDriveUi(); },
  onClose:()=> { loop.resume(); ui.playing=false; refreshDriveUi(); },
  getInfo:wheelInfo, world:{half:55,colliders:city.colliders,scale:CONFIG.world.scale},
  actions:{ startCourier:()=> { void startCourier(); }, abortCourier:()=> { if(courier.s==='active') courierEnd(false,'Job dropped'); },
    callVehicle:(k)=>callVeh(/** @type {'car'|'bike'} */ (k)), switchVehicle:(k)=>switchVeh(/** @type {'car'|'bike'} */ (k)) },
});
$('uo-wheelbtn').addEventListener('click',()=> wheel.open());
INPUT.onKey('KeyQ',()=> { if(wheel.isOpen()) wheel.close(); else wheel.open(); });

const loop=startLoop({
  update(dt) {
    const blocked=UI.phoneOpen();               // the phone swallows movement and vehicle input
    let x=blocked?0:moveX,y=blocked?0:moveY;
    if(state==='play'&&!blocked) {
      const k=INPUT.axis();if(INPUT.key('KeyW')||INPUT.key('KeyA')||INPUT.key('KeyS')||INPUT.key('KeyD')||INPUT.key('ArrowUp')||INPUT.key('ArrowDown')||INPUT.key('ArrowLeft')||INPUT.key('ArrowRight')) {x=k.x;y=k.y;firstMove();}
      if(mode==='drive') {
        cur.pv.x=car.s.x; cur.pv.z=car.s.z; cur.pv.h=car.s.h;
        car.input.throttle=-y; car.input.steer=x; car.input.brake=blocked?true:(brakeHeld||INPUT.key('Space'));
        const hit=car.update(dt,P(cur),city.colliders,city.isRoad);
        if(cur.parts) cur.wheel+=car.s.speed*dt/cur.parts.r; // wheel roll comes from the simulated distance, so it is exact at any frame rate
        if(hit>4) { HAPTICS.bump(); SFX.play('impact.punch',{volume:Math.min(0.6,hit/30)}); }
        // a swipe adds a temporary orbit offset that eases back to the chase position
        if(!dragging) yawOffset*=Math.exp(-1.4*dt);
      } else if(hero) {
        yaw=camRig.state.yaw;
        hero.move((x*Math.cos(yaw)+y*Math.sin(yaw))*CONFIG.player.strength,(-x*Math.sin(yaw)+y*Math.cos(yaw))*CONFIG.player.strength);
        hero.sprint(Math.hypot(x,y)>=CONFIG.player.runThreshold);
      }
    } else if(hero) {hero.move(0,0);hero.sprint(false);}
    if(blocked&&hero) {hero.move(0,0);hero.sprint(false);} // the phone freezes the hero even if a stick push was queued that frame
    physics.step(dt);VFX.update(dt);
    if(hero && hero.position[1]<CONFIG.player.recoveryDepth) {disposeHero();hero=makeHero(city.spawn.toArray());wireHero();}
    const driving=mode==='drive', px=driving?car.s.x:hero?hero.position[0]:0, pz=driving?car.s.z:hero?hero.position[2]:0, py=driving||!hero?0:hero.position[1];
    if(state==='play') {
      elapsed+=dt;
      if((!driving?nearVeh():null)!==ui.near || !ui.playing) refreshDriveUi();
      if(driving) { const kmh=Math.round(Math.abs(car.s.speed)*3.6); if(kmh!==ui.kmh) { ui.kmh=kmh; UI.setSpeed(kmh); } }
      const p=city.spots[targetIndex];
      if(Math.hypot(px-p.x,pz-p.z)<CONFIG.hunt.radius+(driving?1.4:0) && py<3) { award(CONFIG.hunt.points,p.x,p.z); relocate(); }
      updateMission(dt,px,pz); updateCourier(dt,px,pz);
    }
    for(const v of VLIST) { v.marker.visible=state==='play'&&v.ready&&!(driving&&v===cur); v.marker.position.set(v.ctrl.s.x,(v.kind==='bike'?2.6:3.4)+Math.sin(elapsed*3)*0.25,v.ctrl.s.z); v.marker.rotation.y+=dt*2; }
    const p=city.spots[targetIndex];token.position.set(p.x,1.4+Math.sin(elapsed*3)*0.15,p.z);token.scale.setScalar(CONFIG.hunt.size);token.rotation.y+=dt*1.8;
    tokenMat.color.set(CONFIG.palette.gold);beam.position.set(p.x,CONFIG.hunt.beacon/2,p.z);beam.scale.y=CONFIG.hunt.beacon;
    token.visible=beam.visible=state==='play';
  },
  render(alpha) {
    physics.sync(alpha);
    if(mode==='walk') poseHeroFrame(Math.min(100,performance.now()-lastFrame)/1000);
    const now=performance.now(), ft=now-lastFrame; lastFrame=now;
    if(ft<250) emaMs+=(Math.min(ft,100)-emaMs)*0.05;
    if(state==='play'&&!loop.paused&&elapsed>3&&CONFIG.quality.autoQuality&&qualityLevel<2) { // slow phone: lower resolution first, then drop the shadow
      if(emaMs>42) slowMs+=ft; else slowMs=Math.max(0,slowMs-ft*2);
      if(slowMs>4000) { qualityLevel++; slowMs=0; applyQuality(); }
    } else slowMs=0;
    const dtf=Math.min(ft,100)/1000;
    /* the rider: while riding, the pose follows the bike every frame; on foot, a pending dismount
       blend finishes first. Both are skipped entirely when there is no rider. */
    if(mode==='drive'&&cur&&cur.kind==='bike') poseRider(cur,dtf,true);
    updateDismount(dtf);
    for(const v of VLIST) if(v.ready) drawVeh(v,alpha,dtf);
    let lx=0,lz=0;
    if(mode==='drive' && cur) {
      lx=cur.root.position.x; lz=cur.root.position.z;
      camRig.update(dtf,{mode:cur.kind==='bike'?'bike':'car',x:lx,z:lz,y:cur.root.position.y,heading:car.s.h+yawOffset,speed:Math.abs(car.s.speed),steer:car.s.steer,now});
    } else if(hero) {
      const p=hero.drawPosition; lx=p[0]; lz=p[2];
      camRig.update(dtf,{mode:'walk',x:p[0],z:p[2],y:p[1],heading:hero.facing,speed:hero.speed,sprint:hero.speed>5.2,now});
    }
    if(Math.abs(lx-sunX)>6||Math.abs(lz-sunZ)>6) { sunX=Math.round(lx/6)*6; sunZ=Math.round(lz/6)*6; sun.target.position.set(sunX,0,sunZ); sun.position.set(sunX+15,35,sunZ+12); } // shadow follows the player
    renderer.render(scene,camera);
  },
});
camera.position.set(0,5,20);PF.on('before-shot',()=>renderer.render(scene,camera));

/** @param {'office'|'apartment'} kind @param {string} name */
async function loadBuilding(kind,name) {
  try {
    await MODELS.load([name]);
    const source=MODELS.model(name).scene;
    let usable=false;
    source.traverse(node=> { if(node instanceof THREE.Mesh && (node.geometry.getAttribute('position')?.count ?? 0)>0) usable=true; });
    const size=new THREE.Box3().setFromObject(source).getSize(new THREE.Vector3());
    if(!usable || ![size.x,size.y,size.z].every(n=>Number.isFinite(n)&&n>0)) throw new Error('No usable three-dimensional building geometry');
    importedBuildings[kind]=source;
    return true;
  } catch(error) {
    console.warn('Building upload unavailable; keeping the V1 buildings:',name,error);
    return false;
  }
}
(async()=> {
  const office=await loadBuilding('office','low_poly_city_office_building_low_2');
  const apartment=await loadBuilding('apartment','low_poly_city_apartment_building_low_2');
  city.refreshBuildings();
  UI.setAssetStatus(`Office: ${office?'loaded':'unavailable'} · Apartments: ${apartment?'loaded':'unavailable'}`);
  UI.bootNote('Loading vehicles and character…');
  await loadExtras();
  UI.ready(true); UI.setSave(!!SAVE.get('started',false));
})();
/** Fresh copy of the uploaded character, mapped to the ragdoll and (optionally) dressed. */
const CHAR_MODELS={suit:'male_character_in_suit',scan:'char_scan_lite',mannequin:'characterrigged'}; /** @type {'suit'|'scan'|'mannequin'} */ let charKind='suit';
function buildCharacter(/** @type {'suit'|'scan'|'mannequin'} */ kind=charKind) {
  if(kind==='suit') return prepareSuitCharacter(MODELS.model(CHAR_MODELS.suit).scene);
  if(kind==='scan') return prepareScanCharacter(MODELS.model(CHAR_MODELS.scan).scene);
  const c=CONFIG.character;
  return prepareCharacter(MODELS.model(CHAR_MODELS.mannequin).scene,c.tint,c.dressed?{hoodie:CONFIG.palette.hoodie,pants:c.pants,shoes:c.shoes,skin:c.skin,hair:c.hair,cap:c.cap}:null);
}
for(const key of ['character.dressed','character.pants','character.shoes','character.skin','character.hair','character.cap','character.tint','palette.hoodie']) CONFIG.on(key,()=> { if(!charModel) return; try { const r=buildCharacter(); if(r.model) { charModel=r.model; diag.char=`uploaded model mapped; ${r.dressed}`; swapHero(); } } catch(error) { console.warn('[character] rebuild failed:',error); } });
/** Loads the Lamborghini and the character after the menu is already usable; either can fail without breaking the game. */
async function loadExtras() {
  const order=CONFIG.car.model==='full'?['full','lite']:['lite','full']; /** @type {string[]} */ const notes=[]; let loaded='';
  for(const key of order) {
    try { await MODELS.load([CAR_MODELS[key]]); V.car.source=MODELS.model(CAR_MODELS[key]).scene; mountVeh(V.car); loaded=key; break; }
    catch(error) { console.warn('[car] model unavailable:',CAR_MODELS[key],error); notes.push(key+' model unavailable'); V.car.source=null; }
  }
  if(!loaded) { mountVeh(V.car); notes.push('using simple box car'); }
  diag.car=(loaded?`${loaded} model loaded`:'fallback')+(notes.length?' ('+notes.join('; ')+')':'');
  const readyVeh=(/** @type {typeof V.car} */ v)=> { v.ready=true; v.root.visible=true; const sp=v.kind==='bike'?city.bikeSpawn:city.carSpawn; v.ctrl.reset(sp.x,sp.z,sp.heading); v.pv.x=sp.x; v.pv.z=sp.z; v.pv.h=sp.heading; parkBody(v); };
  readyVeh(V.car); ui.playing=false; refreshDriveUi();
  try { // the bobber
    await MODELS.load([BIKE_MODEL]); V.bike.source=MODELS.model(BIKE_MODEL).scene; mountVeh(V.bike);
    diag.bike=V.bike.parts?'bobber model loaded (wheels spin, fork steers)':'bobber model loaded (no separate wheels found)';
  } catch(error) { console.warn('[bike] model unavailable:',error); V.bike.source=null; mountVeh(V.bike); diag.bike='fallback box bike (model unavailable)'; }
  readyVeh(V.bike); ui.playing=false; refreshDriveUi();
  /** @type {string[]} */ const cn=[];
  /* the suit character is the player; the V2 scan and the mannequin remain as fallbacks */
  const cm=CONFIG.character.model;
  for(const kind of /** @type {('suit'|'scan'|'mannequin')[]} */ (cm==='mannequin'?['mannequin']:cm==='scan'?['scan','mannequin']:['suit','scan','mannequin'])) {
    try {
      await MODELS.load([CHAR_MODELS[kind]]);
      const r=buildCharacter(kind);
      if(r.model) { charModel=r.model; charKind=kind; diag.bind=captureBindPose(r.model)+' bones'; diag.char=`${kind} character: rig accepted (rest pose ${r.info.restPose}, facing ${r.info.facing}); ${r.dressed}`+(cn.length?' [fallback: '+cn.join('; ')+']':''); if(CONFIG.character.useModel) swapHero(); break; }
      cn.push(kind+': '+r.reason); console.warn('[character]',kind,r.reason);
    } catch(error) { cn.push(kind+': could not load'); console.warn('[character] unavailable:',kind,error); }
  }
  if(!charModel) diag.char='boxy fallback - '+cn.join('; ');
}
