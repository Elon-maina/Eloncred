const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const pool = require('../db');
const { requireUser } = require('../middleware/auth');
const mpesa = require('../services/mpesa');

// If no callback arrives, ask Daraja directly — but not more often than this
const QUERY_AFTER_MS = 20 * 1000;
const QUERY_EVERY_MS = 10 * 1000;
// Don't send a second PIN prompt for the same order while the first is still live
const REPUSH_WAIT_MS = 60 * 1000;

function safeEqual(a, b) {
    const x = Buffer.from(String(a || ''));
    const y = Buffer.from(String(b || ''));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Record the final result of a payment. Idempotent: only a pending payment can change.
async function finalizePayment(checkoutRequestId, { paid, resultCode, resultDesc, receipt, transactionDate, paidAmount }) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [rows] = await conn.execute(
            'SELECT * FROM mpesa_payments WHERE checkout_request_id = ? FOR UPDATE',
            [checkoutRequestId]
        );
        if (!rows.length) { await conn.rollback(); return { found: false }; }
        const payment = rows[0];
        if (payment.status !== 'pending') { await conn.rollback(); return { found: true, status: payment.status }; }

        let status = paid ? 'paid' : 'failed';
        let desc = resultDesc || '';
        if (paid && paidAmount !== undefined && Number(paidAmount) !== Number(payment.amount)) {
            status = 'failed';
            desc = `Amount mismatch: expected ${payment.amount}, received ${paidAmount}`;
        }

        await conn.execute(
            `UPDATE mpesa_payments
             SET status = ?, result_code = ?, result_desc = ?, mpesa_receipt = ?, transaction_date = ?, updated_at = NOW()
             WHERE id = ?`,
            [status, resultCode ?? null, desc.slice(0, 255), receipt || null, transactionDate || null, payment.id]
        );

        if (status === 'paid') {
            await conn.execute("UPDATE orders SET status = 'confirmed' WHERE id = ? AND status = 'pending'", [payment.order_id]);
            await conn.execute('DELETE FROM cart WHERE user_id = ?', [payment.user_id]);
        }
        await conn.commit();
        return { found: true, status };
    } catch (err) {
        await conn.rollback().catch(() => {});
        throw err;
    } finally {
        conn.release();
    }
}

