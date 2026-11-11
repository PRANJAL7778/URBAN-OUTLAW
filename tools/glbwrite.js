// Minimal GLB writer: nodes with optional mesh (POSITION/NORMAL/COLOR_0 float, indices), TRS, children and optional skin.
const fs=require('fs');
/** nodes: [{name,children:[idx],translation,rotation,scale,mesh:{P,N,C,IDX},skin:{joints:[nodeIdx],ibm:Float32Array(16*n)}}]  roots: [idx] */
module.exports=function writeGLB(path,{nodes,roots,generator='urban-outlaw-pipeline',material={roughness:0.7,metalness:0.0,doubleSided:false}}){
  const views=[],accessors=[],bins=[]; let off=0;
  const add=(buf,target)=>{ const pad=(4-buf.length%4)%4; const b=pad?Buffer.concat([buf,Buffer.alloc(pad)]):buf; views.push({buffer:0,byteOffset:off,byteLength:buf.length,...(target?{target}:{})}); bins.push(b); off+=b.length; return views.length-1; };
  const acc=(bv,comp,count,type,min,max)=>{ accessors.push({bufferView:bv,componentType:comp,count,type,...(min?{min,max}:{})}); return accessors.length-1; };
  const meshes=[],jn=[],skins=[];
  nodes.forEach((n,i)=>{
    const o={name:n.name}; if(n.children&&n.children.length)o.children=n.children; if(n.translation)o.translation=n.translation; if(n.rotation)o.rotation=n.rotation; if(n.scale)o.scale=n.scale;
    if(n.mesh){ const m=n.mesh,cnt=m.P.length/3; const mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9]; for(let k=0;k<cnt;k++)for(let c=0;c<3;c++){mn[c]=Math.min(mn[c],m.P[k*3+c]);mx[c]=Math.max(mx[c],m.P[k*3+c]);}
      const attrs={POSITION:acc(add(Buffer.from(m.P.buffer,m.P.byteOffset,m.P.byteLength),34962),5126,cnt,'VEC3',mn,mx)};
      if(m.N)attrs.NORMAL=acc(add(Buffer.from(m.N.buffer,m.N.byteOffset,m.N.byteLength),34962),5126,cnt,'VEC3');
      if(m.C)attrs.COLOR_0=acc(add(Buffer.from(m.C.buffer,m.C.byteOffset,m.C.byteLength),34962),5126,cnt,'VEC3');
      if(m.J){attrs.JOINTS_0=acc(add(Buffer.from(m.J.buffer,m.J.byteOffset,m.J.byteLength),34962),5123,cnt,'VEC4'); attrs.WEIGHTS_0=acc(add(Buffer.from(m.W.buffer,m.W.byteOffset,m.W.byteLength),34962),5126,cnt,'VEC4');}
      const idx=m.IDX; const use16=cnt<65535; const I=use16?Uint16Array.from(idx):Uint32Array.from(idx);
      const ia=acc(add(Buffer.from(I.buffer,I.byteOffset,I.byteLength),34963),use16?5123:5125,idx.length,'SCALAR');
      meshes.push({name:n.name,primitives:[{attributes:attrs,indices:ia,material:0}]}); o.mesh=meshes.length-1; }
    if(n.skin){ const ibm=acc(add(Buffer.from(n.skin.ibm.buffer,n.skin.ibm.byteOffset,n.skin.ibm.byteLength)),5126,n.skin.joints.length,'MAT4'); skins.push({joints:n.skin.joints,inverseBindMatrices:ibm}); o.skin=skins.length-1; }
    jn.push(o);
  });
  const bin=Buffer.concat(bins);
  const json={asset:{version:'2.0',generator},scene:0,scenes:[{nodes:roots}],nodes:jn,meshes,accessors,bufferViews:views,buffers:[{byteLength:bin.length}],
    materials:[{name:'vertex_colour',pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],metallicFactor:material.metalness,roughnessFactor:material.roughness},doubleSided:!!material.doubleSided}]};
  if(skins.length)json.skins=skins;
  let js=Buffer.from(JSON.stringify(json)); js=Buffer.concat([js,Buffer.alloc((4-js.length%4)%4,0x20)]);
  const h=Buffer.alloc(12); h.writeUInt32LE(0x46546C67,0);h.writeUInt32LE(2,4);h.writeUInt32LE(12+8+js.length+8+bin.length,8);
  const ch=(t,b)=>{const x=Buffer.alloc(8);x.writeUInt32LE(b.length,0);x.writeUInt32LE(t,4);return Buffer.concat([x,b]);};
  fs.writeFileSync(path,Buffer.concat([h,ch(0x4E4F534A,js),ch(0x004E4942,bin)])); return fs.statSync(path).size;
};
