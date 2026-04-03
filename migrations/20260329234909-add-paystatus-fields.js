'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const desc = await queryInterface.describeTable('fund_transactions');
    const has =
      Object.keys(desc).some((k) => k.toLowerCase() === 'pay_status') ||
      Object.keys(desc).some((k) => k === 'payStatus');
    if (has) {
      console.log('⏭️  pay_status / payStatus 已存在，跳过 addColumn');
      return;
    }
    await queryInterface.addColumn('fund_transactions', 'payStatus', {
      type: Sequelize.ENUM('pending', 'success', 'failed'),
      allowNull: false,
      defaultValue: 'pending',
      comment: '支付状态 pending待支付 success支付成功 failed支付失败'
    });
    console.log('✅ 已添加 payStatus 字段到 FundTransactions 表');
  },

  down: async (queryInterface, Sequelize) => {
    const desc = await queryInterface.describeTable('fund_transactions');
    if (!Object.keys(desc).includes('payStatus')) {
      console.log('⏭️  无 payStatus 列，跳过 removeColumn');
      return;
    }
    await queryInterface.removeColumn('fund_transactions', 'payStatus');
    console.log('❌ 已删除 payStatus 字段从 FundTransactions 表');
  }
};
