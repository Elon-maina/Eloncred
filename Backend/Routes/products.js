const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');

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

// ==========================
// ADD PRODUCT (ADMIN ONLY)
// ==========================
router.post('/', requireAdmin, async (req, res) => {
    const { name, price, category, image, stock_quantity } = req.body;

    if (!name || !price || !category) {
        return res.status(400).json({
            success: false,
            message: 'Missing required fields'
        });
    }

    const numericPrice = Number(price);
    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
        return res.status(400).json({ success: false, message: 'Invalid price' });
    }

    try {
        const [result] = await pool.execute(
            `INSERT INTO products
            (name, price, category, image, stock_quantity)
            VALUES (?, ?, ?, ?, ?)`,
            [name, numericPrice, category, image || null, Number(stock_quantity) || 0]
        );

        res.json({
            success: true,
            message: 'Product added successfully',
            productId: result.insertId
        });
    } catch (err) {
        console.error('Error adding product:', err);
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
    const id = Number(req.params.id);

    if (!id) {
        return res.status(400).json({
            success: false,
            message: 'Invalid product id'
        });
    }

    try {
        const [result] = await pool.execute('DELETE FROM products WHERE id = ?', [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        res.json({
            success: true,
            message: 'Product deleted successfully',
            affectedRows: result.affectedRows
        });
    } catch (err) {
        console.error('Error deleting product:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to delete product'
        });
    }
});

module.exports = router;
