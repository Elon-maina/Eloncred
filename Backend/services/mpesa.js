// Safaricom Daraja client for M-Pesa Express (STK Push).
// All credentials come from Backend/.env — see .env.example for the full list.

const BASE_URLS = {
    sandbox: 'https://sandbox.safaricom.co.ke',
    production: 'https://api.safaricom.co.ke'
};

function config() {
    const env = (process.env.MPESA_ENV || 'sandbox').toLowerCase();
    const shortcode = process.env.MPESA_SHORTCODE || '';
    return {
        env,
        baseUrl: BASE_URLS[env] || BASE_URLS.sandbox,
        consumerKey: process.env.MPESA_CONSUMER_KEY || '',
        consumerSecret: process.env.MPESA_CONSUMER_SECRET || '',
        shortcode,
        passkey: process.env.MPESA_PASSKEY || '',
        // CustomerPayBillOnline for a Paybill, CustomerBuyGoodsOnline for a Till number
        transactionType: process.env.MPESA_TRANSACTION_TYPE || 'CustomerPayBillOnline',
        // For Buy Goods the money goes to the Till (PartyB), which can differ from the store number
        partyB: process.env.MPESA_PARTY_B || shortcode,
        callbackUrl: process.env.MPESA_CALLBACK_URL || '',
        timeoutMs: Number(process.env.MPESA_HTTP_TIMEOUT_MS || 30000)
    };
}

function missingConfig() {
    const c = config();
    const missing = [];
    if (!c.consumerKey) missing.push('MPESA_CONSUMER_KEY');
    if (!c.consumerSecret) missing.push('MPESA_CONSUMER_SECRET');
    if (!c.shortcode) missing.push('MPESA_SHORTCODE');
    if (!c.passkey) missing.push('MPESA_PASSKEY');
    if (!c.callbackUrl) missing.push('MPESA_CALLBACK_URL');
    else if (!/^https:\/\//i.test(c.callbackUrl)) missing.push('MPESA_CALLBACK_URL (must be https)');
    return missing;
}

// 07XXXXXXXX, 01XXXXXXXX, +2547..., 2547..., 7XXXXXXXX -> 2547XXXXXXXX / 2541XXXXXXXX
function normalizePhone(input) {
    const digits = String(input || '').replace(/\D/g, '');
    let local;
    if (/^254[17]\d{8}$/.test(digits)) local = digits.slice(3);
    else if (/^0[17]\d{8}$/.test(digits)) local = digits.slice(1);
    else if (/^[17]\d{8}$/.test(digits)) local = digits;
    else return null;
    return '254' + local;
}

// Daraja expects YYYYMMDDHHmmss in Kenya time (EAT, UTC+3)
function timestamp(date = new Date()) {
    const eat = new Date(date.getTime() + 3 * 60 * 60 * 1000);
    const p = n => String(n).padStart(2, '0');
    return `${eat.getUTCFullYear()}${p(eat.getUTCMonth() + 1)}${p(eat.getUTCDate())}` +
        `${p(eat.getUTCHours())}${p(eat.getUTCMinutes())}${p(eat.getUTCSeconds())}`;
}

function stkPassword(shortcode, passkey, ts) {
    return Buffer.from(`${shortcode}${passkey}${ts}`).toString('base64');
}

async function request(url, options, timeoutMs) {
    const res = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
    const text = await res.text();
    let body;
    try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
    return { ok: res.ok, status: res.status, body };
}

// Access tokens last 1 hour; cache and refresh a minute early.
let cachedToken = null;
async function getAccessToken() {
    const c = config();
    if (cachedToken && cachedToken.env === c.env && cachedToken.expiresAt > Date.now()) {
        return cachedToken.value;
    }
    const auth = Buffer.from(`${c.consumerKey}:${c.consumerSecret}`).toString('base64');
    const { ok, status, body } = await request(
        `${c.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
        { headers: { Authorization: `Basic ${auth}` } },
        c.timeoutMs
    );
    if (!ok || !body.access_token) {
        throw new MpesaError(`Could not get M-Pesa access token (HTTP ${status})`, body);
    }
    const ttl = (Number(body.expires_in) || 3599) * 1000;
    cachedToken = { env: c.env, value: body.access_token, expiresAt: Date.now() + ttl - 60000 };
    return cachedToken.value;
}

class MpesaError extends Error {
    constructor(message, details) {
        super(message);
        this.name = 'MpesaError';
        this.details = details;
    }
}

// Send the PIN prompt to the customer's phone.
async function stkPush({ phone, amount, accountReference, description }) {
    const c = config();
    const ts = timestamp();
    const token = await getAccessToken();
    const payload = {
        BusinessShortCode: c.shortcode,
        Password: stkPassword(c.shortcode, c.passkey, ts),
        Timestamp: ts,
        TransactionType: c.transactionType,
        Amount: amount,
        PartyA: phone,
        PartyB: c.partyB,
        PhoneNumber: phone,
        CallBackURL: c.callbackUrl,
        AccountReference: String(accountReference).slice(0, 12),
        TransactionDesc: String(description || 'Payment').slice(0, 13)
    };
    const { ok, status, body } = await request(
        `${c.baseUrl}/mpesa/stkpush/v1/processrequest`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
        c.timeoutMs
    );
    if (!ok || String(body.ResponseCode) !== '0') {
        throw new MpesaError(body.errorMessage || body.ResponseDescription || `STK push failed (HTTP ${status})`, body);
    }
    return {
        merchantRequestId: body.MerchantRequestID,
        checkoutRequestId: body.CheckoutRequestID,
        customerMessage: body.CustomerMessage
    };
}

// Ask Daraja for the result of an STK push (used when the callback has not arrived).
// Returns { state: 'pending' | 'paid' | 'failed', resultCode, resultDesc }
async function stkQuery(checkoutRequestId) {
    const c = config();
    const ts = timestamp();
    const token = await getAccessToken();
    const { body } = await request(
        `${c.baseUrl}/mpesa/stkpushquery/v1/query`,
        {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                BusinessShortCode: c.shortcode,
                Password: stkPassword(c.shortcode, c.passkey, ts),
                Timestamp: ts,
                CheckoutRequestID: checkoutRequestId
            })
        },
        c.timeoutMs
    );
    // While the customer has not answered, Daraja replies with an error code instead of a result
    if (body.errorCode) {
        return { state: 'pending', resultCode: null, resultDesc: body.errorMessage || 'Still processing' };
    }
    if (body.ResultCode === undefined) {
        return { state: 'pending', resultCode: null, resultDesc: 'No result yet' };
    }
    const code = Number(body.ResultCode);
    return { state: code === 0 ? 'paid' : 'failed', resultCode: code, resultDesc: body.ResultDesc || '' };
}

// Turn the callback's CallbackMetadata.Item list into a plain object.
function parseCallbackMetadata(items) {
    const out = {};
    for (const it of Array.isArray(items) ? items : []) {
        if (it && it.Name) out[it.Name] = it.Value;
    }
    return out;
}

module.exports = {
    config,
    missingConfig,
    normalizePhone,
    timestamp,
    stkPassword,
    stkPush,
    stkQuery,
    parseCallbackMetadata,
    MpesaError
};
