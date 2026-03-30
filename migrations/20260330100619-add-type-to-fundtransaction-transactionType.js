'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('fund_transactions', 'transaction_type', {
      type: Sequelize.ENUM('充值', '提现', '消费', '订单取消退款', '售后退款', '打赏'),
      allowNull: false,
      comment: '交易类型充值，提现，消费，订单取消退款，售后退款，打赏'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('fund_transactions', 'transaction_type', {
      type: Sequelize.ENUM('充值', '提现', '消费', '订单取消退款', '售后退款'),
      allowNull: false,
      comment: '交易类型充值，提现，消费，订单取消退款，售后退款'
    });
  }
};
