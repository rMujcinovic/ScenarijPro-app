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

function splitIntoWords(text) {
  if (typeof text !== "string") return [];
  const trimmed = text.trim();
  if (!trimmed) return [];
  return trimmed.split(/\s+/);
}

function wrapWordsIntoChunks(words, chunkSize = 20) {
  const chunks = [];
  for (let i = 0; i < words.length; i += chunkSize) {
    chunks.push(words.slice(i, i + chunkSize).join(" "));
  }
  return chunks;
}

function explodeNewTextArray(newTextArr) {
  const joined = Array.isArray(newTextArr) ? newTextArr.join(" ").trim() : "";
  const words = splitIntoWords(joined);
  if (words.length === 0) return [joined];
  return wrapWordsIntoChunks(words, 20);
}

function buildOrderedContent(content) {
  if (!Array.isArray(content) || content.length === 0) return [];

  const byId = new Map(content.map((l) => [l.lineId, { ...l }]));

  const nextSet = new Set();
  for (const l of byId.values()) {
    if (l.nextLineId != null) nextSet.add(l.nextLineId);
  }

  let start = null;
  for (const l of byId.values()) {
    if (!nextSet.has(l.lineId)) {
      start = l;
      break;
    }
  }
  if (!start) start = byId.values().next().value;

  const ordered = [];
  const seen = new Set();
  let cur = start;
  while (cur && !seen.has(cur.lineId)) {
    ordered.push(cur);
    seen.add(cur.lineId);
    cur = cur.nextLineId != null ? byId.get(cur.nextLineId) : null;
  }

  for (const l of byId.values()) {
    if (!seen.has(l.lineId)) ordered.push(l);
  }

  return ordered;
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

function ensureScenarioExists(scenario) {
  return scenario && typeof scenario.id === "number" && Array.isArray(scenario.content);
}

function getLineLockKey(scenarioId, lineId) {
  return `${scenarioId}:${lineId}`;
}

function isLineLockedByOther(scenarioId, lineId, userId) {
  const key = getLineLockKey(scenarioId, lineId);
  if (!lineLocks.has(key)) return false;
  return lineLocks.get(key) !== userId;
}

function lockLineForUser(scenarioId, lineId, userId) {
  const key = getLineLockKey(scenarioId, lineId);

  if (userLineLock.has(userId)) {
    const prev = userLineLock.get(userId);
    if (prev && prev.scenarioId === scenarioId && prev.lineId !== lineId) {
      const prevKey = getLineLockKey(prev.scenarioId, prev.lineId);
      if (lineLocks.get(prevKey) === userId) lineLocks.delete(prevKey);
    }
  }

  lineLocks.set(key, userId);
  userLineLock.set(userId, { scenarioId, lineId });
}

function unlockLineIfOwned(scenarioId, lineId, userId) {
  const key = getLineLockKey(scenarioId, lineId);
  if (lineLocks.get(key) === userId) {
    lineLocks.delete(key);
    const cur = userLineLock.get(userId);
    if (cur && cur.scenarioId === scenarioId && cur.lineId === lineId) {
      userLineLock.delete(userId);
    }
    return true;
  }
  return false;
}

function lockCharacter(scenarioId, characterName, userId) {
  const locks = getScenarioCharLocks(scenarioId);

  for (const [name, uid] of locks.entries()) {
    if (uid === userId && name !== characterName) locks.delete(name);
  }

  locks.set(characterName, userId);
}

function isCharacterLockedByOther(scenarioId, characterName, userId) {
  const locks = getScenarioCharLocks(scenarioId);
  if (!locks.has(characterName)) return false;
  return locks.get(characterName) !== userId;
}

function unlockCharacterIfOwned(scenarioId, characterName, userId) {
  const locks = getScenarioCharLocks(scenarioId);
  if (locks.get(characterName) === userId) {
    locks.delete(characterName);
    return true;
  }
  return false;
}

function findMaxLineId(scenario) {
  let maxLineId = 0;
  for (const l of scenario.content || []) {
    if (typeof l.lineId === "number") maxLineId = Math.max(maxLineId, l.lineId);
  }
  return maxLineId + 1;
}

function findLine(scenario, lineId) {
  return (scenario.content || []).find((l) => l.lineId === lineId) || null;
}

function baseScenarioState(scenarioId, title) {
  return {
    id: scenarioId,
    title,
    content: [{ lineId: 1, nextLineId: null, text: "" }]
  };
}

function applyDeltasToScenario(scenarioObj, deltas) {
  const byId = new Map((scenarioObj.content || []).map((l) => [l.lineId, { ...l }]));

  for (const d of deltas) {
    if (d.type === "line_update") {
      if (!byId.has(d.lineId)) {
        byId.set(d.lineId, { lineId: d.lineId, nextLineId: null, text: "" });
      }
      const line = byId.get(d.lineId);
      line.text = d.content ?? "";
      line.nextLineId = d.nextLineId ?? null;
    }

    if (d.type === "char_rename") {
      const oldName = d.oldName ?? "";
      const newName = d.newName ?? "";
      if (oldName.length > 0) {
        for (const line of byId.values()) {
          if (typeof line.text === "string" && line.text.includes(oldName)) {
            line.text = line.text.split(oldName).join(newName);
          }
        }
      }
    }
  }

  const content = Array.from(byId.values()).sort((a, b) => a.lineId - b.lineId);
  return { ...scenarioObj, content: buildOrderedContent(content) };
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

    try {
      await Scenario.findOrCreate({
        where: { id },
        defaults: { id, title: finalTitle }
      });

      const existingLines = await Line.count({ where: { scenarioId: id } });
      if (existingLines === 0) {
        await Line.create({
          scenarioId: id,
          lineId: 1,
          text: "",
          nextLineId: null
        });
      }
    } catch (e) {
      // ignore
    }

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
    const userId = Number(req.body && req.body.userId);

    if (!scenarioId || !lineId || !userId) return res.status(400).json({ message: "Bad request" });

    const scenario = await readScenario(scenarioId);
    if (!ensureScenarioExists(scenario)) return res.status(404).json({ message: "Scenario ne postoji!" });

    if (isLineLockedByOther(scenarioId, lineId, userId)) {
      return res.status(409).json({ message: "Linija je vec zakljucana!" });
    }

    lockLineForUser(scenarioId, lineId, userId);
    return res.status(200).json({ message: "Linija uspjesno zakljucana!" });
  } catch {
    return res.status(500).json({ message: "Server error" });
  }
});

