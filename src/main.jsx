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
  catch(e){throw new Error("LiveShive AI Engine is offline. Start the private engine on this PC, then reload the page.")}
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
  const videoRef=React.useRef(null),canvasRef=React.useRef(null),inputRef=React.useRef(null),audioCtxRef=React.useRef(null),mediaSourceRef=React.useRef(null),audioDestRef=React.useRef(null);

  const current=clips.find(c=>c.id===selected);

  React.useEffect(()=>{engineStatus().then(setEngine);const t=setInterval(()=>engineStatus().then(setEngine),5000);return()=>clearInterval(t)},[]);
  React.useEffect(()=>()=>{if(url)URL.revokeObjectURL(url);outputs.forEach(x=>URL.revokeObjectURL(x.url))},[]);
  async function saveKey(v){
    setApiKey(v);
    try{const r=await engineFetch("/api/key",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:v})});setEngine(await r.json());setStatus("OpenAI key saved securely on this PC. LiveShive will use it automatically.")}
    catch(e){setStatus(e.message||"Could not save the key.")}
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
    if(!engine?.configured)return setStatus("Start the private LiveShive AI Engine and save your OpenAI key once.");
    setBusy(true);setStage("transcribing");setProgress(5);setActiveTab("results");
    try{
      setStatus("1/4 Uploading the source to your private local AI engine...");
      const fd=new FormData();
      fd.append("video",file,file.name||"source.mp4");
      fd.append("style",style);fd.append("count",String(clipCount));fd.append("minLen",String(minLen));fd.append("maxLen",String(maxLen));fd.append("duration",String(duration));
      setProgress(18);setStatus("2/4 Transcribing and reviewing the full speech with timestamps...");
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
    const stream=canvas.captureStream(30);
    try{
      const AudioCtx=window.AudioContext||window.webkitAudioContext;
      if(AudioCtx){
        if(!audioCtxRef.current)audioCtxRef.current=new AudioCtx();
        if(!mediaSourceRef.current){
          mediaSourceRef.current=audioCtxRef.current.createMediaElementSource(v);
          audioDestRef.current=audioCtxRef.current.createMediaStreamDestination();
          mediaSourceRef.current.connect(audioDestRef.current);
          mediaSourceRef.current.connect(audioCtxRef.current.destination);
        }
        await audioCtxRef.current.resume();
        v.muted=false;
        audioDestRef.current.stream.getAudioTracks().forEach(t=>stream.addTrack(t));
      }else if(v.captureStream){
        v.captureStream().getAudioTracks().forEach(t=>stream.addTrack(t));
      }
    }catch(e){
      console.warn("Audio capture fallback:",e);
      if(v.captureStream)v.captureStream().getAudioTracks().forEach(t=>stream.addTrack(t));
    }
    let mime="video/webm;codecs=vp9,opus";if(!MediaRecorder.isTypeSupported(mime))mime="video/webm";
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
        <section className="card"><div className="section-title">AI OUTPUT</div><div className="row"><span>Clips</span><div className="mini-buttons">{[1,2,5,8,10,12].map(n=><button className={clipCount===n?"active":""} key={n} onClick={()=>setClipCount(n)}>{n}</button>)}</div></div><div className="row"><span>Length</span><select value={minLen} onChange={e=>setMinLen(+e.target.value)}><option value="10">10s min</option><option value="12">12s min</option><option value="15">15s min</option></select><select value={maxLen} onChange={e=>setMaxLen(+e.target.value)}><option value="30">30s max</option><option value="40">40s max</option><option value="60">60s max</option></select></div></section>
        <section className="card ai-key"><div className="section-title">PRIVATE AI ENGINE</div><label>OpenAI API key — stored only on this PC</label><div className="keybox"><input type={showKey?"text":"password"} value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="sk-..."/><button onClick={()=>saveKey(apiKey)} disabled={!apiKey.trim()}>Save</button><button onClick={()=>setShowKey(!showKey)}>{showKey?"Hide":"Show"}</button></div><small className="privacy">The key goes only to 127.0.0.1 and is never committed to GitHub or exposed to visitors.</small><div className={"engine-state "+(engine?.configured?"ok":"off")}>{engine?.configured?"● Private AI Engine connected":"● AI Engine offline — start LiveShive Engine"}</div></section>
      </aside>

      <section className="center">
        <div className="hero"><div><div className="kicker">ONE VIDEO → READY-TO-POST CLIPS</div><h2>Give LiveShive the video.<br/><span>You choose the writing style.</span></h2><p>Transcript → moment analysis → clip selection → hooks → accurate captions → on-video commentary → post captions → render.</p></div><button className="autopilot" disabled={!file||busy||!engine?.configured} onClick={autopilot}>{busy?"Working...":"Analyze & Auto-Edit"} <span>✦</span></button></div>
        <div className="progress"><div className="progress-line"><i style={{width:progress+"%"}}/></div><div className="progress-labels"><span className={stage==="transcribing"?"on":""}>TRANSCRIBE</span><span className={stage==="transcribing"?"on":""}>UNDERSTAND</span><span className={stage==="ready"||stage==="rendering"||stage==="done"?"on":""}>EDIT</span><span className={stage==="rendering"||stage==="done"?"on":""}>RENDER</span></div></div>
        <div className="preview card"><div className="preview-head"><div><b>{current?.title||"AI result preview"}</b><span>{current?Math.round(current.score)+"/100 short-form score":"Waiting for analysis"}</span></div><div className="tabs">{["results","transcript","settings"].map(t=><button className={activeTab===t?"active":""} key={t} onClick={()=>setActiveTab(t)}>{t}</button>)}</div></div>
          <div className="stage"><div className="phone">{url?<><video ref={videoRef} src={url} playsInline onError={()=>setStatus("Video failed to load. Try MP4 (H.264/AAC) or WebM, then re-import it.")} onLoadedMetadata={onMeta} onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onClick={togglePlay}/>{current?.hook&&<div className="hook">{current.hook}</div>}{current?.overlay&&<div className="overlay">{current.overlay}</div>}{current&&<div className="sub">{(current.captions||[]).find(x=>(videoRef.current?.currentTime||current.start)-current.start>=x.start&&(videoRef.current?.currentTime||current.start)-current.start<=x.end)?.text||""}</div>} {!playing&&<button className="bigplay" onClick={togglePlay}>▶</button>}</>:<div className="empty">Import a video<br/><small>then press Analyze & Auto-Edit</small></div>}</div></div>
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
