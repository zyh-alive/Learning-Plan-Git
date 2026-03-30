'use strict';

/**
 * 此前迁移用 camelCase 作为 addColumn 名称，MySQL 中实际列名为 merchantOrderId 等；
 * FundTransaction 模型 underscored: true，Sequelize 查询 merchant_order_id，导致 ER_BAD_FIELD_ERROR。
 * 本迁移将列名统一为蛇形，与模型一致。
 */
function colKey(desc, nameLower) {
    return Object.keys(desc).find((k) => k.toLowerCase() === nameLower) || null;
}

module.exports = {
    up: async (queryInterface) => {
        const table = 'fund_transactions';
        const desc = await queryInterface.describeTable(table);

        const renameIfNeeded = (fromVariants, toSnake) => {
            const fromKey = fromVariants.map((v) => colKey(desc, v.toLowerCase())).find(Boolean);
            const toKey = colKey(desc, toSnake);
            if (fromKey && !toKey) {
                return queryInterface.renameColumn(table, fromKey, toSnake);
            }
            return Promise.resolve();
        };

        await renameIfNeeded(['merchantOrderId', 'merchantorderid'], 'merchant_order_id');
        await renameIfNeeded(['alipayTradeNo', 'alipaytradeno'], 'alipay_trade_no');
        await renameIfNeeded(['tradeType', 'tradetype'], 'trade_type');
        await renameIfNeeded(['payStatus', 'paystatus'], 'pay_status');
    },

    down: async (queryInterface) => {
        const table = 'fund_transactions';
        const desc = await queryInterface.describeTable(table);

        const renameIfNeeded = (fromSnake, toCamel) => {
            const fromKey = colKey(desc, fromSnake);
            const toKey = colKey(desc, toCamel.toLowerCase());
            if (fromKey && !toKey) {
                return queryInterface.renameColumn(table, fromKey, toCamel);
            }
            return Promise.resolve();
        };

        await renameIfNeeded('merchant_order_id', 'merchantOrderId');
        await renameIfNeeded('alipay_trade_no', 'alipayTradeNo');
        await renameIfNeeded('trade_type', 'tradeType');
        await renameIfNeeded('pay_status', 'payStatus');
    }
};
