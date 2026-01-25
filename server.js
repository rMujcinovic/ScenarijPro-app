const express = require("express");
const { Op } = require("sequelize");

const { sequelize } = require("./db");
require("./models"); // registruje modele i relacije
const { Scenario, Line, Delta, Checkpoint } = require("./models");

const app = express();
app.use(express.json());

// frontend povezivanje 
app.use(express.static(__dirname));

const lineLocks = new Map();      // key: `${scenarioId}:${lineId}` -> userId
const userLineLock = new Map();   
const characterLocks = new Map(); 

function getScenarioCharLocks(scenarioId) {
  if (!characterLocks.has(scenarioId)) characterLocks.set(scenarioId, new Map());
  return characterLocks.get(scenarioId);
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

function nowUnixSeconds() {
  return Math.floor(Date.now() / 1000);
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

async function getScenarioOr404(scenarioId, res) {
  const scenario = await Scenario.findByPk(scenarioId, { raw: true });
  if (!scenario) {
    res.status(404).json({ message: "Scenario ne postoji!" });
    return null;
  }
  return scenario;
}

async function getScenarioLines(scenarioId) {
  const lines = await Line.findAll({
    where: { scenarioId },
    attributes: ["lineId", "nextLineId", "text"],
    order: [["lineId", "ASC"]],
    raw: true,
  });
  return lines;
}

function baseScenarioState(scenarioId, title) {
  return {
    id: scenarioId,
    title,
    content: [{ lineId: 1, nextLineId: null, text: "" }],
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

    const scen = await Scenario.create({ title: finalTitle });

    await Line.create({
      scenarioId: scen.id,
      lineId: 1,
      text: "",
      nextLineId: null,
    });

    return res.status(200).json({
      id: scen.id,
      title: finalTitle,
      content: [{ lineId: 1, nextLineId: null, text: "" }],
    });
  } catch {
    return res.status(500).json({ message: "Server error" });
  }
});

// GET /api/scenarios/:scenarioId
app.get("/api/scenarios/:scenarioId", async (req, res) => {
  try {
    const scenarioId = Number(req.params.scenarioId);
    if (!scenarioId) return res.status(400).json({ message: "Bad request" });

    const scenario = await getScenarioOr404(scenarioId, res);
    if (!scenario) return;

    const lines = await getScenarioLines(scenarioId);
    const ordered = buildOrderedContent(lines);

    return res.status(200).json({
      id: scenario.id,
      title: scenario.title,
      content: ordered,
    });
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

    const scenario = await getScenarioOr404(scenarioId, res);
    if (!scenario) return;

    const line = await Line.findOne({ where: { scenarioId, lineId }, raw: true });
    if (!line) return res.status(404).json({ message: "Linija ne postoji!" });

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

    const scenario = await getScenarioOr404(scenarioId, res);
    if (!scenario) return;

    const line = await Line.findOne({ where: { scenarioId, lineId }, raw: true });
    if (!line) return res.status(404).json({ message: "Linija ne postoji!" });

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

    const scenario = await getScenarioOr404(scenarioId, res);
    if (!scenario) return;

    const line = await Line.findOne({ where: { scenarioId, lineId } });
    if (!line) return res.status(404).json({ message: "Linija ne postoji!" });

    if (isLineLockedByOther(scenarioId, lineId, userId)) {
      return res.status(409).json({ message: "Linija je vec zakljucana!" });
    }

    const key = getLineLockKey(scenarioId, lineId);
    if (!lineLocks.has(key)) lockLineForUser(scenarioId, lineId, userId);

    const produced = explodeNewTextArray(newText);
    const originalNext = line.nextLineId;
    const ts = nowUnixSeconds();

    const affected = [];

    line.text = produced[0] ?? "";
    await line.save();

    affected.push({
      scenarioId,
      lineId: line.lineId,
      nextLineId: line.nextLineId,
      text: line.text,
    });

    if (produced.length > 1) {
      const max = await Line.max("lineId", { where: { scenarioId } });
      let nextId = Number.isFinite(max) ? max + 1 : 2;

      const newLines = [];
      for (let i = 1; i < produced.length; i++) {
        const newObj = await Line.create({
          scenarioId,
          lineId: nextId++,
          text: produced[i] ?? "",
          nextLineId: null,
        });
        newLines.push(newObj);
      }

      line.nextLineId = newLines[0].lineId;
      await line.save();

      for (let i = 0; i < newLines.length - 1; i++) {
        newLines[i].nextLineId = newLines[i + 1].lineId;
        await newLines[i].save();
      }
      newLines[newLines.length - 1].nextLineId = originalNext ?? null;
      await newLines[newLines.length - 1].save();

      affected.length = 0;
      affected.push({
        scenarioId,
        lineId: line.lineId,
        nextLineId: line.nextLineId,
        text: line.text,
      });
      for (const nl of newLines) {
        affected.push({
          scenarioId,
          lineId: nl.lineId,
          nextLineId: nl.nextLineId,
          text: nl.text,
        });
      }
    }

    await Delta.bulkCreate(
      affected.map((l) => ({
        scenarioId,
        type: "line_update",
        lineId: l.lineId,
        nextLineId: l.nextLineId ?? null,
        content: l.text ?? "",
        oldName: null,
        newName: null,
        timestamp: ts,
      }))
    );

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

    const scenario = await getScenarioOr404(scenarioId, res);
    if (!scenario) return;

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

    const scenario = await getScenarioOr404(scenarioId, res);
    if (!scenario) return;

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

    const scenario = await getScenarioOr404(scenarioId, res);
    if (!scenario) return;

    if (isCharacterLockedByOther(scenarioId, oldName, userId)) {
      return res.status(409).json({ message: "Lik je vec zakljucan!" });
    }

    const locks = getScenarioCharLocks(scenarioId);
    if (!locks.has(oldName)) lockCharacter(scenarioId, oldName, userId);

    const lines = await Line.findAll({ where: { scenarioId } });
    for (const l of lines) {
      if (typeof l.text === "string" && l.text.includes(oldName)) {
        l.text = l.text.split(oldName).join(newName);
        await l.save();
      }
    }

    await Delta.create({
      scenarioId,
      type: "char_rename",
      lineId: null,
      nextLineId: null,
      content: null,
      oldName,
      newName,
      timestamp: nowUnixSeconds(),
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

    const scenario = await getScenarioOr404(scenarioId, res);
    if (!scenario) return;

    const where = { scenarioId };
    if (since != null && Number.isFinite(since)) {
      where.timestamp = { [Op.gt]: since };
    }

    const deltas = await Delta.findAll({
      where,
      order: [["timestamp", "ASC"], ["id", "ASC"]],
      raw: true,
    });

    // vrati bez DB id da bude što sličnije S3
    const payload = deltas.map((d) => ({
      scenarioId: d.scenarioId,
      type: d.type,
      lineId: d.lineId ?? null,
      nextLineId: d.nextLineId ?? null,
      content: d.content ?? null,
      oldName: d.oldName ?? null,
      newName: d.newName ?? null,
      timestamp: d.timestamp,
    }));

    return res.status(200).json({ deltas: payload });
  } catch {
    return res.status(500).json({ message: "Server error" });
  }
});


// POST /api/scenarios/:scenarioId/checkpoint
app.post("/api/scenarios/:scenarioId/checkpoint", async (req, res) => {
  try {
    const scenarioId = Number(req.params.scenarioId);

    const scenario = await Scenario.findByPk(scenarioId);
    if (!scenario) return res.status(404).json({ message: "Scenario ne postoji!" });

    await Checkpoint.create({
      scenarioId,
      timestamp: nowUnixSeconds(),
    });

    return res.status(200).json({ message: "Checkpoint je uspjesno kreiran!" });
  } catch {
    return res.status(500).json({ message: "Server error" });
  }
});

// GET /api/scenarios/:scenarioId/checkpoints
app.get("/api/scenarios/:scenarioId/checkpoints", async (req, res) => {
  try {
    const scenarioId = Number(req.params.scenarioId);

    const scenario = await Scenario.findByPk(scenarioId);
    if (!scenario) return res.status(404).json({ message: "Scenario ne postoji!" });

    const cps = await Checkpoint.findAll({
      where: { scenarioId },
      attributes: ["id", "timestamp"],
      order: [["timestamp", "ASC"]],
      raw: true,
    });

    return res.status(200).json(cps);
  } catch {
    return res.status(500).json({ message: "Server error" });
  }
});

// GET /api/scenarios/:scenarioId/restore/:checkpointId
app.get("/api/scenarios/:scenarioId/restore/:checkpointId", async (req, res) => {
  try {
    const scenarioId = Number(req.params.scenarioId);
    const checkpointId = Number(req.params.checkpointId);

    const scenario = await Scenario.findByPk(scenarioId);
    if (!scenario) return res.status(404).json({ message: "Scenario ne postoji!" });

    const cp = await Checkpoint.findOne({
      where: { id: checkpointId, scenarioId },
      raw: true,
    });

    if (!cp) {
      return res.status(404).json({ message: "Scenario ne postoji!" });
    }

    const deltas = await Delta.findAll({
      where: {
        scenarioId,
        timestamp: { [Op.lte]: cp.timestamp },
      },
      order: [["timestamp", "ASC"], ["id", "ASC"]],
      raw: true,
    });

    const base = baseScenarioState(scenarioId, scenario.title);
    const restored = applyDeltasToScenario(base, deltas);

    return res.status(200).json(restored);
  } catch {
    return res.status(500).json({ message: "Server error" });
  }
});

async function seedForS3Tests() {
  const existing = await Scenario.findByPk(1);
  if (existing) return;

  await Scenario.create({
    id: 1,
    title: "Potraga za izgubljenim ključem",
  });

  await Line.bulkCreate([
    {
      scenarioId: 1,
      lineId: 1,
      nextLineId: 2,
      text: "NARATOR: Sunce je polako zalazilo nad starim gradom.",
    },
    {
      scenarioId: 1,
      lineId: 2,
      nextLineId: 3,
      text: "ALICE: Jesi li siguran da je ključ ostao u biblioteci?",
    },
    {
      scenarioId: 1,
      lineId: 3,
      nextLineId: 4,
      text: "BOB: To je posljednje mjesto gdje sam ga vidio prije nego što je pala noć.",
    },
    {
      scenarioId: 1,
      lineId: 4,
      nextLineId: 5,
      text: "ALICE: Moramo požuriti prije nego što čuvar zaključa glavna vrata.",
    },
    {
      scenarioId: 1,
      lineId: 5,
      nextLineId: 6,
      text: "BOB: Čekaj, čuješ li taj zvuk iza polica?",
    },
    {
      scenarioId: 1,
      lineId: 6,
      nextLineId: null,
      text: "NARATOR: Iz sjene se polako pojavila nepoznata figura.",
    },
  ]);

  await Delta.bulkCreate([
    {
      scenarioId: 1,
      type: "line_update",
      lineId: 1,
      nextLineId: 2,
      content: "NARATOR: Sunce je polako zalazilo nad starim gradom.",
      timestamp: 1736520000,
    },
    {
      scenarioId: 1,
      type: "line_update",
      lineId: 2,
      nextLineId: 3,
      content: "ALICE: Jesi li siguran da je ključ ostao u biblioteci?",
      timestamp: 1736520010,
    },
    {
      scenarioId: 1,
      type: "line_update",
      lineId: 3,
      nextLineId: 4,
      content: "BOB: To je posljednje mjesto gdje sam ga vidio prije nego što je pala noć.",
      timestamp: 1736520020,
    },
    {
      scenarioId: 1,
      type: "line_update",
      lineId: 4,
      nextLineId: 5,
      content: "ALICE: Moramo požuriti prije nego što čuvar zaključa glavna vrata.",
      timestamp: 1736520030,
    },
    {
      scenarioId: 1,
      type: "line_update",
      lineId: 5,
      nextLineId: 6,
      content: "BOB: Čekaj, čuješ li taj zvuk iza polica?",
      timestamp: 1736520040,
    },
    {
      scenarioId: 1,
      type: "line_update",
      lineId: 6,
      nextLineId: null,
      content: "NARATOR: Iz sjene se polako pojavila nepoznata figura.",
      timestamp: 1736520050,
    },
  ]);
}

(async () => {
  try {
    await sequelize.authenticate();
    await sequelize.sync({ force: true });

    await seedForS3Tests();

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`API listening on :${PORT}`));
  } catch (err) {
    console.error("Init error:", err);
    process.exit(1);
  }
})();

