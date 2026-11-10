const fs=require('fs'); const write=require('./glbwrite.js'); const {decimate}=require('./qem.js'); const bake=require('./bake.js'); const D='/home/claude/work/m/bike/';
const f32=f=>{const b=fs.readFileSync(D+f);return new Float32Array(b.buffer,b.byteOffset,b.byteLength/4);};
const P=f32('pos.bin'),N=f32('nor.bin'),UV=f32('uv.bin'); const ib=fs.readFileSync(D+'idx.bin'); const I=new Uint32Array(ib.buffer,ib.byteOffset,ib.byteLength/4);
const {C,W}=bake(D,UV); console.log('texture',W,'x',W);
const FC=[-0.663,-0.136], RC=[0.673,-0.133], RW=0.283, rake=25*Math.PI/180, A=[Math.sin(rake),Math.cos(rake)], tHead=0.40, xCut=-0.36;
function group(cx,cy,cz){
  const rr=Math.hypot(cx-RC[0],cy-RC[1]), rf=Math.hypot(cx-FC[0],cy-FC[1]); const inner=(r)=> r<0.235 && Math.abs(cz)>0.105;
  const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)); const fAng=Math.atan2(A[1],A[0]);
  const forkDir=(rf>0.03&&rf<0.225&&Math.abs(wrap(Math.atan2(cy-FC[1],cx-FC[0])-fAng))<0.22);
  const armDir=(rr>0.03&&rr<0.225&&Math.abs(wrap(Math.atan2(cy-RC[1],cx-RC[0])-Math.atan2(0.06,-1)))<0.22);
  if(rr<RW && !inner(rr) && !armDir) return 1; if(rf<RW && !inner(rf) && !forkDir) return 2; if(forkDir && rf<RW) return 3; if(armDir && rr<RW) return 0;
  const vx=cx-FC[0],vy=cy-FC[1], t=vx*A[0]+vy*A[1], perp=Math.abs(vx*A[1]-vy*A[0]);
  if(t<tHead && cx<xCut) return 3; if(perp<0.13 && t>=-0.05 && t<tHead+0.28 && cx<-0.30) return 3; return 0;
}
const tris=[[],[],[],[]];
for(let t=0;t<I.length/3;t++){const a=I[t*3],b=I[t*3+1],c=I[t*3+2]; tris[group((P[a*3]+P[b*3]+P[c*3])/3,(P[a*3+1]+P[b*3+1]+P[c*3+1])/3,(P[a*3+2]+P[b*3+2]+P[c*3+2])/3)].push(a,b,c);}
const targets=[11000,7000,6000,4000], LAMBDA=1e-3; const out=[];
for(let g=0;g<4;g++){
  // compact the subset
  const map=new Map(),pv=[],nv=[],cv=[],idx=[]; for(const v of tris[g]){let k=map.get(v);if(k===undefined){k=map.size;map.set(v,k);pv.push(P[v*3],P[v*3+1],P[v*3+2]);nv.push(N[v*3],N[v*3+1],N[v*3+2]);cv.push(C[v*3],C[v*3+1],C[v*3+2]);}idx.push(k);}
  const r=decimate({P0:Float32Array.from(pv),N0:Float32Array.from(nv),C0:Float32Array.from(cv),I0:Uint32Array.from(idx)},targets[g],LAMBDA);
  console.log('group',g,'tris',tris[g].length/3,'->',r.IDX.length/3); out.push(r);
}
// nodes: 0 bike, 1 body, 2 rearWheel, 3 fork (steering pivot), 4 frontWheel (child of fork)
const P0=[FC[0]+0.40*A[0],FC[1]+0.40*A[1],0];  // point on the steering axis (head tube)
const shift=(r,o)=>{const q=Float32Array.from(r.P);for(let i=0;i<q.length;i+=3){q[i]-=o[0];q[i+1]-=o[1];q[i+2]-=o[2];}return {...r,P:q};};
const nodes=[
 {name:'bike',children:[1,2,3]},
 {name:'body',mesh:{...out[0]}},
 {name:'rearWheel',translation:[RC[0],RC[1],0],mesh:shift(out[1],[RC[0],RC[1],0])},
 {name:'fork',translation:P0,children:[4],mesh:shift(out[3],P0)},
 {name:'frontWheel',translation:[FC[0]-P0[0],FC[1]-P0[1],0],mesh:shift(out[2],[FC[0],FC[1],0])},
];
const bytes=write('/home/claude/work/m/bike/bike_lite.glb',{nodes,roots:[0],material:{roughness:0.55,metalness:0.1}});
console.log('wrote bike_lite.glb',bytes,'bytes; steering pivot',P0.map(n=>+n.toFixed(3)),'axis',A.map(n=>+n.toFixed(3)));
