// Colour-aware quadric edge-collapse decimation. decimate({P0,N0,C0,I0}, targetTris, lambda) -> {P,N,C,IDX}
function decimate({P0,N0,C0,I0},target,LAMBDA){
// --- weld by position
const nv0=P0.length/3,map=new Int32Array(nv0),H2=new Map();let nv=0;const E=1e5;
const pos=[],col=[],nor=[],cnt=[];
for(let i=0;i<nv0;i++){const k=Math.round(P0[i*3]*E)+','+Math.round(P0[i*3+1]*E)+','+Math.round(P0[i*3+2]*E);let id=H2.get(k);
 if(id===undefined){id=nv++;H2.set(k,id);pos.push(P0[i*3],P0[i*3+1],P0[i*3+2]);col.push(0,0,0);nor.push(0,0,0);cnt.push(0);}
 map[i]=id;for(let c=0;c<3;c++){col[id*3+c]+=C0[i*3+c];nor[id*3+c]+=N0[i*3+c];}cnt[id]++;}
for(let i=0;i<nv;i++)for(let c=0;c<3;c++)col[i*3+c]/=cnt[i];
const F=[];for(let t=0;t<I0.length;t+=3){const a=map[I0[t]],b=map[I0[t+1]],c=map[I0[t+2]];if(a!==b&&b!==c&&a!==c)F.push(a,b,c);}
let nf=F.length/3;const faces=Int32Array.from(F),alive=new Uint8Array(nf).fill(1);let alivef=nf;
if(globalThis.QEM_VERBOSE)console.log('welded verts',nv,'(from',nv0,') tris',nf);
// --- face planes/areas/quadrics
const Q=new Float64Array(nv*10),star=new Float64Array(nv),vf=Array.from({length:nv},()=>[]);
const cross=(ax,ay,az,bx,by,bz)=>[ay*bz-az*by,az*bx-ax*bz,ax*by-ay*bx];
function addPlane(v,a,b,c,d,w){const q=v*10;Q[q]+=w*a*a;Q[q+1]+=w*a*b;Q[q+2]+=w*a*c;Q[q+3]+=w*a*d;Q[q+4]+=w*b*b;Q[q+5]+=w*b*c;Q[q+6]+=w*b*d;Q[q+7]+=w*c*c;Q[q+8]+=w*c*d;Q[q+9]+=w*d*d;}
const ec=new Map();const ek=(a,b)=>a<b?a*nv+b:b*nv+a;
for(let f=0;f<nf;f++){const a=faces[f*3],b=faces[f*3+1],c=faces[f*3+2];
 const [nx,ny,nz]=cross(pos[b*3]-pos[a*3],pos[b*3+1]-pos[a*3+1],pos[b*3+2]-pos[a*3+2],pos[c*3]-pos[a*3],pos[c*3+1]-pos[a*3+1],pos[c*3+2]-pos[a*3+2]);
 const len=Math.hypot(nx,ny,nz),area=len/2;if(len<1e-18){alive[f]=0;alivef--;continue;}
 const A=nx/len,B=ny/len,C=nz/len,Dd=-(A*pos[a*3]+B*pos[a*3+1]+C*pos[a*3+2]);
 for(const v of [a,b,c]){addPlane(v,A,B,C,Dd,area);star[v]+=area;vf[v].push(f);}
 for(const [x,y] of [[a,b],[b,c],[c,a]]){const k=ek(x,y);ec.set(k,(ec.get(k)||0)+1);}}
for(let f=0;f<nf;f++){if(!alive[f])continue;const a=faces[f*3],b=faces[f*3+1],c=faces[f*3+2];
 const [nx,ny,nz]=cross(pos[b*3]-pos[a*3],pos[b*3+1]-pos[a*3+1],pos[b*3+2]-pos[a*3+2],pos[c*3]-pos[a*3],pos[c*3+1]-pos[a*3+1],pos[c*3+2]-pos[a*3+2]);const l=Math.hypot(nx,ny,nz);
 for(const [x,y] of [[a,b],[b,c],[c,a]]){if(ec.get(ek(x,y))!==1)continue;const ex=pos[y*3]-pos[x*3],ey=pos[y*3+1]-pos[x*3+1],ez=pos[y*3+2]-pos[x*3+2];
  const [bx,by,bz]=cross(ex,ey,ez,nx/l,ny/l,nz/l);const bl=Math.hypot(bx,by,bz);if(bl<1e-18)continue;const d=-((bx*pos[x*3]+by*pos[x*3+1]+bz*pos[x*3+2])/bl);
  const el=Math.hypot(ex,ey,ez);for(const v of [x,y])addPlane(v,bx/bl,by/bl,bz/bl,d,el*el*4);}}
// --- heap
const heap=[];const less=(i,j)=>heap[i].c<heap[j].c;
function push(e){heap.push(e);let i=heap.length-1;while(i>0){const p=(i-1)>>1;if(heap[p].c<=heap[i].c)break;[heap[p],heap[i]]=[heap[i],heap[p]];i=p;}}
function pop(){const top=heap[0],last=heap.pop();if(heap.length){heap[0]=last;let i=0;for(;;){let l=2*i+1,r=l+1,m=i;if(l<heap.length&&heap[l].c<heap[m].c)m=l;if(r<heap.length&&heap[r].c<heap[m].c)m=r;if(m===i)break;[heap[m],heap[i]]=[heap[i],heap[m]];i=m;}}return top;}
const ver=new Int32Array(nv),dead=new Uint8Array(nv);
function qerr(q,x,y,z){return Q[q]*x*x+2*Q[q+1]*x*y+2*Q[q+2]*x*z+2*Q[q+3]*x+Q[q+4]*y*y+2*Q[q+5]*y*z+2*Q[q+6]*y+Q[q+7]*z*z+2*Q[q+8]*z+Q[q+9];}
const tmp=new Float64Array(10);
function flips(a,b,px,py,pz){ // would collapsing a,b -> p flip/degenerate a neighbouring face?
 for(const v of [a,b]){for(const f of vf[v]){if(!alive[f])continue;const i0=faces[f*3],i1=faces[f*3+1],i2=faces[f*3+2];if((i0!==a&&i1!==a&&i2!==a)&&(i0!==b&&i1!==b&&i2!==b))continue;
  if((i0===a||i1===a||i2===a)&&(i0===b||i1===b||i2===b))continue;
  const P=(i)=>[pos[i*3],pos[i*3+1],pos[i*3+2]];const A=P(i0),B=P(i1),C=P(i2);const o=cross(B[0]-A[0],B[1]-A[1],B[2]-A[2],C[0]-A[0],C[1]-A[1],C[2]-A[2]);
  const rep=(i,p)=>(i===a||i===b)?[px,py,pz]:p;const A2=rep(i0,A),B2=rep(i1,B),C2=rep(i2,C);const nn=cross(B2[0]-A2[0],B2[1]-A2[1],B2[2]-A2[2],C2[0]-A2[0],C2[1]-A2[1],C2[2]-A2[2]);
  const lo=Math.hypot(...o),ln=Math.hypot(...nn);if(ln<1e-14||(o[0]*nn[0]+o[1]*nn[1]+o[2]*nn[2])<0.25*lo*ln)return true;}}return false;}
function evalEdge(a,b){const qa=a*10,qb=b*10;for(let i=0;i<10;i++)tmp[i]=Q[qa+i]+Q[qb+i];
 const dc=(col[a*3]-col[b*3])**2+(col[a*3+1]-col[b*3+1])**2+(col[a*3+2]-col[b*3+2])**2;
 const cterm=LAMBDA*dc*(star[a]+star[b]);
 let best=null;const cands=[[pos[a*3],pos[a*3+1],pos[a*3+2]],[pos[b*3],pos[b*3+1],pos[b*3+2]],[(pos[a*3]+pos[b*3])/2,(pos[a*3+1]+pos[b*3+1])/2,(pos[a*3+2]+pos[b*3+2])/2]];
 for(const c of cands){const e=qerr2(c[0],c[1],c[2]);if(!best||e<best.e)best={e,p:c};}
 if(flips(a,b,best.p[0],best.p[1],best.p[2]))return null;return {c:best.e+cterm,p:best.p};}
function qerr2(x,y,z){const q=tmp;return q[0]*x*x+2*q[1]*x*y+2*q[2]*x*z+2*q[3]*x+q[4]*y*y+2*q[5]*y*z+2*q[6]*y+q[7]*z*z+2*q[8]*z+q[9];}
function pushEdge(a,b){const r=evalEdge(a,b);if(r)push({c:r.c,a,b,va:ver[a],vb:ver[b],p:r.p});}
const seen=new Set();for(let f=0;f<nf;f++){if(!alive[f])continue;for(const [x,y] of [[faces[f*3],faces[f*3+1]],[faces[f*3+1],faces[f*3+2]],[faces[f*3+2],faces[f*3]]]){const k=ek(x,y);if(seen.has(k))continue;seen.add(k);pushEdge(x,y);}}
if(globalThis.QEM_VERBOSE)console.log('edges queued',heap.length);
let collapses=0;
while(alivef>target&&heap.length){const e=pop();const {a,b}=e;if(dead[a]||dead[b]||ver[a]!==e.va||ver[b]!==e.vb)continue;
 // re-validate flips (neighbourhood may have changed without version bump on far verts)
 if(flips(a,b,e.p[0],e.p[1],e.p[2]))continue;
 const wa=star[a],wb=star[b],ws=wa+wb||1;
 pos[a*3]=e.p[0];pos[a*3+1]=e.p[1];pos[a*3+2]=e.p[2];
 for(let c=0;c<3;c++){col[a*3+c]=(col[a*3+c]*wa+col[b*3+c]*wb)/ws;nor[a*3+c]+=nor[b*3+c];}
 const nl=Math.hypot(nor[a*3],nor[a*3+1],nor[a*3+2])||1;for(let c=0;c<3;c++)nor[a*3+c]/=nl;
 for(let i=0;i<10;i++)Q[a*10+i]+=Q[b*10+i];star[a]=wa+wb;dead[b]=1;ver[a]++;
 const list=vf[a];for(const f of vf[b])list.push(f);
 const nb=new Set();const keep=[];const seenF=new Set();
 for(const f of list){if(!alive[f]||seenF.has(f))continue;seenF.add(f);
  for(let k=0;k<3;k++)if(faces[f*3+k]===b)faces[f*3+k]=a;
  const i0=faces[f*3],i1=faces[f*3+1],i2=faces[f*3+2];
  if(i0===i1||i1===i2||i0===i2){alive[f]=0;alivef--;continue;}keep.push(f);for(const v of [i0,i1,i2])if(v!==a)nb.add(v);}
 vf[a]=keep;vf[b]=[];collapses++;
 for(const v of nb){if(!dead[v])pushEdge(a,v);}
}
if(globalThis.QEM_VERBOSE)console.log('collapses',collapses,'tris',alivef);
// --- compact
const used=new Int32Array(nv).fill(-1);let n2=0;const outF=[];
for(let f=0;f<nf;f++){if(!alive[f])continue;for(let k=0;k<3;k++){const v=faces[f*3+k];if(used[v]<0)used[v]=n2++;outF.push(used[v]);}}
const P=new Float32Array(n2*3),Nn=new Float32Array(n2*3),C=new Float32Array(n2*3);
for(let v=0;v<nv;v++){const i=used[v];if(i<0)continue;for(let c=0;c<3;c++){P[i*3+c]=pos[v*3+c];Nn[i*3+c]=nor[v*3+c];C[i*3+c]=Math.min(1,Math.max(0,col[v*3+c]));}}


 return {P,N:Nn,C,IDX:Uint32Array.from(outF)};
}
module.exports={decimate};
