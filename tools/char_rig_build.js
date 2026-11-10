// skin the decimated scan to the fitted skeleton and write m/char/char_scan_lite.glb
const fs=require('fs'); const write=require('./glbwrite.js'); const D='/home/claude/work/m/char/';
const f32=f=>{const b=fs.readFileSync(D+f);return new Float32Array(b.buffer,b.byteOffset,b.byteLength/4);};
const P=f32('lite.P.bin'),N=f32('lite.N.bin'),C=f32('lite.C.bin'); const ib=fs.readFileSync(D+'lite.I.bin'); const I=new Uint32Array(ib.buffer,ib.byteOffset,ib.byteLength/4);
const R=JSON.parse(fs.readFileSync('/home/claude/work/tools/char_rig.json','utf8'));
const K=+(process.argv[2]||5); const LOCK_LEFT_ARM=process.argv[3]!=='free';
// joint order (bone name, parent) -- names match what RAGDOLL.create({model}) looks for
const joints=[['hips',null],['spine','hips'],['chest','spine'],['head','chest'],
 ['leftUpperArm','chest'],['leftLowerArm','leftUpperArm'],['leftHand','leftLowerArm'],['rightUpperArm','chest'],['rightLowerArm','rightUpperArm'],['rightHand','rightLowerArm'],
 ['leftUpperLeg','hips'],['leftLowerLeg','leftUpperLeg'],['leftFoot','leftLowerLeg'],['rightUpperLeg','hips'],['rightLowerLeg','rightUpperLeg'],['rightFoot','rightLowerLeg']];
