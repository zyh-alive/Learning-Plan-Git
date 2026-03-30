// ========== 第三方支付回调：/api/pay/*（与业务路由分离，无需登录） ==========
const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');

// 用隧道公网域名访问此地址，确认请求能到达本机（支付宝回调打不到时先测这个）
router.get('/ping', (req, res) => {
    res.json({
        ok: true,
        message: '若能在浏览器打开本 JSON，说明公网已指到本服务；支付宝需 POST 到 notifyUrlConfigured',
        notifyPath: '/api/pay/notify/alipay',
        notifyUrlConfigured: paymentController.getNotifyUrlForDiagnostics()
    });
});//用于检测连接是否正常稳定

// 支付宝异步通知（POST，form-urlencoded）
router.post(
    '/notify/alipay',
    //这个地方的路由和.env中的回调地址要一致，排查问题时先用ping排查隧道能否正常使用，ping返回的notifyUrlConfigured就是回调地址
    (req, res, next) => {
        console.log(
            '[支付宝] 命中 POST /api/pay/notify/alipay，Content-Type:',
            req.headers['content-type'] || '(无)'
        );
        next();
    },
    express.urlencoded({ extended: false }),
    paymentController.alipayCallback
);

// 同步跳转（电脑网站支付 return_url 落地后可指向此地址）
router.get('/return/alipay', (req, res) => {
    res.redirect(302, '/pay-result.html');
});

module.exports = router;
