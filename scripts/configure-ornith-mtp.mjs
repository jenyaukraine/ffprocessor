import fs from 'node:fs';
import path from 'node:path';
const file=path.join(process.env.USERPROFILE,'.lmstudio/apps/bionic/.internal/user-concrete-model-default-config/julianmb/Ornith-1.5-35B-A3B-ROCmFP4-GGUF/Ornith-1.5-35B-A3B-ROCmFP4.gguf.json');
const original=fs.readFileSync(file,'utf8'), config=JSON.parse(original);
const values={'llm.load.llama.speculativeDecoding.draftMtp':true,'llm.load.llama.speculativeDecoding.draftMaxTokens':2,'llm.load.llama.speculativeDecoding.draftMinContinueProbability':0.6};
for(const [key,value] of Object.entries(values)){
  const field=config.load.fields.find(field=>field.key===key);
  if(!field)throw Error(`Missing load field: ${key}`);
  field.value=value;
}
if(process.argv.includes('--apply')){
  if(!fs.existsSync(file+'.before-mtp.bak'))fs.writeFileSync(file+'.before-mtp.bak',original,{flag:'wx'});
  fs.writeFileSync(file,JSON.stringify(config,null,2));
}
console.log('Validated Ornith MTP settings: enabled, max=2, probability=0.6. Reload model after applying.');
