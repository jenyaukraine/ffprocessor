import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const file=path.join(process.env.BIONIC_BUNDLE_DIR??'C:/Program Files/Bionic/resources/app/.webpack-bionic','renderer/main_window.js');
const marker='ffprocessor-context-popover-v4';
const original=fs.readFileSync(file,'utf8');
if(original.includes(marker)){console.log('Already installed');process.exit(0);}
const hook='[ffError,ffSetError]=(0,w.useState)(false);';
assert.equal(original.split(hook).length-1,1);
let source=original.replace(hook,'[ffError,ffSetError]=(0,w.useState)(false),[ffOpen,ffSetOpen]=(0,w.useState)(false);');
const start=source.indexOf('(0,r.jsxs)("span",{className:"flex items-center gap-2 rounded-full border border-white/10');
assert.ok(start>=0,'Install slider v3 first');
const end=source.indexOf(',(0,r.jsx)(C.LuGauge,',start);assert.ok(end>start);
const popover=`(0,r.jsxs)("span",{style:{position:"relative"},children:[(0,r.jsx)("button",{type:"button","aria-label":"Context compaction settings","aria-expanded":ffOpen,onClick:()=>ffSetOpen(!ffOpen),style:{fontSize:"12px",color:"#a3a3a3",cursor:"pointer",padding:"3px 7px",borderRadius:"10px"},children:"Compact "+Math.round(ff.ratio*100)+"%"}),ffOpen&&(0,r.jsxs)("div",{role:"dialog","aria-label":"Compaction threshold",style:{position:"absolute",right:0,bottom:"32px",width:"300px",padding:"18px",borderRadius:"24px",background:"#262626",border:"1px solid #3a3a3a",boxShadow:"0 12px 36px #0008",zIndex:100},children:[(0,r.jsx)("button",{type:"button","aria-label":"Close context settings",onClick:()=>ffSetOpen(false),style:{position:"absolute",right:"16px",top:"12px",color:"#aaa"},children:"×"}),(0,r.jsx)("div",{style:{textAlign:"center",fontSize:"18px",fontWeight:600,color:"#60a5fa"},children:Math.round(ff.ratio*100)+"%"}),(0,r.jsx)("div",{style:{textAlign:"center",fontSize:"13px",color:"#aaa",marginTop:"3px",marginBottom:"16px"},children:"Context compaction"}),(0,r.jsx)("style",{children:".ff-context-range{-webkit-appearance:none;appearance:none;width:100%;height:40px;border-radius:24px;background:#404040;border:1px solid #4a4a4a;cursor:pointer}.ff-context-range::-webkit-slider-thumb{-webkit-appearance:none;width:40px;height:40px;background:#fff;border-radius:50%;box-shadow:0 1px 5px #0005}.ff-context-range:focus-visible{outline:2px solid #60a5fa;outline-offset:3px}"}),(0,r.jsxs)("div",{style:{position:"relative"},children:[(0,r.jsxs)("div",{style:{position:"absolute",left:"20px",right:"20px",top:"18px",display:"flex",justifyContent:"space-between",pointerEvents:"none"},children:[40,50,60,70,80].map(value=>(0,r.jsx)("span",{style:{width:"5px",height:"5px",borderRadius:"50%",background:"#777"}},value))}),(0,r.jsx)("input",{className:"ff-context-range",type:"range",min:40,max:80,step:10,value:Math.round(ff.ratio*100),"aria-label":"Compaction threshold percent",onChange:event=>{const ratio=Number(event.target.value)/100;ffSet({...ff,ratio});window.ffprocessorContext.set(ratio).then(ffSet).catch(()=>ffSetError(true))},disabled:ffError})]}),(0,r.jsx)("div",{style:{fontSize:"11px",color:"#999",marginTop:"10px",textAlign:"center"},children:"Uses loaded context · keeps response reserve"})]})]})`;
source=source.slice(0,start)+popover+source.slice(end)+`\n/* ${marker} */\n`;
new vm.Script(source);
console.log('PASS: exact anchors and renderer syntax');
if(process.argv.includes('--apply')){
  fs.writeFileSync(file+'.'+marker+'.bak',original,{flag:'wx'});
  try{fs.writeFileSync(file,source);}catch(error){fs.writeFileSync(file,original);throw error;}
  console.log('Installed; renderer reload needed after current work.');
}
