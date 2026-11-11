// sample an sRGB RGB texture (tex.rgb, square) at per-vertex UVs -> linear colours
const fs=require('fs');
module.exports=function bakeColors(dir,UV){
  const tex=fs.readFileSync(dir+'tex.rgb'); const W=Math.round(Math.sqrt(tex.length/3)),H=W;
  const LUT=new Float32Array(256); for(let i=0;i<256;i++){const c=i/255;LUT[i]=c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4);}
  const n=UV.length/2,C=new Float32Array(n*3);
  const g=(x,y,ch)=>LUT[tex[(y*W+x)*3+ch]];
  for(let i=0;i<n;i++){ let u=UV[i*2],v=UV[i*2+1]; u-=Math.floor(u); v-=Math.floor(v); const x=u*(W-1),y=v*(H-1),x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(W-1,x0+1),y1=Math.min(H-1,y0+1),fx=x-x0,fy=y-y0;
    for(let c=0;c<3;c++) C[i*3+c]=(g(x0,y0,c)*(1-fx)+g(x1,y0,c)*fx)*(1-fy)+(g(x0,y1,c)*(1-fx)+g(x1,y1,c)*fx)*fy; }
  return {C,W};
};
