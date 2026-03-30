// ========== 评价相关路由：/api/reviews/* ==========
// 与订单支付、接单等解耦；模型仍用 Order、OrderReview（数据与订单关联）

const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth');
const reviewController = require('../controllers/reviewController');

// 以下 GET 须写在 POST /:orderId 之前，避免将来若增加 GET /:x 时被误匹配（consultant、consultants 等字面路径优先）
// 顾客：查看某顾问的已评价订单列表（原 /api/consultants/:id/reviews）
router.get('/consultants/:id/reviews', authenticateToken, reviewController.listPublicConsultantReviews);
// 顾问：本人订单与评价列表（原 /api/order/consultant/orders-review-feed）
router.get('/consultant/orders-review-feed', authenticateToken, reviewController.listOwnerConsultantOrdersFeed);
// 顾问：本人只包含已评价的订单评价列表（原 /api/order/consultant/reviews-review-feed）
router.get('/consultant/reviews-review-feed', authenticateToken, reviewController.listOwnerConsultantReviewsFeed);
// 顾问：本人只包含已打赏的订单评价列表（原 /api/order/consultant/tippings-review-feed）
router.get('/consultant/tippings-review-feed', authenticateToken, reviewController.listOwnerConsultantTippingsFeed);
// 客户：对指定订单提交评价（订单须为待评价且归属当前用户）
router.post('/:orderId', authenticateToken, reviewController.submitReview);

module.exports = router;
