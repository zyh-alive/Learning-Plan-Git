'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
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
    await queryInterface.removeColumn('fund_transactions', 'tradeType');
    await queryInterface.removeColumn('fund_transactions', 'alipayTradeNo');
    await queryInterface.removeColumn('fund_transactions', 'merchantOrderId');
    console.log('❌ 已删除三个字段从 FundTransactions 表');
  }
};
