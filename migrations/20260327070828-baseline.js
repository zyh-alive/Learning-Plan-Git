// migrations/XXXXXXXXXXXXXX-baseline.js
'use strict';

module.exports = {
    // up: 标记"现有表已存在"
    up: async (queryInterface, Sequelize) => {
        console.log('📌 基线已建立，以下表已存在：');
        console.log('   - ConsultantAuth');
        console.log('   - ConsultantProfile');
        console.log('   - ConsultantService');
        console.log('   - FundTransaction');
        console.log('   - Order');
        console.log('   - OrderChatMessage');
        console.log('   - OrderReview');
        console.log('   - UserAuth');
        console.log('   - UserProfile');
        console.log('');
        console.log('✅ 后续的 migration 将基于此基线执行');
    },

    // down: 回滚基线（什么都不做）
    down: async (queryInterface, Sequelize) => {
        console.log('⚠️ 基线回滚，不做任何操作');
    }
};