import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const file=path.join(process.env.BIONIC_BUNDLE_DIR??'C:/Program Files/Bionic/resources/app/.webpack-bionic','renderer/main_window.js');
const marker='ffprocessor-context-counter-trigger-v5';
const original=fs.readFileSync(file,'utf8');
if(original.includes(marker)){console.log('Already installed');process.exit(0);}
let source=original;
const start=source.indexOf('(0,r.jsx)("button",{type:"button","aria-label":"Context compaction settings"');
assert.ok(start>=0,'Install context popover v4 first');
const end=source.indexOf('ffOpen&&',start);assert.ok(end>start);
source=source.slice(0,start)+source.slice(end);
const target='(0,r.jsxs)("span",{className:"text-xs text-foreground-muted",title:e.formatMessage({id:"4SWwoX"';
assert.equal(source.split(target).length-1,1,'Unsupported context counter');
source=source.replace(target,'(0,r.jsxs)("span",{role:"button",tabIndex:0,"aria-label":"Context compaction settings","aria-expanded":ffOpen,onClick:()=>ffSetOpen(!ffOpen),onKeyDown:event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();ffSetOpen(!ffOpen)}},style:{cursor:"pointer"},className:"text-xs text-foreground-muted",title:e.formatMessage({id:"4SWwoX"');
source+=`\n/* ${marker} */\n`;
new vm.Script(source);
console.log('PASS: one context counter trigger, keyboard activation, renderer syntax');
if(process.argv.includes('--apply')){
  fs.writeFileSync(file+'.'+marker+'.bak',original,{flag:'wx'});
  try{fs.writeFileSync(file,source);}catch(error){fs.writeFileSync(file,original);throw error;}
  console.log('Installed. Activate after current work by restarting Bionic.');
}
