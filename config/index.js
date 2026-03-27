// config/index.js
// 加载顺序：1）config.yaml（非数据库业务配置）2）config.json（仅数据库，与 sequelize-cli 同源）
// 合并后导出：database 来自 json 当前环境，其余来自 yaml；均经 replaceEnvVars 替换 ${...}

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
require('dotenv').config();



const yamlPath = path.join(__dirname, 'config.yaml');//yaml配置文件路径
const jsonPath = path.join(__dirname, 'config.json');//json配置文件路径

const yamlRaw = yaml.load(fs.readFileSync(yamlPath, 'utf8'));//yaml配置文件内容 转为对象
const yamlConfig = replaceEnvVars(yamlRaw);//替换${...}为环境变量

const jsonRaw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const jsonConfig = replaceEnvVars(jsonRaw);

const env = process.env.NODE_ENV || 'development';//为了支持多环境，这里默认是development
const db = jsonConfig[env];//根据环境变量获取数据库配置
if (!db) {
    throw new Error(`config.json 中缺少环境 "${env}"，请检查 NODE_ENV 与 config.json`);
}//如果数据库配置不存在，则抛出错误

const defaultPool = { max: 5, min: 0, acquire: 30000, idle: 10000 };//默认连接池配置

const config = {
    ...yamlConfig,
    database: {
        name: db.database,
        user: db.username,
        password: db.password,
        host: db.host,
        port: db.port,
        dialect: db.dialect,
        pool: db.pool || defaultPool
    }
};
/**
 * 将对象中的 "${VAR_NAME}" 字符串递归替换为 process.env[VAR_NAME]（与 .env 配合）。
 */
function replaceEnvVars(obj) {
    console.log('obj是：', obj);
    if (typeof obj === 'string') {
        const match = obj.match(/^\${(.*)}$/);
        if (match) {
            const envValue = process.env[match[1]];
            if (envValue === undefined) {
                console.warn(`⚠️ 环境变量 ${match[1]} 未设置`);
                return obj;
            }
            return envValue;
        }
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map((item) => replaceEnvVars(item));
    }
    if (obj && typeof obj === 'object') {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            result[key] = replaceEnvVars(value);
        }
        return result;
    }
    return obj;
}

module.exports = {
    ...config,
    replaceEnvVars
};
