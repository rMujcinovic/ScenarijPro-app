const { DataTypes } = require("sequelize");
const { sequelize } = require("../db");

const Checkpoint = sequelize.define(
  "Checkpoint",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    timestamp: { type: DataTypes.INTEGER, allowNull: false },
  },
  { tableName: "Checkpoint", timestamps: false }
);

module.exports = Checkpoint;
