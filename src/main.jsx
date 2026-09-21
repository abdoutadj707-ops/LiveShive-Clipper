import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

const ENGINE_BASE="http://127.0.0.1:8787";
const uid=()=>Math.random().toString(36).slice(2,10);
const fmt=s=>{s=Number(s)||0;return String(Math.floor(s/60)).padStart(2,"0")+":"+String(Math.floor(s%60)).padStart(2,"0")};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const styles={
  viral:{label:"Viral / Curiosity",instruction:"strong curiosity without clickbait; concise, high-retention wording"},
  cinematic:{label:"Cinematic",instruction:"dramatic, cinematic, emotional but faithful to the source"},
  informative:{label:"Informative",instruction:"clear, useful, precise, educational wording"},
  punchy:{label:"Fast & Punchy",instruction:"very short, energetic, direct wording"},
  story:{label:"News / Story",instruction:"storytelling structure: setup, tension, payoff; factual and easy to follow"}
};

async function engineFetch(path,options={}){
  let r;
  try{r=await fetch(ENGINE_BASE+path,{...options,signal:AbortSignal.timeout(120000)})}
  catch(e){throw new Error("LiveShive AI Engine is not running. Start the private LiveShive Engine on this PC, then reload the page.")}
  if(!r.ok){let msg="LiveShive Engine request failed";try{const j=await r.json();msg=j.error||msg}catch{}throw new Error(msg+" ("+r.status+")")}
  return r;
}

async function engineStatus(){
  try{const r=await fetch(ENGINE_BASE+"/api/health",{signal:AbortSignal.timeout(2500)});return r.ok?await r.json():null}catch{return null}}

function buildCaptions(transcript,start,end){
  return (transcript.segments||[]).filter(s=>Number(s.end)>start&&Number(s.start)<end).map(s=>({
    start:Math.max(0,Number(s.start)-start),end:Math.min(end-start,Number(s.end)-start),
    text:String(s.text||"").trim()
  })).filter(x=>x.text);
}

port React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

const ENGINE_BASE="http://127.0.0.1:8787";
const uid=()=>Math.random().toString(36).slice(2,10);
const fmt=s=>{s=Number(s)||0;return String(Math.floor(s/60)).padStart(2,"0")+":"+String(Math.floor(s%60)).padStart(2,"0")};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const styles={
  viral:{label:"Viral / Curiosity",instruction:"strong curiosity without clickbait; concise, high-retention wording"},
  cinematic:{label:"Cinematic",instruction:"dramatic, cinematic, emotional but faithful to the source"},
  informative:{label:"Informative",instruction:"clear, useful, precise, educational wording"},
  punchy:{label:"Fast & Punchy",instruction:"very short, energetic, direct wording"},
  story:{label:"News / Story",instruction:"storytelling structure: setup, tension, payoff; factual and easy to follow"}
};

async function engineFetch(path,options={}){
  let r;
  try{r=await fetch(ENGINE_BASE+path,{...options,signal:AbortSignal.timeout(120000)})}
  catch(e){throw new Error("LiveShive AI Engine is not running. Start the private LiveShive Engine on this PC, then reload the page.")}
  if(!r.ok){let msg="LiveShive Engine request failed";try{const j=await r.json();msg=j.error||msg}catch{}throw new Error(msg+" ("+r.status+")")}
  return r;
}

async function engineStatus(){
  try{const r=await fetch(ENGINE_BASE+"/api/health",{signal:AbortSignal.timeout(2500)});return r.ok?await r.json():null}catch{return null}}

function buildCaptions(transcript,start,end){
  return (transcript.segments||[]).filter(s=>Number(s.end)>start&&Number(s.start)<end).map(s=>({
    start:Math.max(0,Number(s.start)-start),end:Math.min(end-start,Number(s.end)-start),
    text:String(s.text||"").trim()
  })).filter(x=>x.text);
}

function buildCaptions(transcript,start,end){
  return (transcript.segments||[]).filter(s=>Number(s.end)>start&&Number(s.start)<end).map(s=>({
    start:Math.max(0,Number(s.start)-start),end:Math.min(end-start,Number(s.end)-start),
    text:String(s.text||"").trim()
  })).filter(x=>x.text);
}

