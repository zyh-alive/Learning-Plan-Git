const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Collects = sequelize.define('Collects', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '主键'
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '用户ID',
        references: { model: 'user_auth', key: 'id' },
        onDelete: 'RESTRICT'
    },
    consultantId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '顾问ID',
        references: { model: 'consultant_auth', key: 'id' },
        onDelete: 'RESTRICT'
    }
}, {
    tableName: 'collects',
    underscored: false,
    timestamps: true
});

module.exports = Collects;