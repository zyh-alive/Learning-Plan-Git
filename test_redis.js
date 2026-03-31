require('dotenv').config();
const { getRedisClient } = require('./config/redis');

async function test() {
    console.log('开始测试 Redis...');
    
    try {
        const client = await getRedisClient();
        
        // 1. 测试写入
        await client.set('test_key', 'Hello Redis!');
        console.log('✅ 写入成功');
        
        // 2. 测试读取
        const value = await client.get('test_key');
        console.log('✅ 读取成功:', value);
        
        // 3. 测试删除
        await client.del('test_key');
        console.log('✅ 删除成功');
        
        // 4. 验证已删除
        const deleted = await client.get('test_key');
        console.log('删除后读取:', deleted || '(空)');
        
        console.log('\n🎉 Redis 测试通过！');
        
    } catch (error) {
        console.error('❌ Redis 测试失败:', error.message);
    } finally {
        process.exit(0);
    }
}

test();