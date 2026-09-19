* {
  box-sizing: border-box;
}

:root {
  font-family: Inter, 'Segoe UI', sans-serif;
  color: #e2e8f0;
  background: #020817;
  line-height: 1.5;
  font-weight: 400;
}

body {
  margin: 0;
  min-height: 100vh;
  background:
    radial-gradient(circle at top, rgba(59, 130, 246, 0.3), transparent 30%),
    linear-gradient(180deg, #020817 0%, #0f172a 100%);
}

button,
input,
select {
  font: inherit;
}

#root {
  min-height: 100vh;
}

.app-shell {
  max-width: 1240px;
  margin: 0 auto;
  padding: 32px 20px 48px;
}

.topbar {
  margin-bottom: 24px;
}

.eyebrow {
  margin: 0;
  font-size: 12px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #7dd3fc;
}

h1 {
  margin: 8px 0 0;
  font-size: clamp(2rem, 4vw, 3.2rem);
}

.layout {
  display: grid;
  grid-template-columns: minmax(280px, 420px) minmax(0, 1fr);
  gap: 24px;
}

.panel {
  background: rgba(15, 23, 42, 0.82);
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 18px;
  padding: 20px;
  backdrop-filter: blur(10px);
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.3);
}

.upload-box {
  display: block;
  border: 1.5px dashed rgba(125, 211, 252, 0.9);
  border-radius: 14px;
  min-height: 88px;
  padding: 18px;
  background: rgba(15, 118, 110, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: 0.2s ease;
}

.upload-box:hover {
  border-color: #38bdf8;
}

.upload-box input {
  display: none;
}

.controls {
  margin-top: 20px;
  display: grid;
  gap: 18px;
}

label {
  display: grid;
  gap: 8px;
  color: #cbd5e1;
  font-size: 0.95rem;
}

select,
input[type='range'] {
  width: 100%;
}

select {
  background: #0f172a;
  color: #f8fafc;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 10px;
  padding: 10px 12px;
}

.range-row {
  display: grid;
  gap: 8px;
}

.range-row strong {
  color: #7dd3fc;
  font-size: 0.9rem;
}

.primary,
.download-link {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 46px;
  border: none;
  border-radius: 12px;
  text-decoration: none;
  background: linear-gradient(90deg, #38bdf8, #2563eb);
  color: white;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.primary:hover,
.download-link:hover {
  transform: translateY(-1px);
}

.primary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.status {
  margin-top: 18px;
  color: #e2e8f0;
  font-size: 0.95rem;
}

.download-link {
  margin-top: 16px;
  padding: 0 18px;
}

.preview-panel {
  min-height: 560px;
}

.video-stage {
  width: 100%;
  height: 100%;
  min-height: 520px;
  display: grid;
  place-items: center;
  background: rgba(15, 23, 42, 0.7);
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  overflow: hidden;
}

.video-stage[data-ratio='9:16'] video {
  max-height: 100%;
  max-width: min(420px, 100%);
  aspect-ratio: 9 / 16;
  border-radius: 18px;
  background: #000;
}

.video-stage[data-ratio='1:1'] video {
  max-width: min(520px, 100%);
  aspect-ratio: 1 / 1;
}

.video-stage[data-ratio='16:9'] video {
  width: min(100%, 900px);
  aspect-ratio: 16 / 9;
}

.video-stage video {
  width: 100%;
  height: auto;
  display: block;
  object-fit: contain;
  background: #000;
}

.empty-state {
  color: #94a3b8;
  font-size: 1rem;
}

@media (max-width: 860px) {
  .layout {
    grid-template-columns: 1fr;
  }
}
