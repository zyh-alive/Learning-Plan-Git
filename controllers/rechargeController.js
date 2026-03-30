// 充值业务逻辑：用户充值金币

const FundTransaction = require('../models/FundTransaction');
const UserProfile = require('../models/UserProfile');
const ConsultantProfile = require('../models/ConsultantProfile');
const sequelize = require('../config/database');
const paymentController = require('./paymentController');
// ================================
// 用户充值金币 - POST /api/recharge
//说明：由原来的直接处理增减逻辑变成先生成订单并写入，在下面一个函数中进行支付完成后的记录更新
// ================================
exports.recharge = async (req, res) => {
    try {
        const role = req.user.role || 'user';
        const userId = req.user.userId;
        
        // 1. 身份校验
        if (role !== 'user' || !userId) {
            return res.status(403).json({ message: '仅登录客户可充值' });
        }

        // 2. 获取充值金额
        const rowAmount = req.body.transactionAmount!=null?req.body.transactionAmount:req.body.amount;
        const amountNum = Number(rowAmount);
        if (rowAmount==null || rowAmount===''||Number.isNaN(amountNum) || amountNum <= 0) {
            return res.status(400).json({ message: '充值金额必须大于 0' });
        }
        if (amountNum > 10000) {
            return res.status(400).json({ message: '单次充值金额不能超过 10000' });
        }

        const payChannel = String(req.body.payChannel || req.body.tradeType || 'alipay')
            .trim()
            .toLowerCase();
        if (payChannel === 'wechat') {
            return res.status(503).json({
                message: '微信支付即将开通，请暂时使用支付宝',
                payChannel: 'wechat'
            });
        }
        if (payChannel !== 'alipay') {
            return res.status(400).json({ message: '不支持的支付方式' });
        }

        // 3. 事务操作：创建待支付流水 + 调用支付宝
        const transaction = await sequelize.transaction();//开启事务，转账事务，保证数据一致性       
        try {
            // 查用户资料
            const profile = await UserProfile.findOne({
                where: { userId },
                transaction,
                lock: transaction.LOCK.UPDATE
                // 行锁，防止并发问题（一次一个请求只能操作一行数据）
                // 用户余额 100，同时发起两次充值 50
                // 请求A: 读取余额 = 100
                // 请求B: 读取余额 = 100
                // 请求A: 计算 100+50 = 150，写入 150
                // 请求B: 计算 100+50 = 150，写入 150

                // 最终余额：150 ❌ 应该是 200
                // 丢了 50 块钱！
            });
            
            if (!profile) {
                await transaction.rollback();
                return res.status(404).json({ message: '用户资料不存在' });
            }

            //后端幂等，防止重复多点，导致多条待支付订单
            const pendingOrder = await FundTransaction.findOne({
                where: {
                    userId,
                    transactionType: '充值',
                    payStatus: 'pending'
                },
                transaction,
            });
            if (pendingOrder) {
                await transaction.commit();
                return res.status(400).json({ message: '有待支付的订单，请先完成或取消之后再进行充值！' });
            }

            // 先生成商户单号，写入流水后再调支付宝（out_trade_no = merchantOrderId）
            //这次的写入流水是创建订单（支付订单），不是充值完成后的流水
            const merchantOrderId = paymentController.generateMerchantOrderId(userId);//生成随机商户订单号

            const fundRow = await FundTransaction.createFundTransaction(
                {
                    userId,
                    transactionType: '充值',
                    payStatus: 'pending',
                    fundStatus: 'frozen',
                    tradeType: 'alipay',
                    reason: '支付宝充值待支付',
                    purpose: null,
                    transactionAmount: amountNum,
                    customerBalanceAfter: profile.coin,
                    merchantOrderId,
                    operatedAt: new Date()
                },
                { transaction }
            );

            const payUrl = paymentController.createRechargeOrder(amountNum, merchantOrderId);
            //这里的payUrl是支付宝的支付表单，由前端/浏览器在新窗口 document.write 后跳转支付宝（包含支付宝的支付地址）
            //在recharge.html的319行

            // 提交事务
            await transaction.commit();//正式写入数据库
            res.json({
                message: '请前往支付',
                payUrl
            });

            /*// 4. 返回结果
            res.json({
                message: '充值成功',
                data: {
                    transactionAmount: amountNum,//交易金额
                    customerBalanceAfter: newBalance,//交易后顾客剩余金额
                    newBalance,//新余额
                   operatedAt: new Date()//操作时间
                }
            });*/
        } catch (err) {
            // 出错回滚
            await transaction.rollback();//回滚事务，保证数据一致性
            throw err;
        }
    } catch (err) {
        console.error('充值错误:', err);
        res.status(500).json({ message: '服务器错误' });
    }
};

