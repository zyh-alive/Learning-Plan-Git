// ========== 订单控制器：订单从创建到完成/取消的全流程 + 金币冻结/退回/释放 ==========
//
// 阅读顺序建议：
// 1. 先看下面的 freezeLifecycleState、syncConsultantBusyFromOrders（两个内部辅助函数）
// 2. 再看 createOrder → payOrder → acceptOrder → requestStart → respondStart → completeOrder / cancelOrder
//
// 订单状态：pending(待支付) → paidAt 有值后顾问可见（存活时间从此刻起算，默认 24h）→ accepted … → completed
//          超时未接单 → expired，freeze_records 追加 refunded，原因「订单过期」，金币退回客户
// 金币：支付时扣用户、写 frozen；完成时写 released、加顾问；取消/过期/拒绝时写 refunded、退用户
//
const { Op } = require('sequelize');
const Order = require('../models/Order');
const ConsultantProfile = require('../models/ConsultantProfile');
const ConsultantService = require('../models/ConsultantService');
const UserProfile = require('../models/UserProfile');
const jwt = require('jsonwebtoken');
const sse = require('../config/sse');        // 顾问端 SSE：新订单推送给顾问
const sseUser = require('../config/sseUser'); // 用户端 SSE：邀请开始服务推送给用户
const { JWT_SECRET: JWT_SSE_SECRET } = require('../utils/verifyAccessToken');
const sequelize = require('../config/database');
const FundTransaction = require('../models/FundTransaction');
/** 默认待接单存活时间：24 小时（秒） */
const DEFAULT_SURVIVAL_SECONDS = 86400;//24*3600=86400
/** 存活时间下限，防止误配为 0 */
const MIN_SURVIVAL_SECONDS = 60;//60秒

/** 加急默认窗口 1 小时；加急失败后普通单接单截止 = 下单后 24h（与需求一致） */
const DEFAULT_RUSH_DURATION_SECONDS = 3600;
const MIN_RUSH_DURATION_SECONDS = 60;
const MAX_RUSH_DURATION_SECONDS = 86400;
const NORMAL_DEADLINE_FROM_CREATED_SECONDS = 86400;

function computeRushFeeFromOrderPrice(price) {
    const p = Number(price);
    if (!Number.isFinite(p) || p <= 0) return 0;
    return Number((p / 2).toFixed(2));
}

/** 在事务内：退回指定 purpose 的 frozen（main / rush） */
async function appendRefundForFrozenByPurpose(order, purpose, reason, transaction) {
    const orderId = order.orderId;
    const where =
        purpose === 'rush'
            ? { orderId, fundStatus: 'frozen', purpose: 'rush' }
            : {
                  orderId,
                  fundStatus: 'frozen',
                  [Op.or]: [{ purpose: 'main' }, { purpose: { [Op.is]: null } }]
              };
    //查冻结记录
    const fr = await FundTransaction.findOne({
        where,
        order: [['operatedAt', 'ASC']],
        transaction,
        lock: transaction.LOCK.UPDATE
    });
    if (!fr) return false;
    const amt = Number(fr.transactionAmount);//冻结金额
    //查用户资料,更新用户剩余金额
    const profile = await UserProfile.findOne({
        where: { userId: order.userId },
        transaction,
        lock: transaction.LOCK.UPDATE
    });
    const cprof = await ConsultantProfile.findOne({
        where: { consultantId: order.consultantId },
        transaction,
        lock: transaction.LOCK.UPDATE
    });//查顾问资料
    if (profile) {
        profile.coin = Math.round((Number(profile.coin || 0) + amt) * 100) / 100;
        await profile.save({ transaction });//更新用户剩余金额
    }
    await FundTransaction.createFundTransaction(
        {
            orderId,
            userId: order.userId,
            consultantId: order.consultantId,
            transactionType: '订单取消退款',
            transactionAmount: amt,
            fundStatus: 'refunded',
            customerBalanceAfter: profile.coin || 0,
            consultantBalanceAfter: cprof.coin || 0,
            operatedAt: new Date(),
            reason: reason || '退回冻结金币',
            purpose: fr.purpose
        },
        { transaction }
    );
    console.log(
        `[订单金币] 退回冻结 订单#${orderId} purpose=${purpose} 用户#${order.userId} 金额=${amt} 原因=${reason || ''}`
    );
    return true;
}

/** 仅退订单本金 frozen（订单整单过期） */
async function appendRefundForFrozenOrder(order, reason, transaction) {
    return appendRefundForFrozenByPurpose(order, 'main', reason, transaction);
}

/** 退尽本单所有仍冻结中的款项（取消订单等） */
async function appendRefundAllFrozen(order, reason, transaction) {
    let any = false;
    if (await appendRefundForFrozenByPurpose(order, 'rush', reason, transaction)) any = true;
    if (await appendRefundForFrozenByPurpose(order, 'main', reason, transaction)) any = true;
    return any;
}

//查是否有主订单款冻结或释放
async function hasMainPaymentFrozenOrReleased(orderId) {
    const row = await FundTransaction.findOne({
        where: {
            orderId,
            fundStatus: { [Op.in]: ['frozen', 'released'] },
            [Op.or]: [{ purpose: 'main' }, { purpose: { [Op.is]: null } }]//主订单款或没有purpose
        }
    });
    return !!row;//是否有主订单款冻结或释放
}

//查是否有加急款冻结
async function hasActiveRushFrozen(orderId) {
    const row = await FundTransaction.findOne({
        where: { orderId, purpose: 'rush', fundStatus: 'frozen' }
    });
    return !!row;//是否有加急款冻结
}

//获取订单接单截止时间
//如果订单状态为加急待接并且订单的加急截止时间存在，则用R接收这个时间戳，如果这个时间戳是数字就返回R
//如果订单状态不是待接单或者订单完成支付的时间为空（没支付），则返回null
//定义sec是订单的存活时间
//如果订单的接单截止时间存在，则用T接收这个时间戳，如果这个时间戳是数字就返回T
//返回订单完成支付的时间戳加上sec乘以1000
function getOrderAcceptDeadlineMs(order) {
    if (order.status === 'pending_rush' && order.rushExpiresAt) {//rushExpiresAt是加急接单截止时间
        const r = new Date(order.rushExpiresAt).getTime();//new Date()是将时间对象转化为时间戳，.getTime()是将时间戳转化为毫秒，1970.1.1 00:00:00 到现在的毫秒数
        if (!Number.isNaN(r)) return r;//Number.isNaN()是检查是否为数字，不是数字返回true，是数字返回false 
    }
    if (order.status !== 'pending' || !order.paidAt) return null;//status是订单状态，pending是待接单，!order.paidAt是未支付
    const sec = Math.max(MIN_SURVIVAL_SECONDS, Number(order.survivalSeconds) || DEFAULT_SURVIVAL_SECONDS);//Math.max()是取最大值，MIN_SURVIVAL_SECONDS是最小存活时间，Number(order.survivalSeconds)是订单存活时间，DEFAULT_SURVIVAL_SECONDS是默认存活时间
    if (order.expiresAt) {
        return new Date(order.expiresAt).getTime();//new Date()是将时间对象转化为时间戳，.getTime()是将时间戳转化为毫秒，1970.1.1 00:00:00 到现在的毫秒数
    }
    return new Date(order.paidAt).getTime() + sec * 1000;//new Date()是将时间对象转化为时间戳，.getTime()是将时间戳转化为毫秒，1970.1.1 00:00:00 到现在的毫秒数
}

