// ========== 数据库连接：所有查库、写库都通过这个连接 ==========
// 别的文件用：const sequelize = require('../config/database'); 然后 sequelize.query / Model 都用它

const { Sequelize } = require('sequelize');
const config = require('./index');//导入配置文件

// 创建一个 MySQL 连接：数据库名、用户名、密码、主机、类型
const sequelize = new Sequelize(config.database.name, config.database.user, config.database.password, {
    host: config.database.host,   // 本机 MySQL
    dialect: config.database.dialect,    // 用的是 MySQL
    port: config.database.port,
    pool: {
        max: config.database.pool.max,
        min: config.database.pool.min,
        acquire: config.database.pool.acquire,
        idle: config.database.pool.idle,
    }
});

module.exports = sequelize;