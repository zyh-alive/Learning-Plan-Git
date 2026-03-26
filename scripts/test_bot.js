const { sendToGroup } = require('../external_call/feishuBot');

async function test() {
    console.log('发送测试消息...');
    await sendToGroup('🎉 测试消息：飞书机器人连接成功！');
}

test();