/** 查某订单的资金状态（多笔冻结并存时：有 released 优先；否则有 frozen；否则全 refunded） */
async function freezeLifecycleState(orderId) {
    const rows = await FundTransaction.findAll({
        where: { orderId },
        order: [['operatedAt', 'ASC']]
    });
    if (!rows.length) return 'unpaid';
    if (rows.some((r) => r.fundStatus === 'released')) return 'released';
    if (rows.some((r) => r.fundStatus === 'frozen')) return 'frozen';
    if (rows.length && rows.every((r) => r.fundStatus === 'refunded')) return 'refunded';
    return 'refunded';
}

/** 根据该顾问是否还有「服务中」订单，更新顾问的空闲/忙碌状态（1=空闲 2=忙碌） */
async function syncConsultantBusyFromOrders(consultantId) {
    if (consultantId == null) return;
    const cid = Number(consultantId);
    const n = await Order.count({ where: { consultantId: cid, status: 'in_service' } });
    await ConsultantProfile.update({ workStatus: n > 0 ? 2 : 1 }, { where: { consultantId: cid } });
}
////////////////////////////////就是下面这俩函数是掉电不丢失核心函数，其他都是辅助函数////////////////////////////
/**
 * 已支付、仍待接单且已超过截止时间 → 退款、状态改为 expired
 * @returns {boolean} 是否刚被置为过期
 */
