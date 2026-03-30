/*
// 路由前缀：/api/tippings（见 routes/tippingRoutes.js、server.js）
//1.用户打赏顾问 - POST /api/tippings/add
//2.顾问查询订单打赏列表 - GET /api/tippings/userTippingList
// 业务：用户打赏顾问
*/
const Tipping = require('../models/Tipping');
const UserProfile = require('../models/UserProfile');
const ConsultantProfile = require('../models/ConsultantProfile');
const Order = require('../models/Order');
const FundTransaction = require('../models/FundTransaction');
const sequelize = require('../config/database');

//1.用户打赏顾问 - POST /api/tippings/:orderId
exports.addTipping = async (req, res) => {
    try {
        const role = req.user.role || 'user';
        const userId = req.user.userId;
        if (role !== 'user' || !userId) {
            return res.status(403).json({ message: '仅登录客户可打赏顾问' });
        }
        const orderId = parseInt(req.params.orderId, 10);
        if (!orderId) {
            return res.status(400).json({ message: '订单ID无效' });
        }
        const tipAmount= req.body.tipAmount;
        if (tipAmount <= 0) {
            return res.status(400).json({ message: '打赏金额无效' });
        }
        const transaction = await sequelize.transaction();//开启事务，转账事务，保证数据一致性  
        try{
            const order = await Order.findOne({
                where: { orderId },
                attributes: ['userId', 'consultantId'],
                transaction,
                lock: transaction.LOCK.UPDATE
                 });
            if (!order) {
                await transaction.rollback();
                return res.status(404).json({ message: '订单不存在' });
            }
            const consultantId = order.consultantId;
            if (consultantId == null) {
                await transaction.rollback();
                return res.status(400).json({ message: '订单无承接顾问，无法打赏' });
            }
            // 不可只查 attributes: ['coin']：实例无主键时 save() 会报 “no primary key”
            const profile = await UserProfile.findOne({
                where: { userId: order.userId },
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            if (!profile) {
                await transaction.rollback();
                return res.status(404).json({ message: '用户资料不存在' });
            }
            const cprof = await ConsultantProfile.findOne({
                where: { consultantId: order.consultantId },
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            if (!cprof) {
                await transaction.rollback();
                return res.status(404).json({ message: '顾问资料不存在' });
            }
            const coin = Number(profile.coin || 0);
            if (coin < tipAmount) {
                await transaction.rollback();
                return res.status(400).json({ message: '打赏金额不能超过用户剩余金额' });
            }
            const afterCoin = Math.round((coin - tipAmount) * 100) / 100;
            profile.coin = afterCoin;
            await profile.save({ transaction });
            const afterCprofCoin = Math.round((cprof.coin + tipAmount) * 100) / 100;
            cprof.coin = afterCprofCoin;
            await cprof.save({ transaction });
            // 必须与上面同一 transaction：否则 INSERT 走另一条连接，外键检查要等本事务对 orders 等的锁 → ER_LOCK_WAIT_TIMEOUT
            const tipping = await Tipping.create(
                { userId, orderId, consultantId, tipAmount },
                { transaction }
            );
            await FundTransaction.createFundTransaction({ 
                userId, 
                transactionType: '打赏',
                transactionAmount: tipAmount,
                fundStatus: 'completed',
                operatedAt: new Date(),
                reason: '打赏顾问',
                purpose: 'main',
                orderId, 
                consultantId, 
                customerBalanceAfter: afterCoin,
                consultantBalanceAfter: afterCprofCoin,
            }, { transaction });
            await transaction.commit();
            return res.status(200).json({ message: '打赏顾问成功', tipping });
        } catch (error) {
            await transaction.rollback();
            console.error('打赏顾问失败:', error);
            return res.status(500).json({ message: '打赏顾问失败' });
        }
    } catch (error) {
        console.error('打赏顾问失败:', error);
        return res.status(500).json({ message: '打赏顾问失败' });
    }
};

