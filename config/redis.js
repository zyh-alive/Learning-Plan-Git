// config/redis.js
const redis = require('redis');

// Redis 配置（简单，不需要从 config.yaml 读）
let redisClient = null;

async function getRedisClient() {
    if (redisClient && redisClient.isOpen) {//isOpen是redisClient的属性，表示是否连接成功
        return redisClient;
    }//如果redisClient已经连接，则直接返回
    //如果redisClient没有连接，则创建一个redisClient
    redisClient = redis.createClient({
        socket: {
            host: process.env.REDIS_HOST,
            port: parseInt(process.env.REDIS_PORT)
        }
    });
    //如果redisClient连接失败，则打印错误信息
    redisClient.on('error', (err) => {
        console.error('Redis 连接错误:', err);
    });
    //如果redisClient连接成功，则打印连接成功信息
    redisClient.on('connect', () => {
        console.log('✅ Redis 连接成功');
    });
    
    await redisClient.connect();//连接redisClient
    return redisClient;//返回redisClient
}

module.exports = { getRedisClient };//导出getRedisClient函数