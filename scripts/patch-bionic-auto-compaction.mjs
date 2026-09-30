import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=process.env.BIONIC_BUNDLE_DIR??'C:/Program Files/Bionic/resources/app/.webpack-bionic';
const marker='ffprocessor-auto-compaction-v2';
const edits=[];
function replaceOnce(source,before,after){assert.equal(source.split(before).length-1,1,`Unsupported anchor: ${before}`);return source.replace(before,after);}
const mainFile=path.join(root,'main/index.js');
let original=fs.readFileSync(mainFile,'utf8'), source=original;
if(!source.includes(marker)){
  const old='const ff=globalThis.ffprocessorContextSettings();if(void 0x0!==_0x1005d5||void 0x0!==_0x241d29){const capacity=await _0x399a1f({controller:_0x45d980,deps:_0x13f50d});_0x28f102.push(Math.min(capacity,ff.contextCap)*ff.ratio);}';
  const replacement='if(void 0x0!==_0x1005d5||void 0x0!==_0x241d29){const ffCapacity=await _0x399a1f({controller:_0x45d980,deps:_0x13f50d});const ffLimit=await globalThis.ffprocessorAutoLimit(ffCapacity);return Math.max(2048,Math.floor(ffLimit-Math.max(4096,ffLimit*.25)));}';
  source=replaceOnce(source,old,replacement);
  const gate='if(_0x4f2a1f[_0x497a25(0x2751)]<_0x40cafc)return;';
  source=replaceOnce(source,gate,'if(!globalThis.ffprocessorAutoShouldCompact(this,_0x4f2a1f[_0x497a25(0x2751)],_0x40cafc))return;');
  const success="await _0x31c913['replaceContext']({'to':_0x2303b1['id'],'with':[..._0x46d72c[_0x1a6884(0x5fb9)](_0x6277bf=>this[_0x1a6884(0x9361)](_0x6277bf[_0x1a6884(0x5b04)])),_0x3a417c]});";
  source=replaceOnce(source,success,success+'globalThis.ffprocessorAutoCompacted.add(this);');
  source+=`\n/* ${marker} */
globalThis.ffprocessorAutoCompacted=new WeakSet();
globalThis.ffprocessorAutoStates=new WeakMap();
globalThis.ffprocessorAutoLimit=async function(capacity){
  const safety=globalThis.ffprocessorContextSettings().contextCap;
  try{
    const response=await fetch('http://127.0.0.1:1234/api/v1/models',{signal:AbortSignal.timeout(1200)});
    if(response.ok){const data=await response.json();const loaded=(data.models??[]).flatMap(model=>model.loaded_instances??[]);
      // A single loaded model is unambiguous; multiple models use the configured
      // conservative cap instead of attributing another model's capacity.
      if(loaded.length===1){const length=loaded[0].config?.context_length;if(Number.isInteger(length)&&length>=4096)return Math.min(capacity,length,safety);}
    }
  }catch{}
  return Math.min(capacity,safety);
};
globalThis.ffprocessorAutoShouldCompact=function(module,tokens,threshold){
  if(!Number.isFinite(tokens)||tokens<0)return false;
  if(globalThis.ffprocessorAutoCompacted.has(module)){
    globalThis.ffprocessorAutoCompacted.delete(module);
    globalThis.ffprocessorAutoStates.set(module,{baseline:tokens});
    return false;
  }
  const state=globalThis.ffprocessorAutoStates.get(module);
  if(state&&tokens<state.baseline)state.baseline=tokens;
  // Require new information after a successful summary. Do not summarize the
  // same oversized result forever; the backend can report a capacity error.
  const growth=Math.max(2048,Math.floor(threshold*.12));
  return tokens>=threshold&&(!state||tokens>=state.baseline+growth);
};
`;
  new vm.Script(source);edits.push({file:mainFile,original,updated:source});
}
const rendererFile=path.join(root,'renderer/main_window.js');
original=fs.readFileSync(rendererFile,'utf8');
if(!original.includes(marker)){
  const start=original.indexOf('(0,r.jsx)("select",{"aria-label":"Auto compaction threshold"');
  assert.ok(start>=0,'Install context-control v1 first');
  const end=original.indexOf(',(0,r.jsx)(C.LuGauge,',start);
  assert.ok(end>start);
  source=original.slice(0,start)+'(0,r.jsx)("span",{className:"text-xs text-foreground-muted",title:"Automatic compaction: loaded capacity with a response reserve; requires new context growth after a successful summary.",children:"Compact Auto"})'+original.slice(end)+`\n/* ${marker} */\n`;
  new vm.Script(source);edits.push({file:rendererFile,original,updated:source});
}
// Execute only the isolated gate helper, never the application bundle.
const code=source.includes('globalThis.ffprocessorAutoShouldCompact=')?source:fs.readFileSync(mainFile,'utf8');
const main=edits.find(edit=>edit.file===mainFile)?.updated??fs.readFileSync(mainFile,'utf8');
const helper=main.slice(main.indexOf('globalThis.ffprocessorAutoShouldCompact='));
const context={WeakMap,WeakSet};context.globalThis=context;
context.ffprocessorAutoCompacted=new WeakSet();context.ffprocessorAutoStates=new WeakMap();
vm.runInNewContext(helper,context);
const module={};assert.equal(context.ffprocessorAutoShouldCompact(module,20000,24000),false);
assert.equal(context.ffprocessorAutoShouldCompact(module,25000,24000),true);
context.ffprocessorAutoCompacted.add(module);
assert.equal(context.ffprocessorAutoShouldCompact(module,25000,24000),false);
assert.equal(context.ffprocessorAutoShouldCompact(module,25000,24000),false);
assert.equal(context.ffprocessorAutoShouldCompact(module,27000,24000),false);
assert.equal(context.ffprocessorAutoShouldCompact(module,28000,24000),true);
assert.equal(context.ffprocessorAutoShouldCompact({},25000,24000),true);
console.log('PASS: bundle syntax, exact anchors, summary growth guard and module isolation');
if(process.argv.includes('--apply')){
  for(const edit of edits)fs.writeFileSync(edit.file+'.'+marker+'.bak',edit.original,{flag:'wx'});
  const written=[];try{for(const edit of edits){written.push(edit);fs.writeFileSync(edit.file,edit.updated);}}
  catch(error){for(const edit of written)fs.writeFileSync(edit.file,edit.original);throw error;}
  console.log('Installed '+edits.length+' files. Restart Bionic after finishing current work to activate.');
}