// Daraja TransactionDate is a number like 20261117143015 (EAT)
function parseTransactionDate(v) {
    const s = String(v || '');
    if (!/^\d{14}$/.test(s)) return null;
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)} ${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}`;
}

// ==========================
// START PAYMENT: send the PIN prompt to the customer's phone
// body: { orderId, phone }
// ==========================
router.post('/stkpush', requireUser, async (req, res) => {
    const missing = mpesa.missingConfig();
    if (missing.length) {
        console.error('M-Pesa not configured, missing:', missing.join(', '));
        return res.status(503).json({ success: false, message: 'M-Pesa payments are not available right now.' });
    }

    const orderId = Number(req.body.orderId);
    const phone = mpesa.normalizePhone(req.body.phone);
    if (!Number.isInteger(orderId) || orderId < 1) {
        return res.status(400).json({ success: false, message: 'Invalid order' });
    }
    if (!phone) {
        return res.status(400).json({ success: false, message: 'Enter a valid Safaricom number, e.g. 0712 345 678' });
    }

    try {
        const [orders] = await pool.execute(
            'SELECT id, user_id, total_amount, status FROM orders WHERE id = ? AND user_id = ?',
            [orderId, req.user_id]
        );
        if (!orders.length) return res.status(404).json({ success: false, message: 'Order not found' });
        const order = orders[0];
        if (order.status !== 'pending') {
            return res.status(409).json({ success: false, message: 'This order is not awaiting payment' });
        }

        const [existing] = await pool.execute(
            `SELECT status, created_at FROM mpesa_payments WHERE order_id = ? ORDER BY id DESC LIMIT 1`,
            [orderId]
        );
        if (existing.length) {
            if (existing[0].status === 'paid') {
                return res.status(409).json({ success: false, message: 'This order is already paid' });
            }
            if (existing[0].status === 'pending' && Date.now() - new Date(existing[0].created_at).getTime() < REPUSH_WAIT_MS) {
                return res.status(429).json({ success: false, message: 'A payment request was just sent. Check your phone or wait a minute to try again.' });
            }
        }

        // M-Pesa only accepts whole shillings
        const amount = Math.ceil(Number(order.total_amount));
        if (!(amount >= 1)) return res.status(400).json({ success: false, message: 'Invalid order amount' });

        const result = await mpesa.stkPush({
            phone,
            amount,
            accountReference: `ELONCRED${order.id}`,
            description: `Order ${order.id}`
        });

        await pool.execute(
            `INSERT INTO mpesa_payments
             (order_id, user_id, phone, amount, merchant_request_id, checkout_request_id, status)
             VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
            [order.id, req.user_id, phone, amount, result.merchantRequestId, result.checkoutRequestId]
        );
        // Older still-pending requests for this order are superseded
        await pool.execute(
            `UPDATE mpesa_payments SET status = 'failed', result_desc = 'Superseded by a newer request', updated_at = NOW()
             WHERE order_id = ? AND status = 'pending' AND checkout_request_id <> ?`,
            [order.id, result.checkoutRequestId]
        );

        res.json({
            success: true,
            message: result.customerMessage || 'Check your phone and enter your M-Pesa PIN',
            checkoutRequestId: result.checkoutRequestId,
            amount
        });
    } catch (err) {
        if (err instanceof mpesa.MpesaError) {
            console.error('STK push error:', err.message, err.details);
            return res.status(502).json({ success: false, message: 'Could not reach M-Pesa. Please try again.' });
        }
        console.error('STK push error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ==========================
// PAYMENT STATUS (polled by the checkout page)
// ==========================
router.get('/status/:checkoutRequestId', requireUser, async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT id, order_id, status, result_desc, mpesa_receipt, amount, created_at, last_queried_at
             FROM mpesa_payments WHERE checkout_request_id = ? AND user_id = ?`,
            [req.params.checkoutRequestId, req.user_id]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: 'Payment not found' });
        let p = rows[0];

        // Fallback when the callback has not arrived (e.g. server not reachable from the internet)
        const age = Date.now() - new Date(p.created_at).getTime();
        const sinceQuery = p.last_queried_at ? Date.now() - new Date(p.last_queried_at).getTime() : Infinity;
        if (p.status === 'pending' && age > QUERY_AFTER_MS && sinceQuery > QUERY_EVERY_MS && !mpesa.missingConfig().length) {
            await pool.execute('UPDATE mpesa_payments SET last_queried_at = NOW() WHERE id = ?', [p.id]);
            try {
                const q = await mpesa.stkQuery(req.params.checkoutRequestId);
                if (q.state !== 'pending') {
                    await finalizePayment(req.params.checkoutRequestId, {
                        paid: q.state === 'paid', resultCode: q.resultCode, resultDesc: q.resultDesc
                    });
                    const [again] = await pool.execute(
                        'SELECT id, order_id, status, result_desc, mpesa_receipt, amount FROM mpesa_payments WHERE id = ?',
                        [p.id]
                    );
                    p = again[0];
                }
            } catch (err) {
                console.warn('STK query failed:', err.message);
            }
        }

        res.json({
            success: true,
            status: p.status,
            orderId: p.order_id,
            amount: Number(p.amount),
            receipt: p.mpesa_receipt,
            message: p.status === 'failed' ? (p.result_desc || 'Payment was not completed') : undefined
        });
    } catch (err) {
        console.error('Payment status error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ==========================
// DARAJA CALLBACK (called by Safaricom, not by the browser)
// URL: MPESA_CALLBACK_URL = https://<your-domain>/api/mpesa/callback/<MPESA_CALLBACK_SECRET>
// ==========================
router.post('/callback/:secret', async (req, res) => {
    // Always acknowledge so Safaricom does not keep retrying; problems are logged instead.
    const ack = () => res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

    if (!process.env.MPESA_CALLBACK_SECRET || !safeEqual(req.params.secret, process.env.MPESA_CALLBACK_SECRET)) {
        console.warn('M-Pesa callback rejected: bad secret from', req.ip);
        return res.status(403).json({ ResultCode: 1, ResultDesc: 'Rejected' });
    }

    const cb = req.body && req.body.Body && req.body.Body.stkCallback;
    if (!cb || !cb.CheckoutRequestID) {
        console.warn('M-Pesa callback with unexpected body');
        return ack();
    }

    try {
        const code = Number(cb.ResultCode);
        const meta = mpesa.parseCallbackMetadata(cb.CallbackMetadata && cb.CallbackMetadata.Item);
        const result = await finalizePayment(cb.CheckoutRequestID, {
            paid: code === 0,
            resultCode: code,
            resultDesc: cb.ResultDesc,
            receipt: meta.MpesaReceiptNumber,
            transactionDate: parseTransactionDate(meta.TransactionDate),
            paidAmount: code === 0 ? meta.Amount : undefined
        });
        if (!result.found) console.warn('M-Pesa callback for unknown request', cb.CheckoutRequestID);
        else console.log(`M-Pesa ${cb.CheckoutRequestID}: ${result.status} (${cb.ResultDesc})`);
    } catch (err) {
        console.error('M-Pesa callback error:', err);
    }
    ack();
});

module.exports = router;
module.exports.finalizePayment = finalizePayment;
