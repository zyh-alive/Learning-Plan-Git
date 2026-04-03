'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const desc = await queryInterface.describeTable('fund_transactions');
    const ttKey = Object.keys(desc).find((k) => k.toLowerCase() === 'transaction_type');
    if (!ttKey) return;
    const colType = String(desc[ttKey].type || '');
    if (colType.includes('打赏')) {
      console.log('⏭️  transaction_type 已含「打赏」，跳过 changeColumn');
      return;
    }
    await queryInterface.changeColumn('fund_transactions', ttKey, {
      type: Sequelize.ENUM('充值', '提现', '消费', '订单取消退款', '售后退款', '打赏'),
      allowNull: false,
      comment: '交易类型充值，提现，消费，订单取消退款，售后退款，打赏'
    });
  },

  down: async (queryInterface, Sequelize) => {
    const desc = await queryInterface.describeTable('fund_transactions');
    const ttKey = Object.keys(desc).find((k) => k.toLowerCase() === 'transaction_type');
    if (!ttKey) return;
    await queryInterface.changeColumn('fund_transactions', ttKey, {
      type: Sequelize.ENUM('充值', '提现', '消费', '订单取消退款', '售后退款'),
      allowNull: false,
      comment: '交易类型充值，提现，消费，订单取消退款，售后退款'
    });
  }
};
