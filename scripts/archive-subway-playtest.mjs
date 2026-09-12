#!/usr/bin/env node
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// Run in a checkout, then commit the archive with its associated observations.
const [input,cohort='calibration',notes='']=process.argv.slice(2);
if(!input||!['calibration','holdout','reference'].includes(cohort)) throw new Error('Usage: node scripts/archive-subway-playtest.mjs export.json [calibration|holdout|reference] [observations]');
const root=process.env.SUBWAY_ARCHIVE_ROOT||resolve(dirname(fileURLToPath(import.meta.url)),'../playtests/subway');
const bytes=await readFile(input);
if(bytes.length>20_000_000) throw new Error('Export exceeds 20 MB.');
const id=createHash('sha256').update(bytes).digest('hex');
let record;try{record=JSON.parse(bytes.toString('utf8'));}catch{}
const roster=record?.room?.players;
const structured=record?.schema===1&&Number.isInteger(record.stateVersion)&&typeof record.build==='string'&&typeof record.room?.roomCode==='string'&&typeof record.room?.hostId==='string'&&Array.isArray(roster)&&roster.length>=2&&roster.length<=4&&roster.every(p=>p&&typeof p.id==='string'&&typeof p.name==='string')&&new Set(roster.map(p=>p.id)).size===roster.length&&record.initial&&typeof record.initial==='object'&&typeof record.rules==='string'&&Array.isArray(record.actions)&&record.actions.length>0&&record.actions[0]?.action?.type==='START_GAME'&&record.actions.length<=2000&&record.actions.every(e=>e?.action&&typeof e.action.type==='string'&&typeof e.action.playerId==='string'&&Array.isArray(e.times)&&e.times.every(Number.isFinite)&&Array.isArray(e.random)&&e.random.every(n=>Number.isFinite(n)&&n>=0&&n<1)&&typeof e.after==='string');
const source=structured&&['human','mixed','bots','simulation'].includes(record.source)?record.source:'legacy';
const entry={id,path:`${id}/original.${structured?'json':'txt'}`,source,stateVersion:structured?record.stateVersion:null,rules:structured?record.rules:null,build:structured?record.build:null,players:structured?record.room.players?.length:null,actions:structured?record.actions.length:null,cohort:source==='human'?cohort:'reference',replay:structured?'unverified':'unavailable',validation:structured?'structure-only':record?.schema===1?'malformed':'legacy',comparisonEligible:false,archivedAt:new Date().toISOString()};
await mkdir(root,{recursive:true});
const indexPath=resolve(root,'index.json');
let index=[];try{index=JSON.parse(await readFile(indexPath,'utf8'));}catch(e){if(e.code!=='ENOENT') throw e;}
if(index.some(e=>e.id===id)) {console.log(`Already archived: ${id}`);process.exit(0);}
const folder=resolve(root,id);await mkdir(folder,{recursive:true});
async function preserve(name,data) {try{await writeFile(resolve(folder,name),data,{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}}
await preserve(`original.${structured?'json':'txt'}`,bytes);
await preserve('metadata.json',JSON.stringify(entry,null,2)+'\n');
await preserve('observations.md',`# Owner observations\n\n${notes||'None supplied.'}\n`);
await preserve('analysis.md','# Analysis\n\nNot analyzed yet. Original evidence is preserved separately. Replay has not been verified.\n');
index.push(entry);
const temporary=indexPath+`.${process.pid}.tmp`;
await writeFile(temporary,JSON.stringify(index,null,2)+'\n');await rename(temporary,indexPath);
console.log(`Archived ${source} playtest: ${id}`);
