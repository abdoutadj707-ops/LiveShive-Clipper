import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

const API_BASE="https://api.openai.com/v1";
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

function jsonFromText(text){
  const clean=String(text||"").replace(/\`\`\`json|\`\`\`/g,"").trim();
  const a=clean.indexOf("{"),b=clean.lastIndexOf("}");
  if(a<0||b<a)throw new Error("AI returned an invalid plan.");
  return JSON.parse(clean.slice(a,b+1));
}

async function openaiFetch(path,key,options={}){
  const r=await fetch(API_BASE+path,{...options,headers:{Authorization:"Bearer "+key,...(options.headers||{})}});
  if(!r.ok){let msg="OpenAI request failed";try{const j=await r.json();msg=j.error?.message||msg}catch{}throw new Error(msg+" ("+r.status+")")}
  return r;
}

async function transcribe(file,key){
  const fd=new FormData();
  fd.append("file",file,file.name||"source.mp4");
  fd.append("model","whisper-1");
  fd.append("response_format","verbose_json");
  fd.append("timestamp_granularities[]","segment");
  fd.append("timestamp_granularities[]","word");
  const r=await openaiFetch("/audio/transcriptions",key,{method:"POST",body:fd});
  return r.json();
}

async function planWithAI(transcript,duration,style,count,minLen,maxLen,key){
  const segments=(transcript.segments||[]).map((s,i)=>({i,start:Number(s.start||0),end:Number(s.end||0),text:String(s.text||"").trim()})).filter(x=>x.text);
  const compact=segments.map(s=>`[${s.start.toFixed(2)}-${s.end.toFixed(2)}] ${s.text}`).join("\n");
  const prompt=`You are the editorial brain of LiveShive Clipper. Analyze this timestamped transcript and choose the strongest short-form moments.

SOURCE DURATION: ${duration.toFixed(2)} seconds
TARGET CLIPS: ${count}
TARGET LENGTH: ${minLen}-${maxLen} seconds
WRITING STYLE: ${styles[style].label} — ${styles[style].instruction}

SELECTION RULES:
1. Select complete, self-contained ideas, not random loud moments.
2. Prefer a strong opening premise, tension/question, surprising fact, emotional beat, reveal, argument, punchline or useful insight, followed by a natural payoff.
3. The first spoken seconds must make sense. Do not start mid-sentence.
4. End after the payoff, not immediately after the hook.
5. Avoid duplicate ideas and overlapping clips.
6. Prefer moments that can stand alone without the rest of the video.
7. Score each candidate 0-100 for short-form potential using clarity, curiosity, emotional intensity, payoff, quotability and context independence.
8. Use timestamps from the transcript. Expand boundaries slightly when needed for natural speech.
9. Never invent facts, quotes, names or claims.
10. "caption" must be the accurate spoken text for the selected moment, lightly cleaned only for obvious filler/transcription errors.
11. "overlay" is a short on-video editorial comment based strictly on what is actually said; it is NOT a fake quote.
12. "postCaption" is the social-media description for TikTok/Reels/Shorts, not the on-video subtitle.
13. Return fewer than ${count} clips if the transcript does not contain ${count} genuinely distinct strong moments.

Return ONLY valid JSON:
{
 "clips":[
  {"start":12.3,"end":34.1,"score":94,"title":"...","hook":"...","overlay":"...","caption":"...","postCaption":"...","reason":"..."}
 ]
}

TIMESTAMPED TRANSCRIPT:
${compact}`;
  const body={model:"gpt-5.6-luna",input:[
    {role:"system",content:"You are a precise short-form video editor. You must ground every editorial statement in the supplied transcript."},
    {role:"user",content:prompt}
  ],temperature:0.2};
  const r=await openaiFetch("/responses",key,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const data=await r.json();
  const text=data.output_text||data.output?.flatMap(x=>x.content||[]).map(x=>x.text||"").join("")||"";
  return jsonFromText(text);
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
  const [apiKey,setApiKey]=React.useState(()=>sessionStorage.getItem("liveShive_openai_key")||"");
  const [showKey,setShowKey]=React.useState(false),[busy,setBusy]=React.useState(false);
  const [stage,setStage]=React.useState("idle"),[progress,setProgress]=React.useState(0),[status,setStatus]=React.useState("Upload one video. LiveShive will do the rest.");
  const [format,setFormat]=React.useState("9:16"),[blur,setBlur]=React.useState(true),[ranking,setRanking]=React.useState(false);
  const [quality,setQuality]=React.useState("high"),[outputs,setOutputs]=React.useState([]);
  const [playing,setPlaying]=React.useState(false),[renderIndex,setRenderIndex]=React.useState(0);
  const [activeTab,setActiveTab]=React.useState("results");
  const videoRef=React.useRef(null),canvasRef=React.useRef(null),inputRef=React.useRef(null);

  const current=clips.find(c=>c.id===selected);

  React.useEffect(()=>()=>{if(url)URL.revokeObjectURL(url);outputs.forEach(x=>URL.revokeObjectURL(x.url))},[]);
  function saveKey(v){setApiKey(v);sessionStorage.setItem("liveShive_openai_key",v)}
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
    if(!apiKey.trim())return setStatus("Add your OpenAI API key in AI Settings.");
    setBusy(true);setStage("transcribing");setProgress(8);setActiveTab("results");
    try{
      setStatus("1/4 Transcribing the full video with timestamps...");
      const transcript=await transcribe(file,apiKey.trim());setProgress(35);
      setStatus("2/4 Reading the transcript and finding complete high-retention moments...");
      const plan=await planWithAI(transcript,duration,style,clipCount,minLen,maxLen,apiKey.trim());setProgress(68);
      const raw=(plan.clips||[]).filter(x=>Number.isFinite(Number(x.start))&&Number.isFinite(Number(x.end)));
      const sorted=raw.map((x,i)=>{
        const start=clamp(Number(x.start)-Math.min(1.2,Number(x.start)),0,duration);
        const end=clamp(Number(x.end)+Math.min(1.0,Math.max(0,duration-Number(x.end))),start+.5,duration);
        return {id:uid(),start,end,title:x.title||`Clip ${String(i+1).padStart(2,"0")}`,score:Number(x.score)||0,hook:x.hook||"",overlay:x.overlay||"",postCaption:x.postCaption||"",reason:x.reason||"",captions:buildCaptions(transcript,start,end)};
      }).sort((a,b)=>b.score-a.score).slice(0,clipCount);
      if(!sorted.length)throw new Error("No strong standalone moments were found.");
      setClips(sorted);setSelected(sorted[0].id);setStage("ready");setProgress(82);
      setStatus(`3/4 ${sorted.length} clips selected. Captions, hooks and post captions are ready. Rendering comes next.`);
      setActiveTab("results");
      setTimeout(()=>renderAll(sorted),200);
    }catch(e){console.error(e);setStage("error");setStatus(e.message||"AI analysis failed.");}
    finally{setBusy(false)}
  }

  function drawFrame(ctx,v,w,h,c,rank){
    ctx.clearRect(0,0,w,h);
    if(blur){ctx.save();ctx.filter="blur(34px)";ctx.globalAlpha=.72;ctx.drawImage(v,0,0,w,h);ctx.restore();ctx.fillStyle="rgba(0,0,0,.35)";ctx.fillRect(0,0,w,h)}
    const sw=v.videoWidth||1280,sh=v.videoHeight||720,src=sw/sh,target=w/h;
    let cw=sw,ch=sh;if(src>target)cw=sh*target;else ch=sw/target;
    const sx=(sw-cw)/2,sy=(sh-ch)/2;ctx.drawImage(v,sx,sy,cw,ch,0,0,w,h);
    const hook=c.hook;
    if(hook){ctx.textAlign="center";ctx.font="900 58px Arial";ctx.lineWidth=12;ctx.strokeStyle="#000";ctx.strokeText(hook,w/2,145,w-90);ctx.fillStyle="#fff";ctx.fillText(hook,w/2,145,w-90)}
    const rel=(v.currentTime-c.start);
    const cap=(c.captions||[]).find(x=>rel>=x.start&&rel<=x.end)?.text;
    if(cap){ctx.textAlign="center";ctx.font="700 40px Arial";ctx.lineWidth=9;ctx.strokeStyle="#000";ctx.strokeText(cap,w/2,h-120,w-100);ctx.fillStyle="#fff";ctx.fillText(cap,w/2,h-120,w-100)}
    if(c.overlay){ctx.font="700 34px Arial";ctx.lineWidth=8;ctx.strokeStyle="#000";ctx.strokeText(c.overlay,w/2,h-220,w-120);ctx.fillStyle="#ffd95a";ctx.fillText(c.overlay,w/2,h-220,w-120)}
    if(ranking){ctx.textAlign="left";ctx.font="900 84px Arial";ctx.lineWidth=12;ctx.strokeStyle="#000";ctx.strokeText(String(rank),55,120);ctx.fillStyle="#fff";ctx.fillText(String(rank),55,120)}
  }

  async function renderOne(c,index,total){
    const v=videoRef.current,canvas=canvasRef.current;if(!v||!canvas)throw new Error("Renderer unavailable");
    const w=1080,h=format==="1:1"?1080:format==="16:9"?608:1920;canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext("2d");v.pause();v.playbackRate=1;v.currentTime=c.start;
    await new Promise(r=>{const done=()=>{v.removeEventListener("seeked",done);r()};v.addEventListener("seeked",done,{once:true});setTimeout(r,700)});
    const stream=canvas.captureStream(30);let mime="video/webm;codecs=vp9,opus";if(!MediaRecorder.isTypeSupported(mime))mime="video/webm";
    const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:quality==="high"?8000000:quality==="medium"?5000000:2500000,audioBitsPerSecond:128000});
    const chunks=[];rec.ondataavailable=e=>e.data?.size&&chunks.push(e.data);
    const done=new Promise(r=>rec.onstop=()=>r(new Blob(chunks,{type:mime})));rec.start(100);await v.play();
    await new Promise(resolve=>{let last=0;const loop=now=>{if(v.currentTime>=c.end-.03||v.ended){v.pause();rec.stop();resolve();return}if(now-last>20){drawFrame(ctx,v,w,h,c,ranking?total-index:index+1);last=now}requestAnimationFrame(loop)};requestAnimationFrame(loop)});
    return done;
  }
  async function renderAll(list=clips){
    if(!list.length||!videoRef.current)return;
    setBusy(true);setStage("rendering");setProgress(84);setStatus("4/4 Rendering publish-ready clips...");
    outputs.forEach(x=>URL.revokeObjectURL(x.url));setOutputs([]);
    try{
      const out=[];
      for(let i=0;i<list.length;i++){setRenderIndex(i+1);setProgress(84+(i/list.length)*15);const blob=await renderOne(list[i],i,list.length);out.push({id:uid(),name:`liveShive-${String(i+1).padStart(2,"0")}.webm`,url:URL.createObjectURL(blob),caption:list[i].postCaption})}
      setOutputs(out);setProgress(100);setStage("done");setStatus(`Done. ${out.length} clips rendered. Each clip already has its hook, captions and post caption.`);setActiveTab("export");
    }catch(e){console.error(e);setStage("error");setStatus("Rendering failed: "+e.message)}
    finally{setBusy(false);if(videoRef.current){videoRef.current.playbackRate=1;videoRef.current.muted=false}}
  }

  return <div className="app">
    <header className="topbar"><div className="brand"><div className="logo">LS</div><div><div className="kicker">AI AUTOPILOT VIDEO STUDIO</div><h1>LiveShive <b>Clipper</b></h1></div></div><div className="source-name">{file?.name||"No source video"}</div><button className="import" onClick={()=>inputRef.current?.click()}>＋ Import video</button><input ref={inputRef} hidden type="file" accept="video/*" onChange={loadFile}/></header>

    <main className="layout">
      <aside className="left">
        <section className="card source-card"><div className="section-title">SOURCE</div><button className="drop" onClick={()=>inputRef.current?.click()}><span className="drop-icon">↑</span><b>{file?"Replace video":"Drop video here"}</b><small>MP4 / MOV / WebM</small></button>{file&&<div className="source-meta"><b>{file.name}</b><span>{fmt(duration)} • local source</span></div>}</section>
        <section className="card"><div className="section-title">WRITING STYLE <span>only creative choice</span></div><div className="style-grid">{Object.entries(styles).map(([k,v])=><button key={k} className={style===k?"active":""} onClick={()=>setStyle(k)}><b>{v.label}</b><small>{k==="viral"?"Curiosity":k==="cinematic"?"Emotion":k==="informative"?"Clarity":k==="punchy"?"Energy":"Story"}</small></button>)}</div></section>
        <section className="card"><div className="section-title">AI OUTPUT</div><div className="row"><span>Clips</span><div className="mini-buttons">{[5,8,10,12].map(n=><button className={clipCount===n?"active":""} key={n} onClick={()=>setClipCount(n)}>{n}</button>)}</div></div><div className="row"><span>Length</span><select value={minLen} onChange={e=>setMinLen(+e.target.value)}><option value="10">10s min</option><option value="12">12s min</option><option value="15">15s min</option></select><select value={maxLen} onChange={e=>setMaxLen(+e.target.value)}><option value="30">30s max</option><option value="40">40s max</option><option value="60">60s max</option></select></div></section>
        <section className="card ai-key"><div className="section-title">AI SETTINGS</div><label>OpenAI API key</label><div className="keybox"><input type={showKey?"text":"password"} value={apiKey} onChange={e=>saveKey(e.target.value)} placeholder="sk-..."/><button onClick={()=>setShowKey(!showKey)}>{showKey?"Hide":"Show"}</button></div><small className="privacy">Used only from this browser session. The current GitHub Pages build has no private server.</small></section>
      </aside>

      <section className="center">
        <div className="hero"><div><div className="kicker">ONE VIDEO → READY-TO-POST CLIPS</div><h2>Give LiveShive the video.<br/><span>You choose the writing style.</span></h2><p>Transcript → moment analysis → clip selection → hooks → accurate captions → on-video commentary → post captions → render.</p></div><button className="autopilot" disabled={!file||busy} onClick={autopilot}>{busy?"Working...":"Analyze & Auto-Edit"} <span>✦</span></button></div>
        <div className="progress"><div className="progress-line"><i style={{width:progress+"%"}}/></div><div className="progress-labels"><span className={stage==="transcribing"?"on":""}>TRANSCRIBE</span><span className={stage==="transcribing"?"on":""}>UNDERSTAND</span><span className={stage==="ready"||stage==="rendering"||stage==="done"?"on":""}>EDIT</span><span className={stage==="rendering"||stage==="done"?"on":""}>RENDER</span></div></div>
        <div className="preview card"><div className="preview-head"><div><b>{current?.title||"AI result preview"}</b><span>{current?Math.round(current.score)+"/100 short-form score":"Waiting for analysis"}</span></div><div className="tabs">{["results","transcript","settings"].map(t=><button className={activeTab===t?"active":""} key={t} onClick={()=>setActiveTab(t)}>{t}</button>)}</div></div>
          <div className="stage"><div className="phone">{url?<><video ref={videoRef} src={url} playsInline onLoadedMetadata={onMeta} onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onClick={togglePlay}/>{current?.hook&&<div className="hook">{current.hook}</div>}{current?.overlay&&<div className="overlay">{current.overlay}</div>}{current&&<div className="sub">{(current.captions||[]).find(x=>(videoRef.current?.currentTime||current.start)-current.start>=x.start&&(videoRef.current?.currentTime||current.start)-current.start<=x.end)?.text||""}</div>} {!playing&&<button className="bigplay" onClick={togglePlay}>▶</button>}</>:<div className="empty">Import a video<br/><small>then press Analyze & Auto-Edit</small></div>}</div></div>
          {activeTab==="results"&&<div className="result-list">{clips.map((c,i)=><button key={c.id} className={"result "+(selected===c.id?"selected":"")} onClick={()=>{setSelected(c.id);seek(c.start)}}><span className="rank">#{i+1}</span><span className="rtext"><b>{c.title}</b><small>{fmt(c.end-c.start)} • {Math.round(c.score)}/100</small></span><span className="arrow">›</span></button>)}</div>}
          {activeTab==="transcript"&&<div className="transcript"><p>Captions are generated from timestamped speech and mapped back to each selected clip.</p>{current?.captions?.map((x,i)=><div key={i}><time>{fmt(x.start)}</time><span>{x.text}</span></div>)}</div>}
          {activeTab==="settings"&&<div className="settings"><label>Format <select value={format} onChange={e=>setFormat(e.target.value)}><option>9:16</option><option>1:1</option><option>16:9</option></select></label><label>Blurred background <input type="checkbox" checked={blur} onChange={e=>setBlur(e.target.checked)}/></label><label>Ranking 5 → 1 <input type="checkbox" checked={ranking} onChange={e=>setRanking(e.target.checked)}/></label><label>Render quality <select value={quality} onChange={e=>setQuality(e.target.value)}><option value="high">High</option><option value="medium">Medium</option><option value="fast">Fast</option></select></label></div>}
        </div>
        <div className={"status "+(stage==="error"?"error":"")}>{status}{stage==="rendering"&&<span> • clip {renderIndex}/{clips.length}</span>}</div>
      </section>

      <aside className="right">
        <section className="card inspector"><div className="section-title">AI OUTPUT</div>{current?<><div className="score"><b>{Math.round(current.score)}</b><span>SHORT-FORM<br/>POTENTIAL</span></div><label>HOOK</label><div className="copy">{current.hook||"—"}</div><label>ON-VIDEO COMMENTARY</label><div className="copy">{current.overlay||"—"}</div><label>POST CAPTION</label><div className="copy post">{current.postCaption||"—"}</div><label>WHY THIS MOMENT</label><div className="reason">{current.reason||"—"}</div></>:<div className="empty-side">AI will fill this automatically after analysis.</div>}</section>
        <section className="card"><div className="section-title">EXPORT</div><button className="export" disabled={!clips.length||busy} onClick={()=>renderAll()}>{stage==="done"?"Render again":"Render all clips"} →</button>{outputs.length>0&&<div className="downloads">{outputs.map((o,i)=><div key={o.id}><a href={o.url} download={o.name}>↓ {o.name}</a><small>{o.caption}</small></div>)}</div>}</section>
      </aside>
    </main>
    <canvas ref={canvasRef} hidden/>
  </div>
}
ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
