const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const cors = require('cors');
const path = require('path');
const session = require("express-session");
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });

if (!process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET is required. Configure it in Backend/.env.');
}

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------
// DATABASE
// ---------------------
const pool = require('./db'); // use centralized db.js with mysql2/promise pool
const { requireUser } = require('./middleware/auth');

// Test DB connection
(async () => {
    try {
        const conn = await pool.getConnection();
        console.log('Database connected successfully');
        conn.release();
    } catch (err) {
        console.error('❌ Database connection failed:', err.message);
    }
})();

// ---------------------
// MIDDLEWARE
// ---------------------
// The frontend is served by this same server, so cross-origin requests are only allowed
// for origins listed explicitly in CORS_ORIGINS (comma-separated), e.g. a live-server dev URL.
const allowedOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : false, credentials: true }));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(express.static(path.join(__dirname, '../Frontend')));

// Session middleware
// Session configuration: 6 hours lifetime, cookie-based sessions
const SIX_HOURS = 6 * 60 * 60 * 1000;
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';
if (COOKIE_SECURE) app.set('trust proxy', 1);
app.use(session({
    name: process.env.SESSION_NAME || 'eloncred_sid',
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
        secure: COOKIE_SECURE, // set COOKIE_SECURE=true when served over HTTPS
        httpOnly: true,
        maxAge: SIX_HOURS,
        sameSite: 'lax'
    }
}));

// ---------------------
// PRODUCT ROUTES
// ---------------------
const productsRouter = require('./Routes/products');
app.use('/api/products', productsRouter);

// ---------------------
// CART ROUTES
// ---------------------
const cartRouter = require('./Routes/cartroutes');
app.use('/api/cart', cartRouter);
// ---------------------
// FEEDBACK / MESSAGES
// ---------------------
const feedbackRoutes = require('./Routes/feedbackRoutes');
feedbackRoutes(app, pool);
// ---------------------
// ADMIN ROUTES
// ---------------------
const adminRouter = require('./Routes/admin');
app.use('/api/admin', adminRouter);
// ---------------------
// ORDER ROUTES
// ---------------------
const ordersRouter = require('./Routes/orders');
app.use('/api/orders', ordersRouter);
// ---------------------
// PASSWORD HELPERS
// ---------------------
async function hashPassword(password) {
    return bcrypt.hash(password, 12);
}

async function verifyPassword(raw, hashed) {
    return bcrypt.compare(raw, hashed);
}

// ---------------------
// LOGIN RATE LIMITING (in-memory, per IP + email)
// ---------------------
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;
const loginAttempts = new Map();

function loginKey(req) {
    return `${req.ip}|${String(req.body?.email || '').toLowerCase()}`;
}

function isLoginBlocked(req) {
    const entry = loginAttempts.get(loginKey(req));
    if (!entry) return false;
    if (Date.now() - entry.first > LOGIN_WINDOW_MS) {
        loginAttempts.delete(loginKey(req));
        return false;
    }
    return entry.count >= LOGIN_MAX_ATTEMPTS;
}

function recordLoginFailure(req) {
    const key = loginKey(req);
    const entry = loginAttempts.get(key);
    if (!entry || Date.now() - entry.first > LOGIN_WINDOW_MS) {
        loginAttempts.set(key, { count: 1, first: Date.now() });
    } else {
        entry.count++;
    }
}

function clearLoginFailures(req) {
    loginAttempts.delete(loginKey(req));
}

const TOO_MANY_ATTEMPTS = { success: false, message: 'Too many login attempts. Please try again in 15 minutes.' };

// ---------------------
// FRONTEND ROUTES
// ---------------------
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../Frontend/home.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, '../Frontend/login.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, '../Frontend/signup.html')));

// ---------------------
// AUTH APIs
// ---------------------

// SIGNUP
app.post('/api/signup', async (req, res) => {
    const { fullname, email, phone, password } = req.body;

    if (!fullname || !email || !phone || !password) {
        return res.json({ success: false, message: 'All fields are required' });
    }

    if (password.length < 6) {
        return res.json({ success: false, message: 'Password too short' });
    }

    try {
        const [exists] = await pool.execute(
            'SELECT id FROM users WHERE email = ? OR phone = ?',
            [email, phone]
        );

        if (exists.length > 0) {
            return res.json({ success: false, message: 'User already exists' });
        }

        const hashed = await hashPassword(password);

        await pool.execute(
            'INSERT INTO users (fullname, email, phone, password) VALUES (?, ?, ?, ?)',
            [fullname, email, phone, hashed]
        );

        res.json({ success: true, message: 'Account created successfully' });
    } catch (err) {
        console.error('Signup error:', err);
        res.json({ success: false, message: 'Server error' });
    }
});

