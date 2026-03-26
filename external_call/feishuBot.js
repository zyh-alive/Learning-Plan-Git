const axios = require('axios');//axios是用来发送http请求的库（调用外部接口）
const config = require('../config');
const FEISHU_BOT_WEBHOOK_URL = config.feishu.botWebhook;

async function sendToGroup(content) {
    if (!FEISHU_BOT_WEBHOOK_URL) {
        console.error('❌ 请先设置 FEISHU_BOT_WEBHOOK_URL 环境变量');
        return false;
    }
    try {
        const response = await axios.post(FEISHU_BOT_WEBHOOK_URL, {//post的意思是发送http请求，参数1是请求地址，参数2是请求体
            msg_type: 'text',
            content: { text: content }
        });
        if (response.data.code === 0) {//如果响应状态码为0，则表示发送成功
            console.log('✅ 飞书消息发送成功');
            return true;
        }
    } catch (error) {//如果发送失败，则返回false
        console.error('❌ 发送失败:', error.message);
        return false;
    }
}

module.exports = { sendToGroup };