/**
 * 支付宝异步通知：paymentController 验签并按类型分发后调用。
 * 只更新已存在的一条 FundTransaction（payStatus / fundStatus / 余额），不新建流水。
 */
exports.applyAlipayRechargeSuccess = async function applyAlipayRechargeSuccess(params, transactionId) {
    const t = await sequelize.transaction();
    try {
        const fundRow = await FundTransaction.findByPk(transactionId, {//查找流水
            transaction: t,//事务，保证数据一致性
            lock: t.LOCK.UPDATE
        });
        if (!fundRow || fundRow.transactionType !== '充值') {
            throw new Error('流水不存在或非充值类型');
        }
        if (fundRow.payStatus === 'success') {
            await t.commit();
            return;
        }
        if (fundRow.payStatus === 'failed') {
            throw new Error('充值流水已标记失败');
        }

        const paidCents = Math.round(Number(params.total_amount) * 100);
        //round四舍五入，乘以100转换为分，转换为整数，避免浮点数精度问题，因为钱可能会有小数点
        const expectCents = Math.round(Number(fundRow.transactionAmount) * 100);
        if (!Number.isFinite(paidCents) || !Number.isFinite(expectCents) || paidCents !== expectCents) {//判断是否为数字，并且是否相等
            throw new Error(
                `金额不一致: 通知 ${params.total_amount}(${paidCents}分) 流水 ${fundRow.transactionAmount}(${expectCents}分)`
            );
        }
        const paid = paidCents / 100;//转换为元

        const userId = fundRow.userId;//获取用户ID
        if (userId == null) {
            throw new Error('流水缺少 userId');
        }

        const profile = await UserProfile.findOne({
            where: { userId },
            transaction: t,
            lock: t.LOCK.UPDATE
        });
        if (!profile) {
            throw new Error('用户资料不存在');
        }
        //console.log('profile.coin是：', profile.coin);
        const oldBalance = Number(profile.coin || 0);
        //console.log('oldBalance是：', oldBalance);
        const newBalance = Math.round((oldBalance + paid) * 100) / 100;
        profile.coin = newBalance;
        //console.log('newBalance是：', newBalance);
        //console.log('profile.coin是：', profile.coin);
        await profile.save({ transaction: t });

        fundRow.payStatus = 'success';
        fundRow.fundStatus = 'completed';
        
        fundRow.customerBalanceAfter = newBalance;
        fundRow.transactionAmount = paid;
        const tradeNo = params.trade_no != null ? String(params.trade_no).trim() : '';
        if (!tradeNo) {
            throw new Error('支付宝回调缺少 trade_no');
        }
        fundRow.alipayTradeNo = tradeNo;//写入支付宝回调回来的交易号
        fundRow.operatedAt = new Date();
        fundRow.reason = '用户充值成功';
        await fundRow.save({ transaction: t });//这部分是对之前写入的更新

        await t.commit();
    } catch (e) {
        await t.rollback();
        throw e;
    }
};
// ================================
// 查询充值记录 - GET /api/recharge/history
// ================================
exports.getHistory = async (req, res) => {
    try {
        const role = req.user.role || 'user';
        const userId = req.user.userId;
        
        if (role !== 'user' || !userId) {
            return res.status(403).json({ message: '仅登录客户可查看充值记录' });
        }

        // 参数解析：默认每页 100 条，方便一页展示全部历史
        const { page = 1, limit } = req.query;
        let pageNum = parseInt(page, 10) || 1;
        let limitNum = limit !== undefined && limit !== '' ? parseInt(limit, 10) : 100;
        
        pageNum = Math.max(1, pageNum);
        limitNum = Math.min(500, Math.max(1, limitNum));
        
        const offset = (pageNum - 1) * limitNum;

        // 查询充值记录
        const { count, rows } = await FundTransaction.findAndCountAll({
            where: { userId, transactionType: '充值' },
            attributes: ['transactionId', 'transactionAmount', 'customerBalanceAfter', 'operatedAt'],
            limit: limitNum,
            offset,
            order: [['operatedAt', 'DESC']]
        });

        // 格式化返回
        const list = rows.map((item => {
            const row=item.toJSON()?item.toJSON():item;//安全转换：如果数据模型有 toJSON() 方法就调用，否则直接返回item
            const amt = row.transactionAmount;
            return {
                transactionId: row.transactionId,
                transactionAmount: amt,
                amount: amt,
                customerBalanceAfter: row.customerBalanceAfter,
                operatedAt: row.operatedAt
        };//返回到回调函数的结果数组中
    }));

        res.json({
            message: '获取成功',
            data: {
                list,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total: count,
                    totalPages: Math.ceil(count / limitNum)||1
                }
            }
        });
    } catch (err) {
        console.error('查询充值记录错误:', err);
        res.status(500).json({ message: '服务器错误' });
    }
};

