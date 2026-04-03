'use strict';

/** 商户订单号与支付宝 out_trade_no 一致，为长数字串，超出 INT，改为 VARCHAR */
module.exports = {
    up: async (queryInterface, Sequelize) => {
        const desc = await queryInterface.describeTable('fund_transactions');
        const merKey =
            Object.keys(desc).find((k) => k.toLowerCase() === 'merchant_order_id') ||
            Object.keys(desc).find((k) => k.toLowerCase() === 'merchantorderid');
        if (!merKey) {
            console.log('⏭️  无商户订单号列，跳过 changeColumn');
            return;
        }
        const t = String(desc[merKey].type || '').toLowerCase();
        if (t.includes('varchar') && (t.includes('(64)') || t.includes('(255)'))) {
            console.log('⏭️  商户订单号已是字符串类型，跳过 changeColumn');
            return;
        }
        await queryInterface.changeColumn('fund_transactions', merKey, {
            type: Sequelize.STRING(64),
            allowNull: true,
            unique: true,
            comment: '商户订单号（与支付宝 out_trade_no 一致）'
        });
    },

    down: async (queryInterface, Sequelize) => {
        const desc = await queryInterface.describeTable('fund_transactions');
        const merKey =
            Object.keys(desc).find((k) => k.toLowerCase() === 'merchant_order_id') ||
            Object.keys(desc).find((k) => k.toLowerCase() === 'merchantorderid');
        if (!merKey) return;
        await queryInterface.changeColumn('fund_transactions', merKey, {
            type: Sequelize.INTEGER,
            allowNull: true,
            unique: true,
            comment: '商户订单号'
        });
    }
};
