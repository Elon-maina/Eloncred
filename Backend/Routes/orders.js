const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireUser, requireAdmin } = require('../middleware/auth');

// ==========================
// CREATE ORDER (LOGGED-IN USER)
// Prices are taken from the products table, never from the client.
// ==========================
router.post('/', requireUser, async (req, res) => {
    const items = Array.isArray(req.body.items) ? req.body.items : [];

    const quantities = new Map();
    for (const item of items) {
        const productId = Number(item && (item.product_id || item.id));
        const qty = Number(item && (item.qty || item.quantity || 1));
        if (!Number.isInteger(productId) || productId < 1 || !Number.isInteger(qty) || qty < 1) {
            return res.status(400).json({ success: false, message: 'Invalid order items' });
        }
        quantities.set(productId, (quantities.get(productId) || 0) + qty);
    }

    if (!quantities.size) {
        return res.status(400).json({ success: false, message: 'Your cart is empty' });
    }

    const conn = await pool.getConnection();
    try {
        const ids = [...quantities.keys()];
        const [products] = await conn.query('SELECT id, price FROM products WHERE id IN (?)', [ids]);
        if (products.length !== ids.length) {
            return res.status(400).json({ success: false, message: 'Some products are no longer available' });
        }

        const lines = products.map(p => ({ product_id: p.id, quantity: quantities.get(p.id), unit_price: Number(p.price) }));
        const total = lines.reduce((sum, l) => sum + l.unit_price * l.quantity, 0);

        await conn.beginTransaction();
        const [order] = await conn.execute(
            'INSERT INTO orders (user_id, total_amount) VALUES (?, ?)',
            [req.user_id, total.toFixed(2)]
        );
        for (const l of lines) {
            await conn.execute(
                'INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
                [order.insertId, l.product_id, l.quantity, l.unit_price]
            );
        }
        await conn.execute('DELETE FROM cart WHERE user_id = ?', [req.user_id]);
        await conn.commit();

        res.json({ success: true, message: 'Order created', orderId: order.insertId, total: Number(total.toFixed(2)) });
    } catch (err) {
        await conn.rollback().catch(() => {});
        console.error('Error creating order:', err);
        res.status(500).json({ success: false, message: 'Failed to create order' });
    } finally {
        conn.release();
    }
});

// ==========================
// LIST ALL ORDERS (ADMIN ONLY)
// ==========================
router.get('/', requireAdmin, async (req, res) => {
    try {
        const [orders] = await pool.execute(`
            SELECT o.id, o.user_id, o.total_amount, o.status, o.created_at, u.fullname, u.email
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.id
            ORDER BY o.created_at DESC
        `);
        res.json({ success: true, orders });
    } catch (err) {
        console.error('Error fetching orders:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch orders' });
    }
});

module.exports = router;
