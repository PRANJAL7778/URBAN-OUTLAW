const acorn = require('/tmp/lint/node_modules/acorn');
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const ast = acorn.parse(src, { ecmaVersion: 2023, sourceType: 'module', locations: true });
const FUNC = new Set(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression','ClassDeclaration','ClassExpression']);
function patternNames(p, out){ if(!p) return; switch(p.type){
  case 'Identifier': out.push(p.name); break;
  case 'ObjectPattern': for(const q of p.properties) patternNames(q.value||q.argument,out); break;
  case 'ArrayPattern': for(const e of p.elements) patternNames(e,out); break;
  case 'AssignmentPattern': patternNames(p.left,out); break;
  case 'RestElement': patternNames(p.argument,out); break; } }
const declLine = {};
for(const n of ast.body){
  if(n.type==='VariableDeclaration') for(const d of n.declarations){ const ns=[]; patternNames(d.id,ns); for(const x of ns) if(!(x in declLine)) declLine[x]=n.loc.start.line; }
  else if((n.type==='FunctionDeclaration'||n.type==='ClassDeclaration')&&n.id) declLine[n.id.name]=n.loc.start.line;
  else if(n.type==='ImportDeclaration') for(const s of n.specifiers) declLine[s.local.name]=n.loc.start.line;
}
function refs(node, out){
  const visit=(n)=>{
    if(!n||typeof n.type!=='string') return;
    if(FUNC.has(n.type)) return;               // deferred: not executed at load
    if(n.type==='Identifier') out.push({name:n.name,line:n.loc.start.line});
    for(const k in n){ const v=n[k];
      if(Array.isArray(v)) for(const c of v) if(c&&typeof c.type==='string') visit(c);
      else if(v&&typeof v.type==='string') visit(v); }
  };
  visit(node);
}
const hits=[];
for(const stmt of ast.body){
  const out=[];
  if(stmt.type==='VariableDeclaration'||stmt.type==='ImportDeclaration') { for(const d of stmt.declarations||[]) if(d.init) refs(d.init,out); }
  else if(!FUNC.has(stmt.type)) refs(stmt,out);
  for(const r of out){
    const dl=declLine[r.name];
    if(dl!==undefined && dl>r.line) hits.push(`line ${r.line}: ${r.name} (declared at ${dl})`);
  }
}
console.log(hits.length ? hits.join('\n') : 'no top-level use-before-declaration');
