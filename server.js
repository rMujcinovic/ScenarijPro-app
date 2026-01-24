const express = require("express");
const fs = require("fs/promises");
const path = require("path");

const app = express();
app.use(express.json());

const { sequelize } = require("./db");
require("./models"); // da se modeli i relacije registruju

const { Op } = require("sequelize");
const { Scenario, Line, Delta, Checkpoint } = require("./models");

// frontend povezivanje
app.use(express.static(__dirname));

const DATA_DIR = path.join(__dirname, "data");
const SCENARIOS_DIR = path.join(DATA_DIR, "scenarios");
const DELTAS_PATH = path.join(DATA_DIR, "deltas.json");

async function ensureDataLayout() {
  await fs.mkdir(SCENARIOS_DIR, { recursive: true });
  try {
    await fs.access(DELTAS_PATH);
  } catch {
    await fs.writeFile(DELTAS_PATH, JSON.stringify([], null, 2), "utf-8");
  }
}

function scenarioFilePath(id) {
  return path.join(SCENARIOS_DIR, `scenario-${id}.json`);
}

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readScenario(id) {
  const p = scenarioFilePath(id);
  if (!(await fileExists(p))) return null;
  const raw = await fs.readFile(p, "utf-8");
  return JSON.parse(raw);
}

async function writeScenario(scenario) {
  const p = scenarioFilePath(scenario.id);
  await fs.writeFile(p, JSON.stringify(scenario, null, 2), "utf-8");
}

async function readAllDeltas() {
  const raw = await fs.readFile(DELTAS_PATH, "utf-8");
  return JSON.parse(raw);
}

async function appendDelta(delta) {
  const deltas = await readAllDeltas();
  deltas.push(delta);
  await fs.writeFile(DELTAS_PATH, JSON.stringify(deltas, null, 2), "utf-8");

  try {
    await Delta.create({
      scenarioId: delta.scenarioId,
      type: delta.type,
      lineId: delta.lineId ?? null,
      nextLineId: delta.nextLineId ?? null,
      content: delta.content ?? null,
      oldName: delta.oldName ?? null,
      newName: delta.newName ?? null,
      timestamp: delta.timestamp
    });
  } catch (e) {
    // ignore
  }
}

function nowUnixSeconds() {
  return Math.floor(Date.now() / 1000);
}

const lineLocks = new Map();
const userLineLock = new Map();
const characterLocks = new Map();

function getScenarioCharLocks(scenarioId) {
  if (!characterLocks.has(scenarioId)) characterLocks.set(scenarioId, new Map());
  return characterLocks.get(scenarioId);
}

function unlockUsersPreviousLineLock(userId) {
  const prev = userLineLock.get(userId);
  if (!prev) return;
  const key = `${prev.scenarioId}:${prev.lineId}`;
  const existing = lineLocks.get(key);
  if (existing && existing.userId === userId) {
    lineLocks.delete(key);
  }
  userLineLock.delete(userId);
}

function buildOrderedContent(content) {
  if (!Array.isArray(content) || content.length === 0) return [];
  const byId = new Map(content.map((l) => [l.lineId, l]));

  const referenced = new Set();
  for (const l of content) {
    if (l.nextLineId !== null && l.nextLineId !== undefined) referenced.add(l.nextLineId);
  }
  let head = content.find((l) => !referenced.has(l.lineId));
  if (!head) head = content[0];

  const ordered = [];
  const visited = new Set();
  let cur = head;
  while (cur && !visited.has(cur.lineId)) {
    visited.add(cur.lineId);
    ordered.push(cur);
    cur = cur.nextLineId == null ? null : byId.get(cur.nextLineId);
  }

  if (ordered.length !== content.length) {
    const remaining = content
      .filter((l) => !visited.has(l.lineId))
      .sort((a, b) => a.lineId - b.lineId);
    ordered.push(...remaining);
  }
  return ordered;
}

function isWordChar(ch) {
  return /[0-9A-Za-zÀ-ž\-']/.test(ch);
}
function hasLetter(str) {
  return /[A-Za-zÀ-ž]/.test(str);
}
function extractWordsSpirala2(text) {
  const s = String(text ?? "");
  const words = [];
  let buf = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (isWordChar(ch)) buf.push(ch);
    else {
      if (buf.length) {
        const w = buf.join("");
        if (hasLetter(w)) words.push(w);
        buf = [];
      }
    }
  }
  if (buf.length) {
    const w = buf.join("");
    if (hasLetter(w)) words.push(w);
  }
  return words;
}