// ================================
// 查询当前金币余额 - GET /api/recharge/balance
// ================================
exports.getBalance = async (req, res) => {
    try {
        const role = req.user.role || 'user';
        if (role === 'user') {
        const userId = req.user.userId;
            if (role !== 'user' && role !== 'consultant') {
                return res.status(403).json({ message: '请先登录' });
            }
            const profile = await UserProfile.findOne({
                where: { userId },
                attributes: ['coin']
            });
            if (!profile) {
                return res.status(404).json({ message: '用户资料不存在' });
            }
            return res.json({
                message: '获取成功',
                data: {
                    userId,
                    coin: profile.coin || 0
                }
            });
        }
        if (role === 'consultant') {
            const consultantId = req.user.consultantId;
            if (consultantId == null) {
                return res.status(403).json({ message: 'token 无效' });
            }
            const profile_consultant = await ConsultantProfile.findOne({
                where: { consultantId },
                attributes: ['coin']
            });
            if (!profile_consultant) {
                return res.status(404).json({ message: '顾问资料不存在' });
            }
            return res.json({
                message: '获取成功',
                data: {
                    consultantId,
                    coin: profile_consultant.coin || 0
                }
            });
        }
    } catch (err) {
        console.error('查询余额错误:', err);
        res.status(500).json({ message: '服务器错误' });
    }
};

