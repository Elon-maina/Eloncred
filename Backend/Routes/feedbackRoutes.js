const { getUserId, requireAdmin } = require('../middleware/auth');

module.exports = (app, pool) => {

    // ---------------------
    // MESSAGE HANDLING APIs
    // ---------------------

    // POST to send a message (public; linked to the user when logged in)
    app.post('/api/messages', async (req, res) => {
        try {
            const { name, email, subject, message } = req.body;

            if (!name || !email || !subject || !message) {
                return res.status(400).json({ success: false, message: 'All fields are required' });
            }

            const userId = await getUserId(req);

            const [result] = await pool.execute(
                'INSERT INTO messages (user_id, name, email, subject, message) VALUES (?, ?, ?, ?, ?)',
                [userId, name, email, subject, message]
            );

            console.log('New message received: id=%d', result.insertId);

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
    app.get('/api/messages', requireAdmin, async (req, res) => {
        try {
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

    // PUT to respond to a message (admin only)
    app.put('/api/messages/:id', requireAdmin, async (req, res) => {
        try {
            const id = Number(req.params.id);
            const { admin_response } = req.body;

            if (!id) return res.status(400).json({ success: false, message: 'Invalid message id' });
            if (!admin_response) return res.status(400).json({ success: false, message: 'Response text is required' });

            const [result] = await pool.execute(
                "UPDATE messages SET admin_response = ?, response_date = NOW(), status = 'responded' WHERE id = ?",
                [admin_response, id]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({ success: false, message: 'Message not found' });
            }

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