async function expireIfStaleByOrderId(orderId) {
    const transaction = await sequelize.transaction();
    try {
        const order = await Order.findOne({
            where: { orderId },
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!order || order.status !== 'pending' || !order.paidAt) {
            await transaction.commit();
            return false;
        }

        const deadlineMs = getOrderAcceptDeadlineMs(order);//deadlineMs是接单截止时间
        if (deadlineMs == null || Number.isNaN(deadlineMs)) {//Number.isNaN()是检查是否为数字，不是数字返回true，是数字返回false
            await transaction.commit();
            return false;
        }
        

        //过期逻辑判断：如果当前时间戳小于等于接单截止时间，则将订单状态改为过期
        if (Date.now() <= deadlineMs) {//Date.now()是当前时间戳，deadlineMs是接单截止时间
            if (!order.expiresAt) {
                order.expiresAt = new Date(deadlineMs);//new Date()是将时间对象转化为时间戳，.getTime()是将时间戳转化为毫秒，1970.1.1 00:00:00 到现在的毫秒数
                await order.save({ transaction });
            }
            await transaction.commit();
            return false;
        }

        const refunded = await appendRefundForFrozenOrder(order, '订单过期', transaction);
        if (!refunded) {
            await transaction.commit();
            return false;
        }

        order.status = 'expired';
        order.expiredAt = new Date();//过期处理时间
        order.cancelReason = '订单超时未接单';
        if (!order.expiresAt) {
            order.expiresAt = new Date(deadlineMs);
        }
        await order.save({ transaction });
        await transaction.commit();

        const cid = order.consultantId != null ? Number(order.consultantId) : null;
        if (cid) {
            sse.notifyConsultant(cid, { type: 'order_cancelled', orderId: order.orderId });
            await syncConsultantBusyFromOrders(cid);
        }
        console.log(`[订单过期] 订单#${orderId} 已自动退款并标记 expired`);
        return true;
    } catch (e) {
        await transaction.rollback();
        throw e;
    }
}

/**
 * 加急窗口结束仍无人接单：只退加急冻结款，订单回到 pending，接单截止改为 createdAt+24h
 */
async function expireRushIfStaleByOrderId(orderId) {
    const transaction = await sequelize.transaction();
    try {
        const order = await Order.findOne({
            where: { orderId },
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!order || order.status !== 'pending_rush' || !order.rushPaidAt || !order.rushExpiresAt) {
            await transaction.commit();
            return false;
        }
        const rushEnd = new Date(order.rushExpiresAt).getTime();
        if (Number.isNaN(rushEnd) || Date.now() <= rushEnd) {
            await transaction.commit();
            return false;
        }

        const refunded = await appendRefundForFrozenByPurpose(order, 'rush', '加急过期', transaction);
        if (!refunded) {
            await transaction.commit();
            return false;
        }

        order.status = 'pending';
        order.rushPaidAt = null;
        order.rushExpiresAt = null;
        const createdMs = new Date(order.createdAt).getTime();
        order.expiresAt = new Date(createdMs + NORMAL_DEADLINE_FROM_CREATED_SECONDS * 1000);
        await order.save({ transaction });
        await transaction.commit();

        const cid = order.consultantId != null ? Number(order.consultantId) : null;
        if (cid) {
            sse.notifyConsultant(cid, { type: 'consultant_reload_orders' });
        }
        console.log(`[加急过期] 订单#${orderId} 已退加急款，恢复为普通待接单，新截止=${order.expiresAt}`);
        return true;
    } catch (e) {
        await transaction.rollback();
        throw e;
    }
}

/** 定时任务：加急超时 → 普通单；普通待接单超时 → expired */
async function runPendingOrderExpirySweep() {
    const rushRows = await Order.findAll({
        where: { status: 'pending_rush' },
        attributes: ['orderId']
    });
    let nr = 0;
    for (const r of rushRows) {
        try {
            if (await expireRushIfStaleByOrderId(r.orderId)) nr += 1;//如果加急订单超时，则nr加1
        } catch (err) {
            console.error(`[加急过期扫描] 订单#${r.orderId}`, err);
        }
    }
    if (nr > 0) {
        console.log(`[加急过期扫描] 本轮处理 ${nr} 笔`);
    }

    const rows = await Order.findAll({
        where: { status: 'pending', paidAt: { [Op.ne]: null } },
        attributes: ['orderId']
    });
    let n = 0;
    for (const r of rows) {
        try {
            if (await expireIfStaleByOrderId(r.orderId)) n += 1;
        } catch (err) {
            console.error(`[订单过期扫描] 订单#${r.orderId}`, err);
        }
    }
    if (n > 0) {
        console.log(`[订单过期扫描] 本轮过期 ${n} 笔`);
    }
}

exports.runPendingOrderExpirySweep = runPendingOrderExpirySweep;

/** 订单 ID 统一为数字，避免 object 键 123 与 "123" 对不上导致查不到售后流水 */
function normOrderIdKey(id) {
    if (id == null || id === '') return null;
    const n = Number(id);
    return Number.isFinite(n) ? n : null;
}

/** 将售后退款流水按 orderId 建映射（已按 operatedAt DESC，只保留每单第一条） */
function buildAfterSaleRefundTxByOrderId(transactions) {
    const map = {};
    if (!transactions || !transactions.length) return map;
    for (const tx of transactions) {
        const plain =
            tx && typeof tx.get === 'function'
                ? tx.get({ plain: true })
                : tx && typeof tx === 'object'
                  ? { ...tx }
                  : null;
        if (!plain) continue;
        const oid = plain.orderId != null ? plain.orderId : plain.order_id;
        const key = normOrderIdKey(oid);
        if (key == null || map[key] != null) continue;
        map[key] = plain;
    }
    return map;
}

/** 从流水行取出原因类型、详情（兼容 camelCase / snake_case） */
function afterSaleReasonFromTxRow(row) {
    if (!row || typeof row !== 'object') {
        return { servicingReasonType: null, servicingRefundDetails: null };
    }
    const tRaw = row.servicingReasonType != null ? row.servicingReasonType : row.servicing_reason_type;
    const dRaw = row.servicingRefundDetails != null ? row.servicingRefundDetails : row.servicing_refund_details;
    const t = tRaw != null && String(tRaw).trim() !== '' ? String(tRaw).trim() : null;
    const d = dRaw != null && String(dRaw).trim() !== '' ? String(dRaw).trim() : null;
    return { servicingReasonType: t, servicingRefundDetails: d };
}

const ACTIVE_DUPLICATE_STATUSES = [
    'pending',
    'pending_rush',
    'accepted',
    'start_invited',
    'in_service',
]; // 这些状态下不允许同人同顾问再下一单

// ================================ 用户创建订单：POST /api/order/create ================================
// 客户选顾问、服务类型、填需求；不扣款，订单状态 pending，顾问此时看不到（只推已支付的）
//创建订单步骤：1.查顾问存不存在 2.查服务类型存不存在 3.查重 4.创建订单 5.查用户姓名
exports.createOrder = async (req, res) => {
    try {
        const role = req.user.role || 'user';
        const userId = req.user.userId;
        if (role !== 'user' || !userId) {
            return res.status(403).json({ message: '仅登录客户可向顾问下单' });
        }

        const { consultantId, serviceType, serviceContent, survivalSeconds: survivalBody } = req.body;//survivalSeconds: survivalBody是存活时间
        const cid = parseInt(consultantId, 10);
        if (!cid || cid <= 0) {
            return res.status(400).json({ message: '请选择顾问' });
        }
        const consultant = await ConsultantProfile.findOne({
            where: { consultantId: cid }
        });
        if (!consultant) {
            return res.status(404).json({ message: '顾问不存在' });
        }

        if (!serviceType || !serviceContent) {
            return res.status(400).json({ message: '请填写服务类型与需求描述' });
        }

        const typeTrim = String(serviceType).trim();
        const svc = await ConsultantService.findByConsultantAndType(cid, typeTrim);
        if (!svc) {
            return res.status(400).json({ message: '该顾问未提供此类服务，请从已注册的业务类型中选择' });
        }
        //查重：同一用户同一顾问同一服务类型同一状态的订单
        const existingOrder = await Order.findOne({
            where: {
                userId,
                consultantId: cid,
                serviceType: typeTrim,
                status: { [Op.in]: ACTIVE_DUPLICATE_STATUSES }
            },
            order: [['createdAt', 'DESC']]
        });

        if (existingOrder) {
            return res.status(400).json({
                message: '您已有一个进行中的订单，请结束或取消后再下单',
                data: {
                    orderId: existingOrder.orderId,
                    status: existingOrder.status,
                    createdAt: existingOrder.createdAt
                }
            });
        }//到这里查重成功
        //计算存活时间
        ////好神经
        let survivalSeconds = DEFAULT_SURVIVAL_SECONDS;//默认存活时间24小时
        if (survivalBody != null && survivalBody !== '') {//survivalBody是存活时间
            const s = parseInt(survivalBody, 10);//parseInt()是将字符串转换为数字，10是进制，survivalBody是存活时间
            if (!Number.isNaN(s)) {//Number.isNaN()是检查是否为数字，不是数字返回true，是数字返回false
                survivalSeconds = Math.min(604800, Math.max(MIN_SURVIVAL_SECONDS, s));//Math.min()是取最小值，Math.max()是取最大值，MIN_SURVIVAL_SECONDS是最小存活时间，s是存活时间，604800是7天，7*24*3600=604800
            }
        }
        const order = await Order.createOrder({//创建订单
            userId,
            consultantId: cid,
            serviceType: typeTrim,
            serviceContent: String(serviceContent).trim(),
            price: svc.price,
            status: 'pending',
            survivalSeconds//24小时存活时间
        });
        //到这里创建订单成功
        console.log(
            `[订单金币] 用户下单(尚未扣款) 订单#${order.orderId} 用户#${userId} 顾问#${cid} 应付金额=${order.price}`
        );

        let userName = null;
        try {
            const prof = await UserProfile.findOne({
                where: { userId },
                attributes: ['name']
            });
            if (prof && prof.name) userName = String(prof.name).trim() || null;//String()是将对象转换为字符串，.trim()是去除字符串两端的空格，|| null是如果用户名不存在，则返回null
        } catch (e) { /* ignore */ }//获取下单用户的姓名

        res.status(201).json({
            message: '订单已创建，请尽快完成支付后顾问方可接单',
            data: {
                orderId: order.orderId,
                consultantId: order.consultantId,
                status: order.status,
                price: order.price,
                createdAt: order.createdAt,
                paidAt: null,
                needPay: true,
                survivalSeconds: order.survivalSeconds != null ? Number(order.survivalSeconds) : DEFAULT_SURVIVAL_SECONDS
            }
        });
    } catch (err) {
        console.error('创建订单错误:', err);
        res.status(500).json({ message: '服务器错误' });
    }
};

// ================================ 客户「我的订单」列表：GET /api/order/list ================================
exports.getList = async (req, res) => {
    try {
        const role = req.user.role || 'user';
        const userId = req.user.userId;
        if (role !== 'user' || !userId) {
            return res.status(403).json({ message: '仅客户可查看订单列表' });
        }
        await runPendingOrderExpirySweep();
        const rows = await Order.findByUserId(userId);//rows：订单列表
        //afterSaleOrderIds：售后完成订单ID列表
        const afterSaleOrderIds = rows
            .filter((r) => r.status === 'servicing_completed')//筛选出售后完成订单
            .map((r) => r.orderId);//筛选出售后完成订单ID列表，双层循环
        let afterSaleByOrderId = {};
        if (afterSaleOrderIds.length) {
            const refundTxs = await FundTransaction.findAll({
                where: {
                    userId,
                    orderId: { [Op.in]: afterSaleOrderIds },
                    transactionType: '售后退款'
                },
                attributes: ['orderId', 'servicingReasonType', 'servicingRefundDetails'],
                order: [['operatedAt', 'DESC']]
            });
            afterSaleByOrderId = buildAfterSaleRefundTxByOrderId(refundTxs);
        }
        const cids = [...new Set(rows.map((r) => r.consultantId).filter(Boolean))];
        let nameByCid = {};
        if (cids.length) {
            const profiles = await ConsultantProfile.findAll({
                where: { consultantId: cids },
                attributes: ['consultantId', 'name']
            });
            nameByCid = Object.fromEntries(
                profiles.map((p) => [p.consultantId, p.name || null])
            );
        }
        const list = rows.map((o) => {
            const deadlineMs = getOrderAcceptDeadlineMs(o);
            const acceptRemainingSec =
                (o.status === 'pending' || o.status === 'pending_rush') &&
                o.paidAt &&
                deadlineMs != null
                    ? Math.max(0, Math.floor((deadlineMs - Date.now()) / 1000))
                    : null;
            const rushFeeSuggested = computeRushFeeFromOrderPrice(o.price);
            const oidKey = normOrderIdKey(o.orderId);
            const asRow = oidKey != null ? afterSaleByOrderId[oidKey] : null;
            const afterSaleFields = afterSaleReasonFromTxRow(asRow);
            return {
                orderId: o.orderId,
                consultantId: o.consultantId,
                consultantName: o.consultantId ? nameByCid[o.consultantId] ?? null : null,
                status: o.status,
                price: o.price,
                serviceType: o.serviceType,
                serviceContent: o.serviceContent,
                createdAt: o.createdAt,
                acceptedAt: o.acceptedAt || null,
                paidAt: o.paidAt || null,
                survivalSeconds: o.survivalSeconds != null ? Number(o.survivalSeconds) : DEFAULT_SURVIVAL_SECONDS,
                expiresAt: o.expiresAt || null,
                acceptRemainingSec,
                expiredAt: o.expiredAt || null,
                cancelReason: o.cancelReason || null,
                rushDescription: o.rushDescription || null,
                rushFee: o.rushFee != null ? Number(o.rushFee) : null,
                rushDurationSeconds: o.rushDurationSeconds != null ? Number(o.rushDurationSeconds) : null,
                rushPaidAt: o.rushPaidAt || null,
                rushExpiresAt: o.rushExpiresAt || null,
                rushFeeSuggested,
                rushPayAvailable:
                    o.status === 'pending' &&
                    o.paidAt &&
                    rushFeeSuggested > 0,
                servicingReasonType: afterSaleFields.servicingReasonType,
                servicingRefundDetails: afterSaleFields.servicingRefundDetails
            };
        });
        res.json({ message: '获取成功', data: { list } });
    } catch (err) {
        console.error('订单列表错误:', err);
        res.status(500).json({ message: '服务器错误' });
    }
};

// ================================
// 用户订单详情（用于开始服务确认页）- GET /api/order/detail/:orderId
// ================================
exports.getOrderDetail = async (req, res) => {
    try {
        const role = req.user.role || '';
        const userId = req.user.userId;
        const consultantId = req.user.consultantId;
        const orderId = parseInt(req.params.orderId, 10);
        if (!orderId || orderId <= 0) {
            return res.status(400).json({ message: '订单 ID 无效' });
        }
        await expireRushIfStaleByOrderId(orderId);
        await expireIfStaleByOrderId(orderId);
        const order = await Order.findByOrderId(orderId);
        if (!order) {
            return res.status(404).json({ message: '订单不存在' });
        }
        if (role === 'user' && order.userId !== userId) {
            return res.status(403).json({ message: '无权查看' });
        }
        if (role === 'consultant' && Number(order.consultantId) !== Number(consultantId)) {
            return res.status(403).json({ message: '无权查看' });
        }
        if (!['user', 'consultant'].includes(role)) {
            return res.status(403).json({ message: '无权查看' });
        }
        let consultantName = null;
        if (order.consultantId) {
            const cp = await ConsultantProfile.findOne({
                where: { consultantId: order.consultantId },
                attributes: ['name']
            });
            consultantName = cp && cp.name ? String(cp.name).trim() : null;
        }
        let userName = null;
        if (order.userId) {
            const up = await UserProfile.findOne({
                where: { userId: order.userId },
                attributes: ['name']
            });
            userName = up && up.name ? String(up.name).trim() : null;
        }
        const deadlineMs = getOrderAcceptDeadlineMs(order);
        const acceptRemainingSec =
            (order.status === 'pending' || order.status === 'pending_rush') &&
            order.paidAt &&
            deadlineMs != null
                ? Math.max(0, Math.floor((deadlineMs - Date.now()) / 1000))
                : null;
        const rushFeeSuggested = computeRushFeeFromOrderPrice(order.price);
        const rushPayAvailable =
            order.status === 'pending' &&
            order.paidAt &&
            !(await hasActiveRushFrozen(order.orderId)) &&
            rushFeeSuggested > 0;
        res.json({
            message: '获取成功',
            data: {
                orderId: order.orderId,
                userId: order.userId,
                userName,
                status: order.status,
                serviceType: order.serviceType,
                serviceContent: order.serviceContent,
                price: order.price,
                consultantId: order.consultantId,
                consultantName,
                createdAt: order.createdAt,
                paidAt: order.paidAt || null,
                survivalSeconds: order.survivalSeconds != null ? Number(order.survivalSeconds) : DEFAULT_SURVIVAL_SECONDS,
                expiresAt: order.expiresAt || null,
                acceptRemainingSec,
                expiredAt: order.expiredAt || null,
                cancelReason: order.cancelReason || null,
                rushDescription: order.rushDescription || null,
                rushFee: order.rushFee != null ? Number(order.rushFee) : null,
                rushDurationSeconds: order.rushDurationSeconds != null ? Number(order.rushDurationSeconds) : null,
                rushPaidAt: order.rushPaidAt || null,
                rushExpiresAt: order.rushExpiresAt || null,
                rushFeeSuggested,
                rushPayAvailable
            }
        });
    } catch (err) {
        console.error('订单详情错误:', err);
        res.status(500).json({ message: '服务器错误' });
    }
};

// ================================ 客户取消订单：PUT /api/order/:orderId/cancel ================================
// 若已支付过，会在 freeze_records 追加一行 refunded 并退回用户金币
exports.cancelOrder = async (req, res) => {//export
    try {
        const role = req.user.role || 'user';
        const userId = req.user.userId;
        if (role !== 'user' || !userId) {
            return res.status(403).json({ message: '仅登录客户可取消订单' });
        }

        const orderId = parseInt(req.params.orderId, 10);
        if (!orderId || orderId <= 0) {
            return res.status(400).json({ message: '订单 ID 格式错误' });
        }

        const order = await Order.findByOrderId(orderId);
        if (!order) {
            return res.status(404).json({ message: '订单不存在' });
        }
        if (order.userId !== userId) {
            return res.status(403).json({ message: '无权取消此订单' });
        }
        if (!['pending', 'pending_rush', 'accepted', 'start_invited', 'in_service'].includes(order.status)) {
            return res.status(400).json({ message: `当前状态不可取消` });
        }

        const { cancelReason } = req.body;
        const reason = cancelReason ? String(cancelReason).trim().slice(0, 255) : null;
        const consultCid = order.consultantId != null ? Number(order.consultantId) : null;

        const coinState = await freezeLifecycleState(orderId);
        const transaction = await sequelize.transaction();
        try {
            if (coinState === 'frozen') {
                let freezeReason = '顾客取消订单';
                if (order.status === 'in_service') {
                    freezeReason = reason && reason.length ? reason : '顾客对订单不满意';
                }
                await appendRefundAllFrozen(order, freezeReason, transaction);
            }

            order.status = 'cancelled';
            order.cancelledAt = new Date();
            order.cancelReason = reason;
            await order.save({ transaction });
            await transaction.commit();
        } catch (e) {
            await transaction.rollback();
            throw e;
        }

        if (consultCid) {
            sse.notifyConsultant(consultCid, { type: 'order_cancelled', orderId: order.orderId });
            await syncConsultantBusyFromOrders(consultCid);
        }

        res.json({
            message:
                coinState === 'frozen' ? '订单已取消，已付金额已退回您的账户' : '订单已取消',
            data: {
                orderId: order.orderId,
                status: order.status,
                cancelledAt: order.cancelledAt,
                cancelReason: order.cancelReason
            }
        });
    } catch (err) {
        console.error('取消订单错误:', err);
        res.status(500).json({ message: '服务器错误' });
    }
};

// ================================
// 顾问 SSE
// ================================
exports.consultantSseStream = (req, res) => {
    const token = req.query.token;
    if (!token) {
        return res.status(401).json({ message: '缺少 token' });
    }
    jwt.verify(token, JWT_SSE_SECRET, (err, user) => {
        if (err || (user.role || '') !== 'consultant' || user.consultantId == null) {
            return res.status(403).json({ message: '仅顾问可订阅' });
        }
        const cid = Number(user.consultantId);
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        if (typeof res.flushHeaders === 'function') res.flushHeaders();

        sse.addConnection(cid, res);
        res.write(`data: ${JSON.stringify({ type: 'connected', consultantId: cid })}\n\n`);

        const keepAlive = setInterval(() => {
            try {
                res.write(': ping\n\n');
            } catch (e) {
                clearInterval(keepAlive);
            }
        }, 25000);

        req.on('close', () => {
            clearInterval(keepAlive);
            sse.removeConnection(cid, res);
        });
    });
};

// ================================
// 用户 SSE（开始服务邀请等）
// ================================
exports.userSseStream = (req, res) => {
    const token = req.query.token;
    if (!token) {
        return res.status(401).json({ message: '缺少 token' });
    }
    jwt.verify(token, JWT_SSE_SECRET, (err, user) => {
        if (err || (user.role || '') !== 'user' || user.userId == null) {
            return res.status(403).json({ message: '仅客户可订阅' });
        }
        const uid = Number(user.userId);
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        if (typeof res.flushHeaders === 'function') res.flushHeaders();

        sseUser.addUserConnection(uid, res);
        res.write(`data: ${JSON.stringify({ type: 'connected', userId: uid })}\n\n`);

        const keepAlive = setInterval(() => {
            try {
                res.write(': ping\n\n');
            } catch (e) {
                clearInterval(keepAlive);
            }
        }, 25000);

        req.on('close', () => {
            clearInterval(keepAlive);
            sseUser.removeUserConnection(uid, res);
        });
    });
};
// ================================
// 顾问订单列表
// ================================
function orderToConsultantPayload(o, userName) {
    const deadlineMs = getOrderAcceptDeadlineMs(o);
    const acceptRemainingSec =
        (o.status === 'pending' || o.status === 'pending_rush') &&
        o.paidAt &&
        deadlineMs != null
            ? Math.max(0, Math.floor((deadlineMs - Date.now()) / 1000))
            : null;
    return {
        orderId: o.orderId,
        userId: o.userId,
        userName: userName || null,
        serviceType: o.serviceType,
        serviceContent: o.serviceContent,
        price: o.price,
        status: o.status,
        flowStatus: o.status,
        createdAt: o.createdAt,
        paidAt: o.paidAt || null,
        survivalSeconds: o.survivalSeconds != null ? Number(o.survivalSeconds) : DEFAULT_SURVIVAL_SECONDS,
        expiresAt: o.expiresAt || null,
        acceptRemainingSec,
        acceptedAt: o.acceptedAt || null,
        completedAt: o.completedAt || null,
        cancelledAt: o.cancelledAt || null,
        expiredAt: o.expiredAt || null,
        cancelReason: o.cancelReason || null,
        isRush: o.status === 'pending_rush',
        rushDescription: o.rushDescription || null,
        rushFee: o.rushFee != null ? Number(o.rushFee) : null,
        rushDurationSeconds: o.rushDurationSeconds != null ? Number(o.rushDurationSeconds) : null,
        rushExpiresAt: o.rushExpiresAt || null,
        rushPaidAt: o.rushPaidAt || null,
        updatedAt: o.updatedAt || null
    };
}

// ================================
// 顾问订单列表
// ================================
exports.getConsultantOrders = async (req, res) => {
    try {
        const role = req.user.role || '';
        const consultantId = req.user.consultantId;
        if (role !== 'consultant' || !consultantId) {
            return res.status(403).json({ message: '仅顾问可查看' });
        }
        const cid = Number(consultantId);
        // 待接单 + 进行中
        await runPendingOrderExpirySweep();

        const rows = await Order.findAll({
            where: {
                consultantId: cid,
                [Op.or]: [
                    { status: 'pending', paidAt: { [Op.ne]: null } },//操作符：ne：不等于
                    { status: 'pending_rush', paidAt: { [Op.ne]: null } },//操作符：ne：不等于
                    { status: { [Op.in]: ['accepted', 'start_invited', 'in_service', 'pending_review'] } }//操作符：in：包含
                ]//
            },
            order: [['createdAt', 'ASC']]
        });
        // 已完成（含已完成、已取消）
        const doneRows = await Order.findAll({
            where: {
                consultantId: cid,
                status: { [Op.in]: ['completed', 'cancelled', 'expired'] }
            },
            order: [['updatedAt', 'DESC']]
        });
        const afterSaleRows = await Order.findAll({
            where: { consultantId: cid, status: 'servicing_completed' },
            order: [['updatedAt', 'DESC']]
        });//售后完成订单列表
        const allUids = [
            ...new Set([
                ...rows.map((r) => r.userId),
                ...doneRows.map((r) => r.userId),
                ...afterSaleRows.map((r) => r.userId)
            ])
        ];//所有用户ID列表
        let nameMap = {};//用户名称映射
        if (allUids.length) {
            const profiles = await UserProfile.findAll({
                where: { userId: { [Op.in]: allUids } },
                attributes: ['userId', 'name']
            });
            nameMap = Object.fromEntries(
                profiles.map((p) => [p.userId, p.name ? String(p.name).trim() : null])
            );
        }
        const pending = [];
        const ongoing = [];
        for (const o of rows) {
            const item = orderToConsultantPayload(o, nameMap[o.userId]);
            if (o.status === 'pending' || o.status === 'pending_rush') pending.push(item);
            else ongoing.push(item);
        }
        const done = doneRows.map((o) => orderToConsultantPayload(o, nameMap[o.userId]));
        const afterOrderIds = afterSaleRows.map((r) => r.orderId);
        let refundByOrderId = {};
        if (afterOrderIds.length) {
            const refundTxs = await FundTransaction.findAll({
                where: {
                    orderId: { [Op.in]: afterOrderIds },
                    transactionType: '售后退款'
                },
                attributes: [
                    'orderId',
                    'servicingReasonType',
                    'servicingRefundDetails',
                    'operatedAt',
                    'transactionAmount'
                ],
                order: [['operatedAt', 'DESC']]
            });
            refundByOrderId = buildAfterSaleRefundTxByOrderId(refundTxs);
        }
        const afterSales = afterSaleRows.map((o) => {
            const base = orderToConsultantPayload(o, nameMap[o.userId]);
            const oidKey = normOrderIdKey(o.orderId);
            const fr = oidKey != null ? refundByOrderId[oidKey] : null;
            const reason = afterSaleReasonFromTxRow(fr);
            const opAt = fr && (fr.operatedAt != null ? fr.operatedAt : fr.operated_at);
            const amtRaw = fr && (fr.transactionAmount != null ? fr.transactionAmount : fr.transaction_amount);
            return {
                ...base,
                servicingReasonType: reason.servicingReasonType,
                servicingRefundDetails: reason.servicingRefundDetails,
                refundOperatedAt: opAt || null,
                refundAmount: amtRaw != null && amtRaw !== '' ? Number(amtRaw) : null
            };
        });
        res.json({
            message: '获取成功',
            data: { pending, ongoing, done, afterSales }
        });
    } catch (err) {
        console.error('顾问订单列表错误:', err);
        res.status(500).json({ message: '服务器错误' });
    }
};

// ================================
// 顾问接单 → 空闲（非忙碌，除非已有服务中订单）
// ================================
exports.acceptOrder = async (req, res) => {
    try {
        const role = req.user.role || '';
        const consultantId = req.user.consultantId;
        if (role !== 'consultant' || !consultantId) {
            return res.status(403).json({ message: '仅顾问可接单' });
        }
        const cid = Number(consultantId);
        const orderId = parseInt(req.params.orderId, 10);
        if (!orderId || orderId <= 0) {
            return res.status(400).json({ message: '订单 ID 无效' });
        }
        await expireRushIfStaleByOrderId(orderId);
        await expireIfStaleByOrderId(orderId);
        const order = await Order.findByOrderId(orderId);
        if (!order || Number(order.consultantId) !== cid) {
            return res.status(404).json({ message: '订单不存在' });
        }
        if (order.status === 'expired') {
            return res.status(400).json({ message: '订单已过期，无法接单' });
        }
        if (order.status !== 'pending' && order.status !== 'pending_rush') {
            return res.status(400).json({ message: '当前状态不可接单' });
        }
        if (!order.paidAt) {
            return res.status(400).json({ message: '客户尚未付款，无法接单' });
        }
        order.status = 'accepted';
        order.acceptedAt = new Date();
        await order.save();
        await syncConsultantBusyFromOrders(cid);

        sseUser.notifyUser(order.userId, {
            type: 'order_accepted',
            orderId: order.orderId
        });

        res.json({
            message: '已接单（当前为空闲，开始服务需客户确认后您将变为忙碌）',
            data: { orderId: order.orderId, status: order.status }
        });
    } catch (err) {
        console.error('接单错误:', err);
        res.status(500).json({ message: '服务器错误' });
    }
};

// ================================
// 顾问发起「开始服务」→ 等客户确认
// ================================
exports.requestStart = async (req, res) => {
    try {
        const role = req.user.role || '';
        const consultantId = req.user.consultantId;
        if (role !== 'consultant' || !consultantId) {
            return res.status(403).json({ message: '仅顾问可操作' });
        }
        const cid = Number(consultantId);
        const orderId = parseInt(req.params.orderId, 10);
        if (!orderId) {
            return res.status(400).json({ message: '订单 ID 无效' });
        }
        const order = await Order.findByOrderId(orderId);
        if (!order || Number(order.consultantId) !== cid) {
            return res.status(404).json({ message: '订单不存在' });
        }
        if (order.status !== 'accepted') {
            return res.status(400).json({ message: '仅「已接单」订单可发起开始服务' });
        }
        order.status = 'start_invited';
        await order.save();
        await syncConsultantBusyFromOrders(cid);

        const cp = await ConsultantProfile.findOne({
            where: { consultantId: cid },
            attributes: ['name']
        });
        const consultantName = cp && cp.name ? String(cp.name).trim() : null;

        sseUser.notifyUser(order.userId, {
            type: 'start_service_invite',
            orderId: order.orderId,
            consultantName,
            serviceType: order.serviceType,
            price: order.price,
            message: '顾问邀请您确认开始服务，请前往确认页面同意或拒绝'
        });

        res.json({
            message: '已发送开始服务邀请，等待客户确认',
            data: { orderId: order.orderId, status: order.status }
        });
    } catch (err) {
        console.error('requestStart:', err);
        res.status(500).json({ message: '服务器错误' });
    }
};

// ================================
// 客户同意/拒绝开始服务
// ================================
exports.respondStart = async (req, res) => {
    try {
        const role = req.user.role || '';
        const userId = req.user.userId;
        if (role !== 'user' || !userId) {
            return res.status(403).json({ message: '仅客户可操作' });
        }
        const orderId = parseInt(req.params.orderId, 10);
        if (!orderId) {
            return res.status(400).json({ message: '订单 ID 无效' });
        }
        const agree = req.body && (req.body.agree === true || req.body.agree === 'true');
        const order = await Order.findByOrderId(orderId);
        if (!order || order.userId !== userId) {
            return res.status(404).json({ message: '订单不存在' });
        }
        if (order.status !== 'start_invited') {
            return res.status(400).json({ message: '当前无需确认或已处理' });
        }
        const consultCid = order.consultantId != null ? Number(order.consultantId) : null;

        if (agree) {
            order.status = 'in_service';
            await order.save();
        } else {
            const transaction = await sequelize.transaction();
            try {
                const st = await freezeLifecycleState(orderId);
                if (st === 'frozen') {
                    await appendRefundAllFrozen(order, '顾客取消订单（拒绝开始服务）', transaction);
                    console.log(`[订单金币] 拒绝开始-退回 订单#${orderId} 用户#${userId}（本金+加急如有）`);
                }
                order.status = 'cancelled';
                order.cancelledAt = new Date();
                order.cancelReason = '客户拒绝开始服务';
                await order.save({ transaction });
                await transaction.commit();
            } catch (e) {
                await transaction.rollback();
                throw e;
            }
        }

        if (consultCid) {
            await syncConsultantBusyFromOrders(consultCid);
            sse.notifyConsultant(consultCid, { type: 'consultant_reload_orders' });
            if (!agree) {
                sse.notifyConsultant(consultCid, { type: 'order_cancelled', orderId });
            }
        }

        res.json({
            message: agree ? '已同意开始服务' : '已拒绝，订单已取消，已付金额已退回您的账户',
            data: { orderId: order.orderId, status: order.status }
        });
    } catch (err) {
        console.error('respondStart:', err);
        res.status(500).json({ message: '服务器错误' });
    }
};

// ================================
// 顾问完成订单（仅服务中）
// 资金：与本事务内写入 pending_review 同步——顾问点击「完成服务」即视为服务结束，
// 先追加 freeze released + 顾问加币，再改订单为待评价；进入「待评价」时资金已释放给顾问，与客户是否评价无关。
// ================================
exports.completeOrder = async (req, res) => {
    try {
        const role = req.user.role || '';
        const consultantId = req.user.consultantId;
        if (role !== 'consultant' || !consultantId) {
            return res.status(403).json({ message: '仅顾问可操作' });
        }
        const cid = Number(consultantId);
        const orderId = parseInt(req.params.orderId, 10);
        if (!orderId || orderId <= 0) {
            return res.status(400).json({ message: '订单 ID 无效' });
        }
        const order = await Order.findByOrderId(orderId);
        if (!order || Number(order.consultantId) !== cid) {
            return res.status(404).json({ message: '订单不存在' });
        }
        if (order.status !== 'in_service') {
            return res.status(400).json({ message: '仅「服务中」订单可标记完成' });
        }
        const coinState = await freezeLifecycleState(orderId);
        if (coinState !== 'frozen') {
            return res.status(400).json({ message: '订单资金状态异常，无法结算' });
        }

        const transaction = await sequelize.transaction();
        try {
            const frozens = await FundTransaction.findAll({
                where: { orderId, fundStatus: 'frozen' },
                order: [['operatedAt', 'ASC']],//按操作时间排序
                transaction,
                lock: transaction.LOCK.UPDATE
            });//查冻结记录
            if (!frozens.length) {
                await transaction.rollback();
                return res.status(400).json({ message: '订单资金状态异常，无法结算' });
            }
            let total = 0;
            for (const fr of frozens) {
                total += Number(fr.transactionAmount);
            }
            total = Number(total.toFixed(2));
            const cprof = await ConsultantProfile.findOne({
                where: { consultantId: cid },//顾问ID别名cid
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            //profile：用户资料
            const profile = await UserProfile.findOne({
                where: { userId: order.userId },
                transaction,
                lock: transaction.LOCK.UPDATE
            });//查用户资料
            const beforeC = cprof ? Number(cprof.coin || 0) : 0;
            cprof.coin = Math.round((beforeC + total) * 100) / 100;
            cprof.totalOrders = Number(cprof.totalOrders || 0) + 1;  // 顾问表订单数随订单完成自增
            await FundTransaction.createFundTransaction(
                {
                    orderId,
                    userId: order.userId,
                    consultantId: cid,
                    transactionType: '消费',
                    transactionAmount: total,
                    fundStatus: 'released',
                    consultantBalanceAfter: cprof.coin || 0,
                    customerBalanceAfter: profile.coin || 0,
                    operatedAt: new Date(),
                    reason: '完成服务（订单款+加急款）',
                    purpose: 'main'
                },
                { transaction }
            );
              
            await cprof.save({ transaction });

            order.status = 'pending_review';//订单状态改为待评价
            await order.save({ transaction });//保存订单
            await transaction.commit();
            if (cprof) {
                console.log(
                    `[订单金币] 完成结算 订单#${orderId} 顾问#${cid} 到账+${total} 顾问金币 ${beforeC}->${beforeC + total}（追加 released）`
                );
            } else {
                console.warn(
                    `[订单金币] 完成结算 订单#${orderId} 顾问#${cid} 已追加 released 但顾问资料缺失，未加金币`
                );
            }
        } catch (e) {
            await transaction.rollback();
            throw e;
        }

        await syncConsultantBusyFromOrders(cid);
        const stillInService = await Order.count({
            where: { consultantId: cid, status: 'in_service' }
        });
        res.json({
            message:
                stillInService > 0
                    ? '已标记服务结束，等待客户评价后订单完成（仍有服务中的单，仍为忙碌）'
                    : '已标记服务结束，等待客户评价后订单完成；金币已到账，您已切换为空闲',
            data: { orderId: order.orderId, status: order.status }
        });
    } catch (err) {
        console.error('完成订单错误:', err);
        res.status(500).json({ message: '服务器错误' });
    }
};

// ================================ 客户支付：POST /api/order/:orderId/pay ================================
// 扣用户金币，在 freeze_records 插入一行 frozen，订单写 paidAt，并通过 SSE 推给顾问「有新订单」
exports.payOrder = async (req, res) => {
    try {
        const role = req.user.role || 'user';
        const userId = req.user.userId;
        if (role !== 'user' || !userId) {
            return res.status(403).json({ message: '仅客户可支付' });
        }
        const orderId = parseInt(req.params.orderId, 10);
        if (!orderId || orderId <= 0) {
            return res.status(400).json({ message: '订单 ID 无效' });
        }
        await expireRushIfStaleByOrderId(orderId);
        await expireIfStaleByOrderId(orderId);
        const order = await Order.findByOrderId(orderId);
        if (!order || order.userId !== userId) {
            return res.status(404).json({ message: '订单不存在' });
        }
        if (['pending_review', 'completed', 'cancelled', 'expired'].includes(order.status)) {//includes：包含，判断order.status是否在['pending_review', 'completed', 'cancelled', 'expired']范围内
            return res.status(400).json({ message: '订单已结束，无法支付' });
        }
        if (await hasMainPaymentFrozenOrReleased(orderId)) {
            return res.status(400).json({ message: '该订单已支付或已处理，无需重复付款' });
        }

        const price = Number(order.price);
        if (price <= 0 || Number.isNaN(price)) {
            return res.status(400).json({ message: '订单金额无效' });
        }

        const transaction = await sequelize.transaction();
        try {
            const profile = await UserProfile.findOne({
                where: { userId },
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            const cprof = await ConsultantProfile.findOne({
                where: { consultantId: order.consultantId },
                transaction,
                lock: transaction.LOCK.UPDATE
            });//查顾问资料
            if (!profile) {
                await transaction.rollback();
                return res.status(404).json({ message: '用户资料不存在' });
            }
            const coin = Number(profile.coin || 0);
            if (coin < price) {
                await transaction.rollback();
                return res.status(400).json({
                    message: `金币不足，当前 ${coin}，需支付 ${price}，请先充值`
                });
            }
            const balanceAfter = Math.round((coin - price) * 100) / 100;
            profile.coin = balanceAfter;
            await profile.save({ transaction });
            //创建冻结记录
            await FundTransaction.createFundTransaction(
                {
                    orderId,
                    userId,
                    consultantId: order.consultantId,
                    transactionType: '消费',
                    transactionAmount: price,
                    fundStatus: 'frozen',
                    operatedAt: new Date(),
                    reason: '用户付款',
                    purpose: 'main',
                    customerBalanceAfter: balanceAfter,
                    consultantBalanceAfter: cprof.coin || 0,
                },
                { transaction }
            );
            const paidNow = new Date();
            order.paidAt = paidNow;
            const sec = Math.max(MIN_SURVIVAL_SECONDS, Number(order.survivalSeconds) || DEFAULT_SURVIVAL_SECONDS);
            order.expiresAt = new Date(paidNow.getTime() + sec * 1000);
            await order.save({ transaction });
            await transaction.commit();
            console.log(
                `[订单金币] 支付扣款 订单#${orderId} 用户#${userId} 金额=${price} 用户余额 ${coin}->${balanceAfter}（freeze_records.frozen）`
            );
        } catch (e) {
            await transaction.rollback();
            throw e;
        }

        let userName = null;
        try {
            const prof = await UserProfile.findOne({ where: { userId }, attributes: ['name'] });
            if (prof && prof.name) userName = String(prof.name).trim() || null;
        } catch (e) { /* ignore */ }

        sse.notifyConsultant(Number(order.consultantId), {
            type: 'new_order',
            order: {
                orderId: order.orderId,
                userId,
                userName,
                serviceType: order.serviceType,
                serviceContent: order.serviceContent,
                price: order.price,
                status: order.status,
                createdAt: order.createdAt,
                paidAt: order.paidAt,
                expiresAt: order.expiresAt,
                survivalSeconds: order.survivalSeconds
            }
        });
        res.json({
            message: '支付成功，等待顾问接单',
            data: {
                orderId: order.orderId,
                paidAt: order.paidAt,
                expiresAt: order.expiresAt || null,
                survivalSeconds: order.survivalSeconds != null ? Number(order.survivalSeconds) : DEFAULT_SURVIVAL_SECONDS,
                newBalance: (await UserProfile.findOne({ where: { userId }, attributes: ['coin'] }))?.coin
            }
        });
    } catch (err) {
        console.error('支付错误:', err);
        res.status(500).json({ message: '服务器错误' });
    }
};

// ================================ 加急：预览 GET /api/order/:orderId/rush/preview ================================
exports.getRushPreview = async (req, res) => {
    try {
        const role = req.user.role || 'user';
        const userId = req.user.userId;
        if (role !== 'user' || !userId) {
            return res.status(403).json({ message: '仅客户可查看' });
        }
        const orderId = parseInt(req.params.orderId, 10);
        if (!orderId || orderId <= 0) {
            return res.status(400).json({ message: '订单 ID 无效' });
        }
        await expireRushIfStaleByOrderId(orderId);
        await expireIfStaleByOrderId(orderId);
        const order = await Order.findByOrderId(orderId);
        if (!order || order.userId !== userId) {
            return res.status(404).json({ message: '订单不存在' });
        }
        if (order.status !== 'pending' || !order.paidAt) {
            return res.status(400).json({
                message: '仅「已付款、待接单」的普通订单可加急，请刷新订单列表后重试'
            });
        }
        if (await hasActiveRushFrozen(orderId)) {
            return res.status(400).json({ message: '加急款项处理中，请勿重复操作' });
        }
        const rushFee = computeRushFeeFromOrderPrice(order.price);
        if (rushFee <= 0) {
            return res.status(400).json({ message: '订单金额无效，无法加急' });
        }
        res.json({
            message: '获取成功',
            data: {
                orderId: order.orderId,
                price: order.price,
                rushFee,
                rushDurationSeconds: DEFAULT_RUSH_DURATION_SECONDS,
                rushDescription: order.rushDescription || ''
            }
        });
    } catch (err) {
        console.error('加急预览错误:', err);
        res.status(500).json({ message: '服务器错误' });
    }
};

// ================================ 加急：支付 POST /api/order/:orderId/rush/pay ================================
exports.payRushOrder = async (req, res) => {
    try {
        const role = req.user.role || 'user';
        const userId = req.user.userId;
        if (role !== 'user' || !userId) {
            return res.status(403).json({ message: '仅客户可支付加急费' });
        }
        const orderId = parseInt(req.params.orderId, 10);
        if (!orderId || orderId <= 0) {
            return res.status(400).json({ message: '订单 ID 无效' });
        }
        await expireRushIfStaleByOrderId(orderId);
        await expireIfStaleByOrderId(orderId);
        const order = await Order.findByOrderId(orderId);
        if (!order || order.userId !== userId) {
            return res.status(404).json({ message: '订单不存在' });
        }
        if (order.status !== 'pending' || !order.paidAt) {
            return res.status(400).json({ message: '当前状态不可支付加急费，请刷新后重试' });
        }
        if (await hasActiveRushFrozen(orderId)) {
            return res.status(400).json({ message: '请勿重复支付加急费' });
        }

        const rushFee = computeRushFeeFromOrderPrice(order.price);
        if (rushFee <= 0 || Number.isNaN(rushFee)) {
            return res.status(400).json({ message: '加急费用计算异常' });
        }

        const rushDescription =
            req.body.rushDescription != null
                ? String(req.body.rushDescription).trim().slice(0, 500)
                : '';
        let rushDurationSeconds = parseInt(req.body.rushDurationSeconds, 10);
        if (Number.isNaN(rushDurationSeconds)) {
            rushDurationSeconds = DEFAULT_RUSH_DURATION_SECONDS;
        }
        rushDurationSeconds = Math.min(
            MAX_RUSH_DURATION_SECONDS,
            Math.max(MIN_RUSH_DURATION_SECONDS, rushDurationSeconds)
        );

        const transaction = await sequelize.transaction();
        try {
            const profile = await UserProfile.findOne({
                where: { userId },
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            const cprof = await ConsultantProfile.findOne({
                where: { consultantId: order.consultantId },
                transaction,
                lock: transaction.LOCK.UPDATE
            });//查顾问资料
            if (!profile) {
                await transaction.rollback();
                return res.status(404).json({ message: '用户资料不存在' });
            }
            const coin = Number(profile.coin || 0);
            if (coin < rushFee) {
                await transaction.rollback();
                return res.status(400).json({
                    message: `金币不足，当前 ${coin}，加急需支付 ${rushFee}，请先充值`
                });
            }
            const afterRush = Math.round((coin - rushFee) * 100) / 100;
            profile.coin = afterRush;
            await profile.save({ transaction });

            await FundTransaction.createFundTransaction(
                {
                    orderId,
                    userId,
                    consultantId: order.consultantId,
                    transactionType: '消费',
                    transactionAmount: rushFee,
                    fundStatus: 'frozen',
                    operatedAt: new Date(),
                    reason: '加急付款',
                    purpose: 'rush',
                    customerBalanceAfter: afterRush,
                    consultantBalanceAfter: cprof.coin || 0,
                },
                { transaction }
            );

            const rushNow = new Date();
            order.rushDescription = rushDescription || null;
            order.rushFee = rushFee;
            order.rushDurationSeconds = rushDurationSeconds;
            order.rushPaidAt = rushNow;
            order.rushExpiresAt = new Date(rushNow.getTime() + rushDurationSeconds * 1000);
            order.status = 'pending_rush';
            await order.save({ transaction });
            await transaction.commit();
            console.log(
                `[订单加急] 订单#${orderId} 用户#${userId} 加急费=${rushFee} 时长=${rushDurationSeconds}s 截止=${order.rushExpiresAt}`
            );
        } catch (e) {
            await transaction.rollback();
            throw e;
        }

        const cid = order.consultantId != null ? Number(order.consultantId) : null;
        if (cid) {
            sse.notifyConsultant(cid, { type: 'consultant_reload_orders' });
        }

        res.json({
            message: '加急付款成功，顾问将优先看到本单并在加急时限内接单',
            data: {
                orderId: order.orderId,
                status: order.status,
                rushFee,
                rushExpiresAt: order.rushExpiresAt,
                rushDurationSeconds,
                newBalance: (await UserProfile.findOne({ where: { userId }, attributes: ['coin'] }))?.coin
            }
        });
    } catch (err) {
        console.error('加急支付错误:', err);
        res.status(500).json({ message: '服务器错误' });
    }
};
