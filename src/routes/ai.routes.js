const express = require('express')
const router = express.Router()

// ✅ أضف chatbot هنا
const { analyzeStudent, chatbot } = require('../controllers/ai.controller')
const { protect, requireRole } = require('../middleware/auth.middleware')

router.use(protect)

router.post('/chat', requireRole('ADMIN', 'TEACHER', 'STUDENT', 'PARENT'), chatbot)
router.get('/analyze/:id', requireRole('ADMIN', 'TEACHER', 'STUDENT', 'PARENT'), analyzeStudent)

module.exports = router
