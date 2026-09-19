import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

const DEFAULT_ASPECT = '9:16';

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function App() {
  const [videoUrl, setVideoUrl] = React.useState('');
  const [fileName, setFileName] = React.useState('');
  const [start, setStart] = React.useState(0);
  const [end, setEnd] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const [aspect, setAspect] = React.useState(DEFAULT_ASPECT);
  const [isRendering, setIsRendering] = React.useState(false);
  const [status, setStatus] = React.useState('Upload a video to begin.');
  const [downloadUrl, setDownloadUrl] = React.useState('');

  const videoRef = React.useRef(null);
  const canvasRef = React.useRef(null);

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    setFileName(file.name);
    setStatus('Video loaded. Adjust the trim range and export.');
    setDownloadUrl('');
  };

  const handleMetadataLoaded = () => {
    const video = videoRef.current;
    if (!video) return;
    const nextDuration = Number(video.duration || 0);
    setDuration(nextDuration);
    setStart(0);
    setEnd(nextDuration);
  };

  const renderClip = async () => {
    const video = videoRef.current;
    if (!video || !videoUrl) {
      setStatus('Please upload a video first.');
      return;
    }

    const nextStart = clamp(Number(start), 0, duration || Number.MAX_SAFE_INTEGER);
    const nextEnd = clamp(Number(end), nextStart, duration || Number.MAX_SAFE_INTEGER);

    if (nextEnd <= nextStart) {
      setStatus('The end time must be after the start time.');
      return;
    }

    setStatus('Rendering clip... this may take a few seconds.');
    setIsRendering(true);

    try {
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      const stream = canvas.captureStream(30);
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        const outputUrl = URL.createObjectURL(blob);
        setDownloadUrl(outputUrl);
        setStatus('Clip is ready. Download it below.');
        setIsRendering(false);
      };

      video.pause();
      video.currentTime = nextStart;
      await new Promise((resolve) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          resolve();
        };
        video.addEventListener('seeked', onSeeked);
      });

      const width = 1080;
      const height = aspect === '9:16' ? 1920 : 1080;
      canvas.width = width;
      canvas.height = height;

      recorder.start();
      const originalWidth = video.videoWidth || 1280;
      const originalHeight = video.videoHeight || 720;

      const drawFrame = () => {
        if (video.currentTime >= nextEnd) {
          recorder.stop();
          return;
        }

        const cropRatio = originalWidth / originalHeight;
        const targetRatio = width / height;

        let sourceX = 0;
        let sourceY = 0;
        let sourceWidth = originalWidth;
        let sourceHeight = originalHeight;

        if (cropRatio > targetRatio) {
          sourceHeight = originalHeight;
          sourceWidth = originalHeight * targetRatio;
          sourceX = (originalWidth - sourceWidth) / 2;
        } else {
          sourceWidth = originalWidth;
          sourceHeight = originalWidth / targetRatio;
          sourceY = (originalHeight - sourceHeight) / 2;
        }

        context.clearRect(0, 0, width, height);
        context.fillStyle = '#0f172a';
        context.fillRect(0, 0, width, height);
        context.drawImage(
          video,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          0,
          0,
          width,
          height
        );

        requestAnimationFrame(drawFrame);
      };

      video.play();
      drawFrame();
    } catch (error) {
      console.error(error);
      setStatus('Something went wrong while rendering. Please try again.');
      setIsRendering(false);
    }
  };

  React.useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [videoUrl, downloadUrl]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">MVP</p>
          <h1>LiveShive Clipper</h1>
        </div>
      </header>

      <main className="layout">
        <section className="panel upload-panel">
          <label className="upload-box">
            <input type="file" accept="video/*" onChange={handleFileChange} />
            <span>{fileName || 'Upload a video'}</span>
          </label>

          <div className="controls">
            <label>
              Aspect ratio
              <select value={aspect} onChange={(event) => setAspect(event.target.value)}>
                <option value="9:16">9:16</option>
                <option value="1:1">1:1</option>
                <option value="16:9">16:9</option>
              </select>
            </label>

            <div className="range-row">
              <label>
                Start
                <input
                  type="range"
                  min="0"
                  max={duration || 0}
                  step="0.1"
                  value={start}
                  onChange={(event) => setStart(Number(event.target.value))}
                />
              </label>
              <strong>{formatTime(start)}</strong>
            </div>

            <div className="range-row">
              <label>
                End
                <input
                  type="range"
                  min="0"
                  max={duration || 0}
                  step="0.1"
                  value={end}
                  onChange={(event) => setEnd(Number(event.target.value))}
                />
              </label>
              <strong>{formatTime(end)}</strong>
            </div>

            <button className="primary" onClick={renderClip} disabled={!videoUrl || isRendering}>
              {isRendering ? 'Rendering...' : 'Render clip'}
            </button>
          </div>

          {status && <p className="status">{status}</p>}

          {downloadUrl && (
            <a className="download-link" href={downloadUrl} download="clip-output.webm">
              Download clip
            </a>
          )}
        </section>

        <section className="panel preview-panel">
          <div className="video-stage" data-ratio={aspect}>
            {videoUrl ? (
              <video
                ref={videoRef}
                src={videoUrl}
                controls
                onLoadedMetadata={handleMetadataLoaded}
                onTimeUpdate={() => {
                  if (videoRef.current && videoRef.current.currentTime > end) {
                    videoRef.current.pause();
                  }
                }}
              />
            ) : (
              <div className="empty-state">No video selected</div>
            )}
          </div>
        </section>
      </main>

      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
