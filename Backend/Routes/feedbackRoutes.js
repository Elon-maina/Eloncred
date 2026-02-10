module.exports = (app, pool) => {

    // ---------------------
    // MESSAGE HANDLING APIs
    // ---------------------

    // POST to send a message
    app.post('/api/messages', async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;

        // Validation
        if (!name || !email || !subject || !message) {
            return res.json({ success: false, message: 'All fields are required' });
        }

        // Get user_id if logged in (optional)
        let userId = null;
        // Prefer express-session user id when available (cookie-based auth)
        if (req.session && req.session.userId) {
            userId = req.session.userId;
        } else {
            const authHeader = req.get('Authorization');
            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.split(' ')[1];
                    const [sessions] = await pool.execute('SELECT user_id FROM sessions WHERE session_token = ? AND (expires_at IS NULL OR expires_at > NOW())', [token]);
                if (sessions.length > 0) {
                    userId = sessions[0].user_id;
                }
            }
        }

        // Insert message
        const [result] = await pool.execute(
            'INSERT INTO messages (user_id, name, email, subject, message) VALUES (?, ?, ?, ?, ?)',
            [userId, name, email, subject, message]
        );

        console.log('New message received:', {
            id: result.insertId,
            name,
            email,
            subject,
            userId
        });

        res.json({
            success: true,
            message: 'Message sent successfully! We\'ll get back to you soon.'
        });
    } catch (error) {
        console.error('Message send error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

    // GET to retrieve all messages (admin only)
    app.get('/api/messages', async (req, res) => {
    try {
        // Check auth: allow cookie-based session or bearer token
        let viewerId = null;
        if (req.session && req.session.userId) {
            viewerId = req.session.userId;
        } else {
            const authHeader = req.get('Authorization');
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ success: false, message: 'Unauthorized' });
            }

            const token = authHeader.split(' ')[1];
                const [sessions] = await pool.execute('SELECT user_id FROM sessions WHERE session_token = ? AND (expires_at IS NULL OR expires_at > NOW())', [token]);
            if (sessions.length === 0) {
                return res.status(401).json({ success: false, message: 'Invalid session' });
            }

            viewerId = sessions[0].user_id;
        }

        // For now, allow any logged-in user to view messages (you can restrict to admin users later)
        const [messages] = await pool.execute(`
            SELECT m.*, u.fullname as user_name, u.email as user_email 
            FROM messages m 
            LEFT JOIN users u ON m.user_id = u.id 
            ORDER BY m.created_at DESC
        `);

        res.json({
            success: true,
            messages: messages || []
        });
    } catch (error) {
        console.error('Messages fetch error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
    });

    // PUT to respond to a message
    app.put('/api/messages/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { admin_response } = req.body;

        if (!id) return res.status(400).json({ success: false, message: 'Invalid message id' });

        // Check authentication: accept cookie session or bearer token
        let adminId = null;
        if (req.session && req.session.userId) {
            adminId = req.session.userId;
        } else {
            const authHeader = req.get('Authorization');
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ success: false, message: 'Unauthorized' });
            }

            const token = authHeader.split(' ')[1];
                const [sessions] = await pool.execute('SELECT user_id FROM sessions WHERE session_token = ? AND (expires_at IS NULL OR expires_at > NOW())', [token]);
            if (sessions.length === 0) {
                return res.status(401).json({ success: false, message: 'Invalid session' });
            }

            adminId = sessions[0].user_id;
        }

        // Update message with response
        const [result] = await pool.execute(
            'UPDATE messages SET admin_response = ?, response_date = NOW(), status = "responded" WHERE id = ?',
            [admin_response, id]
        );

        console.log('Message responded to:', { id, admin_response });

        res.json({
            success: true,
            message: 'Response sent successfully'
        });
    } catch (error) {
        console.error('Message response error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
    });

};
