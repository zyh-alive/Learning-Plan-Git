// ========== 程序入口：从这里看起 ==========
// 作用：把 Express、数据库、路由拼在一起，启动 HTTP 服务。
// 运行方式：在项目根目录执行 node server.js

const http = require('http');
const express = require('express');  // 引入 Express，用来处理 HTTP 请求
const { setupWebSockets } = require('./ws'); // WebSocket 与 Express 分离，见 ws/ 目录

// 下面这些是「路由模块」：每个文件负责一类 URL（如 /auth、/api/order、/api/reviews）
// 评价全量纠偏脚本：node scripts/sync-consultant-ratings-from-reviews.js（见 代码说明文档.md）
const authRoutes = require('./routes/authRoutes');           // 注册、登录、个人资料、改密码
const orderRoutes = require('./routes/orderRoute');           // 下单、支付、接单、完成、取消
const reviewRoutes = require('./routes/reviewRoute');         // 客户提交订单评价（独立控制器）
const consultRoutes = require('./routes/consultRoute');      // 顾问列表、顾问详情
const sequelize = require('./config/database');               // 数据库连接，后面要用来同步表结构
const transactionRoutes = require('./routes/transactionRoute');    // 充值、余额、充值记录
const payRoutes = require('./routes/payRoutes');                  // 支付宝/微信等支付回调（无登录）
const consultantServiceRoutes = require('./routes/consultantService'); // 顾问设置服务价格
const orderChatHttpRoutes = require('./ws/order-chat/orderChatHttpRoutes'); // 订单聊天 REST（与 ws 实时通道同属 ws/order-chat）
const orderController = require('./controllers/orderController'); // 订单过期扫描（定时任务）
const config = require('./config'); // 含 .env 替换后的 feishu 等（见 config/index.js）

// 加载全部模型（与 config.yaml / config/database 同一连接）；再加载角色表映射
require('./models');
require('./config/roleConfig');

const app = express();  // 创建 Express 应用，所有请求都会经过 app

// ---------- 中间件：每个请求都会先经过这里 ----------
app.use(express.json());  // 把请求体里的 JSON 自动解析成 req.body，后面控制器直接用

// 静态文件：浏览器访问 /login.html、/dashboard.html 等，直接读 public 文件夹里的文件
app.use(express.static('public'));

// ---------- 挂载路由：按 URL 前缀把请求分给不同路由文件 ----------
// 例如：请求 /auth/login → 进 authRoutes，请求 /api/order/create → 进 orderRoutes
app.use('/auth', authRoutes);                    // /auth/* → 注册登录、资料、改密码
app.use('/api/consultants', consultRoutes);       // /api/consultants/* → 顾问列表、详情
app.use('/api/order', orderChatHttpRoutes);      // 聊天相关 REST：/chat/conversations、/:id/chat/*（须先于纯订单路由）
app.use('/api/order', orderRoutes);              // /api/order/* → 订单全流程（纯 HTTP，不含聊天）
app.use('/api/reviews', reviewRoutes);           // 评价：POST /:orderId、GET 顾问公开/本人订单评价列表等
app.use('/api/transaction', transactionRoutes);        // /api/transaction/* → 充值相关
app.use('/api/pay', payRoutes);                        // /api/pay/* → 支付渠道异步通知等
app.use('/api/consultant/service', consultantServiceRoutes);  // 顾问服务价格

// 根路径：随便访问一下会返回一句 Hello World，用来确认服务已启动
app.get('/', (req, res) => {
    res.json({ message: 'Hello World' });
});

// ---------- 启动：先同步数据库表，再监听端口（HTTP + WebSocket 同一端口） ----------
// 默认只做「缺表则建」，不 alter 已存在表，避免反复 sync 在 MySQL 上堆出大量重复索引（ER_TOO_MANY_KEYS）。
// 需要 Sequelize 自动改列时临时执行：SEQUELIZE_SYNC_ALTER=1 node server.js
(async () => {
    //const syncOpts = process.env.SEQUELIZE_SYNC_ALTER === '1' ? { alter: true } : {};
    //await sequelize.sync(syncOpts);
    try {
        await sequelize.authenticate();
        console.log('✅ 数据库连接成功');
    } catch (error) {
        console.error('❌ 数据库连接失败：', error);
        process.exit(1);
    }
    const PORT = 3003;
    const server = http.createServer(app);
    setupWebSockets(server);
    server.listen(PORT, () => {
        console.log(`✅ 服务器运行在 http://localhost:${PORT}`);
        console.log(`   WebSocket 订单聊天：ws://localhost:${PORT}/ws/order-chat?token=...&orderId=...`);
        // 已支付待接单订单：超过存活时间自动过期并退款（默认 24h，见 orders.survival_seconds）
        orderController.runPendingOrderExpirySweep().catch(() => {});
        setInterval(() => {
            orderController.runPendingOrderExpirySweep().catch((e) =>
                console.error('[订单过期扫描]', e && e.message ? e.message : e)
            );
        }, 60 * 1000);
        // 飞书顾问早间待处理播报：开关与时刻来自 config.yaml（经 config/index.js 从 .env 替换），见 feishu.enableMorningBrief / morningHour / morningMinute
        if (config.feishu && String(config.feishu.enableMorningBrief || '').trim() === '1') {
            const { startScheduledNotifications } = require('./external_call/scheduledNotifications');
            startScheduledNotifications();
        }
    });
})();
