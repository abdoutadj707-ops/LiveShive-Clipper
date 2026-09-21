import express from "express";
import cors from "cors";
import multer from "multer";
import OpenAI,{toFile} from "openai";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
const app=express(),PORT=8787,HOST="127.0.0.1";
const ROOT=path.join(os.homedir(),".liveshive"),KEY_FILE=path.join(ROOT,"openai.key");
await fs.mkdir(ROOT,{recursive:true});
const origins=new Set(["https://abdoutadj707-ops.github.io","http://localhost:5173","http://127.0.0.1:5173"]);
app.use(cors({origin:(o,cb)=>!o||origins.has(o)?cb(null,true):cb(new Error("Origin not allowed"))}));
app.use(express.json({limit:"1mb"}));
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:1024*1024*1024}});
const styles={viral:"strong curiosity without clickbait; concise, high-retention wording",cinematic:"dramatic, cinematic, emotional but faithful",informative:"clear, useful, precise, educational",punchy:"very short, energetic, direct",story:"setup, tension, payoff; factual and easy to follow"};
async function key(){try{return (await fs.readFile(KEY_FILE,"utf8")).trim()||process.env.OPENAI_API_KEY||""}catch{return process.env.OPENAI_API_KEY||""}}
app.get("/api/health",async(_q,s)=>s.json({ok:true,configured:Boolean(await key()),private:true,engine:"LiveShive AI Engine"}));
app.post("/api/key",async(req,res)=>{try{const k=String(req.body?.key||"").trim();if(!/^sk-[A-Za-z0-9._-]+$/.test(k))throw Error("Invalid OpenAI API key.");await fs.writeFile(KEY_FILE,k,{mode:0o600});res.json({ok:true,configured:true,private:true})}catch(e){res.status(400).json({error:e.message})}});
app.post("/api/analyze",upload.single("video"),async(req,res)=>{
 try{
  const k=await key();if(!k)return res.status(401).json({error:"OpenAI API key is not configured on this PC."});
  if(!req.file)return res.status(400).json({error:"No video was uploaded."});
  const count=Math.max(1,Math.min(12,Number(req.body.count)||8)),minLen=Math.max(5,Number(req.body.minLen)||12),maxLen=Math.max(minLen+1,Number(req.body.maxLen)||40),style=styles[req.body.style]?req.body.style:"viral",duration=Number(req.body.duration)||0;
  const ai=new OpenAI({apiKey:k});
  const tr=await ai.audio.transcriptions.create({file:await toFile(req.file.buffer,req.file.originalname||"source.mp4"),model:"whisper-1",response_format:"verbose_json",timestamp_granularities:["segment","word"]});
  const seg=(tr.segments||[]).map((x,i)=>({i,start:Number(x.start||0),end:Number(x.end||0),text:String(x.text||"").trim()})).filter(x=>x.text);
  const transcript=seg.map(x=>`[${x.start.toFixed(2)}-${x.end.toFixed(2)}] ${x.text}`).join("\\n");
  const prompt=`You are LiveShive's editorial brain. Analyze the COMPLETE timestamped transcript.
TARGET CLIPS: ${count}. TARGET LENGTH: ${minLen}-${maxLen}s. STYLE: ${style} — ${styles[style]}.
Choose complete standalone ideas with a clear hook/premise and payoff. Never start mid-sentence. Avoid duplicates/overlap. Never invent facts, names or quotes. Caption must be accurate spoken text, lightly cleaned. Overlay is short commentary grounded in the speech, not a fake quote. postCaption is a ready social caption. If target is 1 or 2, return exactly that many if supported. Return fewer only when necessary.
Return JSON: {"clips":[{"start":12.3,"end":34.1,"score":94,"title":"...","hook":"...","overlay":"...","caption":"...","postCaption":"...","reason":"..."}]}
SOURCE DURATION: ${duration.toFixed(2)}s
TIMESTAMPED TRANSCRIPT:
${transcript}`;
  const out=await ai.responses.create({model:"gpt-5.6-luna",input:[{role:"system",content:"You are a precise short-form editor. Ground every statement in the transcript."},{role:"user",content:prompt}],text:{format:{type:"json_schema",name:"liveShive_clip_plan",strict:true,schema:{type:"object",additionalProperties:false,properties:{clips:{type:"array",minItems:1,maxItems:12,items:{type:"object",additionalProperties:false,properties:{start:{type:"number"},end:{type:"number"},score:{type:"number"},title:{type:"string"},hook:{type:"string"},overlay:{type:"string"},caption:{type:"string"},postCaption:{type:"string"},reason:{type:"string"}},required:["start","end","score","title","hook","overlay","caption","postCaption","reason"]}}},required:["clips"]}}},store:false});
  const plan=JSON.parse(out.output_text),clips=(plan.clips||[]).filter(x=>Number.isFinite(Number(x.start))&&Number.isFinite(Number(x.end))).sort((a,b)=>Number(b.score||0)-Number(a.score||0)).slice(0,count);
  res.json({ok:true,clips,transcript:{text:tr.text||"",language:tr.language||"",duration:tr.duration||duration,segments:seg}});
 }catch(e){console.error(e);res.status(Number(e?.status)>=400?Number(e.status):500).json({error:e?.status===401?"OpenAI rejected the API key. Replace it in LiveShive AI Settings.":e?.message||"LiveShive AI analysis failed."})}
});
app.use((e,_q,res,_n)=>res.status(400).json({error:e.message||"LiveShive Engine request failed."}));
app.listen(PORT,HOST,()=>console.log(`LiveShive AI Engine: http://${HOST}:${PORT}`));