// POST /api/scenarios/:scenarioId/lines/:lineId/unlock
app.post("/api/scenarios/:scenarioId/lines/:lineId/unlock", async (req, res) => {
  try {
    const scenarioId = Number(req.params.scenarioId);
    const lineId = Number(req.params.lineId);
    const userId = Number(req.body && req.body.userId);

    if (!scenarioId || !lineId || !userId) return res.status(400).json({ message: "Bad request" });

    const scenario = await readScenario(scenarioId);
    if (!ensureScenarioExists(scenario)) return res.status(404).json({ message: "Scenario ne postoji!" });

    if (!unlockLineIfOwned(scenarioId, lineId, userId)) {
      return res.status(409).json({ message: "Ne mozete otkljucati liniju!" });
    }

    return res.status(200).json({ message: "Linija uspjesno otkljucana!" });
  } catch {
    return res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/scenarios/:scenarioId/lines/:lineId
app.put("/api/scenarios/:scenarioId/lines/:lineId", async (req, res) => {
  try {
    const scenarioId = Number(req.params.scenarioId);
    const lineId = Number(req.params.lineId);
    const userId = Number(req.body && req.body.userId);
    const newText = req.body && req.body.newText;

    if (!scenarioId || !lineId || !userId || !Array.isArray(newText)) {
      return res.status(400).json({ message: "Bad request" });
    }

    const scenario = await readScenario(scenarioId);
    if (!ensureScenarioExists(scenario)) {
      return res.status(404).json({ message: "Scenario ne postoji!" });
    }

    const line = findLine(scenario, lineId);
    if (!line) {
      return res.status(404).json({ message: "Linija ne postoji!" });
    }

    if (isLineLockedByOther(scenarioId, lineId, userId)) {
      return res.status(409).json({ message: "Linija je vec zakljucana!" });
    }

    const key = getLineLockKey(scenarioId, lineId);
    if (!lineLocks.has(key)) {
      lockLineForUser(scenarioId, lineId, userId);
    }

    const produced = explodeNewTextArray(newText);
    const originalNext = line.nextLineId;
    const ts = nowUnixSeconds();

    line.text = produced[0] ?? "";

    const affected = [line];

    if (produced.length > 1) {
      let nextId = findMaxLineId(scenario);

      const newLines = [];
      for (let i = 1; i < produced.length; i++) {
        const newObj = {
          lineId: nextId++,
          nextLineId: null,
          text: produced[i] ?? ""
        };
        scenario.content.push(newObj);
        newLines.push(newObj);
      }

      line.nextLineId = newLines[0].lineId;

      for (let i = 0; i < newLines.length - 1; i++) {
        newLines[i].nextLineId = newLines[i + 1].lineId;
      }

      newLines[newLines.length - 1].nextLineId = originalNext;
      affected.push(...newLines);
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

    unlockLineIfOwned(scenarioId, lineId, userId);

    return res.status(200).json({ message: "Linija uspjesno azurirana!" });
  } catch {
    return res.status(500).json({ message: "Server error" });
  }
});

// POST /api/scenarios/:scenarioId/characters/lock
app.post("/api/scenarios/:scenarioId/characters/lock", async (req, res) => {
  try {
    const scenarioId = Number(req.params.scenarioId);
    const userId = Number(req.body && req.body.userId);
    const characterName = (req.body && typeof req.body.characterName === "string" ? req.body.characterName : "").trim();

    if (!scenarioId || !userId || !characterName) return res.status(400).json({ message: "Bad request" });

    const scenario = await readScenario(scenarioId);
    if (!ensureScenarioExists(scenario)) return res.status(404).json({ message: "Scenario ne postoji!" });

    if (isCharacterLockedByOther(scenarioId, characterName, userId)) {
      return res.status(409).json({ message: "Lik je vec zakljucan!" });
    }

    lockCharacter(scenarioId, characterName, userId);
    return res.status(200).json({ message: "Lik uspjesno zakljucan!" });
  } catch {
    return res.status(500).json({ message: "Server error" });
  }
});

// POST /api/scenarios/:scenarioId/characters/unlock
app.post("/api/scenarios/:scenarioId/characters/unlock", async (req, res) => {
  try {
    const scenarioId = Number(req.params.scenarioId);
    const userId = Number(req.body && req.body.userId);
    const characterName = (req.body && typeof req.body.characterName === "string" ? req.body.characterName : "").trim();

    if (!scenarioId || !userId || !characterName) return res.status(400).json({ message: "Bad request" });

    const scenario = await readScenario(scenarioId);
    if (!ensureScenarioExists(scenario)) return res.status(404).json({ message: "Scenario ne postoji!" });

    if (!unlockCharacterIfOwned(scenarioId, characterName, userId)) {
      return res.status(409).json({ message: "Ne mozete otkljucati lika!" });
    }

    return res.status(200).json({ message: "Lik uspjesno otkljucan!" });
  } catch {
    return res.status(500).json({ message: "Server error" });
  }
});

// POST /api/scenarios/:scenarioId/characters/update
app.post("/api/scenarios/:scenarioId/characters/update", async (req, res) => {
  try {
    const scenarioId = Number(req.params.scenarioId);
    const userId = Number(req.body && req.body.userId);
    const oldName = (req.body && typeof req.body.oldName === "string" ? req.body.oldName : "").trim();
    const newName = (req.body && typeof req.body.newName === "string" ? req.body.newName : "").trim();

    if (!scenarioId || !userId || !oldName || !newName) {
      return res.status(400).json({ message: "Bad request" });
    }

    const scenario = await readScenario(scenarioId);
    if (!ensureScenarioExists(scenario)) {
      return res.status(404).json({ message: "Scenario ne postoji!" });
    }

    if (isCharacterLockedByOther(scenarioId, oldName, userId)) {
      return res.status(409).json({ message: "Lik je vec zakljucan!" });
    }

    const locks = getScenarioCharLocks(scenarioId);
    if (!locks.has(oldName)) {
      lockCharacter(scenarioId, oldName, userId);
    }

    for (const line of scenario.content || []) {
      if (typeof line.text === "string" && line.text.includes(oldName)) {
        line.text = line.text.split(oldName).join(newName);
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

    unlockCharacterIfOwned(scenarioId, oldName, userId);

    return res.status(200).json({ message: "Lik uspjesno azuriran!" });
  } catch {
    return res.status(500).json({ message: "Server error" });
  }
});

// GET /api/scenarios/:scenarioId/deltas?since=timestamp
app.get("/api/scenarios/:scenarioId/deltas", async (req, res) => {
  try {
    const scenarioId = Number(req.params.scenarioId);
    const since = req.query && req.query.since ? Number(req.query.since) : null;

    if (!scenarioId) return res.status(400).json({ message: "Bad request" });

    const scenario = await readScenario(scenarioId);
    if (!ensureScenarioExists(scenario)) return res.status(404).json({ message: "Scenario ne postoji!" });

    const all = await readAllDeltas();
    const filtered = all.filter((d) => d.scenarioId === scenarioId && (since == null || d.timestamp > since));

    return res.status(200).json({ deltas: filtered });
  } catch {
    return res.status(500).json({ message: "Server error" });
  }
});

// GET /api/scenarios/:scenarioId
app.get("/api/scenarios/:scenarioId", async (req, res) => {
  try {
    const scenarioId = Number(req.params.scenarioId);
    if (!scenarioId) return res.status(400).json({ message: "Bad request" });

    const scenario = await readScenario(scenarioId);
    if (!ensureScenarioExists(scenario)) return res.status(404).json({ message: "Scenario ne postoji!" });

    const ordered = buildOrderedContent(scenario.content);
    return res.status(200).json({ ...scenario, content: ordered });
  } catch {
    return res.status(500).json({ message: "Server error" });
  }
});


app.post("/api/scenarios/:scenarioId/checkpoint", async (req, res) => {
  try {
    const scenarioId = Number(req.params.scenarioId);

    const scenario = await Scenario.findByPk(scenarioId);
    if (!scenario) return res.status(404).json({ message: "Scenario ne postoji!" });

    await Checkpoint.create({
      scenarioId,
      timestamp: nowUnixSeconds()
    });

    return res.status(200).json({ message: "Checkpoint je uspjesno kreiran!" });
  } catch {
    return res.status(500).json({ message: "Server error" });
  }
});

app.get("/api/scenarios/:scenarioId/checkpoints", async (req, res) => {
  try {
    const scenarioId = Number(req.params.scenarioId);

    const scenario = await Scenario.findByPk(scenarioId);
    if (!scenario) return res.status(404).json({ message: "Scenario ne postoji!" });

    const cps = await Checkpoint.findAll({
      where: { scenarioId },
      attributes: ["id", "timestamp"],
      order: [["timestamp", "ASC"]],
      raw: true
    });

    return res.status(200).json(cps);
  } catch {
    return res.status(500).json({ message: "Server error" });
  }
});

app.get("/api/scenarios/:scenarioId/restore/:checkpointId", async (req, res) => {
  try {
    const scenarioId = Number(req.params.scenarioId);
    const checkpointId = Number(req.params.checkpointId);

    const scenario = await Scenario.findByPk(scenarioId);
    if (!scenario) return res.status(404).json({ message: "Scenario ne postoji!" });

    const cp = await Checkpoint.findOne({
      where: { id: checkpointId, scenarioId },
      raw: true
    });

    if (!cp) {
      return res.status(404).json({ message: "Scenario ne postoji!" });
    }

    const deltas = await Delta.findAll({
      where: {
        scenarioId,
        timestamp: { [Op.lte]: cp.timestamp }
      },
      order: [["timestamp", "ASC"], ["id", "ASC"]],
      raw: true
    });

    const base = baseScenarioState(scenarioId, scenario.title);
    const restored = applyDeltasToScenario(base, deltas);

    return res.status(200).json(restored);
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