const mid=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const hipsC=R.hips, neck=[R.chest[0]-0.02,1.55,R.chest[2]];
// skinning capsules: [bone, A, B, radius, side constraint: 0 none, +1 needs x>xmin, -1 needs x<xmax]
const cx=R.hips[0];
const caps=[
 ['hips',[cx,0.99,hipsC[2]],[cx,0.80,hipsC[2]],0.17,0],
 ['spine',[cx-0.01,1.00,R.spine[2]],[cx-0.02,1.22,R.spine[2]],0.16,0],
 ['chest',[cx-0.02,1.22,R.chest[2]],neck,0.19,0],
 ['head',R.head,R.headTop,0.13,0],
 ['leftUpperArm',R.leftUpperArm,R.leftLowerArm,0.065,1],['leftLowerArm',R.leftLowerArm,R.leftHand,0.05,1],['leftHand',R.leftHand,R.leftHandEnd,0.045,1],
 ['rightUpperArm',R.rightUpperArm,R.rightLowerArm,0.065,-1],['rightLowerArm',R.rightLowerArm,R.rightHand,0.05,-1],['rightHand',R.rightHand,R.rightHandEnd,0.045,-1],
 ['leftUpperLeg',R.leftUpperLeg,R.leftLowerLeg,0.10,1],['leftLowerLeg',R.leftLowerLeg,R.leftFoot,0.07,1],['leftFoot',R.leftFoot,R.leftToe,0.065,1],
 ['rightUpperLeg',R.rightUpperLeg,R.rightLowerLeg,0.10,-1],['rightLowerLeg',R.rightLowerLeg,R.rightFoot,0.07,-1],['rightFoot',R.rightFoot,R.rightToe,0.065,-1],
];
const jIndex=Object.fromEntries(joints.map((j,i)=>[j[0],i]));
const segDist=(p,a,b)=>{const ab=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],ap=[p[0]-a[0],p[1]-a[1],p[2]-a[2]];const l2=ab[0]*ab[0]+ab[1]*ab[1]+ab[2]*ab[2];let t=l2>0?(ap[0]*ab[0]+ap[1]*ab[1]+ap[2]*ab[2])/l2:0;t=Math.max(0,Math.min(1,t));const q=[a[0]+ab[0]*t-p[0],a[1]+ab[1]*t-p[1],a[2]+ab[2]*t-p[2]];return Math.hypot(q[0],q[1],q[2]);};
const n=P.length/3,J=new Uint16Array(n*4),W=new Float32Array(n*4); const usage=new Float32Array(joints.length);
for(let i=0;i<n;i++){
  const p=[P[i*3],P[i*3+1],P[i*3+2]]; const cand=[];
  const cr=C[i*3],cg=C[i*3+1],cb=C[i*3+2]; const flesh=cr>0.08&&cr>cb*1.25&&cr>cg*1.08;
  // skin-coloured forearm/hand vertices (y 0.70..1.30) can only belong to the arm on their side, even when the hand rests on the hip
  const armOnly = flesh && p[1]>0.70 && p[1]<1.30 && Math.abs(p[0]-cx)>0.05;
  for(const [bone,a,b,r,side] of caps){
    if(armOnly && !/Arm$|Hand$/.test(bone)) continue;
    if(armOnly && ((p[0]>cx)!==(side===1))) continue;
    if(side===1 && p[0]<cx-0.07) continue; if(side===-1 && p[0]>cx+0.07) continue;   // keep left/right limbs apart
    const dn=segDist(p,a,b)/r; cand.push([jIndex[bone],Math.exp(-K*dn*dn)]);
  }
  if(LOCK_LEFT_ARM){ // the scan's left forearm is fused to the torso: bind it rigidly to the chest so it never tears
    const lock=new Set([jIndex.leftUpperArm,jIndex.leftLowerArm,jIndex.leftHand]); const acc={};
    for(const [j,w] of cand){ const k=lock.has(j)?jIndex.chest:j; acc[k]=(acc[k]||0)+w; }
    cand.length=0; for(const k of Object.keys(acc)) cand.push([+k,acc[k]]);
  }
  cand.sort((x,y)=>y[1]-x[1]); const top=cand.slice(0,4); let s=top.reduce((q,c)=>q+c[1],0);
  if(s<1e-9){ // far from every capsule: nearest bone by distance
    let best=0,bd=1e9; caps.forEach(([bone,a,b],k)=>{const d=segDist(p,a,b);if(d<bd){bd=d;best=jIndex[bone];}}); top.length=0; top.push([LOCK_LEFT_ARM&&[jIndex.leftUpperArm,jIndex.leftLowerArm,jIndex.leftHand].includes(best)?jIndex.chest:best,1]); s=1; }
  for(let k=0;k<4;k++){ if(top[k]){J[i*4+k]=top[k][0];W[i*4+k]=top[k][1]/s;usage[top[k][0]]+=top[k][1]/s;} }
}
console.log('weight mass per bone:',joints.map((j,i)=>j[0]+':'+usage[i].toFixed(0)).join(' '));
// node hierarchy
const world=name=>R[name]; const nodes=[]; const idx={};
nodes.push({name:'Armature',children:[]}); // 0
joints.forEach(([name,parent])=>{ idx[name]=nodes.length; const pw=parent?world(parent):[0,0,0]; const w=world(name); nodes.push({name,children:[],translation:[w[0]-pw[0],w[1]-pw[1],w[2]-pw[2]]}); (parent?nodes[idx[parent]]:nodes[0]).children.push(idx[name]); });
const ibm=new Float32Array(joints.length*16); joints.forEach(([name],i)=>{const w=world(name); ibm.set([1,0,0,0, 0,1,0,0, 0,0,1,0, -w[0],-w[1],-w[2],1],i*16);});
const meshIdx=nodes.length; nodes.push({name:'ScanBody',mesh:{P,N,C,IDX:I,J,W},skin:{joints:joints.map(j=>idx[j[0]]),ibm}});
const bytes=write(D+'char_scan_lite.glb',{nodes,roots:[0,meshIdx],material:{roughness:0.85,metalness:0.0,doubleSided:false}});
console.log('wrote char_scan_lite.glb',bytes,'bytes; verts',n,'tris',I.length/3);
