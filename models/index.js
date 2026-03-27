'use strict';

/**
 * 统一挂载所有模型（与 config/database.js 同一 Sequelize 实例）。
 * 业务代码可继续 require('../models/Order')，也可 require('../models').Order。
 */

const sequelize = require('../config/database');
const { Sequelize } = require('sequelize');

// 顺序：先被其它文件 require 的在前（如 UserProfile → UserAuth）
const UserAuth = require('./UserAuth');
const UserProfile = require('./UserProfile');
const ConsultantAuth = require('./ConsultantAuth');
const ConsultantProfile = require('./ConsultantProfile');
const ConsultantService = require('./ConsultantService');
const FundTransaction = require('./FundTransaction');
const Order = require('./Order');
const OrderChatMessage = require('./OrderChatMessage');
const OrderReview = require('./OrderReview');

const db = {
    sequelize,
    Sequelize,
    UserAuth,
    UserProfile,
    ConsultantAuth,
    ConsultantProfile,
    ConsultantService,
    FundTransaction,
    Order,
    OrderChatMessage,
    OrderReview
};

module.exports = db;



