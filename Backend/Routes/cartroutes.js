// routes/cart.js
const express = require("express");
const router = express.Router();
const pool = require("../db");

/* ===============================
   AUTH MIDDLEWARE
   Supports: express-session (server cookie) OR Bearer token in Authorization header
================================ */
const authenticateUser = async (req, res, next) => {
    try {
        // 1) cookie/session-based auth
        if (req.session && (req.session.userId || req.session.user)) {
            req.user_id = req.session.userId || (req.session.user && req.session.user.id);
            if (req.user_id) return next();
        }

        // 2) bearer token
        const authHeader = req.get('Authorization') || '';
        let token = null;
        if (authHeader.startsWith('Bearer ')) token = authHeader.slice(7).trim();
        token = token || req.body?.token || req.query?.token || null;

        if (!token) {
            return res.status(401).json({ success: false, message: 'Unauthorized. Please log in first.' });
        }

        // lookup session in DB (token column)
        const [rows] = await pool.execute('SELECT user_id FROM sessions WHERE session_token = ? AND (expires_at IS NULL OR expires_at > NOW())', [token]);
        if (!rows || rows.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid or expired session token' });
        }

        req.user_id = rows[0].user_id;
        return next();
    } catch (err) {
        console.error('Auth middleware error:', err);
        return res.status(500).json({ success: false, message: 'Authentication error' });
    }
};

/* ===============================
   GET USER CART
================================ */
router.get('/', authenticateUser, async (req, res) => {
    try {
        const sql = `
            SELECT 
                c.id,
                c.product_id,
                c.quantity,
                c.total_price,
                p.name,
                p.price,
                p.image
            FROM cart c
            JOIN products p ON c.product_id = p.id
            WHERE c.user_id = ?
        `;
        const [rows] = await pool.execute(sql, [req.user_id]);
        return res.json({ success: true, cart: rows });
    } catch (err) {
        console.error('Error fetching cart:', err);
        return res.status(500).json({ success: false, message: 'Failed to fetch cart' });
    }
});

/* ===============================
   ADD ITEM TO CART (UPSERT)
================================ */
router.post('/add', authenticateUser, async (req, res) => {
    const { product_id, quantity = 1 } = req.body;
    try {
        // normalize inputs
        const pid = Number(product_id);
        const qty = Number(quantity) || 1;
        if (!pid) return res.status(400).json({ success: false, message: 'Invalid product id' });

        // check existing cart item
        const [existing] = await pool.execute('SELECT id, quantity FROM cart WHERE user_id = ? AND product_id = ?', [req.user_id, pid]);

        let addedNew = false;
        if (existing && existing.length > 0) {
            // item already present — do not increment; inform client
            addedNew = false;
            // fetch current cart rows to return
            const [cartRowsExisting] = await pool.execute(`
                SELECT c.id, c.product_id, c.quantity, c.total_price, p.name, p.price, p.image
                FROM cart c
                JOIN products p ON c.product_id = p.id
                WHERE c.user_id = ?
                ORDER BY c.id DESC
            `, [req.user_id]);
            const cartCountExisting = cartRowsExisting.reduce((s, r) => s + (r.quantity || 0), 0);
            return res.json({ success: true, message: 'Already in cart', addedNew: false, already: true, cartCount: cartCountExisting, cart: cartRowsExisting });
        } else {
            // insert new row
            await pool.execute(
                `INSERT INTO cart (user_id, product_id, quantity, total_price)
                 SELECT ?, p.id, ?, p.price * ? FROM products p WHERE p.id = ?`,
                [req.user_id, qty, qty, pid]
            );
            addedNew = true;
        }

        // return updated cart for the user
        const [cartRows] = await pool.execute(`
            SELECT c.id, c.product_id, c.quantity, c.total_price, p.name, p.price, p.image
            FROM cart c
            JOIN products p ON c.product_id = p.id
            WHERE c.user_id = ?
            ORDER BY c.id DESC
        `, [req.user_id]);

        const cartCount = cartRows.reduce((s, r) => s + (r.quantity || 0), 0);

        return res.json({ success: true, message: 'Cart updated', addedNew, cartCount, cart: cartRows });
    } catch (err) {
        console.error('Error adding to cart:', err);
        return res.status(500).json({ success: false, message: 'Failed to add to cart' });
    }
});

/* ===============================
   UPDATE ITEM QUANTITY
   (increase / decrease / manual)
================================ */
router.put('/update/:id', authenticateUser, async (req, res) => {
    const { quantity } = req.body;
    if (!quantity || quantity < 1) {
        return res.status(400).json({ success: false, message: 'Quantity must be at least 1' });
    }
    try {
        const sql = `
            UPDATE cart
            JOIN products ON cart.product_id = products.id
            SET 
                cart.quantity = ?,
                cart.total_price = ? * products.price
            WHERE cart.id = ? AND cart.user_id = ?
        `;
        await pool.execute(sql, [quantity, quantity, req.params.id, req.user_id]);
        return res.json({ success: true, message: 'Cart updated' });
    } catch (err) {
        console.error('Error updating quantity:', err);
        return res.status(500).json({ success: false, message: 'Failed to update cart' });
    }
});

/* ===============================
   REMOVE ITEM FROM CART
================================ */
router.delete('/remove/:id', authenticateUser, async (req, res) => {
    try {
        const sql = `DELETE FROM cart WHERE id = ? AND user_id = ?`;
        await pool.execute(sql, [req.params.id, req.user_id]);
        return res.json({ success: true, message: 'Item removed from cart' });
    } catch (err) {
        console.error('Error removing item:', err);
        return res.status(500).json({ success: false, message: 'Failed to remove item' });
    }
});

module.exports = router;
