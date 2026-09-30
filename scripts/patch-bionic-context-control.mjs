import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = process.env.BIONIC_BUNDLE_DIR ?? 'C:/Program Files/Bionic/resources/app/.webpack-bionic';
const marker = 'ffprocessor-context-control-v1';
const settings = path.join(process.env.LOCALAPPDATA, 'ffprocessor', 'bionic-context.json');
const edits = [];
function edit(relative, change) {
  const file = path.join(root, relative), original = fs.readFileSync(file, 'utf8');
  if (original.includes(marker)) {
    if(relative==='renderer/main_window.js' && original.includes('{value:ratio,children:"Compact "+')) {
      const updated=original.replace('{value:ratio,children:"Compact "+','{value:ratio,style:{color:"#111",backgroundColor:"#fff"},children:"Compact "+');
      new vm.Script(updated); edits.push({file,original,updated,revision:true});
    }
    return;
  }
  const updated = change(original);
  new vm.Script(updated, { filename: file });
  edits.push({ file, original, updated });
}
function once(source, before, after) {
  assert.equal(source.split(before).length - 1, 1, `Unsupported bundle anchor: ${before}`);
  return source.replace(before, after);
}
const configLiteral = JSON.stringify(settings);
edit('main/index.js', source => {
  const anchor = "const _0xeadce9=_0x403284,_0x28f102=new Array();";
  return once(source, anchor, anchor + `const ff=globalThis.ffprocessorContextSettings();if(void 0x0!==_0x1005d5||void 0x0!==_0x241d29){const capacity=await _0x399a1f({controller:_0x45d980,deps:_0x13f50d});_0x28f102.push(Math.min(capacity,ff.contextCap)*ff.ratio);}`) + `\n/* ${marker} */\n` + `
globalThis.ffprocessorContextSettings = () => {
  try { const value=JSON.parse(require('fs').readFileSync(${configLiteral},'utf8'));
    if([.4,.5,.6,.7,.8].includes(value.ratio)&&Number.isInteger(value.contextCap)&&value.contextCap>=4096&&value.contextCap<=262144)return value;
  } catch {}
  return {ratio:.5,contextCap:32768};
};
require('electron').ipcMain.handle('ffprocessor:context:get',()=>globalThis.ffprocessorContextSettings());
require('electron').ipcMain.handle('ffprocessor:context:set',(_event,ratio)=>{
  if(![.4,.5,.6,.7,.8].includes(ratio))throw Error('Invalid compaction ratio');
  const value={...globalThis.ffprocessorContextSettings(),ratio}, fs=require('fs');
  fs.mkdirSync(require('path').dirname(${configLiteral}),{recursive:true});
  fs.writeFileSync(${configLiteral}+'.tmp',JSON.stringify(value));fs.renameSync(${configLiteral}+'.tmp',${configLiteral});return value;
});
`;
});
edit('main/main_window_preload.js', source => source + `\n/* ${marker} */\nrequire('electron').contextBridge.exposeInMainWorld('ffprocessorContext',{get:()=>require('electron').ipcRenderer.invoke('ffprocessor:context:get'),set:ratio=>require('electron').ipcRenderer.invoke('ffprocessor:context:set',ratio)});\n`);
edit('renderer/main_window.js', source => {
  const before='function({sessionId:t}){const e=(0,U.useIntl)(),a=(0,f.useNGSessionContextEstimation)(t).total;if(void 0===a)return null;';
  const after=`function({sessionId:t}){const [ff,ffSet]=(0,w.useState)({ratio:.5,contextCap:32768}),[ffError,ffSetError]=(0,w.useState)(false);(0,w.useEffect)(()=>{window.ffprocessorContext.get().then(ffSet).catch(()=>ffSetError(true))},[]);const e=(0,U.useIntl)(),a=(0,f.useNGSessionContextEstimation)(t).total;if(void 0===a)return null;`;
  source=once(source,before,after);
  const start=source.indexOf(after), end=source.indexOf('tt=(0,w.memo)',start);
  let component=source.slice(start,end);
  component=once(component,'children:[(0,r.jsx)(C.LuGauge,',`children:[(0,r.jsx)("select",{"aria-label":"Auto compaction threshold",title:"Global auto compaction threshold; conservative context cap "+ff.contextCap+" tokens. Applies to enabled compaction modules on the next model call.",className:"text-xs bg-transparent text-foreground-muted",value:ff.ratio,disabled:ffError,onChange:event=>{window.ffprocessorContext.set(Number(event.target.value)).then(ffSet).catch(()=>ffSetError(true))},children:[.4,.5,.6,.7,.8].map(ratio=>(0,r.jsx)("option",{value:ratio,children:"Compact "+Math.round(ratio*100)+"%"},ratio))}),(0,r.jsx)(C.LuGauge,`);
  component=component.replace('{value:ratio,children:"Compact "+','{value:ratio,style:{color:"#111",backgroundColor:"#fff"},children:"Compact "+');
  return source.slice(0,start)+component+source.slice(end)+`\n/* ${marker} */\n`;
});
console.log(`PASS: validated ${edits.length} bundle changes; settings ${settings}`);
if(process.argv.includes('--apply')) {
  for(const edit of edits) fs.writeFileSync(edit.file+'.'+marker+(edit.revision?'.revision2':'')+'.bak',edit.original,{flag:'wx'});
  const written=[];
  try {for(const edit of edits){written.push(edit);fs.writeFileSync(edit.file,edit.updated);}}
  catch(error){for(const edit of written)fs.writeFileSync(edit.file,edit.original);throw error;}
  console.log('Applied. Restart Bionic to activate.');
}