function wrapTextToLines(text, maxWords = 20) {
  const raw = String(text ?? "");
  const words = extractWordsSpirala2(raw);
  if (words.length === 0) return [raw];
  const out = [];
  for (let i = 0; i < words.length; i += maxWords) {
    out.push(words.slice(i, i + maxWords).join(" "));
  }
  return out;
}

function explodeNewTextArray(newTextArr) {
  const result = [];
  for (const s of newTextArr) result.push(...wrapTextToLines(s, 20));
  return result;
}

async function nextScenarioId() {
  const files = await fs.readdir(SCENARIOS_DIR);
  let maxId = 0;
  for (const f of files) {
    const m = /^scenario-(\d+)\.json$/.exec(f);
    if (m) maxId = Math.max(maxId, Number(m[1]));
  }
  return maxId + 1;
}

function nextLineIdForScenario(scenario) {
  let maxLineId = 0;
  for (const l of scenario.content || []) {
    if (typeof l.lineId === "number") maxLineId = Math.max(maxLineId, l.lineId);
  }
  return maxLineId + 1;
}

function findLine(scenario, lineId) {
  return (scenario.content || []).find((l) => l.lineId === lineId) || null;
}


// POST /api/scenarios
app.post("/api/scenarios", async (req, res) => {
  try {
    const title = (req.body && typeof req.body.title === "string" ? req.body.title : "").trim();
    const finalTitle = title.length > 0 ? title : "Neimenovani scenarij";

    const id = await nextScenarioId();
    const scenario = {
      id,
      title: finalTitle,
      content: [{ lineId: 1, nextLineId: null, text: "" }]
    };

    await writeScenario(scenario);
    return res.status(200).json(scenario);
  } catch {
    return res.status(500).json({ message: "Server error" });
  }
});