function App(){
  const [file,setFile]=React.useState(null),[url,setUrl]=React.useState("");
  const [duration,setDuration]=React.useState(0),[clips,setClips]=React.useState([]);
  const [selected,setSelected]=React.useState(null),[style,setStyle]=React.useState("viral");
  const [clipCount,setClipCount]=React.useState(8),[minLen,setMinLen]=React.useState(12),[maxLen,setMaxLen]=React.useState(40);
  const [apiKey,setApiKey]=React.useState(""),[showKey,setShowKey]=React.useState(false),[engine,setEngine]=React.useState(null),[busy,setBusy]=React.useState(false);
  const [stage,setStage]=React.useState("idle"),[progress,setProgress]=React.useState(0),[status,setStatus]=React.useState("Upload one video. LiveShive will do the rest.");
  const [format,setFormat]=React.useState("9:16"),[blur,setBlur]=React.useState(true),[ranking,setRanking]=React.useState(false);
  const [quality,setQuality]=React.useState("high"),[outputs,setOutputs]=React.useState([]);
  const [playing,setPlaying]=React.useState(false),[renderIndex,setRenderIndex]=React.useState(0);
  const [activeTab,setActiveTab]=React.useState("results");
  const videoRef=React.useRef(null),canvasRef=React.useRef(null),inputRef=React.useRef(null);

  const current=clips.find(c=>c.id===selected);

  React.useEffect(()=>{
    engineStatus().then(setEngine);
    const t=setInterval(()=>engineStatus().then(setEngine),5000);
    return()=>clearInterval(t);
  },[]);
  React.useEffect(()=>()=>{if(url)URL.revokeObjectURL(url);outputs.forEach(x=>URL.revokeObjectURL(x.url))},[]);
  async function saveKey(v){
    setApiKey(v);
    try{
      const r=await engineFetch("/api/key",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:v})});
      const j=await r.json(); setEngine(j);
      setStatus("OpenAI key saved securely on this PC. LiveShive will use it automatically.");
    }catch(e){setStatus(e.message||"Could not save the key.")}
  }
  function loadFile(e){
    const f=e.target.files?.[0]; if(!f)return;
    if(!f.type.startsWith("video/"))return setStatus("Choose a video file.");
    if(url)URL.revokeObjectURL(url);
    outputs.forEach(x=>URL.revokeObjectURL(x.url));
    setFile(f);setUrl(URL.createObjectURL(f));setClips([]);setOutputs([]);setSelected(null);setStage("ready");setProgress(0);
    setStatus("Video loaded. Choose a writing style, then Analyze & Auto-Edit.");
    e.target.value="";
  }
  function onMeta(){setDuration(Number(videoRef.current?.duration||0))}
  function updateClip(id,p){setClips(v=>v.map(c=>c.id===id?{...c,...p}:c))}
  function seek(t){if(videoRef.current)videoRef.current.currentTime=clamp(t,0,duration)}
  function togglePlay(){const v=videoRef.current;if(!v)return;v.paused?v.play():v.pause()}
  async function autopilot(){
    if(!file||!duration)return setStatus("Upload a video first.");
    if(!engine?.configured)return setStatus("Start the private LiveShive AI Engine and save your OpenAI key once in AI Settings.");
    setBusy(true);setStage("transcribing");setProgress(5);setActiveTab("results");
    try{
      setStatus("1/4 Uploading the source to your private local AI engine...");
      const fd=new FormData();
      fd.append("video",file,file.name||"source.mp4");
      fd.append("style",style);
      fd.append("count",String(clipCount));
      fd.append("minLen",String(minLen));
      fd.append("maxLen",String(maxLen));
      fd.append("duration",String(duration));
      setProgress(18);
      setStatus("2/4 Transcribing and reviewing the full speech with timestamps...");
      const r=await engineFetch("/api/analyze",{method:"POST",body:fd});
      const plan=await r.json();setProgress(68);
      setStatus("3/4 Selecting the strongest moments and preparing captions, hooks and commentary...");
      const raw=(plan.clips||[]).filter(x=>Number.isFinite(Number(x.start))&&Number.isFinite(Number(x.end)));
      const sorted=raw.map((x,i)=>{
        const start=clamp(Number(x.start)-Math.min(1.2,Number(x.start)),0,duration);
        const end=clamp(Number(x.end)+Math.min(1.0,Math.max(0,duration-Number(x.end))),start+.5,duration);
        return {id:uid(),start,end,title:x.title||`Clip ${String(i+1).padStart(2,"0")}`,score:Number(x.score)||0,hook:x.hook||"",overlay:x.overlay||"",postCaption:x.postCaption||"",reason:x.reason||"",captions:buildCaptions(plan.transcript||{segments:[]},start,end)};
      }).sort((a,b)=>b.score-a.score).slice(0,clipCount);
      if(!sorted.length)throw new Error("No strong standalone moments were found.");
      setClips(sorted);setSelected(sorted[0].id);setStage("ready");setProgress(82);
      setStatus(`3/4 ${sorted.length} clips selected. Captions, hooks and post captions are ready. Rendering comes next.`);
      setActiveTab("results");
      await renderAll(sorted);
    }catch(e){console.error(e);setStage("error");setStatus(e.message||"AI analysis failed.");}
    finally{setBusy(false)}
  }

