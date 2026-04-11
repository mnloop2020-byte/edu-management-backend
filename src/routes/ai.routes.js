const express = require('express')
const router = express.Router()
const { analyzeStudent } = require('../controllers/ai.controller')
const { protect } = require('../middleware/auth.middleware')

router.use(protect)

router.get('/analyze/:id', analyzeStudent)

module.exports = router