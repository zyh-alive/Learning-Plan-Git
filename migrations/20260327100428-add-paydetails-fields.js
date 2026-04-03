'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const desc = await queryInterface.describeTable('fund_transactions');
    const keys = Object.keys(desc);
    const hasPayCols =
      keys.some((k) => k.toLowerCase() === 'merchant_order_id') ||
      keys.some((k) => k.toLowerCase() === 'merchantorderid');
    if (hasPayCols) {
      console.log('⏭️  paydetails 列已存在（如 baseline 已建表），跳过 addColumn');
      return;
    }

    await queryInterface.addColumn('fund_transactions', 'merchantOrderId', {
      //添加商户订单号字段
      type: Sequelize.INTEGER,
      allowNull: true,
      unique: true,
      comment: '商户订单号'
    });

    await queryInterface.addColumn('fund_transactions', 'alipayTradeNo', {
      //添加支付宝交易号字段
      type: Sequelize.STRING(50),
      allowNull: true,
      unique: true,
      comment: '支付宝交易号'
    });

    await queryInterface.addColumn('fund_transactions', 'tradeType', {
      type: Sequelize.ENUM('alipay', 'wechat'),
      allowNull: true,
      comment: '交易方式 alipay支付宝 wechat微信'
    });
    console.log('✅ 已添加三个字段到 FundTransactions 表');
  },

  down: async (queryInterface, Sequelize) => {
    const desc = await queryInterface.describeTable('fund_transactions');
    const keys = Object.keys(desc);
    const hasCamel =
      keys.some((k) => k === 'tradeType') ||
      keys.some((k) => k === 'alipayTradeNo') ||
      keys.some((k) => k === 'merchantOrderId');
    if (!hasCamel) {
      console.log('⏭️  无 camelCase 支付列，跳过 removeColumn');
      return;
    }
    await queryInterface.removeColumn('fund_transactions', 'tradeType');
    await queryInterface.removeColumn('fund_transactions', 'alipayTradeNo');
    await queryInterface.removeColumn('fund_transactions', 'merchantOrderId');
    console.log('❌ 已删除三个字段从 FundTransactions 表');
  }
};
