'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('collects', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '主键'
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: '用户ID',
        references: { model: 'user_auth', key: 'id' },
        onDelete: 'RESTRICT'//
      },
      consultantId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: '顾问ID',
        references: { model: 'consultant_auth', key: 'id' },
        onDelete: 'RESTRICT'
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
        comment: '创建时间'
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
        comment: '更新时间'
      }
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('collects');
  }
};
