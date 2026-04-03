'use strict';
const FundTransaction = require('../models/FundTransaction');
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const desc = await queryInterface.describeTable('fund_transactions');
    const merKey =
      Object.keys(desc).find((k) => k.toLowerCase() === 'merchant_order_id') ||
      Object.keys(desc).find((k) => k.toLowerCase() === 'merchantorderid');
    if (!merKey) {
      console.log('⏭️  无商户订单号列，跳过去重与索引');
      return;
    }

    const [idxRows] = await queryInterface.sequelize.query(
      'SHOW INDEX FROM fund_transactions WHERE Non_unique = 0 AND Column_name = ?',
      { replacements: [merKey] }
    );
    if (idxRows && idxRows.length > 0) {
      console.log('⏭️  商户订单号列已有唯一索引，跳过去重与 addIndex');
      return;
    }

    const qCol = '`' + String(merKey).replace(/`/g, '``') + '`';
    const [duplicateRows] = await queryInterface.sequelize.query(
      `SELECT ${qCol} AS mer_val FROM fund_transactions WHERE ${qCol} IS NOT NULL GROUP BY ${qCol} HAVING COUNT(*) > 1`
    );
    if (duplicateRows.length > 0) {
      for (const row of duplicateRows) {
        const val = row.mer_val;
        const keep = await FundTransaction.findOne({
          where: { merchantOrderId: val },
          order: [['transactionId', 'DESC']],
          attributes: ['transactionId']
        });
        if (keep) {
          await FundTransaction.destroy({
            where: {
              merchantOrderId: val,
              transactionId: { [Sequelize.Op.ne]: keep.transactionId }
            }
          });
        }
      }
      console.log(`✅ 已删除 ${duplicateRows.length} 组重复商户号记录，现在可以添加唯一索引`);
    }
    await queryInterface.addIndex('fund_transactions', [merKey], { unique: true });
    console.log('✅ 已添加唯一索引');
  },

  down: async (queryInterface, Sequelize) => {
    const desc = await queryInterface.describeTable('fund_transactions');
    const merKey =
      Object.keys(desc).find((k) => k.toLowerCase() === 'merchant_order_id') ||
      Object.keys(desc).find((k) => k.toLowerCase() === 'merchantorderid');
    if (!merKey) return;
    try {
      await queryInterface.removeIndex('fund_transactions', [merKey]);
    } catch (e) {
      console.log('⏭️  removeIndex 商户订单号 跳过（可能未由本迁移创建）');
    }
  }
};
