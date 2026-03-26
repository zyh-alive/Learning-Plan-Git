// ========== 充值相关路由：/api/recharge/* ==========
const express = require('express');
const router = express.Router();
const rechargeController = require('../controllers/rechargeController');
const authenticateToken = require('../middleware/auth');

router.post('/', authenticateToken, rechargeController.recharge);   // 充值：加用户金币，记一条充值记录
router.get('/history', authenticateToken, rechargeController.getHistory); // 当前用户的充值记录列表
router.get('/balance', authenticateToken, rechargeController.getBalance); // 当前用户金币余额
router.post('/withdraw', authenticateToken, rechargeController.withdraw); // 提现：减用户金币，记一条提现记录
router.get('/withdraw/history', authenticateToken, rechargeController.getWithdrawHistory); // 当前用户的提现记录列表
router.get('/withdraw/balance', authenticateToken, rechargeController.getWithdrawBalance); // 当前用户提现余额
router.get('/customerOrConsultant/history', authenticateToken, rechargeController.getCustomerOrConsultantHistory); // 查询当前顾客或者顾问的流水记录
module.exports = router;