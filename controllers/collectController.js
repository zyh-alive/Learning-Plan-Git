/*
// 路由前缀：/api/collects（见 routes/collectRoute.js、server.js）
//1.添加顾问收藏 - POST /api/collects/add
//2.删除顾问收藏 - POST /api/collects/delete
//3.查询用户收藏列表 - GET /api/collects/list
// 业务：用户收藏顾问
*/
const Collects = require('../models/Collects');
const ConsultantProfile = require('../models/ConsultantProfile');

// 1.添加收藏顾问 - POST /api/collects
exports.addCollectConsultant = async (req, res) => {
    try {
        const role = req.user.role || 'user';
        const userId = req.user.userId;
        if (role !== 'user' || !userId) {
            return res.status(403).json({ message: '仅登录客户可收藏顾问' });
        }
        const consultantId = req.body.consultantId;
        if (!consultantId) {
            return res.status(400).json({ message: '请选择顾问' });
        }
        const consultant = await ConsultantProfile.findOne({ where: { consultantId } });
        if (!consultant) {
            return res.status(404).json({ message: '顾问不存在' });
        }
        const dup = await Collects.findOne({ where: { userId, consultantId } });
        if (dup) {
            return res.status(200).json({ message: '已收藏该顾问', collect: dup });
        }
        const collect = await Collects.create({ userId, consultantId });
        return res.status(200).json({ message: '添加收藏顾问成功', collect });
    } catch (error) {
        console.error('添加收藏顾问失败:', error);
        return res.status(500).json({ message: '添加收藏顾问失败' });
    }
};

//2.删除收藏顾问 - POST /api/collects/delete
exports.deleteCollectConsultant = async (req, res) => {
    try {
        const role = req.user.role || 'user';
        const userId = req.user.userId;
        if (role !== 'user' || !userId) {
            return res.status(403).json({ message: '仅登录客户可删除收藏顾问' });
        }
        const consultantId = req.body.consultantId;
        if (!consultantId) {
            return res.status(400).json({ message: '请选择顾问' });
        }
        const collect = await Collects.destroy({ where: { userId, consultantId } });
        return res.status(200).json({ message: '删除收藏顾问成功', collect });
    } catch (error) {
        console.error('删除收藏顾问失败:', error);
        return res.status(500).json({ message: '删除收藏顾问失败' });
    }
};

//3.查询用户收藏列表 - GET /api/collects/list
exports.getUserCollectList = async (req, res) => {
    try {
        const role = req.user.role || 'user';
        const userId = req.user.userId;
        if (role !== 'user' || !userId) {
            return res.status(403).json({ message: '仅登录客户可查询用户收藏列表' });
        }
        const collects = await Collects.findAll({ where: { userId } });
        return res.status(200).json({ message: '查询用户收藏列表成功', collects });
    } catch (error) {
        console.error('查询用户收藏列表失败:', error);
        return res.status(500).json({ message: '服务器错误' });
    }
};