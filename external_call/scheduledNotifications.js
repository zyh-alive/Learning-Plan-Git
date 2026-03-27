/**
 * 顾问早间待处理订单飞书播报
 * - 按 IANA 时区分组，为每个时区注册「本地指定时刻」的 cron（默认 08:00，见 config.feishu.morningHour / morningMinute）。
 * - 触发时：orderController.getPendingOrders({ timezone }) 返回该时区顾问列表 + 待处理统计，拼一条正文 sendToGroup。
 *
 * 开关由 server.js 读 config.feishu.enableMorningBrief（yaml 中 ${ENABLE_FEISHU_MORNING}）；时刻由本模块读 config（经 config/index.js 替换环境变量）。
 */

const cron = require('node-cron');
const moment = require('moment-timezone');
const config = require('../config');
const ConsultantProfile = require('../models/ConsultantProfile');
const orderController = require('../controllers/orderController');
const { sendToGroup } = require('./feishuBot');

const DEFAULT_TZ = 'Asia/Shanghai';

/** @type {import('node-cron').ScheduledTask[]} */
let cronJobs = [];

/** 未设置对应 .env 时 config/index.js 会留下 "${VAR_NAME}"，视为空并用默认值 */
function feishuConfigScalar(raw) {
    if (raw == null) return '';
    const s = String(raw).trim();
    return /^\$\{[^}]+\}$/.test(s) ? '' : s;
}

function morningHour() {
    const s = feishuConfigScalar(config.feishu?.morningHour);
    const h = parseInt(s || '8', 10);
    return Number.isFinite(h) && h >= 0 && h <= 23 ? h : 8;
}

function morningMinute() {
    const s = feishuConfigScalar(config.feishu?.morningMinute);
    const m = parseInt(s || '0', 10);
    return Number.isFinite(m) && m >= 0 && m <= 59 ? m : 0;
}

function isValidIanaZone(tz) {
    return Boolean(tz && moment.tz.zone(tz));
}

/**
 * 与 scripts/test_bot.js 一致的飞书正文拼接（按顾问块：总订单 / 待接单 / 加急 / 已接单待服务）
 * @param {string} timezone
 * @param {string} timeLabel
 * @param {{ consultantId: number, name: string|null }[]} consultants
 * @param {Record<string, any>} statusMap getPendingOrders 的 status
 */
//作用是拼接飞书正文
function buildMorningBriefText(timezone, timeLabel, consultants, statusMap) {
    let text = `📋 【${timezone}】早间待处理（本地 ${timeLabel}）\n总顾问人数: ${consultants.length}\n订单待处理人数:${statusMap.length}\n\n`;

    for (const consultantId in statusMap) {
        const data = statusMap[consultantId];
        text += `👤 ${data.name}\n`;
        text += `   总订单: ${data.total} 个\n`;
        
        data.pending > 0?text += `   待接单: ${data.pending} 个\n`:text += `   待接单: ${0} 个\n`;
        data.pending_rush > 0?text += `   加急待接单: ${data.pending_rush} 个\n`:text += `   加急待接单: ${0} 个\n`;
        data.accepted > 0?text += `   已接单待服务: ${data.accepted} 个\n`:text += `   已接单待服务: ${0} 个\n`;
        
        text += `\n`;
    }
    return text;
}

async function runTimezoneMorningBrief(timezone) {
    const h = morningHour();
    const m = morningMinute();
    const timeLabel = `${h}:${String(m).padStart(2, '0')}`;

    const result = await orderController.getPendingOrders({ timezone });
    console.log('result.status:', result.status);
    if (result.error) {
        console.error('[早间播报]', timezone, result.error);
        await sendToGroup(`【早间播报异常】时区 ${timezone}\n${result.error}`);
        return;
    }

    const consultants = result.consultants || [];
    if (consultants.length === 0) {
        console.log(`[早间播报] ${timezone} 无顾问，跳过`);
        return;
    }

    const text = buildMorningBriefText(timezone, timeLabel, consultants, result.status || {});
    console.log('text:', text);
    await sendToGroup(text);
}

function startScheduledNotifications() {
    stopScheduledNotifications();
    const h = morningHour();
    const min = morningMinute();
    const cronExpr = `${min} ${h} * * *`;
    let registeredZones = new Set();//registeredZones是集合，用于存储已注册的时区

    function scanAndRegister() {//扫描并注册时区
        ConsultantProfile.findAll({ attributes: ['timezone'] })
            .then((rows) => {
                const zones = new Set();//zones是集合，用于存储时区
                for (const p of rows) {
                    let tz = (p.timezone && String(p.timezone).trim()) || DEFAULT_TZ;
                    if (!isValidIanaZone(tz)) tz = DEFAULT_TZ;
                    zones.add(tz);
                }
                if (zones.size === 0) zones.add(DEFAULT_TZ);

                for (const timezone of zones) {
                    if (registeredZones.has(timezone)) {
                        continue;  // 已注册，跳过
                    }//去重逻辑
                    try {
                        const job = cron.schedule(
                            cronExpr,
                            () => {
                                runTimezoneMorningBrief(timezone).catch((e) =>
                                    console.error('[早间播报]', timezone, e)
                                );
                            },
                            { timezone }
                        );
                        cronJobs.push(job);
                        registeredZones.add(timezone);//添加到已注册的时区集合中
                        console.log(
                            `[早间播报] 已注册时区 ${timezone}，每日本地 ${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
                        );
                    } catch (e) {
                        console.error(`[早间播报] 注册 cron 失败 ${timezone}:`, e.message);
                    }
                }
            })
            .catch((e) => console.error('[早间播报] 初始化时区列表失败', e));
        }//扫描并注册时区
    scanAndRegister();//服务器启动立即执行

    // 2. 设置每天凌晨 0 点重新扫描（发现新时区）
    const refreshJob = cron.schedule('0 0 * * *', () => {//每天凌晨0点执行
        console.log('[早间播报] 执行每日时区刷新...');
        scanAndRegister();//扫描并注册时区
    });
    cronJobs.push(refreshJob);//添加到cronJobs数组中
}

function stopScheduledNotifications() {
    for (const j of cronJobs) {
        try {
            j.stop();
        } catch (_) {}
    }
    cronJobs = [];
}

module.exports = {
    startScheduledNotifications,
    stopScheduledNotifications,
    runTimezoneMorningBrief,
    buildMorningBriefText
};
