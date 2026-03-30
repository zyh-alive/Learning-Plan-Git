const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Tipping = sequelize.define('Tipping', {
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
    },
    tipAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '打赏金额',
    },
    orderId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '订单ID',
        references: { model: 'orders', key: 'order_id' },
        onDelete: 'SET NULL'
    }
}, {
    tableName: 'tippings',
    underscored: false,
    timestamps: true
});
module.exports = Tipping;