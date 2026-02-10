const express = require('express');
const router = express.Router();
const pool = require('../db');



// Middleware to ensure caller is an admin (cookie session OR bearer token)
async function requireAdmin(req, res, next) {
    try {
        console.log("SESSION DEBUG:", req.session);

        // Session-based admin
        if (req.session && req.session.isAdmin === true) {
            return next();
        }

        // Token-based admin
        const authHeader = req.get('Authorization') || '';
        let token = null;
        if (authHeader.startsWith('Bearer ')) {
            token = authHeader.slice(7).trim();
        }

        if (!token) {
            return res.status(403).json({ success: false, message: 'Admin login required' });
        }

        const [sessions] = await pool.execute(
            'SELECT user_id FROM sessions WHERE session_token = ? AND (expires_at IS NULL OR expires_at > NOW())',
            [token]
        );

        if (!sessions.length) {
            return res.status(403).json({ success: false, message: 'Invalid admin session' });
        }

        const userId = sessions[0].user_id;
        const [users] = await pool.execute(
            'SELECT id, role, is_admin FROM users WHERE id = ?',
            [userId]
        );

        if (!users.length) {
            return res.status(403).json({ success: false, message: 'Invalid admin session' });
        }

        const user = users[0];

        if (user.role === 'admin' || Number(user.is_admin) === 1) {
            // 🔥 Persist admin state
            if (req.session) {
                req.session.isAdmin = true;
                req.session.adminId = user.id;
            }
            return next();
        }

        return res.status(403).json({ success: false, message: 'Admin privileges required' });

    } catch (err) {
        console.error('requireAdmin error:', err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
}

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
        // get user id from session or token
        let userId = null;
        if (req.session && req.session.adminId) userId = req.session.adminId;
        else {
            const authHeader = req.get('Authorization') || '';
            if (authHeader.startsWith('Bearer ')) {
                const token = authHeader.slice(7).trim();
                const [sessions] = await pool.execute('SELECT user_id FROM sessions WHERE session_token = ? AND (expires_at IS NULL OR expires_at > NOW())', [token]);
                if (sessions && sessions.length) userId = sessions[0].user_id;
            }
        }

        if (!userId) return res.status(403).json({ success: false, message: 'Not an admin' });

        const [rows] = await pool.execute('SELECT id, fullname, email, phone, role FROM users WHERE id = ?', [userId]);
        if (!rows || rows.length === 0) return res.status(404).json({ success: false, message: 'Admin not found' });

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

        await pool.execute('UPDATE users SET role = ? WHERE id = ?', [role, id]);
        // Optionally update is_admin for compatibility
        const is_admin = role === 'admin' ? 1 : 0;
        await pool.execute('UPDATE users SET is_admin = ? WHERE id = ?', [is_admin, id]);

        res.json({ success: true, message: 'User role updated' });
    } catch (err) {
        console.error('Error updating user role:', err);
        res.status(500).json({ success: false, message: 'Failed to update role' });
    }
});

module.exports = router;
