const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');

// GET all users (admin only)
router.get('/users', requireAdmin, async (req, res) => {
    try {
        const [rows] = await pool.execute(`SELECT id, fullname, email, phone, role, is_admin, created_at FROM users ORDER BY created_at DESC`);
        res.json({ success: true, users: rows });
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch users' });
    }
});

// GET admin check (returns current admin info if session valid)
router.get('/check', requireAdmin, async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT id, fullname, email, phone, role FROM users WHERE id = ?', [req.admin_id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'Admin not found' });

        res.json({ success: true, admin: rows[0] });
    } catch (err) {
        console.error('Admin check error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// PUT change user role (admin only)
router.put('/users/:id/role', requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { role } = req.body;
        if (!id || !role) return res.status(400).json({ success: false, message: 'Invalid payload' });
        if (!['user', 'admin', 'moderator'].includes(role)) return res.status(400).json({ success: false, message: 'Invalid role' });
        if (id === Number(req.admin_id) && role !== 'admin') {
            return res.status(400).json({ success: false, message: 'You cannot remove your own admin role' });
        }

        // is_admin is a generated column derived from role
        await pool.execute('UPDATE users SET role = ? WHERE id = ?', [role, id]);

        res.json({ success: true, message: 'User role updated' });
    } catch (err) {
        console.error('Error updating user role:', err);
        res.status(500).json({ success: false, message: 'Failed to update role' });
    }
});

module.exports = router;
