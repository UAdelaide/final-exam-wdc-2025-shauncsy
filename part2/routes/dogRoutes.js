const express = require('express')
const router = express.Router()
const db = require('../models/db')

router.get('/', async (req, res) => {
  try {
    const [items] = await db.execute('SELECT * FROM Dogs')

    res.json(items)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch Dogs' })
  }
})

module.exports = router
