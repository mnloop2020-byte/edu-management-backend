const express = require('express')
const router = express.Router()

// ✅ أضف chatbot هنا
const { analyzeStudent, chatbot } = require('../controllers/ai.controller')
const { protect } = require('../middleware/auth.middleware')

router.use(protect)

router.post('/chat', chatbot)
router.get('/analyze/:id', analyzeStudent)

module.exports = router