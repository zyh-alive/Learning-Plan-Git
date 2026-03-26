const { sendToGroup } = require('../external_call/feishuBot');
const orderController = require('../controllers/orderController');
async function test() {
    const message = await orderController.getPendingOrders();//message是对象，包含status属性，status属性是对象，包含顾问ID和顾问的订单统计信息
    let text = '📊 订单统计\n\n';

    for (const consultantId in message.status) {//这里的consultant是新定义的变量接收message.status的键，键是顾问ID，值是顾问的订单统计信息
        const data = message.status[consultantId];
        text += `👤 ${data.name}\n`;
        text += `   总订单: ${data.total} 个\n`;
        
        data.pending > 0?text += `   待接单: ${data.pending} 个\n`:text += `   待接单: ${0} 个\n`;
        data.pending_rush > 0?text += `   加急待接单: ${data.pending_rush} 个\n`:text += `   加急待接单: ${0} 个\n`;
        data.accepted > 0?text += `   已接单待服务: ${data.accepted} 个\n`:text += `   已接单待服务: ${0} 个\n`;
        
        text += `\n`;
    }
    console.log(text);
    await sendToGroup(text);
}

test();