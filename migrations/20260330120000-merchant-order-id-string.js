'use strict';

/** 商户订单号与支付宝 out_trade_no 一致，为长数字串，超出 INT，改为 VARCHAR */
module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.changeColumn('fund_transactions', 'merchantOrderId', {
            type: Sequelize.STRING(64),
            allowNull: true,
            unique: true,
            comment: '商户订单号（与支付宝 out_trade_no 一致）'
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.changeColumn('fund_transactions', 'merchantOrderId', {
            type: Sequelize.INTEGER,
            allowNull: true,
            unique: true,
            comment: '商户订单号'
        });
    }
};
