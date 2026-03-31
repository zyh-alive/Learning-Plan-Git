// utils/cache.js
const { getRedisClient } = require('../config/redis');

//都是字符串类型的键，值是JSON字符串
// 缓存过期时间（秒）
const CACHE_TTL = {
    ORDER_DETAIL: 300,        // 订单详情 5分钟
    CONSULTANT_REVIEWS: 600,  // 顾问评价列表 10分钟
    COMMENT_LIST: 600         // 评论列表 10分钟
};//缓存时间不一致原因在于纯订单是有订单状态的，因此订单需要被反复的更新写入，会需要频繁的删除缓存添加缓存，而顾问评价列表和评论列表不需要被反复的更新写入，因此缓存时间可以更长

/**
 * 获取缓存
 * @param {string} key - 缓存键
 * @returns {Promise<any>}
 */
async function get(key) {
    try {
        const client = await getRedisClient();//获取redis客户端
        const value = await client.get(key);//获取缓存值
        return value ? JSON.parse(value) : null;//如果缓存值存在，则返回缓存值，否则返回null
    } catch (error) {
        console.error('Redis 读取失败:', error);
        return null;
    }
}

/**
 * 设置缓存
 * @param {string} key - 缓存键
 * @param {any} value - 缓存值
 * @param {number} ttl - 过期时间（秒）
 */
async function set(key, value, ttl) {
    try {
        const client = await getRedisClient();//获取redis客户端
        await client.setEx(key, ttl, JSON.stringify(value));//设置缓存值
        return true;
    } catch (error) {
        console.error('Redis 写入失败:', error);
        return false;
    }
}

/**
 * 删除缓存
 * @param {string} key - 缓存键
 */
async function del(key) {
    try {
        const client = await getRedisClient();//获取redis客户端
        await client.del(key);//删除缓存    
        return true;
    } catch (error) {
        console.error('Redis 删除失败:', error);
        return false;
    }
}

/**
 * 批量删除匹配模式的缓存
 * @param {string} pattern - 匹配模式，如 'consultant:reviews:123:*'
 */
async function delPattern(pattern) {
    try {
        const client = await getRedisClient();//获取redis客户端
        const keys = await client.keys(pattern);//获取缓存键
        if (keys.length > 0) {//如果缓存键存在
            await client.del(keys);//删除缓存
            console.log(`🗑️ 删除了 ${keys.length} 个缓存: ${pattern}`);
        }
        return keys.length;//返回缓存键数量
    } catch (error) {
        console.error('Redis 批量删除失败:', error);
        return 0;//返回0
    }
}

module.exports = {
    CACHE_TTL,
    get,
    set,
    del,
    delPattern
};