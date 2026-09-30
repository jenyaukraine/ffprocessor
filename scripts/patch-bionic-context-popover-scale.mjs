import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const file=path.join(process.env.BIONIC_BUNDLE_DIR??'C:/Program Files/Bionic/resources/app/.webpack-bionic','renderer/main_window.js');
const marker='ffprocessor-context-popover-scale-v6';
const original=fs.readFileSync(file,'utf8');
if(original.includes(marker)){console.log('Already installed');process.exit(0);}
const start=original.indexOf('ffOpen&&(0,r.jsxs)("div",{role:"dialog","aria-label":"Compaction threshold"');
assert.ok(start>=0,'Missing context popover');
const end=original.indexOf(',(0,r.jsx)(C.LuGauge,',start);assert.ok(end>start);
let panel=original.slice(start,end);
const changes=[
 ['width:"300px",padding:"18px",borderRadius:"24px"','width:"252px",padding:"12px",borderRadius:"16px"'],
 ['fontSize:"18px",fontWeight:600','fontSize:"14px",fontWeight:500'],
 ['fontSize:"13px",color:"#aaa",marginTop:"3px",marginBottom:"16px"','fontSize:"11px",color:"#aaa",marginTop:"2px",marginBottom:"12px"'],
 ['right:"16px",top:"12px"','right:"12px",top:"10px",fontSize:"12px"'],
 ['height:40px;border-radius:24px','height:24px;border-radius:16px'],
 ['width:40px;height:40px','width:28px;height:28px'],
 ['left:"20px",right:"20px",top:"18px"','left:"14px",right:"14px",top:"10px"'],
 ['width:"5px",height:"5px",borderRadius:"50%",background:"#777"','width:"4px",height:"4px",borderRadius:"50%",background:"#777",opacity:value===Math.round(ff.ratio*100)?0:1'],
 [',(0,r.jsx)("div",{style:{fontSize:"11px",color:"#999",marginTop:"10px",textAlign:"center"},children:"Uses loaded context · keeps response reserve"})',''],
];
for(const [before,after] of changes){assert.equal(panel.split(before).length-1,1,`Unsupported style: ${before}`);panel=panel.replace(before,after);}
const updated=original.slice(0,start)+panel+original.slice(end)+`\n/* ${marker} */\n`;
new vm.Script(updated);
console.log('PASS: scoped popover styles and renderer syntax');
if(process.argv.includes('--apply')){
 fs.writeFileSync(file+'.'+marker+'.bak',original,{flag:'wx'});
 try{fs.writeFileSync(file,updated);}catch(error){fs.writeFileSync(file,original);throw error;}
 console.log('Installed. New styles appear on next renderer reload.');
}
