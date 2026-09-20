import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

const FORMATS = {
  "9:16": { w: 1080, h: 1920, label: "Vertical 9:16" },
  "1:1": { w: 1080, h: 1080, label: "Square 1:1" },
  "16:9": { w: 1920, h: 1080, label: "Landscape 16:9" },
};

const uid = () => Math.random().toString(36).slice(2, 9);
const fmt = (s) => {
  if (!Number.isFinite(s)) return "00:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return String(m).padStart(2, "0") + ":" + String(sec).padStart(2, "0");
};

function App() {
  const [url, setUrl] = React.useState("");
  const [file, setFile] = React.useState(null);
  const [duration, setDuration] = React.useState(0);
  const [format, setFormat] = React.useState("9:16");
  const [clips, setClips] = React.useState([]);
  const [selected, setSelected] = React.useState(null);
  const [cropX, setCropX] = React.useState(50);
  const [cropY, setCropY] = React.useState(50);
  const [blurBg, setBlurBg] = React.useState(true);
  const [hook, setHook] = React.useState("");
  const [overlay, setOverlay] = React.useState("");
  const [caption, setCaption] = React.useState("");
  const [ranking, setRanking] = React.useState(false);
  const [mute, setMute] = React.useState(false);
  const [volume, setVolume] = React.useState(1);
  const [speed, setSpeed] = React.useState(1);
  const [quality, setQuality] = React.useState("high");
  const audioCtxRef = React.useRef(null);
  const mediaSourceRef = React.useRef(null);
  const audioDestRef = React.useRef(null);
  const renderToken = React.useRef(0);
  const [status, setStatus] = React.useState("Upload a video to start.");
  const [busy, setBusy] = React.useState(false);
  const [outputs, setOutputs] = React.useState([]);
  const videoRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const inputRef = React.useRef(null);

  const current = clips.find(c => c.id === selected);

  React.useEffect(() => {
    return () => { if (url) URL.revokeObjectURL(url); outputs.forEach(o => URL.revokeObjectURL(o.url)); };
  }, [url]);

  React.useEffect(() => {
    if (videoRef.current && current) videoRef.current.currentTime = current.start;
  }, [selected]);

  function loadFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("video/")) return setStatus("Please choose a video file.");
    if (url) URL.revokeObjectURL(url);
    outputs.forEach(o => URL.revokeObjectURL(o.url));
    setOutputs([]);
    const next = URL.createObjectURL(f);
    setFile(f); setUrl(next); setClips([]); setSelected(null);
    setHook(""); setOverlay(""); setCaption(""); setMute(false); setVolume(1); setSpeed(1); setStatus("Video loaded. Add your first clip.");
  }

  function metadata() {
    const d = Number(videoRef.current?.duration || 0);
    setDuration(d);
    if (d > 0 && clips.length === 0) {
      const c = { id: uid(), start: 0, end: d, title: "Clip 1", hook: "", overlay: "" };
      setClips([c]); setSelected(c.id);
    }
  }

  function duplicateClip() {
    if (!current) return;
    const c = { ...current, id: uid(), title: (current.title || "Clip") + " copy" };
    setClips(v => [...v, c]); setSelected(c.id);
  }

  function autoSplit() {
    if (!duration) return;
    const count = Math.min(8, Math.max(2, Math.ceil(duration / 30)));
    const size = duration / count;
    const made = Array.from({length: count}, (_, i) => ({ id: uid(), start: i * size, end: Math.min(duration, (i + 1) * size), title: "Clip " + (i + 1), hook: "", overlay: "", caption: "" }));
    setClips(made); setSelected(made[0].id); setStatus("Created " + made.length + " editable clip segments.");
  }

  function addClip(start = 0, end = duration) {
    if (!duration && end === 0) return;
    const c = { id: uid(), start, end: Math.max(start + .1, end), title: "Clip " + (clips.length + 1), hook: "", overlay: "" };
    setClips(v => [...v, c]); setSelected(c.id);
  }

  function updateClip(id, patch) {
    setClips(v => v.map(c => c.id === id ? { ...c, ...patch } : c));
  }

  function removeClip(id) {
    setClips(v => v.filter(c => c.id !== id));
    if (selected === id) setSelected(null);
  }

  function changeRange(which, value) {
    if (!current) return;
    let n = Number(value);
    if (which === "start") n = Math.min(n, current.end - .1);
    else n = Math.max(n, current.start + .1);
    updateClip(current.id, { [which]: n });
  }

  function seek(t) {
    if (videoRef.current) videoRef.current.currentTime = t;
  }

  function drawCover(ctx, video, w, h) {
    const sw = video.videoWidth || 1280, sh = video.videoHeight || 720;
    const target = w / h, source = sw / sh;
    let cw, ch;
    if (source > target) { ch = sh; cw = sh * target; }
    else { cw = sw; ch = sw / target; }
    const maxX = sw - cw, maxY = sh - ch;
    const sx = maxX * (cropX / 100), sy = maxY * (cropY / 100);
    ctx.drawImage(video, sx, sy, cw, ch, 0, 0, w, h);
  }

  function drawFrame(ctx, video, w, h, c, rank) {
    ctx.clearRect(0, 0, w, h);
    if (blurBg && format === "9:16") {
      ctx.save(); ctx.filter = "blur(35px)";
      const sw = video.videoWidth || 1280, sh = video.videoHeight || 720;
      const scale = Math.max(w / sw, h / sh);
      const dw = sw * scale, dh = sh * scale;
      ctx.drawImage(video, (w-dw)/2, (h-dh)/2, dw, dh);
      ctx.restore();
      ctx.fillStyle = "rgba(0,0,0,.34)"; ctx.fillRect(0,0,w,h);
    } else { ctx.fillStyle = "#000"; ctx.fillRect(0,0,w,h); }
    drawCover(ctx, video, w, h);

    const hookText = c.hook || hook;
    const overlayText = c.overlay || overlay;
    const captionText = c.caption || caption;
    ctx.textAlign = "center";
    ctx.direction = "ltr";
    if (hookText) {
      ctx.font = "900 62px Arial";
      ctx.lineWidth = 12; ctx.strokeStyle = "rgba(0,0,0,.9)"; ctx.strokeText(hookText, w/2, 150, w-90);
      ctx.fillStyle = "#fff"; ctx.fillText(hookText, w/2, 150, w-90);
    }
    if (overlayText) {
      ctx.font = "700 46px Arial"; ctx.lineWidth = 9; ctx.strokeStyle = "#000";
      ctx.strokeText(overlayText, w/2, h-210, w-100);
      ctx.fillStyle = "#fff"; ctx.fillText(overlayText, w/2, h-210, w-100);
    }
    if (captionText) {
      ctx.font = "700 40px Arial"; ctx.lineWidth = 8; ctx.strokeStyle = "#000";
      ctx.strokeText(captionText, w/2, h-100, w-100);
      ctx.fillStyle = "#ffe66d"; ctx.fillText(captionText, w/2, h-100, w-100);
    }
    if (ranking) {
      ctx.textAlign = "left"; ctx.font = "900 86px Arial";
      ctx.lineWidth = 14; ctx.strokeStyle = "#000";
      const n = rank ?? clips.length;
      ctx.strokeText(String(n), 70, 130); ctx.fillStyle = "#fff"; ctx.fillText(String(n), 70, 130);
    }
  }

  async function renderOne(c, index) {
    const video = videoRef.current, canvas = canvasRef.current;
    const { w, h } = FORMATS[format];
    const ctx = canvas.getContext("2d");
    canvas.width = w; canvas.height = h;
    video.pause(); video.currentTime = c.start;
    await new Promise(resolve => {
      const done = () => { video.removeEventListener("seeked", done); resolve(); };
      video.addEventListener("seeked", done);
    });
    const stream = canvas.captureStream(30);

    // Route the video's audio through Web Audio so the exported file contains
    // a real audio track. Directly adding video.captureStream() tracks is
    // unreliable in several Chromium builds.
    try {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) audioCtxRef.current = new AudioCtx();
      }
      if (audioCtxRef.current) {
        if (!mediaSourceRef.current) {
          mediaSourceRef.current = audioCtxRef.current.createMediaElementSource(video);
          audioDestRef.current = audioCtxRef.current.createMediaStreamDestination();
          mediaSourceRef.current.connect(audioDestRef.current);
          mediaSourceRef.current.connect(audioCtxRef.current.destination);
        }
        await audioCtxRef.current.resume();
        video.muted = mute;
        video.volume = volume;
        audioDestRef.current.stream.getAudioTracks().forEach(t => stream.addTrack(t));
      } else if (video.captureStream) {
        video.captureStream().getAudioTracks().forEach(t => stream.addTrack(t));
      }
    } catch (audioError) {
      console.warn("Audio routing fallback:", audioError);
      if (video.captureStream) video.captureStream().getAudioTracks().forEach(t => stream.addTrack(t));
    }

    let mime = "video/webm;codecs=vp9,opus";
    if (!MediaRecorder.isTypeSupported(mime)) mime = "video/webm";

    const bitrate = quality === "high" ? 8000000 : quality === "medium" ? 5000000 : 2500000;
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate, audioBitsPerSecond: 128000 });
    const chunks = [];
    recorder.ondataavailable = e => e.data?.size && chunks.push(e.data);
    const stopped = new Promise(resolve => recorder.onstop = () => resolve(new Blob(chunks, { type: mime })));
    recorder.start(100);
    video.playbackRate = speed;
    await video.play();
    await new Promise(resolve => {
      const loop = () => {
        if (video.currentTime >= c.end || video.ended) { video.pause(); recorder.stop(); resolve(); return; }
        drawFrame(ctx, video, w, h, c, ranking ? clips.length - index : null);
        requestAnimationFrame(loop);
      };
      loop();
    });
    return stopped;
  }

  async function renderAll() {
    if (!videoRef.current || !clips.length) return setStatus("Add at least one clip.");
    if (!window.MediaRecorder) return setStatus("Use Chrome or Edge for browser rendering.");
    setBusy(true); renderToken.current += 1; setOutputs([]); setStatus("Rendering clips in the browser...");
    try {
      const result = [];
      for (let i=0;i<clips.length;i++) {
        setStatus("Rendering clip " + (i+1) + " of " + clips.length + "...");
        const blob = await renderOne(clips[i], i);
        result.push({ id: uid(), name: (clips[i].title || "clip-"+(i+1)) + ".webm", url: URL.createObjectURL(blob) });
      }
      setOutputs(result); setStatus("All clips are ready.");
    } catch (e) {
      console.error(e); setStatus("Rendering failed. Try a smaller MP4 or Chrome/Edge.");
    } finally { setBusy(false); }
  }

  const [panel, setPanel] = React.useState("edit");
  const [showGrid, setShowGrid] = React.useState(false);
  const [playing, setPlaying] = React.useState(false);

  React.useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => setPlaying(true), onPause = () => setPlaying(false);
    v.addEventListener("play", onPlay); v.addEventListener("pause", onPause);
    return () => { v.removeEventListener("play", onPlay); v.removeEventListener("pause", onPause); };
  }, [url]);

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play(); else v.pause();
  }

  return <div className="studio">
    <header className="studio-topbar">
      <div className="studio-brand">
        <div className="brand-mark">LS</div>
        <div><div className="eyebrow">SHORT-FORM VIDEO STUDIO</div><h1>LiveShive <b>Clipper</b></h1></div>
      </div>
      <div className="project-name">{file?.name || "Untitled project"} <span>• Local</span></div>
      <div className="top-actions">
        <button className="ghost-btn" onClick={()=>inputRef.current?.click()}>＋ Import</button>
        <input ref={inputRef} hidden type="file" accept="video/*" onChange={loadFile}/>
        <button className="primary-btn" disabled={busy || !clips.length} onClick={renderAll}>Export <span>⌘↵</span></button>
      </div>
    </header>

    <main className="studio-grid">
      <aside className="media-panel">
        <div className="panel-head"><span>MEDIA</span><button onClick={()=>inputRef.current?.click()}>＋</button></div>
        <button className="dropzone" onClick={()=>inputRef.current?.click()}>
          <div className="drop-icon">↥</div><b>{file ? "Replace source video" : "Import video"}</b><small>MP4, WebM • processed in browser</small>
        </button>
        {file && <div className="media-card"><div className="media-thumb">▶</div><div><b>{file.name}</b><small>{fmt(duration)} • source</small></div></div>}
        <div className="panel-head clips-head"><span>CLIPS <i>{clips.length}</i></span><button disabled={!duration} onClick={autoSplit}>AUTO</button></div>
        <div className="media-clips">
          {clips.map((c,i)=><button key={c.id} onClick={()=>setSelected(c.id)} className={"media-clip "+(selected===c.id?"active":"")}>
            <strong>{String(i+1).padStart(2,"0")}</strong><span><b>{c.title}</b><small>{fmt(c.end-c.start)}</small></span>
          </button>)}
        </div>
        <button className="outline-btn" disabled={!duration} onClick={()=>addClip(0,duration)}>＋ New clip</button>
        <div className="local-note"><span>●</span> Files never leave your browser</div>
      </aside>

      <section className="main-stage">
        <div className="stage-toolbar">
          <div className="toolbar-group"><button className={showGrid?"tool active":"tool"} onClick={()=>setShowGrid(!showGrid)}>⊞</button><button className="tool" onClick={()=>setFormat(format==="9:16"?"1:1":format==="1:1"?"16:9":"9:16")}>Frame</button></div>
          <div className="stage-mode"><button className={format==="9:16"?"active":""} onClick={()=>setFormat("9:16")}>9:16</button><button className={format==="1:1"?"active":""} onClick={()=>setFormat("1:1")}>1:1</button><button className={format==="16:9"?"active":""} onClick={()=>setFormat("16:9")}>16:9</button></div>
          <div className="toolbar-group"><span className="zoom">100%</span><button className="tool">⋯</button></div>
        </div>

        <div className={"stage-canvas "+(showGrid?"grid-on":"")}>
          <div className={"video-frame "+(format==="9:16"?"portrait":"")}>
            {url ? <video ref={videoRef} src={url} controls={false} onLoadedMetadata={metadata} onClick={togglePlay}/> : <div className="empty-stage"><div>＋</div><b>Import a video to start</b><span>Build clips, hooks and vertical videos locally.</span></div>}
            {current?.hook && <div className="preview-hook">{current.hook}</div>}
            {current?.overlay && <div className="preview-overlay">{current.overlay}</div>}
            {current?.caption && <div className="preview-caption">{current.caption}</div>}
            {ranking && current && <div className="rank-badge">{clips.length - clips.indexOf(current)}</div>}
            {!playing && url && <button className="center-play" onClick={togglePlay}>▶</button>}
          </div>
        </div>

        <div className="player-bar">
          <button onClick={()=>seek(current?.start || 0)}>↤</button><button className="play-main" onClick={togglePlay}>{playing?"Ⅱ":"▶"}</button><button onClick={()=>seek(Math.min(duration,current?.end || duration))}>↦</button>
          <span className="timecode">{fmt(videoRef.current?.currentTime || current?.start || 0)} / {fmt(duration)}</span>
          <div className="player-spacer"/>
          <span className="speed-label">{speed}×</span>
          <button onClick={()=>setMute(!mute)}>{mute?"🔇":"🔊"}</button>
        </div>

        <div className="timeline-panel">
          <div className="timeline-top">
            <div><b>Timeline</b><span>{clips.length} clips • {fmt(duration)}</span></div>
            <div className="timeline-actions"><button onClick={autoSplit} disabled={!duration}>Auto split</button><button onClick={()=>current&&duplicateClip()}>Duplicate</button><button onClick={()=>current&&removeClip(current.id)}>Delete</button></div>
          </div>
          <div className="ruler"><span>00:00</span><span>{fmt(duration*.25)}</span><span>{fmt(duration*.5)}</span><span>{fmt(duration*.75)}</span><span>{fmt(duration)}</span></div>
          <div className="tracks">
            <div className="track-label">VIDEO</div>
            <div className="track-lane">{clips.map((c,i)=><button key={c.id} onClick={()=>setSelected(c.id)} className={"timeline-clip "+(selected===c.id?"selected":"")} style={{left:(c.start/Math.max(duration,1))*100+"%",width:Math.max(2,((c.end-c.start)/Math.max(duration,1))*100)+"%"}}><b>{i+1}</b> {c.title}</button>)}</div>
            <div className="track-label">TEXT</div><div className="text-lane"><div className="text-track">HOOK / CAPTIONS</div></div>
          </div>
          {current && <div className="range-row"><label>IN <b>{fmt(current.start)}</b><input type="range" min="0" max={duration} step=".1" value={current.start} onChange={e=>changeRange("start",e.target.value)}/></label><label>OUT <b>{fmt(current.end)}</b><input type="range" min="0" max={duration} step=".1" value={current.end} onChange={e=>changeRange("end",e.target.value)}/></label></div>}
        </div>
      </section>

      <aside className="inspector-panel">
        <div className="inspector-tabs"><button className={panel==="edit"?"active":""} onClick={()=>setPanel("edit")}>EDIT</button><button className={panel==="text"?"active":""} onClick={()=>setPanel("text")}>TEXT</button><button className={panel==="audio"?"active":""} onClick={()=>setPanel("audio")}>AUDIO</button><button className={panel==="export"?"active":""} onClick={()=>setPanel("export")}>EXPORT</button></div>

        {panel==="edit" && <div className="inspector-body">
          <div className="inspector-title">Clip settings <span>{current ? current.title : "No clip selected"}</span></div>
          <div className="field-label">FORMAT</div>
          <div className="format-buttons">{["9:16","1:1","16:9"].map(k=><button key={k} className={format===k?"active":""} onClick={()=>setFormat(k)}>{k}</button>)}</div>
          <div className="field-label">FRAMING</div>
          <label className="switch-row"><span>Blurred background</span><input type="checkbox" checked={blurBg} onChange={e=>setBlurBg(e.target.checked)}/></label>
          <label className="range-control">Horizontal <b>{cropX}%</b><input type="range" value={cropX} onChange={e=>setCropX(Number(e.target.value))}/></label>
          <label className="range-control">Vertical <b>{cropY}%</b><input type="range" value={cropY} onChange={e=>setCropY(Number(e.target.value))}/></label>
          <div className="field-label">RANKING</div>
          <label className="switch-row"><span>Ranking 5 → 1</span><input type="checkbox" checked={ranking} onChange={e=>setRanking(e.target.checked)}/></label>
          {current && <><div className="field-label">CLIP NAME</div><input className="studio-input" value={current.title} onChange={e=>updateClip(current.id,{title:e.target.value})}/></>}
        </div>}

        {panel==="text" && <div className="inspector-body">
          <div className="inspector-title">Text & hooks</div>
          <div className="field-label">HOOK</div><textarea className="studio-textarea" placeholder="This changes everything..." value={current?.hook ?? hook} onChange={e=>current?updateClip(current.id,{hook:e.target.value}):setHook(e.target.value)}/>
          <div className="field-label">BOTTOM OVERLAY</div><textarea className="studio-textarea" placeholder="Short supporting text" value={current?.overlay ?? overlay} onChange={e=>current?updateClip(current.id,{overlay:e.target.value}):setOverlay(e.target.value)}/>
          <div className="field-label">HIGHLIGHTED CAPTION</div><textarea className="studio-textarea" placeholder="Key sentence / subtitle" value={current?.caption ?? caption} onChange={e=>current?updateClip(current.id,{caption:e.target.value}):setCaption(e.target.value)}/>
          <div className="text-presets"><button onClick={()=>current&&updateClip(current.id,{hook:"You won't believe what happens next..."})}>Curiosity hook</button><button onClick={()=>current&&updateClip(current.id,{hook:"The moment everything changed"})}>Story hook</button></div>
        </div>}

        {panel==="audio" && <div className="inspector-body">
          <div className="inspector-title">Audio</div>
          <label className="switch-row"><span>Mute export</span><input type="checkbox" checked={mute} onChange={e=>setMute(e.target.checked)}/></label>
          <label className="range-control">Volume <b>{Math.round(volume*100)}%</b><input type="range" min="0" max="1" step=".05" value={volume} onChange={e=>setVolume(Number(e.target.value))}/></label>
          <div className="field-label">PLAYBACK SPEED</div><div className="speed-grid">{[.75,1,1.25,1.5].map(v=><button className={speed===v?"active":""} key={v} onClick={()=>setSpeed(v)}>{v}×</button>)}</div>
          <div className="audio-note">Exported clips keep the source audio track when supported by the browser.</div>
        </div>}

        {panel==="export" && <div className="inspector-body">
          <div className="inspector-title">Export studio</div>
          <div className="export-summary"><b>{clips.length}</b><span>clips ready</span><b>{format}</b><span>canvas</span></div>
          <div className="field-label">QUALITY</div><div className="speed-grid">{["high","medium","low"].map(v=><button className={quality===v?"active":""} key={v} onClick={()=>setQuality(v)}>{v==="high"?"High":v==="medium"?"Medium":"Fast"}</button>)}</div>
          <button className="export-big" disabled={busy||!clips.length} onClick={renderAll}>{busy?"Rendering...":"Render all clips"} <span>→</span></button>
          {outputs.length>0 && <div className="export-list">{outputs.map((o,i)=><a key={o.id} href={o.url} download={o.name}>↓ {i+1}. {o.name}</a>)}</div>}
          <div className="status-box">{status}</div>
        </div>}
      </aside>
    </main>
  </div>
}

ReactDOM.createRoot(document.getElementById("root")).render(<React.StrictMode><App/></React.StrictMode>);
