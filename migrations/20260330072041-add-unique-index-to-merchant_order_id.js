'use strict';
const FundTransaction = require('../models/FundTransaction');
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    //duplicateRows:查询出重复的merchantOrderId
    const [duplicateRows] = await queryInterface.sequelize.query(//数组对象[['merchantOrderId1', 'merchantOrderId2', 'merchantOrderId3'], ...]
      'SELECT merchant_order_id FROM fund_transactions GROUP BY merchant_order_id HAVING COUNT(*) > 1'
    );//按商户号分组，然后挑出记录大于1的
    if (duplicateRows.length > 0) {
      for (const row of duplicateRows) {
        const keep = await FundTransaction.findOne({//永远只取出最新的一条
          where: {
            merchant_order_id: row.merchant_order_id},//按商户号查询
            order: [['transactionId', 'DESC']],//按transactionId降序，取最新的一条
            attributes: ['transactionId']
        });
        if (keep) {//如果最新的一条存在，则删除其余的重复的记录
          await FundTransaction.destroy({//sequelize的删除方法
            where: {
              merchant_order_id: row.merchant_order_id,
              transactionId: {
                [Sequelize.Op.ne]: keep.transactionId//.ne:不包括最新的一条，其余删除
              }
            }
          }); //删除重复的记录，除了最新的一条
        }
      }
      console.log(`✅ 已删除 ${duplicateRows.length} 条重复的记录，现在可以添加唯一索引`);
    }
    await queryInterface.addIndex('fund_transactions', ['merchant_order_id'], { unique: true });
    console.log('✅ 已添加唯一索引');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex('fund_transactions', ['merchant_order_id']);
  }
};
