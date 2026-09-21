import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

const FORMATS={
  "9:16":{w:1080,h:1920},
  "1:1":{w:1080,h:1080},
  "16:9":{w:1920,h:1080}
};
const uid=()=>Math.random().toString(36).slice(2,9);
const fmt=s=>{
  if(!Number.isFinite(s))return"00:00";
  const m=Math.floor(s/60),x=Math.floor(s%60);
  return String(m).padStart(2,"0")+":"+String(x).padStart(2,"0");
};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

function App(){
  const [url,setUrl]=React.useState("");
  const [file,setFile]=React.useState(null);
  const [duration,setDuration]=React.useState(0);
  const [format,setFormat]=React.useState("9:16");
  const [clips,setClips]=React.useState([]);
  const [selected,setSelected]=React.useState(null);
  const [cropX,setCropX]=React.useState(50);
  const [cropY,setCropY]=React.useState(50);
  const [blurBg,setBlurBg]=React.useState(true);
  const [hook,setHook]=React.useState("");
  const [overlay,setOverlay]=React.useState("");
  const [caption,setCaption]=React.useState("");
  const [ranking,setRanking]=React.useState(false);
  const [mute,setMute]=React.useState(false);
  const [volume,setVolume]=React.useState(1);
  const [speed,setSpeed]=React.useState(1);
  const [quality,setQuality]=React.useState("high");
  const [panel,setPanel]=React.useState("ai");
  const [showGrid,setShowGrid]=React.useState(false);
  const [playing,setPlaying]=React.useState(false);
  const [busy,setBusy]=React.useState(false);
  const [status,setStatus]=React.useState("Upload a video to start.");
  const [outputs,setOutputs]=React.useState([]);
  const [peakCount,setPeakCount]=React.useState(8);
  const [peakLength,setPeakLength]=React.useState(18);
  const [aiProgress,setAiProgress]=React.useState(0);
  const [aiReady,setAiReady]=React.useState(false);
  const [aiScores,setAiScores]=React.useState([]);
  const videoRef=React.useRef(null);
  const analysisRef=React.useRef(null);
  const canvasRef=React.useRef(null);
  const inputRef=React.useRef(null);
  const audioCtxRef=React.useRef(null);
  const mediaSourceRef=React.useRef(null);
  const audioDestRef=React.useRef(null);

  const current=clips.find(c=>c.id===selected);

  React.useEffect(()=>{
    return()=>{
      if(url)URL.revokeObjectURL(url);
      outputs.forEach(o=>URL.revokeObjectURL(o.url));
    };
  },[url]);

  React.useEffect(()=>{
    const v=videoRef.current;
    if(!v)return;
    const onPlay=()=>setPlaying(true),onPause=()=>setPlaying(false);
    v.addEventListener("play",onPlay);v.addEventListener("pause",onPause);
    return()=>{v.removeEventListener("play",onPlay);v.removeEventListener("pause",onPause);};
  },[url]);

  function loadFile(e){
    const f=e.target.files?.[0];
    if(!f)return;
    if(!f.type.startsWith("video/")){setStatus("Please choose a video file.");return;}
    if(url)URL.revokeObjectURL(url);
    outputs.forEach(o=>URL.revokeObjectURL(o.url));
    const next=URL.createObjectURL(f);
    setFile(f);setUrl(next);setDuration(0);setClips([]);setSelected(null);setOutputs([]);
    setAiReady(false);setAiScores([]);setAiProgress(0);
    setHook("");setOverlay("");setCaption("");setStatus("Video loaded. Run AI Peak Finder.");
    e.target.value="";
  }

  function metadata(){
    const d=Number(videoRef.current?.duration||0);
    if(!d)return;
    setDuration(d);
    const c={id:uid(),start:0,end:d,title:"Source",hook:"",overlay:"",caption:"",score:0};
    setClips([c]);setSelected(c.id);
  }

  function updateClip(id,patch){setClips(v=>v.map(c=>c.id===id?{...c,...patch}:c));}
  function removeClip(id){setClips(v=>v.filter(c=>c.id!==id));if(selected===id)setSelected(null);}
  function duplicateClip(){
    if(!current)return;
    const c={...current,id:uid(),title:(current.title||"Clip")+" copy"};
    setClips(v=>[...v,c]);setSelected(c.id);
  }
  function addClip(start=0,end=duration){
    if(!duration)return;
    const c={id:uid(),start,end:Math.max(start+.1,end),title:"Clip "+(clips.length+1),hook:"",overlay:"",caption:"",score:0};
    setClips(v=>[...v,c]);setSelected(c.id);
  }
  function changeRange(which,value){
    if(!current)return;
    let n=Number(value);
    if(which==="start")n=Math.min(n,current.end-.1);
    else n=Math.max(n,current.start+.1);
    updateClip(current.id,{[which]:n});
  }
  function seek(t){if(videoRef.current)videoRef.current.currentTime=clamp(t,0,duration);}

  function drawCover(ctx,video,w,h){
    const sw=video.videoWidth||1280,sh=video.videoHeight||720;
    const target=w/h,source=sw/sh;
    let cw,ch;
    if(source>target){ch=sh;cw=sh*target;}else{cw=sw;ch=sw/target;}
    const sx=(sw-cw)*(cropX/100),sy=(sh-ch)*(cropY/100);
    ctx.drawImage(video,sx,sy,cw,ch,0,0,w,h);
  }

  function drawFrame(ctx,video,w,h,c,rank){
    ctx.clearRect(0,0,w,h);
    if(blurBg&&format==="9:16"){
      ctx.save();ctx.filter="blur(32px)";
      const sw=video.videoWidth||1280,sh=video.videoHeight||720,scale=Math.max(w/sw,h/sh);
      ctx.drawImage(video,(w-sw*scale)/2,(h-sh*scale)/2,sw*scale,sh*scale);
      ctx.restore();ctx.fillStyle="rgba(0,0,0,.35)";ctx.fillRect(0,0,w,h);
    }else{ctx.fillStyle="#000";ctx.fillRect(0,0,w,h);}
    drawCover(ctx,video,w,h);
    const hookText=c.hook||hook,overlayText=c.overlay||overlay,captionText=c.caption||caption;
    ctx.textAlign="center";ctx.direction="ltr";
    if(hookText){ctx.font="900 62px Arial";ctx.lineWidth=12;ctx.strokeStyle="#000";ctx.strokeText(hookText,w/2,150,w-90);ctx.fillStyle="#fff";ctx.fillText(hookText,w/2,150,w-90);}
    if(overlayText){ctx.font="700 46px Arial";ctx.lineWidth=9;ctx.strokeStyle="#000";ctx.strokeText(overlayText,w/2,h-210,w-100);ctx.fillStyle="#fff";ctx.fillText(overlayText,w/2,h-210,w-100);}
    if(captionText){ctx.font="700 40px Arial";ctx.lineWidth=8;ctx.strokeStyle="#000";ctx.strokeText(captionText,w/2,h-100,w-100);ctx.fillStyle="#ffe66d";ctx.fillText(captionText,w/2,h-100,w-100);}
    if(ranking){ctx.textAlign="left";ctx.font="900 86px Arial";ctx.lineWidth=14;ctx.strokeStyle="#000";const n=rank??clips.length;ctx.strokeText(String(n),70,130);ctx.fillStyle="#fff";ctx.fillText(String(n),70,130);}
  }

  async function waitSeek(v,t){
    if(Math.abs((v.currentTime||0)-t)<.04)return;
    await new Promise(resolve=>{
      let done=false;
      const finish=()=>{if(done)return;done=true;v.removeEventListener("seeked",finish);clearTimeout(timer);resolve();};
      const timer=setTimeout(finish,1200);
      v.addEventListener("seeked",finish);
      v.currentTime=t;
    });
  }

  async function renderOne(c,index){
    const video=videoRef.current,canvas=canvasRef.current;
    if(!video||!canvas)throw new Error("Video renderer unavailable");
    const {w,h}=FORMATS[format],ctx=canvas.getContext("2d");
    canvas.width=w;canvas.height=h;
    video.pause();video.playbackRate=speed;
    await waitSeek(video,c.start);
    const stream=canvas.captureStream(30);
    try{
      if(!audioCtxRef.current){
        const AC=window.AudioContext||window.webkitAudioContext;
        if(AC)audioCtxRef.current=new AC();
      }
      if(audioCtxRef.current){
        if(!mediaSourceRef.current){
          mediaSourceRef.current=audioCtxRef.current.createMediaElementSource(video);
          audioDestRef.current=audioCtxRef.current.createMediaStreamDestination();
          mediaSourceRef.current.connect(audioDestRef.current);
          mediaSourceRef.current.connect(audioCtxRef.current.destination);
        }
        await audioCtxRef.current.resume();
        video.muted=mute;video.volume=volume;
        audioDestRef.current.stream.getAudioTracks().forEach(t=>stream.addTrack(t));
      }else if(video.captureStream){
        video.captureStream().getAudioTracks().forEach(t=>stream.addTrack(t));
      }
    }catch(err){
      if(video.captureStream)video.captureStream().getAudioTracks().forEach(t=>stream.addTrack(t));
    }
    let mime="video/webm;codecs=vp9,opus";
    if(!MediaRecorder.isTypeSupported(mime))mime="video/webm";
    const bitrate=quality==="high"?8000000:quality==="medium"?5000000:2500000;
    const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:bitrate,audioBitsPerSecond:128000});
    const chunks=[];
    recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data);};
    const stopped=new Promise(resolve=>{recorder.onstop=()=>resolve(new Blob(chunks,{type:mime}));});
    recorder.start(100);
    await video.play();
    await new Promise(resolve=>{
      let last=0;
      const loop=now=>{
        if(video.currentTime>=c.end-.02||video.ended){
          video.pause();if(recorder.state!=="inactive")recorder.stop();resolve();return;
        }
        if(now-last>20){drawFrame(ctx,video,w,h,c,ranking?clips.length-index:null);last=now;}
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    return stopped;
  }

  async function renderAll(){
    if(!videoRef.current||!clips.length){setStatus("Add at least one clip.");return;}
    if(!window.MediaRecorder||!canvasRef.current?.captureStream){setStatus("Use Chrome or Edge for rendering.");return;}
    setBusy(true);
    outputs.forEach(o=>URL.revokeObjectURL(o.url));setOutputs([]);
    try{
      const result=[];
      const renderClips=clips.filter(c=>c.end-c.start>.15);
      for(let i=0;i<renderClips.length;i++){
        setStatus("Rendering clip "+(i+1)+" of "+renderClips.length+"...");
        const blob=await renderOne(renderClips[i],i);
        result.push({id:uid(),name:(renderClips[i].title||"clip-"+(i+1)).replace(/[^a-z0-9_-]+/gi,"-")+".webm",url:URL.createObjectURL(blob)});
      }
      setOutputs(result);
      setStatus(result.length+" clips rendered. Click a file to download it.");
      setPanel("export");
    }catch(e){
      console.error(e);setStatus("Rendering failed: "+(e?.message||"browser renderer error"));
    }finally{
      setBusy(false);
      if(videoRef.current){videoRef.current.muted=false;videoRef.current.volume=1;videoRef.current.playbackRate=1;}
    }
  }

  async function aiPeakFinder(){
    if(!url||!duration){setStatus("Load a video first.");return;}
    const v=analysisRef.current;
    if(!v){setStatus("AI analyzer is not ready.");return;}
    setBusy(true);setAiReady(false);setAiProgress(0);setAiScores([]);
    setStatus("AI Peak Finder: scanning motion and audio energy...");
    try{
      v.src=url;v.load();
      await new Promise((resolve,reject)=>{
        const ok=()=>{v.removeEventListener("loadedmetadata",ok);resolve();};
        const bad=()=>reject(new Error("Could not analyze video"));
        v.addEventListener("loadedmetadata",ok,{once:true});v.addEventListener("error",bad,{once:true});
      });
      const d=Number(v.duration||duration);
      const sampleStep=d>900?1:d>300?.75:.5;
      const samples=[];
      const c=document.createElement("canvas"),cx=c.getContext("2d",{willReadFrequently:true});
      c.width=64;c.height=36;
      let prev=null,total=Math.ceil(d/sampleStep);
      for(let i=0;i<total;i++){
        const t=Math.min(d-.05,i*sampleStep);
        await waitSeek(v,t);
        cx.drawImage(v,0,0,64,36);
        const data=cx.getImageData(0,0,64,36).data;
        let lum=0,diff=0;
        for(let p=0;p<data.length;p+=4){
          const y=(data[p]*.2126+data[p+1]*.7152+data[p+2]*.0722)/255;lum+=y;
          if(prev)diff+=Math.abs(y-prev[p/4]);
        }
        samples.push({t,motion:prev?diff/(64*36):0,lum:lum/(64*36)});
        prev=new Float32Array(64*36);
        let j=0;for(let p=0;p<data.length;p+=4)prev[j++]=(data[p]*.2126+data[p+1]*.7152+data[p+2]*.0722)/255;
        if(i%3===0)setAiProgress(Math.round(i/total*65));
      }
      let audio=[];
      try{
        const AC=window.AudioContext||window.webkitAudioContext;
        if(AC){
          const ac=new AC();
          const ab=await (await fetch(url)).arrayBuffer();
          const decoded=await ac.decodeAudioData(ab);
          const ch=decoded.getChannelData(0),rate=decoded.sampleRate,step=Math.max(1,Math.floor(rate*sampleStep));
          for(let p=0;p<ch.length;p+=step){
            let sum=0,end=Math.min(ch.length,p+step);
            for(let q=p;q<end;q+=4)sum+=ch[q]*ch[q];
            audio.push(Math.sqrt(sum/Math.max(1,Math.ceil((end-p)/4))));
          }
          await ac.close();
        }
      }catch(err){audio=[];}
      const maxM=Math.max(...samples.map(x=>x.motion),.0001),maxA=Math.max(...audio,.0001);
      const candidates=[];
      for(let i=2;i<samples.length-2;i++){
        const s=samples[i],m=s.motion/maxM;
        const a=audio.length?((audio[i]||0)/maxA):0;
        const neighbor=(samples[i-1].motion+samples[i+1].motion)/(2*maxM);
        const score=clamp(.52*m+.33*a+.15*neighbor,0,1);
        candidates.push({t:s.t,score});
      }
      candidates.sort((a,b)=>b.score-a.score);
      const len=clamp(Number(peakLength)||18,8,60);
      const chosen=[];
      for(const p of candidates){
        let start=clamp(p.t-len*.42,0,Math.max(0,d-len));
        let end=Math.min(d,start+len);
        if(chosen.every(x=>end<=x.start+2||start>=x.end-2)){
          chosen.push({start,end,score:p.score});
          if(chosen.length>=clamp(Number(peakCount)||8,1,12))break;
        }
      }
      chosen.sort((a,b)=>a.start-b.start);
      const made=chosen.map((x,i)=>({
        id:uid(),start:x.start,end:x.end,title:"Peak "+String(i+1).padStart(2,"0"),
        hook:"",overlay:"",caption:"",score:x.score
      }));
      setClips(made);setSelected(made[0]?.id||null);setAiScores(chosen);setAiReady(true);setAiProgress(100);
      setStatus("AI Peak Finder selected "+made.length+" high-signal moments. Review them, then Render all.");
      setPanel("ai");
    }catch(e){
      console.error(e);setStatus("Peak analysis failed. Try a local MP4/WebM in Chrome.");
    }finally{setBusy(false);}
  }

  function autoSplit(){
    if(!duration)return;
    const count=Math.min(12,Math.max(2,Math.ceil(duration/30)));
    const size=duration/count;
    const made=Array.from({length:count},(_,i)=>({id:uid(),start:i*size,end:Math.min(duration,(i+1)*size),title:"Clip "+(i+1),hook:"",overlay:"",caption:"",score:0}));
    setClips(made);setSelected(made[0].id);setStatus("Created "+made.length+" editable segments.");
  }

  function togglePlay(){
    const v=videoRef.current;if(!v)return;
    if(v.paused)v.play();else v.pause();
  }

  return <div className="studio">
    <video ref={analysisRef} hidden playsInline preload="metadata"/>
    <canvas ref={canvasRef} hidden/>
    <header className="studio-topbar">
      <div className="studio-brand"><div className="brand-mark">LS</div><div><div className="eyebrow">SHORT-FORM VIDEO STUDIO</div><h1>LiveShive <b>Clipper</b></h1></div></div>
      <div className="project-name">{file?.name||"Untitled project"} <span>• Local</span></div>
      <div className="top-actions"><button className="ghost-btn" onClick={()=>inputRef.current?.click()}>＋ Import</button><input ref={inputRef} hidden type="file" accept="video/*" onChange={loadFile}/><button className="primary-btn" disabled={busy||!clips.length} onClick={renderAll}>{busy?"Working...":"Export"} <span>⌘↵</span></button></div>
    </header>

    <main className="studio-grid">
      <aside className="media-panel">
        <div className="panel-head"><span>MEDIA</span><button onClick={()=>inputRef.current?.click()}>＋</button></div>
        <button className="dropzone" onClick={()=>inputRef.current?.click()}><div className="drop-icon">↥</div><b>{file?"Replace source video":"Import video"}</b><small>MP4, WebM • local processing</small></button>
        {file&&<div className="media-card"><div className="media-thumb">▶</div><div><b>{file.name}</b><small>{fmt(duration)} • source</small></div></div>}
        <div className="panel-head clips-head"><span>CLIPS <i>{clips.length}</i></span><button disabled={!duration||busy} onClick={autoSplit}>AUTO</button></div>
        <div className="media-clips">{clips.map((c,i)=><button key={c.id} onClick={()=>setSelected(c.id)} className={"media-clip "+(selected===c.id?"active":"")}><strong>{String(i+1).padStart(2,"0")}</strong><span><b>{c.title}</b><small>{fmt(c.end-c.start)} {c.score?("• "+Math.round(c.score*100)): ""}</small></span></button>)}</div>
        <button className="outline-btn" disabled={!duration} onClick={()=>addClip(0,duration)}>＋ New clip</button>
        <div className="local-note"><span>●</span> Source files stay in your browser</div>
      </aside>

      <section className="main-stage">
        <div className="stage-toolbar"><div className="toolbar-group"><button className={showGrid?"tool active":"tool"} onClick={()=>setShowGrid(!showGrid)}>⊞</button><button className="tool" onClick={()=>setFormat(format==="9:16"?"1:1":format==="1:1"?"16:9":"9:16")}>Frame</button></div><div className="stage-mode">{["9:16","1:1","16:9"].map(k=><button key={k} className={format===k?"active":""} onClick={()=>setFormat(k)}>{k}</button>)}</div><div className="toolbar-group"><span className="zoom">100%</span><button className="tool">⋯</button></div></div>
        <div className={"stage-canvas "+(showGrid?"grid-on":"")}><div className={"video-frame "+(format==="9:16"?"portrait":"")}>
          {url?<video ref={videoRef} src={url} controls={false} playsInline onLoadedMetadata={metadata} onClick={togglePlay}/>:<div className="empty-stage"><div>＋</div><b>Import a video to start</b><span>Find peaks, build clips and render vertically.</span></div>}
          {current?.hook&&<div className="preview-hook">{current.hook}</div>}{current?.overlay&&<div className="preview-overlay">{current.overlay}</div>}{current?.caption&&<div className="preview-caption">{current.caption}</div>}{ranking&&current&&<div className="rank-badge">{clips.length-clips.indexOf(current)}</div>}
          {!playing&&url&&<button className="center-play" onClick={togglePlay}>▶</button>}
        </div></div>
        <div className="player-bar"><button onClick={()=>seek(current?.start||0)}>↤</button><button className="play-main" onClick={togglePlay}>{playing?"Ⅱ":"▶"}</button><button onClick={()=>seek(Math.min(duration,current?.end||duration))}>↦</button><span className="timecode">{fmt(videoRef.current?.currentTime||current?.start||0)} / {fmt(duration)}</span><div className="player-spacer"/><span className="speed-label">{speed}×</span><button onClick={()=>setMute(!mute)}>{mute?"🔇":"🔊"}</button></div>
        <div className="timeline-panel">
          <div className="timeline-top"><div><b>Timeline</b><span>{clips.length} clips • {fmt(duration)}</span></div><div className="timeline-actions"><button onClick={aiPeakFinder} disabled={!duration||busy}>AI Peaks</button><button onClick={autoSplit} disabled={!duration||busy}>Auto split</button><button onClick={()=>current&&duplicateClip()}>Duplicate</button><button onClick={()=>current&&removeClip(current.id)}>Delete</button></div></div>
          <div className="ruler"><span>00:00</span><span>{fmt(duration*.25)}</span><span>{fmt(duration*.5)}</span><span>{fmt(duration*.75)}</span><span>{fmt(duration)}</span></div>
          <div className="tracks"><div className="track-label">VIDEO</div><div className="track-lane">{clips.map((c,i)=><button key={c.id} onClick={()=>setSelected(c.id)} className={"timeline-clip "+(selected===c.id?"selected":"")} style={{left:(c.start/Math.max(duration,1))*100+"%",width:Math.max(2,((c.end-c.start)/Math.max(duration,1))*100)+"%"}}><b>{i+1}</b> {c.title}</button>)}</div><div className="track-label">TEXT</div><div className="text-lane"><div className="text-track">HOOK / CAPTIONS</div></div></div>
          {current&&<div className="range-row"><label>IN <b>{fmt(current.start)}</b><input type="range" min="0" max={duration} step=".1" value={current.start} onChange={e=>changeRange("start",e.target.value)}/></label><label>OUT <b>{fmt(current.end)}</b><input type="range" min="0" max={duration} step=".1" value={current.end} onChange={e=>changeRange("end",e.target.value)}/></label></div>}
        </div>
      </section>

      <aside className="inspector-panel">
        <div className="inspector-tabs"><button className={panel==="ai"?"active":""} onClick={()=>setPanel("ai")}>AI PEAKS</button><button className={panel==="edit"?"active":""} onClick={()=>setPanel("edit")}>EDIT</button><button className={panel==="text"?"active":""} onClick={()=>setPanel("text")}>TEXT</button><button className={panel==="export"?"active":""} onClick={()=>setPanel("export")}>EXPORT</button></div>

        {panel==="ai"&&<div className="inspector-body">
          <div className="inspector-title">AI Peak Finder <span>Local peak analysis • motion + audio energy</span></div>
          <div className="ai-explainer">The analyzer scans the whole video and looks for moments with unusually strong visual change and audio intensity, then creates non-overlapping short clips around those peaks.</div>
          <div className="field-label">NUMBER OF PEAKS</div><div className="speed-grid">{[5,8,10,12].map(n=><button key={n} className={peakCount===n?"active":""} onClick={()=>setPeakCount(n)}>{n}</button>)}</div>
          <div className="field-label">CLIP LENGTH</div><div className="speed-grid">{[12,18,25].map(n=><button key={n} className={peakLength===n?"active":""} onClick={()=>setPeakLength(n)}>{n}s</button>)}</div>
          <button className="export-big ai-button" disabled={!duration||busy} onClick={aiPeakFinder}>{busy?"Analyzing...":"Find Peak Moments"} <span>✦</span></button>
          {busy&&<div className="ai-progress"><div style={{width:aiProgress+"%"}}/></div>}
          {aiReady&&<div className="ai-results"><b>{clips.length} peaks selected</b>{aiScores.map((x,i)=><button key={i} onClick={()=>{const c=clips[i];if(c){setSelected(c.id);seek(c.start);}}}><span>#{i+1}</span>{fmt(x.start)}–{fmt(x.end)}<em>{Math.round(x.score*100)}</em></button>)}</div>}
          <div className="audio-note">This is browser-local signal analysis; it does not upload your video. It is designed as the peak-selection engine for the current static GitHub Pages build.</div>
        </div>}

        {panel==="edit"&&<div className="inspector-body">
          <div className="inspector-title">Clip settings <span>{current?current.title:"No clip selected"}</span></div>
          <div className="field-label">FORMAT</div><div className="format-buttons">{["9:16","1:1","16:9"].map(k=><button key={k} className={format===k?"active":""} onClick={()=>setFormat(k)}>{k}</button>)}</div>
          <div className="field-label">FRAMING</div><label className="switch-row"><span>Blurred background</span><input type="checkbox" checked={blurBg} onChange={e=>setBlurBg(e.target.checked)}/></label>
          <label className="range-control">Horizontal <b>{cropX}%</b><input type="range" value={cropX} onChange={e=>setCropX(Number(e.target.value))}/></label>
          <label className="range-control">Vertical <b>{cropY}%</b><input type="range" value={cropY} onChange={e=>setCropY(Number(e.target.value))}/></label>
          <div className="field-label">RANKING</div><label className="switch-row"><span>Ranking 5 → 1</span><input type="checkbox" checked={ranking} onChange={e=>setRanking(e.target.checked)}/></label>
          {current&&<><div className="field-label">CLIP NAME</div><input className="studio-input" value={current.title} onChange={e=>updateClip(current.id,{title:e.target.value})}/></>}
        </div>}

        {panel==="text"&&<div className="inspector-body">
          <div className="inspector-title">Text & hooks</div>
          <div className="field-label">HOOK</div><textarea className="studio-textarea" placeholder="This changes everything..." value={current?.hook??hook} onChange={e=>current?updateClip(current.id,{hook:e.target.value}):setHook(e.target.value)}/>
          <div className="field-label">BOTTOM OVERLAY</div><textarea className="studio-textarea" placeholder="Short supporting text" value={current?.overlay??overlay} onChange={e=>current?updateClip(current.id,{overlay:e.target.value}):setOverlay(e.target.value)}/>
          <div className="field-label">HIGHLIGHTED CAPTION</div><textarea className="studio-textarea" placeholder="Key sentence / subtitle" value={current?.caption??caption} onChange={e=>current?updateClip(current.id,{caption:e.target.value}):setCaption(e.target.value)}/>
          <div className="text-presets"><button onClick={()=>current&&updateClip(current.id,{hook:"You won't believe what happens next..."})}>Curiosity hook</button><button onClick={()=>current&&updateClip(current.id,{hook:"The moment everything changed"})}>Story hook</button></div>
        </div>}

        {panel==="export"&&<div className="inspector-body">
          <div className="inspector-title">Export studio</div><div className="export-summary"><b>{clips.length}</b><span>clips</span><b>{format}</b><span>canvas</span></div>
          <div className="field-label">QUALITY</div><div className="speed-grid">{["high","medium","low"].map(v=><button className={quality===v?"active":""} key={v} onClick={()=>setQuality(v)}>{v==="high"?"High":v==="medium"?"Medium":"Fast"}</button>)}</div>
          <button className="export-big" disabled={busy||!clips.length} onClick={renderAll}>{busy?"Rendering...":"Render all clips"} <span>→</span></button>
          {outputs.length>0&&<div className="export-list">{outputs.map((o,i)=><a key={o.id} href={o.url} download={o.name}>↓ {i+1}. {o.name}</a>)}</div>}
          <div className="status-box">{status}</div>
        </div>}
      </aside>
    </main>
  </div>;
}

ReactDOM.createRoot(document.getElementById("root")).render(<React.StrictMode><App/></React.StrictMode>);
