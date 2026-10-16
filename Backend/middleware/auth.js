const pool = require('../db');

// Resolve the current user id from the cookie session or an `Authorization: Bearer <token>` header.
async function getUserId(req) {
    if (req.session && (req.session.userId || req.session.adminId)) {
        return req.session.userId || req.session.adminId;
    }

    const authHeader = req.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.slice(7).trim();
    if (!token) return null;

    const [rows] = await pool.execute(
        'SELECT user_id FROM sessions WHERE session_token = ? AND (expires_at IS NULL OR expires_at > NOW())',
        [token]
    );
    return rows.length ? rows[0].user_id : null;
}

async function requireUser(req, res, next) {
    try {
        const userId = await getUserId(req);
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized. Please log in first.' });
        }
        req.user_id = userId;
        return next();
    } catch (err) {
        console.error('Auth middleware error:', err);
        return res.status(500).json({ success: false, message: 'Authentication error' });
    }
}

// Admin status is re-checked against the database on every request so revoked admins lose access immediately.
async function requireAdmin(req, res, next) {
    try {
        const userId = (req.session && req.session.adminId) || await getUserId(req);
        if (!userId) {
            return res.status(403).json({ success: false, message: 'Admin login required' });
        }

        const [users] = await pool.execute('SELECT id, role FROM users WHERE id = ?', [userId]);
        if (!users.length || users[0].role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Admin privileges required' });
        }

        req.user_id = userId;
        req.admin_id = userId;
        return next();
    } catch (err) {
        console.error('requireAdmin error:', err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
}

module.exports = { getUserId, requireUser, requireAdmin };