//用户或顾问提现金币 - POST /api/transaction/withdraw
exports.withdraw = async (req, res) => {
    try {
        const role = req.user.role || 'user';
        const userId = req.user.userId;
        const consultantId = req.user.consultantId;
        
        // 1. 身份校验
            if (role !== 'user' && role !== 'consultant') {
            return res.status(403).json({ message: '仅登录客户可提现' });
        }

        // 2. 获取提现金额
        const rowAmount = req.body.transactionAmount!=null?req.body.transactionAmount:req.body.amount;
        const amountNum = Number(rowAmount);
        if (rowAmount==null || rowAmount===''||Number.isNaN(amountNum) || amountNum <= 0) {
            return res.status(400).json({ message: '提现金额必须大于 0' });
        }
        

        // 3. 事务操作：更新金币 + 创建提现记录
        const transaction = await sequelize.transaction();//开启事务，转账事务，保证数据一致性
        try {
            // 查用户资料
            const Model = role === 'user' ? UserProfile : ConsultantProfile;//动态选择模型
            const ID = role === 'user' ? {userId }: {consultantId};//动态选择ID
            const profile = await Model.findOne({
                where: { ...ID },
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            
            if (!profile) {
                await transaction.rollback();
                return res.status(404).json({ message: '用户资料不存在' });
            }
            //提现金额不能超过用户剩余金额
            if (amountNum > Number(profile.coin || 0)) {
                return res.status(400).json({ message: '提现金额不能超过用户剩余金额' });
            }
            // 计算提现后的余额
            const oldBalance = Number(profile.coin || 0);
            const newBalance = Math.round((oldBalance - amountNum) * 100) / 100;

            // 更新金币
            profile.coin = newBalance;
            await profile.save({ transaction });

            // 创建提现记录
            const condition_money = role === 'user' ? 'customerBalanceAfter' : 'consultantBalanceAfter';
            await FundTransaction.createFundTransaction({
                ...ID,
                transactionType: '提现',
                fundStatus: 'completed',
                reason: role === 'user' ? '用户提现成功' : '顾问提现成功',
                purpose: null,
                transactionAmount: amountNum,
                [condition_money]: newBalance,//[]取值，动态传入customerBalanceAfter或consultantBalanceAfter
                operatedAt: new Date(),
            }, { transaction });

            // 提交事务
            await transaction.commit();//正式写入数据库

            // 4. 返回结果
            res.json({
                message: '提现成功',
                data: {
                    transactionAmount: amountNum,
                    [condition_money]: newBalance,
                    newBalance,
                    operatedAt: new Date()
                }
            });
        } catch (err) {
            // 出错回滚
            await transaction.rollback();//回滚事务，保证数据一致性
            throw err;
        }
    } catch (err) {
        console.error('提现错误:', err);
        res.status(500).json({ message: '服务器错误' });
    }
};

//查询提现记录 - GET /api/transaction/withdraw/history
exports.getWithdrawHistory = async (req, res) => {
    try {
        const role = req.user.role || 'user';
        const userId = req.user.userId;
        const consultantId = req.user.consultantId;
        
        if (role !== 'user' && role !== 'consultant') {
            return res.status(403).json({ message: '仅登录客户可查看提现记录' });
        }
        const { page = 1, limit } = req.query;
        let pageNum = parseInt(page, 10) || 1;
        let limitNum = limit !== undefined && limit !== '' ? parseInt(limit, 10) : 100;
        
        pageNum = Math.max(1, pageNum);
        limitNum = Math.min(500, Math.max(1, limitNum));
        
        const offset = (pageNum - 1) * limitNum;
        const condition = role === 'user' ? {userId }: {consultantId};//condition：{userId:userId}或{consultantId:consultantId}
        const condition_money = role === 'user' ? 'customerBalanceAfter' : 'consultantBalanceAfter';//attribute不让传对象，只能传字符串
        
        const { count, rows } = await FundTransaction.findAndCountAll({
            where: { ...condition, transactionType: '提现' },//...condition解包，展开为userId和consultantId
            attributes: ['transactionId', 'transactionAmount', condition_money, 'operatedAt'],
            limit: limitNum,
            offset,
            order: [['operatedAt', 'DESC']]
        });
        console.log("查到了查到了查到了查到了查到了");
        // 格式化返回
        const list = rows.map((item => {
            const row=item.toJSON()?item.toJSON():item;
            const amt = row.transactionAmount;
            return {
                transactionId: row.transactionId,
                transactionAmount: amt,
                amount: amt,
                balanceAfter: row[condition_money],
                operatedAt: row.operatedAt
        };
    }));


        res.json({
            message: '获取成功',
            data: {
                list,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total: count,
                    totalPages: Math.ceil(count / limitNum)||1
                }
            }
        });
        console.log("l是",list);
    } catch (err) {
        console.error('查询提现记录错误:', err);
        res.status(500).json({ message: '服务器错误' });
    }
};

//查询提现余额 - GET /api/transaction/withdraw/balance
exports.getWithdrawBalance = async (req, res) => {
    try {
        const role = req.user.role || 'user';
        if (role === 'user') {
        const userId = req.user.userId;
        const consultantId = req.user.consultantId;
            if (role !== 'user' && role !== 'consultant') {
                return res.status(403).json({ message: '请先登录' });
            }
            const profile = await UserProfile.findOne({
                where: { userId },
                attributes: ['coin']
            });
            if (!profile) {
                return res.status(404).json({ message: '用户资料不存在' });
            }
            return res.json({
                message: '获取成功',
                data: {
                    userId,
                    coin: profile.coin || 0
                }
            });
        }
        if (role === 'consultant') {
            const consultantId = req.user.consultantId;
            if (consultantId == null) {
                return res.status(403).json({ message: 'token 无效' });
            }
            const profile_consultant = await ConsultantProfile.findOne({
                where: { consultantId },
                attributes: ['coin']
            });
            if (!profile_consultant) {
                return res.status(404).json({ message: '顾问资料不存在' });
            }
            return res.json({
                message: '获取成功',
                data: {
                    consultantId,
                    coin: profile_consultant.coin || 0
                }
            });
        }
    } catch (err) {
        console.error('查询提现余额错误:', err);
        res.status(500).json({ message: '服务器错误' });
    }
};

//顾客或顾问流水查询 - GET /api/transaction/customerOrConsultant/history
//顾客端只显示自己的充值，提现，付款，退款记录；顾问端只显示自己的提现，收款，扣款记录
exports.getCustomerOrConsultantHistory = async (req, res) => {
    try {
        const role = req.user.role || 'user';
        const userId = req.user.userId;   
        const consultantId = req.user.consultantId;
        
        if (role !== 'user' && role !== 'consultant') {
            return res.status(403).json({ message: '仅登录客户或顾问可查看流水记录' });
        }
        // 参数解析：默认每页 100 条，方便一页展示全部历史
        console.log("role是shishsihsihsishishsishishis",role);
        const { page = 1, limit } = req.query;
        let pageNum = parseInt(page, 10) || 1;
        let limitNum = limit !== undefined && limit !== '' ? parseInt(limit, 10) : 100;
        
        pageNum = Math.max(1, pageNum);
        limitNum = Math.min(500, Math.max(1, limitNum));
        
        const offset = (pageNum - 1) * limitNum;
        const condition_money = role === 'user' ? 'customerBalanceAfter' : 'consultantBalanceAfter';//condition_money：'customerBalanceAfter'或'consultantBalanceAfter'
        const condition = role === 'user' ? {userId, fundStatus:['completed', 'refunded','frozen','servicing_refunded']}: {consultantId, fundStatus:['completed', 'released','servicing_refunded']};//condition：{userId:userId, fundStatus:['completed', 'refunded','frozen','servicing_refunded']}或{consultantId:consultantId, fundStatus:['completed', 'released','servicing_refunded']}
        //查询顾客流水记录    
        const { count, rows } = await FundTransaction.findAndCountAll({
            where: { ...condition},
            attributes: [
                'transactionId',
                'transactionAmount',
                condition_money,
                'operatedAt',
                'transactionType',
                'fundStatus'
            ],
            limit: limitNum,
            offset,
            order: [['operatedAt', 'DESC']]
        });
        //格式化返回
        const list = rows.map((item => {
            const row=item.toJSON()?item.toJSON():item;
            const amt = row.transactionAmount;
            const type = row.transactionType;
            return {
                transactionId: row.transactionId,
                transactionAmount: amt,
                amount: amt,
                transactionType: type,
                fundStatus: row.fundStatus,
                [condition_money]: row[condition_money],
                operatedAt: row.operatedAt
            };
        }));
        res.json({
            message: '获取成功',
            data: {
                list,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total: count,
                    totalPages: Math.ceil(count / limitNum)||1
                }
            }
        });//返回结果
        console.log("list是list是list是list是list是",list);
    }
    catch (err) {
        console.error('查询顾客流水记录错误:', err);
        res.status(500).json({ message: '服务器错误' });
    }
};