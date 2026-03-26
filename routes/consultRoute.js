// ========== 顾问列表/详情路由：/api/consultants/* ==========
const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth');
const consultController = require('../controllers/consultController');

router.get('/list', authenticateToken, consultController.getList);   // 顾问列表（客户选顾问时用）
router.get('/:id', authenticateToken, consultController.getDetail); // 某个顾问的详情

module.exports = router;