// LOGIN
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.json({ success: false, message: 'Email and password required' });
    }

    if (isLoginBlocked(req)) return res.status(429).json(TOO_MANY_ATTEMPTS);

    try {
        const [users] = await pool.execute(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );

        if (users.length === 0) {
            recordLoginFailure(req);
            return res.json({ success: false, message: 'Invalid credentials' });
        }

        const user = users[0];
        const valid = await verifyPassword(password, user.password);

        if (!valid) {
            recordLoginFailure(req);
            return res.json({ success: false, message: 'Invalid credentials' });
        }
        clearLoginFailures(req);

        // Prevent admin accounts from logging in through the regular user endpoint.
        // Admins must use the admin login page (/api/admin/login) to create an admin session.
        if (user.role && user.role === 'admin') {
            return res.json({ success: false, message: 'Admin accounts must sign in at the admin login page' });
        }

        const token = crypto.randomBytes(32).toString('hex');

        await pool.execute(
            `INSERT INTO sessions 
             (user_id, session_token, created_at, expires_at) 
             VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 7 DAY))`,
            [user.id, token]
        );

        // store user id and token in express-session for cookie-based auth fallback
        try {
            if (req && req.session) {
                req.session.userId = user.id;
                req.session.sessionToken = token;
                // ensure cookie expiry aligns with server session lifetime
                if (req.session.cookie) req.session.cookie.maxAge = SIX_HOURS;
                // save session before responding to ensure cookie set
                req.session.save(err => {
                    if (err) console.warn('Session save error:', err);
                    return res.json({
                        success: true,
                        message: 'Login successful',
                        user: {
                            id: user.id,
                            fullname: user.fullname,
                            email: user.email
                        },
                        session: {
                            token,
                            expiresIn: SIX_HOURS / 1000
                        }
                    });
                });
            } else {
                return res.json({ success: true, message: 'Login successful', user: { id: user.id, fullname: user.fullname, email: user.email }, session: { token, expiresIn: SIX_HOURS / 1000 } });
            }
        } catch (e) {
            console.warn('Session write skipped:', e);
            res.json({
                success: true,
                message: 'Login successful',
                user: {
                    id: user.id,
                    fullname: user.fullname,
                    email: user.email
                },
                session: {
                    token,
                    expiresIn: SIX_HOURS / 1000
                }
            });
        }

    } catch (err) {
        console.error('Login error:', err);
        res.json({ success: false, message: 'Server error' });
    }
});

// ---------------------
// ADMIN LOGIN
// ---------------------
app.post('/api/admin/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.json({ success: false, message: 'Email and password required' });
    }

    if (isLoginBlocked(req)) return res.status(429).json(TOO_MANY_ATTEMPTS);

    try {
        const [users] = await pool.execute(
            "SELECT * FROM users WHERE email = ? AND role = 'admin'",
            [email]
        );

        if (users.length === 0) {
            recordLoginFailure(req);
            return res.json({ success: false, message: 'Invalid admin credentials' });
        }

        const user = users[0];
        const valid = await verifyPassword(password, user.password);

        if (!valid) {
            recordLoginFailure(req);
            return res.json({ success: false, message: 'Invalid admin credentials' });
        }
        clearLoginFailures(req);

        const token = crypto.randomBytes(32).toString('hex');

        await pool.execute(
            `INSERT INTO sessions 
             (user_id, session_token, created_at, expires_at) 
             VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 7 DAY))`,
            [user.id, token]
        ).catch(() => {});

        try {
            if (req && req.session) {
                req.session.adminId = user.id;
                req.session.isAdmin = true;
                req.session.sessionToken = token;
                if (req.session.cookie) req.session.cookie.maxAge = SIX_HOURS;
                req.session.save(err => {
                    if (err) console.warn('Session save error (admin):', err);
                    return res.json({
                        success: true,
                        message: 'Admin login successful',
                        admin: {
                            id: user.id,
                            email: user.email
                        },
                        session: {
                            token,
                            expiresIn: SIX_HOURS / 1000
                        }
                    });
                });
            } else {
                return res.json({ success: true, message: 'Admin login successful', admin: { id: user.id, email: user.email }, session: { token, expiresIn: SIX_HOURS / 1000 } });
            }
        } catch (e) {
            console.warn('Session write skipped (admin):', e);
            res.json({
                success: true,
                message: 'Admin login successful',
                admin: {
                    id: user.id,
                    email: user.email
                },
                session: {
                    token,
                    expiresIn: SIX_HOURS / 1000
                }
            });
        }

    } catch (err) {
        console.error('Admin login error:', err);
        res.json({ success: false, message: 'Server error' });
    }
});

// LOGOUT
app.post('/api/logout', async (req, res) => {
    const token =
        req.body?.token ||
        (req.get('Authorization')?.startsWith('Bearer ')
            ? req.get('Authorization').split(' ')[1]
            : null);

    const sessionToken = req.session?.sessionToken;

    if (!token && !sessionToken) {
        return res.status(400).json({ success: false, message: 'No token provided' });
    }

    try {
        for (const t of new Set([token, sessionToken].filter(Boolean))) {
            await pool.execute('DELETE FROM sessions WHERE session_token = ?', [t]);
        }
        if (req.session) {
            await new Promise(resolve => req.session.destroy(() => resolve()));
            res.clearCookie(process.env.SESSION_NAME || 'eloncred_sid');
        }
        res.json({ success: true, message: 'Logged out successfully' });
    } catch (err) {
        console.error('Logout error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ---------------------
// PROFILE
// ---------------------
app.get('/api/profile/:id', requireUser, async (req, res) => {
    try {
        if (Number(req.params.id) !== Number(req.user_id)) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        const [users] = await pool.execute(
            'SELECT id, fullname, email, phone, created_at FROM users WHERE id = ?',
            [req.params.id]
        );

        if (!users.length) {
            return res.json({ success: false, message: 'User not found' });
        }

        res.json({ success: true, user: users[0] });
    } catch (err) {
        console.error('Profile fetch error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Return JSON for malformed request bodies and unexpected errors instead of HTML stack traces
app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ success: false, message: 'Invalid JSON body' });
    }
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ success: false, message: 'Request body too large' });
    }
    console.error('Unhandled error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
});

// ---------------------
// START SERVER
// ---------------------
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});