import * as THREE from 'three';
import { rigidBody, box, MotionType } from 'crashcat';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import CONFIG from './config.js';
import { makeVehicle, VEHICLE_SIZE } from './vehicles.js';

/** @param {THREE.Scene} scene @param {ReturnType<typeof import('ragdoll').default.createPhysics>} physics @param {{office: THREE.Object3D|null, apartment: THREE.Object3D|null}} imported */
export function createCity(scene, physics, imported = { office: null, apartment: null }) {
  const group = new THREE.Group();
  scene.add(group);
  /** @type {number[]} */ const bodies = [];
  /** @type {THREE.Mesh[]} */ const obstacles = [];
  /** @type {THREE.Vector3[]} */ const spots = [];
  const spawn = new THREE.Vector3(0, 0.1, 12);
  /** @type {{kind:string,path:string,ok:boolean,reason:string,slot:number[],floors:number,k:number,stretch:number,size:number[]}[]} */ const report = [];
  /** solid footprints for the arcade car: {minX,maxX,minZ,maxZ} */ const colliders = [];
  /** @type {THREE.Vector3[]} */ const missionPoints = [];
  /** courier mission: pickup spot by the park fountain and two drop/finish route variants (all on open road) */
  const pickup = new THREE.Vector3();
  /** @type {{drop:THREE.Vector3,fin:THREE.Vector3}[]} */ const courierRoutes = [];
  const tints = new Map();
  const mats = {
    road: new THREE.MeshStandardMaterial(), grass: new THREE.MeshStandardMaterial(),
    cream: new THREE.MeshStandardMaterial(), coral: new THREE.MeshStandardMaterial(),
    blue: new THREE.MeshStandardMaterial(),
    pavement: new THREE.MeshStandardMaterial({ color: '#c3cbd0' }),
    dark: new THREE.MeshStandardMaterial({ color: '#243644' }),
    white: new THREE.MeshStandardMaterial({ color: '#fff5df' }),
    leaf: new THREE.MeshStandardMaterial({ color: '#368443' }),
    wood: new THREE.MeshStandardMaterial({ color: '#936747' }),
    glass: new THREE.MeshStandardMaterial({ color: '#73bee5', roughness: 0.3 }),
  };
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const ball = new THREE.IcosahedronGeometry(1, 0);
  /** @param {number} x @param {number} y @param {number} z @param {number} w @param {number} h @param {number} d @param {THREE.Material} mat @param {boolean} solid */
  function block(x,y,z,w,h,d,mat,solid=false) {
    const m = new THREE.Mesh(cube, mat);
    m.position.set(x,y,z); m.scale.set(w,h,d);
    m.castShadow = h > 1; m.receiveShadow = true; group.add(m);
    if (solid) {
      const b = rigidBody.create(physics.world, { shape: box.create({ halfExtents: [w/2,h/2,d/2] }), motionType: MotionType.STATIC, objectLayer: physics.layers.static, position: [x,y,z], friction: 0.8 });
      bodies.push(b.id); obstacles.push(m);
      if (y+h/2 > 0.3) colliders.push({ minX:x-w/2, maxX:x+w/2, minZ:z-d/2, maxZ:z+d/2 });
    }
    return m;
  }
  const ROOF = /roof/i, GROUND = /door|plinth|porch|entry|entrance/i, WALL = /wall/i;
  /** @param {THREE.Material} mat @param {string} color */
  function tinted(mat,color) {
    if (!color || color.toLowerCase()==='#ffffff' || !(/** @type {any} */ (mat)).color) return mat;
    const key=mat.uuid+color; let t=tints.get(key);
    if (!t) { t=mat.clone(); /** @type {any} */ (t).color.multiply(new THREE.Color(color)); tints.set(key,t); }
    return t;
  }
  /** Split a loaded building into parts (walls/windows repeat per floor; door+plinth only at ground; roof only on top).
      @param {THREE.Object3D} source @param {number} turn */
  function partsOf(source,turn) {
    source.updateMatrixWorld(true);
    const rot=new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(turn));
    /** @type {{kind:string,geo:THREE.BufferGeometry,mat:THREE.Material}[]} */ const parts=[];
    let wall=null;
    source.traverse(n=> {
      const mesh=/** @type {THREE.Mesh} */ (n);
      if (!mesh.isMesh || !(mesh.geometry.getAttribute('position')?.count>0)) return;
      const geo=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld).applyMatrix4(rot);
      geo.computeBoundingBox();
      const kind=ROOF.test(n.name)?'roof':GROUND.test(n.name)?'ground':'storey';
      if (WALL.test(n.name) && !wall) wall=geo.boundingBox.clone();
      parts.push({ kind, geo, mat:Array.isArray(mesh.material)?mesh.material[0]:mesh.material });
    });
    return { parts, wall };
  }
  /** Tall building from the player's own meshes: footprint-fit scale, N stacked floors, small limited stretch.
      @return {{ok:boolean,reason:string,floors?:number,k?:number,stretch?:number,size?:number[]}} */
  function placeStacked(source,x,z,height,width,depth,turn,tint) {
    const { parts, wall }=partsOf(source,turn);
    if (!wall || !parts.some(p=>p.kind==='storey')) return { ok:false, reason:'no wall mesh found to stack' };
    const all=new THREE.Box3(); parts.forEach(p=>all.union(p.geo.boundingBox));
    const fp=all.getSize(new THREE.Vector3());
    const k=Math.min(width/fp.x,depth/fp.z), storey=wall.max.y-wall.min.y, top=all.max.y-all.min.y;
    if (!(k>0) || !(storey>0)) return { ok:false, reason:'invalid size' };
    const maxStretch=CONFIG.buildings.maxStretch, maxFloors=CONFIG.buildings.stackFloors?CONFIG.buildings.maxFloors:1;
    let floors=1, best=Infinity;
    for (let n=1;n<=maxFloors;n++) { const err=Math.abs(Math.log(height/((top+(n-1)*storey)*k))); if (err<best) { best=err; floors=n; } }
    const natural=(top+(floors-1)*storey)*k;
    const sy=THREE.MathUtils.clamp(height/natural,1/maxStretch,maxStretch);
    const cx=(all.min.x+all.max.x)/2, cz=(all.min.z+all.max.z)/2;
    const m=new THREE.Matrix4().makeTranslation(x-cx*k,CONFIG.buildings.groundOffset-all.min.y*k*sy,z-cz*k).multiply(new THREE.Matrix4().makeScale(k,k*sy,k));
    /** @type {Map<THREE.Material,THREE.BufferGeometry[]>} */ const byMat=new Map();
    const add=(p,dy)=> { const g=p.geo.clone(); if (dy) g.translate(0,dy,0); g.applyMatrix4(m); const key=tinted(p.mat,tint); (byMat.get(key)||byMat.set(key,[]).get(key)).push(g); };
    for (const p of parts) {
      if (p.kind==='ground') add(p,0);
      else if (p.kind==='roof') add(p,(floors-1)*storey);
      else for (let f=0;f<floors;f++) add(p,f*storey);
    }
    const bounds=new THREE.Box3();
    for (const [mat,geos] of byMat) {
      const merged=mergeGeometries(geos,false);
      if (!merged) return { ok:false, reason:'geometry merge failed' };
      merged.computeBoundingBox(); merged.computeBoundingSphere(); bounds.union(merged.boundingBox);
      const mesh=new THREE.Mesh(merged,mat); mesh.userData.own=true; mesh.castShadow=false; mesh.receiveShadow=true; group.add(mesh);
      geos.forEach(g=>g.dispose());
    }
    const size=bounds.getSize(new THREE.Vector3()), center=bounds.getCenter(new THREE.Vector3());
    const okSize=[size.x,size.y,size.z].every(n=>Number.isFinite(n)&&n>0);
    if (!okSize || size.x>width*1.03 || size.z>depth*1.03 || size.y<height*0.5 || size.y>height*1.6) {
      return { ok:false, reason:`size check failed (${size.x.toFixed(1)}x${size.y.toFixed(1)}x${size.z.toFixed(1)} for target ${width}x${height}x${depth})`, floors, k, stretch:sy, size:[size.x,size.y,size.z], undo:true };
    }
    const collider=block(center.x,center.y,center.z,size.x,size.y,size.z,mats.dark,true); collider.visible=false;
    return { ok:true, reason:'', floors, k, stretch:sy, size:[size.x,size.y,size.z] };
  }
  /** Fallback: the whole model, one footprint-fit scale, stretch limited. */
  function placeSingle(source,x,z,height,width,depth,turn,tint) {
    const model=source.clone(true);
    model.rotation.y+=THREE.MathUtils.degToRad(turn);
    model.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(model);
    const size=bounds.getSize(new THREE.Vector3());
    if (![size.x,size.y,size.z].every(n=>Number.isFinite(n)&&n>0)) return { ok:false, reason:'invalid model bounds' };
    const k=Math.min(width/size.x,depth/size.z);
    const sy=THREE.MathUtils.clamp(height/(size.y*k),1,CONFIG.buildings.maxStretch);
    model.scale.set(model.scale.x*k,model.scale.y*k*sy,model.scale.z*k); model.updateMatrixWorld(true);
    bounds.setFromObject(model);
    const center=bounds.getCenter(new THREE.Vector3());
    model.position.add(new THREE.Vector3(x-center.x,CONFIG.buildings.groundOffset-bounds.min.y,z-center.z));
    model.traverse(node=> {
      const mesh=/** @type {THREE.Mesh} */ (node);
      if (mesh.isMesh) { mesh.castShadow=false; mesh.receiveShadow=true; if (!Array.isArray(mesh.material)) mesh.material=tinted(mesh.material,tint); }
    });
    group.add(model); model.updateMatrixWorld(true);
    bounds.setFromObject(model); bounds.getSize(size); bounds.getCenter(center);
    const collider=block(center.x,center.y,center.z,size.x,size.y,size.z,mats.dark,true);
    collider.visible=false;
    return { ok:true, reason:'', floors:1, k, stretch:sy, size:[size.x,size.y,size.z] };
  }
  /** Try the stacked build, then the single-model build; false = caller draws the placeholder box. */
  function placeBuilding(kind,source,x,z,height,width,depth,turn) {
    const tint=kind==='office'?CONFIG.buildings.officeTint:CONFIG.buildings.apartmentTint;
    const mark=group.children.length, solids=bodies.length, obs=obstacles.length, cols=colliders.length;
    const undo=()=> { // remove anything a failed attempt added
      while (group.children.length>mark) group.remove(group.children[group.children.length-1]);
      while (bodies.length>solids) { const b=rigidBody.get(physics.world,/** @type {number} */ (bodies.pop())); if (b) rigidBody.remove(physics.world,b); }
      obstacles.length=obs; colliders.length=cols;
    };
    let r;
    try { r=placeStacked(source,x,z,height,width,depth,turn,tint); } catch (e) { r={ ok:false, reason:'stack error: '+(/** @type {Error} */ (e)).message }; }
    let path='stack';
    if (!r.ok) {
      undo(); const why=r.reason;
      try { r=placeSingle(source,x,z,height,width,depth,turn,tint); } catch (e) { r={ ok:false, reason:'single error: '+(/** @type {Error} */ (e)).message }; }
      path='single'; if (!r.ok) undo(); else r.reason='stack skipped: '+why;
    }
    report.push({ kind, path:r.ok?path:'box', ok:r.ok, reason:r.reason, slot:[Math.round(x),Math.round(z)], floors:r.floors||0, k:+(r.k||0).toFixed(3), stretch:+(r.stretch||0).toFixed(3), size:(r.size||[]).map(n=>+n.toFixed(1)) });
    if (!r.ok) console.warn('[city] imported '+kind+' not placed, using box:',r.reason);
    return r.ok;
  }
  function paint() {
    mats.road.color.set(CONFIG.palette.road); mats.grass.color.set(CONFIG.palette.grass);
    mats.cream.color.set(CONFIG.palette.cream); mats.coral.color.set(CONFIG.palette.coral); mats.blue.color.set(CONFIG.palette.blue);
  }
  function build() {
    bodies.forEach(id => { const b = rigidBody.get(physics.world,id); if (b) rigidBody.remove(physics.world,b); });
    bodies.length = obstacles.length = spots.length = colliders.length = report.length = missionPoints.length = 0;
    group.children.forEach(c=> { if (c.userData.own) /** @type {THREE.Mesh} */ (c).geometry.dispose(); });
    group.clear(); paint();
    const s = CONFIG.world.scale;
    let apartmentCount=0;
    block(0,-0.5,0,112,1,112,mats.grass,true);
    for (const a of [-32,0,32]) {
      block(a*s,0.015,0,8,0.03,102,mats.road);
      block(0,0.02,a*s,102,0.03,8,mats.road);
      for (let j=-46;j<=46;j+=8) {
        block(a*s,0.045,j,0.16,0.02,3,mats.white);
        block(j,0.05,a*s,3,0.02,0.16,mats.white);
      }
    }
    for (const x of [-16,16]) for (const z of [-16,16]) {
      const cx=x*s, cz=z*s;
      block(cx,0.06,cz,24*s,0.12,24*s,mats.pavement);
      if (x===16 && z===16) {
        block(cx,0.14,cz,20*s,0.04,20*s,mats.grass);
        block(cx,0.4,cz,4,0.8,4,mats.pavement,true);
        block(cx,0.84,cz,3.4,0.08,3.4,mats.glass);
        block(cx,1.5,cz,0.5,1.4,0.5,mats.cream);
        spots.push(new THREE.Vector3(cx-6,0,cz),new THREE.Vector3(cx+6,0,cz));
      } else {
        if (x===-16 && z===-16 && imported.office && placeBuilding('office',imported.office,cx+CONFIG.buildings.officeOffsetX*s,cz+CONFIG.buildings.officeOffsetZ*s,CONFIG.buildings.officeHeight,CONFIG.buildings.officeWidth*s,CONFIG.buildings.officeDepth*s,CONFIG.buildings.officeTurn)) continue;
        for (const side of [-1,1]) {
          const bx=cx+side*5*s, h=CONFIG.world.height*(side===1?1:0.72);
          if (!(x===-16 && z===-16) && imported.apartment && apartmentCount<CONFIG.buildings.apartmentCount && placeBuilding('apartment',imported.apartment,bx+CONFIG.buildings.apartmentOffsetX*s,cz+CONFIG.buildings.apartmentOffsetZ*s,CONFIG.buildings.apartmentHeight,CONFIG.buildings.apartmentWidth*s,CONFIG.buildings.apartmentDepth*s,side*CONFIG.buildings.apartmentTurn)) {
            apartmentCount++; continue;
          }
          block(bx,h/2+0.12,cz,8*s,h,14*s,side===1?mats.coral:mats.cream,true);
          block(bx,h+0.3,cz,8.5*s,0.35,14.5*s,mats.white);
          for (let floor=2;floor<h;floor+=2.5) for (const ox of [-2,2]) {
            block(bx+ox*s,floor,cz-7.04*s,1.3,1.3,0.06,mats.glass);
            block(bx+ox*s,floor,cz+7.04*s,1.3,1.3,0.06,mats.glass);
          }
          block(bx,1.8,cz-7.2*s,6*s,0.5,0.8,mats.blue);
          block(bx,1,cz-7.06*s,1.6,1.8,0.08,mats.dark);
        }
      }
    }
    for (const x of [-27,-5,5,27]) for (const z of [-27,-5,5,27]) {
      const tx=x*s,tz=z*s;
      block(tx,1.1,tz,0.35,2.2,0.35,mats.wood);
      colliders.push({ minX:tx-0.4, maxX:tx+0.4, minZ:tz-0.4, maxZ:tz+0.4 });
      const crown=new THREE.Mesh(ball,mats.leaf); crown.position.set(tx,3,tz); crown.scale.set(1.8,2.2,1.8); crown.castShadow=true; group.add(crown);
      if (Math.abs(x)===5) spots.push(new THREE.Vector3(tx,0,tz));
    }
    for (const z of [-24,-8,8,24]) for (const x of [-5,5]) {
      block(x*s,2,z*s,0.14,4,0.14,mats.dark);
      colliders.push({ minX:x*s-0.25, maxX:x*s+0.25, minZ:z*s-0.25, maxZ:z*s+0.25 });
      block(x*s,4,z*s,0.65,0.2,0.65,mats.white);
    }
    // parked traffic: six different lightweight vehicle models, parked along the roads (heading: 0/PI = along z, +-PI/2 = along x)
    const parkedCars = [
      [-30,-12,Math.PI,'sedan','#d33a31'], [30,12,0,'suv','#3a3d44'], [-12,30,Math.PI/2,'hatch','#2f6fd6'], [12,-30,-Math.PI/2,'pickup','#2fa37a'],
      [-34,14,Math.PI,'taxi','#f4c20d'], [34,-14,0,'van','#f2f2ee'], [-2.6,-14,0,'sedan','#e8892b'], [18,34,Math.PI/2,'hatch','#f2f2ee'], [-18,-34,-Math.PI/2,'suv','#2fa37a'],
    ];
    for (const [x,z,heading,type,color] of parkedCars) {
      const size = VEHICLE_SIZE[/** @type {keyof typeof VEHICLE_SIZE} */ (type)], alongX = Math.abs(Math.sin(/** @type {number} */ (heading)))>0.5;
      const vehicle = makeVehicle(/** @type {string} */ (type), /** @type {string} */ (color));
      vehicle.position.set(/** @type {number} */ (x)*s,0,/** @type {number} */ (z)*s); vehicle.rotation.y=/** @type {number} */ (heading); group.add(vehicle);
      const solid = block(/** @type {number} */ (x)*s,0.65,/** @type {number} */ (z)*s,alongX?size.L:size.W,1.3,alongX?size.W:size.L,mats.blue,true); solid.visible=false;
    }
    for (const a of [-32,0,32]) for (const b of [-24,24]) spots.push(new THREE.Vector3(a*s,0,b*s));
    for (const a of [-32,32]) for (const b of [-40,40]) missionPoints.push(new THREE.Vector3(a*s,0,b*s));
    pickup.set(16*s+3,0,16*s+3); courierRoutes.length=0;
    courierRoutes.push({ drop:new THREE.Vector3(-32*s,0,16*s), fin:new THREE.Vector3(32*s,0,-32*s) },{ drop:new THREE.Vector3(32*s,0,-16*s), fin:new THREE.Vector3(-32*s,0,32*s) });
    for (const x of [-48,48]) for (const z of [-40,-20,0,20,40]) {
      const h=12+Math.abs(z)*0.25;
      block(x,h/2,z,7,h,8,mats.blue,true);
    }
    for (const x of [-55,55]) block(x,2,0,1,4,112,mats.cream,true);
    for (const z of [-55,55]) block(0,2,z,112,4,1,mats.cream,true);
  }
  build();
  CONFIG.on('world.scale',build); CONFIG.on('world.height',build);
  for (const key of ['groundOffset','officeHeight','officeWidth','officeDepth','officeOffsetX','officeOffsetZ','officeTurn','apartmentHeight','apartmentWidth','apartmentDepth','apartmentOffsetX','apartmentOffsetZ','apartmentTurn','apartmentCount','stackFloors','maxFloors','maxStretch','officeTint','apartmentTint']) CONFIG.on('buildings.'+key,build);
  for (const key of ['road','grass','cream','coral','blue']) CONFIG.on('palette.'+key,paint);
  /** @param {number} x @param {number} z */
  function isRoad(x,z) { const s=CONFIG.world.scale; for (const a of [-32,0,32]) if (Math.abs(x-a*s)<4.4 || Math.abs(z-a*s)<4.4) return true; return false; }
  const carSpawn = { x: 2.6, z: 8.5, heading: Math.PI };
  const bikeSpawn = { x: -2.4, z: 4.0, heading: Math.PI };
  return { spawn, spots, obstacles, colliders, report, missionPoints, pickup, courierRoutes, carSpawn, bikeSpawn, isRoad, refreshBuildings: build };
}
