'use strict';
/**
 * 供 sequelize-cli 使用：与 config.json 同源，先 dotenv 再替换 ${...}。
 * 运行迁移时请使用 package.json 中的脚本（带 --config config/config.js），勿依赖 .sequelizerc。
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { replaceEnvVars } = require('./index');

const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
module.exports = replaceEnvVars(raw);
