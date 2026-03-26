// config/index.js
const fs = require('fs');//文件系统模块，用于读取文件
const path = require('path');//路径模块，用于处理路径
const yaml = require('js-yaml');//yaml模块，用于解析yaml文件
require('dotenv').config();//.config()是读取根目录中的.env文件，并将其加载到process.env中，process.env是环境变量对象

// 1. 读取 config.yaml 文件
const configPath = path.join(__dirname, 'config.yaml');//join是路径拼接，__dirname表示当前文件的目录，config.yaml表示yaml文件名
const configFile = fs.readFileSync(configPath, 'utf8');//readFileSync是同步(会阻塞代码直到读取文件完成)读取文件，参数1是文件路径，参数2是编码方式,返回字符串
let config = yaml.load(configFile);//load是解析yaml文件，返回一个对象（解析的js对象），赋值给config变量，把yaml文本变成可操作的js对象

// 2. 替换环境变量（把 ${XXX} 变成真实值）
function replaceEnvVars(obj) {//替换环境变量，参数obj是一个对象
    if (typeof obj === 'string') {//typeof是判断类型，obj是字符串
        // 匹配 ${VAR_NAME} 格式
        const match = obj.match(/^\${(.*)}$/);//match是匹配，参数1是正则表达式，返回一个数组，match[1]是环境变量名
        //例如：['${DB_PASSWORD}', 'DB_PASSWORD']
        // 索引0：完整匹配
        // 索引1：捕获组的内容
        if (match) {
            const envValue = process.env[match[1]];//process.env是环境变量对象，match[1]是环境变量名,核心是读取.env文件中的环境变量！！！！！！！！！！！1
            if (envValue === undefined) {//undefined是未定义，表示环境变量未设置
                console.warn(`⚠️ 环境变量 ${match[1]} 未设置`);//console.warn是警告输出，参数1是字符串，参数2是变量
                return obj;
            }
            return envValue;
        }
        return obj;
    }
    if (Array.isArray(obj)) {//Array.isArray是数组对象，用于判断是否为数组
        return obj.map(item => replaceEnvVars(item));//例如 ['${VAR1}', '${VAR2}']，递归调用replaceEnvVars函数
    }
    if (obj && typeof obj === 'object') {//obj && typeof obj === 'object'是判断obj是否为对象
        const result = {};//result是对象，用于存储结果
        for (const [key, value] of Object.entries(obj)) {//Object.entries是对象对象，用于遍历对象，参数1是对象，参数2是键值对
            result[key] = replaceEnvVars(value);//例如 {key1: '${VAR1}', key2: '${VAR2}'}，递归调用replaceEnvVars函数
        }
        return result; //例如 {key1: 'value1', key2: 'value2'}
    }
    return obj;
}
config = replaceEnvVars(config);//替换环境变量，参数1是config对象

// 3. 导出配置
module.exports = config;