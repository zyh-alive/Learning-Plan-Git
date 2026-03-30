// controllers/paymentController.js — 仅负责支付宝下单与异步通知（验签、按业务类型分发）
const { AlipaySdk } = require('alipay-sdk');//v4.14.0版本导入的时候不需要
const config = require('../config');
const FundTransaction = require('../models/FundTransaction');

const alipaySdk = new AlipaySdk({
    appId: config.alipay.appId,
    privateKey: config.alipay.privateKey,
    alipayPublicKey: config.alipay.alipayPublicKey,
    gateway: config.alipay.gateway
});


/** 时间戳 + userId + 三位随机数，作为商户单号 / 支付宝 out_trade_no（仅存数字字符） */
function generateMerchantOrderId(userId) {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    return `${timestamp}${userId}${random}`;
}

/**
 * 创建电脑网站支付表单 HTML（由前端/浏览器在新窗口 document.write 后跳转支付宝）。
 * 电脑网站支付须用 pageExecute；exec() 走网关 HTTP+JSON，不会返回可跳转的支付页。
 * @param {number} amount 金额（元）
 * @param {string} outTradeNo 商户订单号，须与 fund_transactions.merchant_order_id 一致
 * @see https://github.com/alipay/alipay-sdk-nodejs-all#pageexecute-示例代码
 */
function createRechargeOrder(amount, outTradeNo) {
    try {
        // createRechargeOrder 函数开头
        console.log('🔍 config.alipay.notifyUrl:', config.alipay?.notifyUrl);
        const port = config.server?.port ?? 3003;//??是可选运算符，如果config.server.port不存在，则使用3003
        //如果config.alipay.returnUrl不存在，则使用http://localhost:3003/pay-result.html
        //用于在支付成功后返回到上一个页面
        const returnUrl =
            config.alipay.returnUrl || `http://localhost:${port}/pay-result.html`;
        return alipaySdk.pageExecute('alipay.trade.page.pay', 'POST', {//调用支付宝的页面支付接口，返回一个支付表单
            returnUrl,//支付宝的同步跳转地址，用于在支付成功后返回到上一个页面
            notifyUrl: config.alipay.notifyUrl,//支付宝的异步通知地址，用于在支付成功后通知服务器
            bizContent: {
                out_trade_no: outTradeNo,
                product_code: 'FAST_INSTANT_TRADE_PAY',
                //product_code: 'FAST_INSTANT_TRADE_PAY' 是支付宝的快速支付产品代码，用于表示这是一个快速支付订单。
                total_amount: amount.toString(),
                subject: `充值${amount}元`,
                //里面的notify_url和上面的notifyUrl要一致，否则支付宝会回调失败
                notify_url: config.alipay.notifyUrl//支付宝的异步通知地址，用于在支付成功后通知服务器
            },
            /*notifyUrl和notify_url的区别：外层（和 bizContent 平级）
            notifyUrl（驼峰）
            由alipay-sdk 库读取，SDK可能自动把它合并到请求里
            内层（bizContent 里面）
            notify_url（下划线）
            由支付宝服务器直接读取，优先级最高,写两遍为了百分百生效*/          
        });
    } catch (error) {
        console.error('支付宝支付接口调用失败:', error);
        throw error;
    }
}

/** 供 GET /api/pay/ping 返回，便于用隧道域名自测是否打到本机 */
//用来检测连接是否稳定，排查问题时先用ping排查隧道能否正常使用
exports.getNotifyUrlForDiagnostics = function getNotifyUrlForDiagnostics() {
    return String(config.alipay?.notifyUrl ?? '').trim();//？.安全操作运算符，不会因为不存在报错，会返回undefined
    //？？是可选运算符，如果config.alipay.notifyUrl不存在，则使用空字符串
};

/** 支付宝认为支付成功的通知状态 */
const ALIPAY_PAID_STATUSES = new Set(['TRADE_SUCCESS', 'TRADE_FINISHED']);

/**
 * 支付宝异步通知（POST）
 * 验签通过后按 FundTransaction.transactionType 分发；具体加币等逻辑在 rechargeController 等模块。
 */
exports.alipayCallback = async (req, res) => {
    try {
        const params = req.body;
        //console.log('收到支付宝回调:', params);    测试回调是否正常收到


        const verified = alipaySdk.checkNotifySign(params);//sdk验签，验证通知是否来自支付宝
        if (!verified) {
            console.error('签名验证失败');
            return res.status(400).send('fail');
        }


        //支付宝会一直重复调用本地的notifyurl，直到交易成功或失败，因此这个判断是为了过滤掉非成功状态，防止支付宝一直重发
        //例如，支付宝返回TRADE_SUCCESS则不进入这里，执行后续逻辑正常写入数据库
        //如果支付宝返回TRADE_CLOSED/WAIT_BUYER_PAY则进入这里，直接返回success，表示这个状态我不需要处理，避免无效浪费资源
        if (!ALIPAY_PAID_STATUSES.has(params.trade_status)) {
            return res.send('success');//返回成功，表示通知已经处理，这个返回是返回给支付宝（不是前端）
        }
        //参数校验，防止商户订单号为空
        const outTradeNo = params.out_trade_no != null ? String(params.out_trade_no).trim() : '';
        if (!outTradeNo) {
            console.error('缺少 out_trade_no');
            return res.status(400).send('fail');
        }

        const fundRow = await FundTransaction.findOne({ where: { merchantOrderId: outTradeNo } });
        if (!fundRow) {
            console.error('未找到流水 merchantOrderId:', outTradeNo);
            return res.status(400).send('fail');
        }
        if (fundRow.payStatus === 'success') {
            return res.send('success');
        }

        switch (fundRow.transactionType) {
            case '充值': {
                const rechargeController = require('./rechargeController');
                await rechargeController.applyAlipayRechargeSuccess(params, fundRow.transactionId);
                break;
            }
            default:
                console.error('未处理的支付宝回调业务类型:', fundRow.transactionType);
                return res.status(400).send('fail');
        }//后续添加别的支付情况时，直接在此添加case

        return res.send('success');
    } catch (error) {
        console.error('处理支付宝回调失败:', error);
        return res.status(500).send('fail');
    }
};

exports.createRechargeOrder = createRechargeOrder;
exports.generateMerchantOrderId = generateMerchantOrderId;