// POST /api/scenarios/:scenarioId/lines/:lineId/lock
app.post("/api/scenarios/:scenarioId/lines/:lineId/lock", async (req, res) => {
  try {
    const scenarioId = Number(req.params.scenarioId);
    const lineId = Number(req.params.lineId);
    const userId = req.body?.userId;

    const scenario = await readScenario(scenarioId);
    if (!scenario) return res.status(404).json({ message: "Scenario ne postoji!" });

    const line = findLine(scenario, lineId);
    if (!line) return res.status(404).json({ message: "Linija ne postoji!" });

    const key = `${scenarioId}:${lineId}`;
    const existing = lineLocks.get(key);
    if (existing && existing.userId !== userId) {
      return res.status(409).json({ message: "Linija je vec zakljucana!" });
    }

    unlockUsersPreviousLineLock(userId);

    lineLocks.set(key, { userId });
    userLineLock.set(userId, { scenarioId, lineId });

    return res.status(200).json({ message: "Linija je uspjesno zakljucana!" });
  } catch {
    return res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/scenarios/:scenarioId/lines/:lineId
app.put("/api/scenarios/:scenarioId/lines/:lineId", async (req, res) => {
  try {
    const scenarioId = Number(req.params.scenarioId);
    const lineId = Number(req.params.lineId);
    const userId = req.body?.userId;
    const newText = req.body?.newText;

    const scenario = await readScenario(scenarioId);
    if (!scenario) return res.status(404).json({ message: "Scenario ne postoji!" });

    const line = findLine(scenario, lineId);
    if (!line) return res.status(404).json({ message: "Linija ne postoji!" });

    if (!Array.isArray(newText) || newText.length === 0) {
      return res.status(400).json({ message: "Niz new_text ne smije biti prazan!" });
    }

    const key = `${scenarioId}:${lineId}`;
    const existing = lineLocks.get(key);
    if (!existing) return res.status(409).json({ message: "Linija nije zakljucana!" });
    if (existing.userId !== userId) return res.status(409).json({ message: "Linija je vec zakljucana!" });

    const produced = explodeNewTextArray(newText);
    const originalNext = line.nextLineId;
    const ts = nowUnixSeconds();

    line.text = produced[0] ?? "";

    const affected = [line];

    if (produced.length > 1) {
      let nextId = nextLineIdForScenario(scenario);

      const newLines = [];
      for (let i = 1; i < produced.length; i++) {
        const newObj = { lineId: nextId++, nextLineId: null, text: produced[i] ?? "" };
        scenario.content.push(newObj);
        newLines.push(newObj);
      }

      line.nextLineId = newLines[0].lineId;

      for (let i = 0; i < newLines.length - 1; i++) {
        newLines[i].nextLineId = newLines[i + 1].lineId;
      }

      newLines[newLines.length - 1].nextLineId = originalNext;

      affected.push(...newLines);
    } else {
    }

    await writeScenario(scenario);

    for (const l of affected) {
      await appendDelta({
        scenarioId,
        type: "line_update",
        lineId: l.lineId,
        nextLineId: l.nextLineId,
        content: l.text,
        timestamp: ts
      });
    }

    lineLocks.delete(key);
    const cur = userLineLock.get(userId);
    if (cur && cur.scenarioId === scenarioId && cur.lineId === lineId) userLineLock.delete(userId);

    return res.status(200).json({ message: "Linija je uspjesno azurirana!" });
  } catch {
    return res.status(500).json({ message: "Server error" });
  }
});

// POST /api/scenarios/:scenarioId/characters/lock
app.post("/api/scenarios/:scenarioId/characters/lock", async (req, res) => {
  try {
    const scenarioId = Number(req.params.scenarioId);
    const userId = req.body?.userId;
    const characterName = req.body?.characterName;

    const scenario = await readScenario(scenarioId);
    if (!scenario) return res.status(404).json({ message: "Scenario ne postoji!" });

    const locks = getScenarioCharLocks(scenarioId);
    if (locks.has(characterName) && locks.get(characterName) !== userId) {
      return res.status(409).json({ message: "Konflikt! Ime lika je vec zakljucano!" });
    }

    locks.set(characterName, userId);
    return res.status(200).json({ message: "Ime lika je uspjesno zakljucano!" });
  } catch {
    return res.status(500).json({ message: "Server error" });
  }
});

// POST /api/scenarios/:scenarioId/characters/update
app.post("/api/scenarios/:scenarioId/characters/update", async (req, res) => {
  try {
    const scenarioId = Number(req.params.scenarioId);
    const userId = req.body?.userId;
    const oldName = req.body?.oldName;
    const newName = req.body?.newName;

    const scenario = await readScenario(scenarioId);
    if (!scenario) return res.status(404).json({ message: "Scenario ne postoji!" });

    const locks = getScenarioCharLocks(scenarioId);
    const owner = locks.get(oldName);
    if (owner !== userId) {
      return res.status(409).json({ message: "Konflikt! Ime lika je vec zakljucano!" });
    }

    for (const l of scenario.content) {
      if (typeof l.text === "string" && l.text.includes(oldName)) {
        const lk = lineLocks.get(`${scenarioId}:${l.lineId}`);
        if (lk && lk.userId !== userId) {
          return res.status(409).json({ message: "Konflikt! Linija je vec zakljucana!" });
        }
      }
    }

    for (const l of scenario.content) {
      if (typeof l.text === "string" && l.text.includes(oldName)) {
        l.text = l.text.split(oldName).join(newName);
      }
    }

    await writeScenario(scenario);

    await appendDelta({
      scenarioId,
      type: "char_rename",
      oldName,
      newName,
      timestamp: nowUnixSeconds()
    });

    locks.delete(oldName);

    return res.status(200).json({ message: "Ime lika je uspjesno promijenjeno!" });
  } catch {
    return res.status(500).json({ message: "Server error" });
  }
});

// GET /api/scenarios/:scenarioId/deltas?since=timestamp
app.get("/api/scenarios/:scenarioId/deltas", async (req, res) => {
  try {
    const scenarioId = Number(req.params.scenarioId);
    const since = Number(req.query.since ?? 0);

    const scenario = await readScenario(scenarioId);
    if (!scenario) return res.status(404).json({ message: "Scenario ne postoji!" });

    const deltas = await readAllDeltas();
    const filtered = deltas
      .filter((d) => d.scenarioId === scenarioId && Number(d.timestamp) > since)
      .sort((a, b) => Number(a.timestamp) - Number(b.timestamp));

    return res.status(200).json({ deltas: filtered });
  } catch {
    return res.status(500).json({ message: "Server error" });
  }
});

// GET /api/scenarios/:scenarioId
app.get("/api/scenarios/:scenarioId", async (req, res) => {
  try {
    const scenarioId = Number(req.params.scenarioId);
    const scenario = await readScenario(scenarioId);
    if (!scenario) return res.status(404).json({ message: "Scenario ne postoji!" });

    const ordered = buildOrderedContent(scenario.content);
    return res.status(200).json({ ...scenario, content: ordered });
  } catch {
    return res.status(500).json({ message: "Server error" });
  }
});

(async () => {
  try {
    await sequelize.authenticate();
    await sequelize.sync({ force: true });

    await ensureDataLayout();

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`API listening on :${PORT}`));
  } catch (err) {
    console.error("Init error:", err);
    process.exit(1);
  }
})();
