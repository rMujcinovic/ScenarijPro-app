const { DataTypes } = require("sequelize");
const { sequelize } = require("../db");

const Scenario = sequelize.define(
  "Scenario",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    title: { type: DataTypes.STRING, allowNull: false },
  },
  { tableName: "scenarios", timestamps: false }
);

module.exports = Scenario;
