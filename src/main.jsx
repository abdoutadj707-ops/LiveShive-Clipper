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

  return <div className="app">
    <header className="topbar">
      <div className="brand"><div className="brand-mark">LS</div><div><span>LIVE VIDEO WORKSPACE</span><h1>LiveShive <b>Clipper</b></h1></div></div>
      <div className="top-actions"><button onClick={()=>inputRef.current?.click()}>＋ New video</button><input ref={inputRef} hidden type="file" accept="video/*" onChange={loadFile}/></div>
    </header>

    <main className="workspace">
      <aside className="sidebar">
        <div className="section-title">PROJECT</div>
        <button className="upload-card" onClick={()=>inputRef.current?.click()}><strong>{file?.name || "Drop or upload video"}</strong><span>MP4 / WebM • local processing</span></button>
        <div className="section-title">CLIPS <em>{clips.length}</em></div>
        <div className="clip-list">{clips.map((c,i)=><button key={c.id} className={"clip-item "+(selected===c.id?"active":"")} onClick={()=>setSelected(c.id)}><span className="clip-num">{i+1}</span><span><b>{c.title}</b><small>{fmt(c.start)} — {fmt(c.end)}</small></span></button>)}</div>
        <div className="clip-tools"><button className="add-clip" disabled={!duration} onClick={()=>addClip(0,duration)}>＋ Add clip</button><button className="add-clip" disabled={!duration} onClick={autoSplit}>Auto split</button></div>
        <div className="sidebar-bottom"><span>LOCAL MODE</span><small>No upload required</small></div>
      </aside>

      <section className="editor">
        <div className="preview-wrap">
          <div className="preview-toolbar"><span>PREVIEW</span><span className="pill">{format}</span></div>
          <div className={"preview "+(format==="9:16"?"vertical":"")} >
            {url ? <video ref={videoRef} src={url} controls onLoadedMetadata={metadata}/> : <div className="empty"><div>▶</div><p>Upload a video to begin</p></div>}
          </div>
        </div>

        <div className="timeline-card">
          <div className="timeline-head"><div><b>Timeline</b><span>{fmt(duration)}</span></div><button onClick={()=>current && seek(current.start)}>Jump to clip</button></div>
          <div className="timeline">
            <div className="track"></div>
            {clips.map((c,i)=><button key={c.id} className={"segment "+(selected===c.id?"selected":"")} style={{left:(c.start/Math.max(duration,1))*100+"%",width:((c.end-c.start)/Math.max(duration,1))*100+"%"}} onClick={()=>setSelected(c.id)}>{i+1}</button>)}
          </div>
          {current && <div className="range-edit">
            <label>START <strong>{fmt(current.start)}</strong><input type="range" min="0" max={duration} step=".1" value={current.start} onChange={e=>changeRange("start",e.target.value)}/></label>
            <label>END <strong>{fmt(current.end)}</strong><input type="range" min="0" max={duration} step=".1" value={current.end} onChange={e=>changeRange("end",e.target.value)}/></label>
          </div>}
        </div>
      </section>

      <aside className="inspector">
        <div className="section-title">FORMAT</div>
        <div className="format-grid">{Object.entries(FORMATS).map(([k,v])=><button className={format===k?"active":""} key={k} onClick={()=>setFormat(k)}>{k}<small>{v.label}</small></button>)}</div>
        <div className="section-title">FRAMING</div>
        <label className="toggle"><span>Blurred background</span><input type="checkbox" checked={blurBg} onChange={e=>setBlurBg(e.target.checked)}/></label>
        <label className="control">Horizontal crop<input type="range" value={cropX} onChange={e=>setCropX(Number(e.target.value))}/></label>
        <label className="control">Vertical crop<input type="range" value={cropY} onChange={e=>setCropY(Number(e.target.value))}/></label>
        <div className="section-title">TEXT OVERLAY</div>
        <input className="text-input" placeholder="Hook — e.g. You won't believe this..." value={current?.hook ?? hook} onChange={e=>current?updateClip(current.id,{hook:e.target.value}):setHook(e.target.value)}/>
        <input className="text-input" placeholder="Bottom text / caption" value={current?.overlay ?? overlay} onChange={e=>current?updateClip(current.id,{overlay:e.target.value}):setOverlay(e.target.value)}/>
        <input className="text-input" placeholder="Highlighted subtitle line" value={current?.caption ?? caption} onChange={e=>current?updateClip(current.id,{caption:e.target.value}):setCaption(e.target.value)}/>
        <div className="two-controls"><label className="control">Speed<select value={speed} onChange={e=>setSpeed(Number(e.target.value))}><option value="0.75">0.75×</option><option value="1">1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option></select></label><label className="control">Quality<select value={quality} onChange={e=>setQuality(e.target.value)}><option value="high">High</option><option value="medium">Medium</option><option value="low">Fast</option></select></label></div>
        <label className="toggle"><span>Mute exported audio</span><input type="checkbox" checked={mute} onChange={e=>setMute(e.target.checked)}/></label>
        <label className="control">Volume <strong>{Math.round(volume*100)}%</strong><input type="range" min="0" max="1" step=".05" value={volume} onChange={e=>setVolume(Number(e.target.value))}/></label>
        <label className="toggle"><span>Ranking mode 5 → 1</span><input type="checkbox" checked={ranking} onChange={e=>setRanking(e.target.checked)}/></label>
        {current && <div className="selected-actions"><input className="text-input" value={current.title} onChange={e=>updateClip(current.id,{title:e.target.value})}/><button className="duplicate" onClick={duplicateClip}>Duplicate clip</button><button className="danger" onClick={()=>removeClip(current.id)}>Delete clip</button></div>}
        <button className="render" disabled={busy || !clips.length} onClick={renderAll}>{busy?"Rendering...":"Render all clips"} <span>→</span></button>
        {outputs.length>0 && <div className="outputs"><div className="section-title">EXPORTS</div>{outputs.map((o,i)=><a key={o.id} href={o.url} download={o.name}>↓ {i+1}. {o.name}</a>)}</div>}
        <p className="status">{status}</p>
      </aside>
    </main>
    <canvas ref={canvasRef} hidden/>
  </div>;
}

ReactDOM.createRoot(document.getElementById("root")).render(<React.StrictMode><App/></React.StrictMode>);
