const express = require("express");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

let db;

async function connectDB() {
  try {
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    db = client.db("social-ai");
    console.log("✅ Base de datos conectada");
  } catch (err) {
    console.error("Error conectando a MongoDB:", err.message);
  }
}

// ── Login ──
app.post("/api/login", (req, res) => {
  const { password } = req.body;
  if (password === process.env.APP_PASSWORD) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: "Contraseña incorrecta." });
  }
});

// ── Middleware auth ──
app.use("/api", (req, res, next) => {
  if (req.path === "/login") return next();
  const auth = req.headers["x-app-password"];
  if (!auth || auth !== process.env.APP_PASSWORD) {
    return res.status(401).json({ error: "No autorizado." });
  }
  next();
});

app.use(express.static("PUBLIC"));

// ── Perfil ──
app.get("/api/profile", async (req, res) => {
  try {
    const profile = await db.collection("profile").findOne({ id: "main" });
    res.json(profile || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post("/api/profile", async (req, res) => {
  try {
    await db.collection("profile").updateOne(
      { id: "main" },
      { $set: { id: "main", ...req.body, updatedAt: new Date() } },
      { upsert: true }
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Análisis ──
app.get("/api/analysis", async (req, res) => {
  try {
    const list = await db.collection("analysis").find().sort({ createdAt: -1 }).limit(10).toArray();
    res.json(list);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post("/api/analysis", async (req, res) => {
  try {
    await db.collection("analysis").insertOne({ ...req.body, createdAt: new Date() });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Contenido ──
app.get("/api/content", async (req, res) => {
  try {
    const list = await db.collection("content").find().sort({ createdAt: -1 }).limit(10).toArray();
    res.json(list);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post("/api/content", async (req, res) => {
  try {
    await db.collection("content").insertOne({ ...req.body, createdAt: new Date() });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Aprendizajes ──
app.get("/api/wins", async (req, res) => {
  try {
    const list = await db.collection("wins").find().sort({ createdAt: -1 }).toArray();
    res.json(list);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post("/api/wins", async (req, res) => {
  try {
    await db.collection("wins").insertOne({ ...req.body, createdAt: new Date() });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete("/api/wins/:id", async (req, res) => {
  try {
    await db.collection("wins").deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Historial de publicaciones ──
app.get("/api/posts", async (req, res) => {
  try {
    const list = await db.collection("posts").find().sort({ publishedAt: -1 }).toArray();
    res.json(list);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post("/api/posts", async (req, res) => {
  try {
    const post = {
      ...req.body,
      metricsDeadline: new Date(new Date(req.body.publishedAt).getTime() + 72 * 60 * 60 * 1000),
      metricsCompleted: false,
      aiAnalysis: null,
      createdAt: new Date()
    };
    const result = await db.collection("posts").insertOne(post);
    res.json({ ok: true, id: result.insertedId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.put("/api/posts/:id", async (req, res) => {
  try {
    await db.collection("posts").updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { ...req.body, updatedAt: new Date() } }
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete("/api/posts/:id", async (req, res) => {
  try {
    await db.collection("posts").deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Claude ──
app.post("/api/chat", async (req, res) => {
  const { prompt, system } = req.body;
  if (!prompt || !system) return res.status(400).json({ error: "Faltan parámetros." });
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });
    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n").trim();
    res.json({ result: text });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3000;
connectDB().then(() => {
  app.listen(PORT, "0.0.0.0", () => console.log(`✅ Social AI corriendo en http://localhost:${PORT}`));
});
