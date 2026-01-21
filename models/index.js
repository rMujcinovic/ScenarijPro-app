const Scenario = require("./Scenario");
const Line = require("./Line");
const Delta = require("./Delta");
const Checkpoint = require("./Checkpoint");

// Relacije
Scenario.hasMany(Line, { foreignKey: "scenarioId", onDelete: "CASCADE" });
Line.belongsTo(Scenario, { foreignKey: "scenarioId" });

Scenario.hasMany(Delta, { foreignKey: "scenarioId", onDelete: "CASCADE" });
Delta.belongsTo(Scenario, { foreignKey: "scenarioId" });

Scenario.hasMany(Checkpoint, { foreignKey: "scenarioId", onDelete: "CASCADE" });
Checkpoint.belongsTo(Scenario, { foreignKey: "scenarioId" });

// unique lineId unutar scenarija
Line.options.indexes = [
  { unique: true, fields: ["scenarioId", "lineId"] }
];

module.exports = { Scenario, Line, Delta, Checkpoint };
