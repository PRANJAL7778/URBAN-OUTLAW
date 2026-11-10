// classify bike triangles into groups and write a colour-coded preview GLB (original resolution)
const fs=require('fs'); const write=require('./glbwrite.js'); const D='/home/claude/work/m/bike/';
const f32=f=>{const b=fs.readFileSync(D+f);return new Float32Array(b.buffer,b.byteOffset,b.byteLength/4);};
const P=f32('pos.bin'),N=f32('nor.bin'); const ib=fs.readFileSync(D+'idx.bin'); const I=new Uint32Array(ib.buffer,ib.byteOffset,ib.byteLength/4);
const FC=[-0.663,-0.136], RC=[0.673,-0.133], RW=0.283, rake=25*Math.PI/180, A=[Math.sin(rake),Math.cos(rake)], tHead=0.40, xCut=-0.36;
function group(cx,cy,cz){
  const rr=Math.hypot(cx-RC[0],cy-RC[1]), rf=Math.hypot(cx-FC[0],cy-FC[1]);
  const inner=(r)=> r<0.235 && Math.abs(cz)>0.105;       // fork legs / swingarm / caliper sit beside the hub: not part of the spinning wheel
  const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)); const fAng=Math.atan2(A[1],A[0]);
  const forkDir=(rf>0.03&&rf<0.225&&Math.abs(wrap(Math.atan2(cy-FC[1],cx-FC[0])-fAng))<0.22);   // fork leg running up from the axle
  const armDir=(rr>0.03&&rr<0.225&&Math.abs(wrap(Math.atan2(cy-RC[1],cx-RC[0])-Math.atan2(0.06,-1)))<0.22); // swingarm running forward from the axle
  if(rr<RW && !inner(rr) && !armDir) return 1;            // rear wheel
  if(rf<RW && !inner(rf) && !forkDir) return 2;           // front wheel
  if(forkDir && rf<RW) return 3;
  if(armDir && rr<RW) return 0;
  const vx=cx-FC[0],vy=cy-FC[1], t=vx*A[0]+vy*A[1], perp=Math.abs(vx*A[1]-vy*A[0]);
  if(t<tHead && cx<xCut) return 3;                         // fork, lamp (below the head plane, in front)
  if(perp<0.13 && t>=-0.05 && t<tHead+0.28 && cx<-0.30) return 3; // fork tubes + handlebar zone along the steering axis
  return 0;
}
const cols=[[0.55,0.55,0.58],[0.2,0.4,1.0],[0.2,0.9,0.3],[1.0,0.25,0.2]]; const gi=new Uint8Array(I.length/3), cnt=[0,0,0,0];
for(let t=0;t<I.length/3;t++){const a=I[t*3],b=I[t*3+1],c=I[t*3+2]; const cx=(P[a*3]+P[b*3]+P[c*3])/3,cy=(P[a*3+1]+P[b*3+1]+P[c*3+1])/3,cz=(P[a*3+2]+P[b*3+2]+P[c*3+2])/3; gi[t]=group(cx,cy,cz); cnt[gi[t]]++;}
console.log('triangles per group [body, rearWheel, frontWheel, fork/bars]:',cnt.join(', '));
const C=new Float32Array(P.length); const Nn=N; const IDX=new Uint32Array(I.length);
// unshare vertices per triangle colour: duplicate vertices
const P2=new Float32Array(I.length*3),N2=new Float32Array(I.length*3),C2=new Float32Array(I.length*3),I2=new Uint32Array(I.length);
for(let t=0;t<I.length/3;t++){for(let k=0;k<3;k++){const v=I[t*3+k],o=t*3+k;P2.set(P.subarray(v*3,v*3+3),o*3);N2.set(N.subarray(v*3,v*3+3),o*3);C2.set(cols[gi[t]],o*3);I2[o]=o;}}
console.log('bytes',write('/home/claude/work/insp/bike_groups.glb',{nodes:[{name:'bike',mesh:{P:P2,N:N2,C:C2,IDX:I2}}],roots:[0]}));
