import fs from 'node:fs';
import path from 'node:path';
const file=path.join(process.env.USERPROFILE,'.lmstudio/apps/bionic/.internal/user-concrete-model-default-config/nanash66/Spark-X2.5-4B-ROCmFP4-STRIX_LEAN-GGUF/Spark-X2.5-4B-Q4_0_ROCMFP4_STRIX_LEAN.gguf.json');
const original=fs.readFileSync(file,'utf8'),config=JSON.parse(original);
function set(section,key,value){const fields=config[section].fields;const field=fields.find(field=>field.key===key);if(field)field.value=value;else fields.push({key,value});}
const load={
 'llm.load.contextLength':65536,
 'llm.load.llama.autoFit':false,
 'llm.load.llama.acceleration.offloadRatio':1,
 'llm.load.llama.cpuThreadPoolSize':8,
 'llm.load.llama.evalBatchSize':2048,
 'llm.load.llama.physicalBatchSize':512,
 'llm.load.numParallelSessions':1,
 'llm.load.llama.contextCheckpoints':0,
 'llm.load.useUnifiedKvCache':false,
 'llm.load.llama.flashAttention':true,
 'llm.load.llama.argumentsOverride':{enabled:true,excludeAllConfig:false,disabledParameters:['--cache-ram'],overrideParameters:[{key:'--cache-ram',value:'0'}]},
 'llm.load.llama.speculativeDecoding.draftMtp':false,
 'llm.load.llama.speculativeDecoding.draftSimple':false,
};
const operation={
 'llm.prediction.temperature':0.4,
 'llm.prediction.topKSampling':20,
 'llm.prediction.topPSampling':{checked:true,value:0.95},
 'llm.prediction.minPSampling':{checked:true,value:0},
 'llm.prediction.repeatPenalty':{checked:true,value:1},
 'llm.prediction.maxPredictedTokens':{checked:true,value:2048},
 'llm.prediction.reasoning.enableThinking':false,
 'llm.prediction.reasoning.budgetTokens':{checked:true,value:512},
 'llm.prediction.systemPrompt':'Act as a practical coding agent. Follow project instructions and dependency versions. For Laravel, OpenCart, PHP, Vue, JavaScript, TypeScript and Next.js, preserve existing conventions. Read only the files and line ranges needed for the next edit. After understanding the relevant code, make a small justified change and run a focused check. Use actual tool calls; never print fake tool calls or claim edits or tests without tool evidence. Avoid repeated reads and long plans. Keep responses concise. If blocked, state the exact missing fact.',
};
for(const [key,value]of Object.entries(load))set('load',key,value);
for(const [key,value]of Object.entries(operation))set('operation',key,value);
if(process.argv.includes('--apply')){
 if(!fs.existsSync(file+'.before-coding.bak'))fs.writeFileSync(file+'.before-coding.bak',original,{flag:'wx'});
 fs.writeFileSync(file,JSON.stringify(config,null,2));
}
console.log('Spark coding defaults validated. Apply with --apply, then reload model when idle.');
