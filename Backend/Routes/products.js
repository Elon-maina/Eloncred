const express = require('express');
const router = express.Router();
const pool = require('../db');

// ==========================
// GET ALL PRODUCTS
// ==========================
router.get('/', async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT * FROM products`
        );

        res.json({
            success: true,
            products: rows
        });
    } catch (err) {
        console.error('❌ Error fetching products:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch products'
        });
    }
});

// Middleware: require admin session
async function requireAdmin(req, res, next) {
    try {
        // 1) cookie/session-based check
        if (req && req.session && req.session.isAdmin) return next();

        // 2) bearer token check
        const authHeader = req.get('Authorization') || '';
        let token = null;
        if (authHeader.startsWith('Bearer ')) token = authHeader.slice(7).trim();
        token = token || req.body?.token || req.query?.token || null;

        if (!token) return res.status(403).json({ success: false, message: 'Admin login required' });

        const [sessions] = await pool.execute('SELECT user_id FROM sessions WHERE token = ? AND (expires_at IS NULL OR expires_at > NOW())', [token]);
        if (!sessions || sessions.length === 0) return res.status(403).json({ success: false, message: 'Invalid admin session' });

        const userId = sessions[0].user_id;
        const [users] = await pool.execute('SELECT role, is_admin FROM users WHERE id = ?', [userId]);
        if (!users || users.length === 0) return res.status(403).json({ success: false, message: 'Invalid admin session' });

        const user = users[0];
        if (user.role === 'admin' || Number(user.is_admin) === 1) return next();

        return res.status(403).json({ success: false, message: 'Admin privileges required' });
    } catch (err) {
        console.error('requireAdmin error:', err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
}

// ==========================
// ADD PRODUCT (ADMIN ONLY)
// ==========================
router.post('/', requireAdmin, async (req, res) => {
    const { name, price, category, image, stock_quantity } = req.body;

    if (!name || !price || !category) {
        return res.json({
            success: false,
            message: 'Missing required fields'
        });
    }

    try {
        const [result] = await pool.execute(
            `INSERT INTO products 
            (name, price, category, image, stock_quantity) 
            VALUES (?, ?, ?, ?, ?)`,
            [name, price, category, image || null, stock_quantity || 0]
        );

        res.json({
            success: true,
            message: 'Product added successfully',
            productId: result.insertId
        });
    } catch (err) {
        console.error(' Error adding product:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to add product'
        });
    }
});

// ==========================
// DELETE PRODUCT (ADMIN ONLY)
// ==========================
router.delete('/:id', requireAdmin, async (req, res) => {
    console.log('=== DELETE PRODUCT REQUEST ===');
    console.log('Request params:', req.params);
    console.log('Request ID param:', req.params.id);
    console.log('Full URL:', req.originalUrl);
    console.log('Method:', req.method);
    console.log('Headers:', req.headers);
    
    const id = Number(req.params.id);
    console.log('Parsed ID:', id, 'Type:', typeof id);
    
    if (!id) {
        console.log('Validation failed: Invalid product ID');
        return res.status(400).json({ 
            success: false, 
            message: 'Invalid product id' 
        });
    }

    try {
        console.log('Attempting to delete product with ID:', id);
        console.log('SQL: DELETE FROM products WHERE id = ?');
        console.log('Value:', id);
        
        const [result] = await pool.execute('DELETE FROM products WHERE id = ?', [id]);
        
        console.log('Delete result:', result);
        console.log('Affected rows:', result.affectedRows);
        console.log('Changed rows:', result.changedRows);
        
        if (result.affectedRows === 0) {
            console.log('No product found with ID:', id);
            return res.status(404).json({ 
                success: false, 
                message: 'Product not found' 
            });
        }

        console.log('✅ Product deleted successfully. ID:', id);
        res.json({ 
            success: true, 
            message: 'Product deleted successfully',
            affectedRows: result.affectedRows
        });
        
    } catch (err) {
        console.error('FULL Error deleting product:');
        console.error('Error message:', err.message);
        console.error('Error code:', err.code || 'N/A');
        console.error('SQL State:', err.sqlState || 'N/A');
        console.error('SQL:', err.sql || 'N/A');
        console.error('Stack trace:', err.stack);
        
        // Check for specific MySQL errors
        if (err.code === 'ER_NO_SUCH_TABLE') {
            console.error('⚠️ TABLE DOES NOT EXIST! Check if "products" table exists.');
            return res.status(500).json({ 
                success: false, 
                message: 'Database table does not exist. Please check database setup.' 
            });
        }
        
        if (err.code === 'ER_ACCESS_DENIED_ERROR') {
            console.error('⚠️ DATABASE ACCESS DENIED! Check database credentials.');
            return res.status(500).json({ 
                success: false, 
                message: 'Database access denied. Please check connection credentials.' 
            });
        }
        
        res.status(500).json({ 
            success: false, 
            message: 'Failed to delete product: ' + err.message 
        });
    }
});

module.exports = router;