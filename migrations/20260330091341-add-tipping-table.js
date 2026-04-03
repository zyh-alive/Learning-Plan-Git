'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tables = await queryInterface.showAllTables();
    const names = tables.map((t) => (typeof t === 'object' && t.tableName ? t.tableName : t));
    if (names.includes('tippings')) {
      console.log('⏭️  tippings 表已存在，跳过 createTable');
      return;
    }
    await queryInterface.createTable('tippings', {
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
        onDelete: 'RESTRICT'
      },
      consultantId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: '顾问ID',
        references: { model: 'consultant_auth', key: 'id' },
        onDelete: 'RESTRICT'
      },
      tipAmount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        comment: '打赏金额',
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
        comment: '打赏创建时间'
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
        comment: '打赏更新时间'
      }
    }); //创建打赏表，用户打赏顾问
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('tippings');
  }
};
