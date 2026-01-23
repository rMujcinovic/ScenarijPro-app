const { DataTypes } = require("sequelize");
const { sequelize } = require("../db");

const Delta = sequelize.define(
  "Delta",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    type: {
      type: DataTypes.STRING,
      allowNull: false, // "line_update" ili "char_rename"
    },

    lineId: { type: DataTypes.INTEGER, allowNull: true },
    nextLineId: { type: DataTypes.INTEGER, allowNull: true },
    content: { type: DataTypes.TEXT, allowNull: true },

    oldName: { type: DataTypes.STRING, allowNull: true },
    newName: { type: DataTypes.STRING, allowNull: true },

    timestamp: { type: DataTypes.INTEGER, allowNull: false },
  },
  { tableName: "Delta", timestamps: false }
);

module.exports = Delta;
