// Single-file web bundler for Urban Outlaw (no network needed). Usage: node bundle.js <projectDir> <out.html> [--exclude=a.glb,b.glb] [--title=..]
const fs=require('fs'),path=require('path');
const sucrase=require('/home/claude/.npm-global/lib/node_modules/@mermaid-js/mermaid-cli/node_modules/sucrase');
const root=path.resolve(process.argv[2]), out=process.argv[3];
const excl=((process.argv.find(a=>a.startsWith('--exclude='))||'').slice(10)||'').split(',').filter(Boolean);
const rd=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=rd('index.html');
const imap=JSON.parse(/<script type="importmap">([\s\S]*?)<\/script>/.exec(html)[1]).imports;
function resolve(spec,from){
  if(spec.startsWith('.')) return path.posix.normalize(path.posix.join(path.posix.dirname(from),spec));
  for(const k of Object.keys(imap)){ if(k.endsWith('/')?spec.startsWith(k):spec===k){ const t=k.endsWith('/')?imap[k]+spec.slice(k.length):imap[k]; return path.posix.normalize(t.replace(/^\.\//,'')); } }
  throw new Error('cannot resolve '+spec+' from '+from);
}
const mods={}; const queue=['src/main.js'];
while(queue.length){
  const id=queue.shift(); if(mods[id]) continue;
  const src=rd(id);
  const code=sucrase.transform(src,{transforms:['imports'],filePath:id,disableESTransforms:true}).code;
  const deps={}; const re=/require\((["'])([^"']+)\1\)/g; let m;
  while((m=re.exec(code))){ if(!deps[m[2]]){ deps[m[2]]=resolve(m[2],id); queue.push(deps[m[2]]);} }
  mods[id]={code,deps};
}
const esc=s=>s.replace(/<\/script/gi,'<\\/script').replace(/<!--/g,'<\\!--');
let bundle='(function(){var M={},C={};\n';
for(const [id,{code,deps}] of Object.entries(mods)) bundle+=`M[${JSON.stringify(id)}]={d:${JSON.stringify(deps)},f:function(module,exports,require){${code}\n}};\n`;
bundle+=`function load(id){var c=C[id];if(c)return c.exports;c=C[id]={exports:{}};var m=M[id];m.f(c,c.exports,function(s){return load(m.d[s]);});return c.exports;}\nload("src/main.js");})();`;
// assets
const emb={}; const man=JSON.parse(rd('assets/manifest.json'));
for(const [k,e] of Object.entries(man)){ if(e.file && excl.includes(e.file)){ delete man[k]; continue; } if(e.file){ emb['assets/'+e.file]=fs.readFileSync(path.join(root,'assets',e.file)).toString('base64'); } }
emb['assets/manifest.json']=Buffer.from(JSON.stringify(man)).toString('base64');
const sfxd=path.join(root,'packs/sfx/pixelfork-sfx@0.9.0-A/files');
for(const f of ['casual.json','packs/core.json','packs/core.webm']) emb[f]=fs.readFileSync(path.join(sfxd,f)).toString('base64');
const icons={}; const idir=path.join(root,'packs/ui/clean-flat@0.3.0-A/files/assets');
for(const f of fs.readdirSync(idir)) if(f.endsWith('.png')) icons[f.slice(0,-4)]='data:image/png;base64,'+fs.readFileSync(path.join(idir,f)).toString('base64');
const shim=`(function(){var E=window.__EMB,B={},mime={glb:'model/gltf-binary',json:'application/json'};var of=window.fetch.bind(window);var co=URL.createObjectURL.bind(URL);URL.createObjectURL=function(b){var u=co(b);B[u]=b;return u;};
function bytes(k){var s=atob(E[k]),a=new Uint8Array(s.length);for(var i=0;i<s.length;i++)a[i]=s.charCodeAt(i);return a;}
window.fetch=function(i,n){var u=typeof i==='string'?i:(i&&i.url)||String(i);if(B[u])return Promise.resolve(new Response(B[u]));var k=null,p=u.split(/[?#]/)[0];for(var q in E){if(p.length>=q.length&&p.slice(-q.length)===q&&(p.length===q.length||p.charAt(p.length-q.length-1)==='/')){if(!k||q.length>k.length)k=q;}}if(k){return Promise.resolve(new Response(bytes(k),{status:200,headers:{'Content-Type':mime[k.split('.').pop()]||'application/octet-stream'}}));}return of(i,n);};})();`;
const css=rd('packs/ui/clean-flat@0.3.0-A/files/kit.css');
const title=(process.argv.find(a=>a.startsWith('--title='))||'--title=URBAN OUTLAW').slice(8);
const cls=['pixelfork/bridge.js','packs/audio/howler@2.2.4/files/howler.min.js','packs/sfx/pixelfork-sfx@0.9.0-A/files/sfx.js','packs/ui/clean-flat@0.3.0-A/files/kit.js'];
let o=`<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no"><meta name="pf-game" content="923f4d05-9db0-4db0-9ef4-c68b2584923e"><title>${title}</title>\n<style>${esc(css)}</style>\n<style>html,body{margin:0;height:100%;overflow:hidden;background:#000;overscroll-behavior:none;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}#game{position:fixed;inset:0}</style>\n<link data-sc-offsets>\n</head><body><div id="game"></div>\n`;
o+=`<script>window.__EMB=${JSON.stringify(emb)};${shim}</script>\n`;
const patch=(c,t)=>c.includes('sfx.js')?t.replace("return s && s.src ? s.src.replace(/\\/[^\\/]*$/, '/') : '';","return s && s.src ? s.src.replace(/\\/[^\\/]*$/, '/') : './';"):t;
for(const c of cls) o+=`<script${c.endsWith('kit.js')?' data-assets="assets/"':''}>${esc(patch(c,rd(c)))}\n</script>\n`;
o+=`<script>(function(){var I=${JSON.stringify(icons)};for(var k in I){try{SC.setImage(k,I[k]);}catch(e){}}})();</script>\n`;
o+=`<script>${esc(bundle)}</script>\n</body></html>`;
fs.writeFileSync(out,o);
const st=fs.statSync(out).size;
console.log('modules',Object.keys(mods).length,'| html bytes',st,'|',(st/1048576).toFixed(2),'MB | embedded assets',Object.keys(emb).length);
