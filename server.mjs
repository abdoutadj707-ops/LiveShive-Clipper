import express from "express";
import cors from "cors";
import multer from "multer";
import OpenAI, { toFile } from "openai";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const app = express();
const PORT = Number(process.env.PORT || 8787);
const HOST = "127.0.0.1";
const ROOT = path.join(os.homedir(), ".liveshive");
const KEY_FILE = path.join(ROOT, "openai.key");

await fs.mkdir(ROOT, { recursive: true });

const allowedOrigins = new Set([
  "https://abdoutadj707-ops.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173"
]);

app.use(cors({
  origin(origin, cb) {
    if (!origin || allowedOrigins.has(origin)) return cb(null, true);
    return cb(new Error("Origin not allowed"));
  }
}));
app.use(express.json({ limit: "1mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 1024 }
});

const styles = {
  viral: { label: "Viral / Curiosity", instruction: "strong curiosity without clickbait; concise, high-retention wording" },
  cinematic: { label: "Cinematic", instruction: "dramatic, cinematic, emotional but faithful to the source" },
  informative: { label: "Informative", instruction: "clear, useful, precise, educational wording" },
  punchy: { label: "Fast & Punchy", instruction: "very short, energetic, direct wording" },
  story: { label: "News / Story", instruction: "storytelling structure: setup, tension, payoff; factual and easy to follow" }
};

async function getKey() {
  try {
    const key = (await fs.readFile(KEY_FILE, "utf8")).trim();
    return key || process.env.OPENAI_API_KEY || "";
  } catch {
    return process.env.OPENAI_API_KEY || "";
  }
}

async function saveKey(key) {
  if (!/^sk-[A-Za-z0-9._-]+$/.test(key)) throw new Error("That does not look like a valid OpenAI API key.");
  await fs.writeFile(KEY_FILE, key, { encoding: "utf8", mode: 0o600 });
}

function parseJson(text) {
  const clean = String(text || "").trim();
  const a = clean.indexOf("{");
  const b = clean.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("The AI returned an invalid edit plan.");
  return JSON.parse(clean.slice(a, b + 1));
}

app.get("/api/health", async (_req, res) => {
  const key = await getKey();
  res.json({ ok: true, configured: Boolean(key), private: true, engine: "LiveShive AI Engine" });
});

app.post("/api/key", async (req, res) => {
  try {
    const key = String(req.body?.key || "").trim();
    await saveKey(key);
    res.json({ ok: true, configured: true, private: true });
  } catch (e) {
    res.status(400).json({ error: e.message || "Could not save API key." });
  }
});

app.post("/api/analyze", upload.single("video"), async (req, res) => {
  const started = Date.now();
  try {
    const key = await getKey();
    if (!key) return res.status(401).json({ error: "OpenAI API key is not configured on this PC." });
    if (!req.file) return res.status(400).json({ error: "No video was uploaded." });

    const style = styles[req.body?.style] ? req.body.style : "viral";
    const count = Math.max(1, Math.min(12, Number(req.body?.count) || 8));
    const minLen = Math.max(5, Number(req.body?.minLen) || 12);
    const maxLen = Math.max(minLen + 1, Number(req.body?.maxLen) || 40);
    const duration = Math.max(0, Number(req.body?.duration) || 0);

    const client = new OpenAI({ apiKey: key });

    const transcription = await client.audio.transcriptions.create({
      file: await toFile(req.file.buffer, req.file.originalname || "source.mp4"),
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["segment", "word"]
    });

    const segments = (transcription.segments || [])
      .map((s, i) => ({
        i,
        start: Number(s.start || 0),
        end: Number(s.end || 0),
        text: String(s.text || "").trim()
      }))
      .filter(s => s.text);

    const compact = segments
      .map(s => "[" + s.start.toFixed(2) + "-" + s.end.toFixed(2) + "] " + s.text)
      .join("\n");

    const prompt = `You are the editorial brain of LiveShive Clipper. Analyze this complete timestamped transcript and choose the strongest short-form moments.

SOURCE DURATION: ${duration.toFixed(2)} seconds
TARGET CLIPS: ${count}
TARGET LENGTH: ${minLen}-${maxLen} seconds
WRITING STYLE: ${styles[style].label} — ${styles[style].instruction}

SELECTION RULES:
1. Select complete, self-contained ideas, not random loud moments.
2. Prefer a strong premise, tension/question, surprising fact, emotional beat, reveal, argument, punchline or useful insight followed by a natural payoff.
3. Never start mid-sentence. Never cut away before the idea resolves.
4. Avoid duplicate ideas and overlapping clips.
5. Prefer moments that stand alone without the rest of the video.
6. Score each candidate 0-100 using clarity, curiosity, emotional intensity, payoff, quotability and context independence.
7. Use transcript timestamps and expand boundaries slightly when needed for natural speech.
8. Never invent facts, quotes, names or claims.
9. "caption" is accurate spoken text for the selected moment, lightly cleaned only for obvious transcription errors.
10. "overlay" is a short on-video editorial comment based strictly on what is actually said; it is NOT a fake quote.
11. "postCaption" is the social-media description for TikTok/Reels/Shorts.
12. Return fewer than ${count} clips if there are not ${count} genuinely distinct strong moments.
13. If TARGET CLIPS is 1 or 2, return exactly that many only when the transcript supports them.
14. Do not use music-related suggestions.

Return ONLY JSON with this shape:
{
  "clips": [
    {
      "start": 12.3,
      "end": 34.1,
      "score": 94,
      "title": "short title",
      "hook": "very short opening hook",
      "overlay": "brief on-video commentary",
      "caption": "accurate spoken text",
      "postCaption": "ready-to-post social caption",
      "reason": "why this moment works"
    }
  ]
}

TIMESTAMPED TRANSCRIPT:
${compact}`;

    const response = await client.responses.create({
      model: "gpt-5.6-luna",
      input: [
        { role: "system", content: "You are a precise short-form video editor. Ground every editorial statement in the supplied transcript." },
        { role: "user", content: prompt }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "liveShive_clip_plan",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              clips: {
                type: "array",
                minItems: 1,
                maxItems: 12,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    start: { type: "number" },
                    end: { type: "number" },
                    score: { type: "number" },
                    title: { type: "string" },
                    hook: { type: "string" },
                    overlay: { type: "string" },
                    caption: { type: "string" },
                    postCaption: { type: "string" },
                    reason: { type: "string" }
                  },
                  required: ["start","end","score","title","hook","overlay","caption","postCaption","reason"]
                }
              }
            },
            required: ["clips"]
          }
        }
      },
      store: false
    });

    const plan = parseJson(response.output_text);
    const safe = (plan.clips || [])
      .filter(x => Number.isFinite(Number(x.start)) && Number.isFinite(Number(x.end)))
      .sort((a,b) => Number(b.score || 0) - Number(a.score || 0))
      .slice(0, count);

    res.json({
      ok: true,
      clips: safe,
      transcript: {
        text: transcription.text || "",
        language: transcription.language || "",
        duration: transcription.duration || duration,
        segments
      },
      engine: "LiveShive AI Engine",
      elapsedMs: Date.now() - started
    });
  } catch (e) {
    console.error(e);
    const message = e?.status === 401
      ? "OpenAI rejected the API key. Replace it in LiveShive AI Settings."
      : e?.message || "LiveShive AI analysis failed.";
    res.status(Number(e?.status) >= 400 && Number(e?.status) < 600 ? Number(e.status) : 500).json({ error: message });
  }
});

app.use((err, _req, res, _next) => {
  res.status(400).json({ error: err?.message || "LiveShive Engine request failed." });
});

app.listen(PORT, HOST, () => {
  console.log("LiveShive AI Engine running privately at http://" + HOST + ":" + PORT);
});
