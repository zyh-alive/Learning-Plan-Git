'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('tippings', 'orderId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      comment: '订单ID',
      references: { model: 'orders', key: 'order_id' },
      onDelete: 'SET NULL'
    });
    console.log('✅ 已添加 orderId 字段到 Tippings 表');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('tippings', 'orderId');
    console.log('❌ 已删除 orderId 字段从 Tippings 表');
  }
};
