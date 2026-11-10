// bake + decimate the scanned character -> m/char/lite.json (arrays) for rigging
const fs=require('fs'); const {decimate}=require('./qem.js'); const bake=require('./bake.js'); const D='/home/claude/work/m/char/';
const target=+process.argv[2]||26000, LAMBDA=+(process.argv[3]||1e-3);
const f32=f=>{const b=fs.readFileSync(D+f);return new Float32Array(b.buffer,b.byteOffset,b.byteLength/4);};
const P=f32('pos.bin'),N=f32('nor.bin'),UV=f32('uv.bin'); const ib=fs.readFileSync(D+'idx.bin'); const I=new Uint32Array(ib.buffer,ib.byteOffset,ib.byteLength/4);
const {C}=bake(D,UV);
// move feet to y=0 (scan is centred at the origin)
let minY=1e9; for(let i=0;i<P.length;i+=3) minY=Math.min(minY,P[i+1]); const P1=Float32Array.from(P); for(let i=1;i<P1.length;i+=3) P1[i]-=minY;
globalThis.QEM_VERBOSE=true; const r=decimate({P0:P1,N0:N,C0:C,I0:I},target,LAMBDA);
fs.writeFileSync(D+'lite.P.bin',Buffer.from(r.P.buffer)); fs.writeFileSync(D+'lite.N.bin',Buffer.from(r.N.buffer)); fs.writeFileSync(D+'lite.C.bin',Buffer.from(r.C.buffer)); fs.writeFileSync(D+'lite.I.bin',Buffer.from(r.IDX.buffer));
console.log('lite verts',r.P.length/3,'tris',r.IDX.length/3,'footY shift',minY.toFixed(4));
