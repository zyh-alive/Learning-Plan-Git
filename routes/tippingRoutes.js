const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth');
const tippingController = require('../controllers/tippingController');

router.post('/:orderId', authenticateToken, tippingController.addTipping);
// 顾问打赏列表请使用 GET /api/reviews/consultant/tippings-review-feed（reviewController）

module.exports = router;