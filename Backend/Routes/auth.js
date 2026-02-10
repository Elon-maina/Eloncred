const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');

const router = express.Router();

// SIGNUP
router.post('/signup', async (req, res) => {
    const { fullname, email, password, confirmPassword } = req.body;

    if (!fullname || !email || !password || !confirmPassword) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    if (password !== confirmPassword) {
        return res.status(400).json({ error: 'Passwords do not match' });
    }

    try {
        const [exists] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
        if (exists.length > 0) return res.status(400).json({ error: 'Email already exists' });

        const hashed = await bcrypt.hash(password, 12);
        await pool.execute('INSERT INTO users (fullname, email, password) VALUES (?, ?, ?)', [fullname, email, hashed]);
        res.json({ success: true, message: 'Signup successful' });
    } catch (err) {
        console.error('Signup error (auth route):', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// LOGIN
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    try {
        const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
        if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

        const user = rows[0];
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

        res.json({ success: true, user: { id: user.id, fullname: user.fullname, email: user.email } });
    } catch (err) {
        console.error('Login error (auth route):', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
