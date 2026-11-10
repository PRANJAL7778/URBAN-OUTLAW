// node extract_model.js <glb in /insp> <outdir>  -> pos/nor/uv/idx .bin (world space, effective base-colour UV)
const puppeteer=require('/home/claude/.npm-global/lib/node_modules/@mermaid-js/mermaid-cli/node_modules/puppeteer'); const {spawn}=require('child_process'); const fs=require('fs');
const file=process.argv[2], out=process.argv[3];
(async()=>{
 const srv=spawn('python3',['-m','http.server','8778'],{cwd:'/home/claude/work/insp',stdio:'ignore'}); await new Promise(r=>setTimeout(r,1200));
 const b=await puppeteer.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--js-flags=--max-old-space-size=4096']});
 const p=await b.newPage(); await p.goto('http://localhost:8778/index.html'); await p.waitForFunction(()=>window.__ready,{timeout:30000});
 await p.evaluate((f)=>window.loadModel(f),file);
 const res=await p.evaluate(()=>{
  const T=window.__THREE, root=window.__model; root.updateMatrixWorld(true);
  const meshes=[]; root.traverse(o=>{ if(o.isMesh) meshes.push(o); });
  let nv=0,ni=0; for(const m of meshes){ nv+=m.geometry.attributes.position.count; ni+=m.geometry.index?m.geometry.index.count:m.geometry.attributes.position.count; }
  const pos=new Float32Array(nv*3),nor=new Float32Array(nv*3),uv=new Float32Array(nv*2),idx=new Uint32Array(ni); let vo=0,io=0; const v=new T.Vector3(); const info=[];
  for(const m of meshes){
    const g=m.geometry,P=g.attributes.position,N=g.attributes.normal,U=g.attributes.uv; const map=m.material.map; if(map){map.updateMatrix();} const e=map?map.matrix.elements:[1,0,0,0,1,0,0,0,1];
    const nm=new T.Matrix3().getNormalMatrix(m.matrixWorld);
    for(let i=0;i<P.count;i++){ v.fromBufferAttribute(P,i).applyMatrix4(m.matrixWorld); pos.set([v.x,v.y,v.z],(vo+i)*3); v.fromBufferAttribute(N,i).applyMatrix3(nm).normalize(); nor.set([v.x,v.y,v.z],(vo+i)*3);
      const u=U.getX(i),w=U.getY(i); uv[(vo+i)*2]=e[0]*u+e[3]*w+e[6]; uv[(vo+i)*2+1]=e[1]*u+e[4]*w+e[7]; }
    const n=g.index?g.index.count:P.count; for(let i=0;i<n;i++) idx[io+i]=(g.index?g.index.getX(i):i)+vo; vo+=P.count; io+=n;
    info.push({tris:n/3,verts:P.count,uvMax:[Math.max(...Array.from({length:Math.min(2000,P.count)},(_,i)=>U.getX(i))),Math.max(...Array.from({length:Math.min(2000,P.count)},(_,i)=>U.getY(i)))],uvNorm:U.normalized,map:!!map,flipY:map&&map.flipY,repeat:map&&map.repeat.toArray(),offset:map&&map.offset.toArray(),colorSpace:map&&map.colorSpace});
  }
  const b64=a=>{const u=new Uint8Array(a.buffer,a.byteOffset,a.byteLength);let s='';for(let i=0;i<u.length;i+=32768)s+=String.fromCharCode.apply(null,u.subarray(i,i+32768));return btoa(s);};
  return {nv,tris:io/3,info,pos:b64(pos),nor:b64(nor),uv:b64(uv),idx:b64(idx)};
 });
 console.log('verts',res.nv,'tris',res.tris,JSON.stringify(res.info));
 for(const k of ['pos','nor','uv','idx']) fs.writeFileSync(`${out}/${k}.bin`,Buffer.from(res[k],'base64'));
 await b.close(); srv.kill();
})();
