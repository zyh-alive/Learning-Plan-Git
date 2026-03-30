const express = require('express');
const router = express.Router();
const collectController = require('../controllers/collectController');
const authenticateToken = require('../middleware/auth');

router.post('/add', authenticateToken, collectController.addCollectConsultant);
router.post('/delete', authenticateToken, collectController.deleteCollectConsultant);
router.get('/list', authenticateToken, collectController.getUserCollectList);

module.exports = router;