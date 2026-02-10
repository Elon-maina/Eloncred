const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const cors = require('cors');
const path = require('path');
const session = require("express-session");
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------
// DATABASE
// ---------------------
const pool = require('./db'); // use centralized db.js with mysql2/promise pool

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
// Enable CORS and allow credentials so frontend (including iframes) can send cookies when needed.
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(express.static(path.join(__dirname, '../Frontend')));


// Log all DELETE requests
app.use((req, res, next) => {
    if (req.method === 'DELETE') {
        console.log('=== DELETE REQUEST DETECTED ===');
        console.log('URL:', req.url);
        console.log('Path:', req.path);
        console.log('Original URL:', req.originalUrl);
        console.log('Route:', req.route);
        console.log('======================');
    }
    next();
});
// Session middleware
// Session configuration: 6 hours lifetime, cookie-based sessions
const SIX_HOURS = 6 * 60 * 60 * 1000;
app.use(session({
    name: process.env.SESSION_NAME || 'eloncred_sid',
    secret: process.env.SESSION_SECRET || "session_secret",
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
        secure: false, // set true when using HTTPS
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
// PASSWORD HELPERS
// ---------------------
async function hashPassword(password) {
    return bcrypt.hash(password, 12);
}

async function verifyPassword(raw, hashed) {
    return bcrypt.compare(raw, hashed);
}

// ---------------------
// FRONTEND ROUTES
// ---------------------
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../frontend/home.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, '../frontend/login.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, '../frontend/signup.html')));

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

    try {
        const [users] = await pool.execute(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );

        if (users.length === 0) {
            return res.json({ success: false, message: 'Invalid credentials' });
        }

        const user = users[0];

        // Prevent admin accounts from logging in through the regular user endpoint.
        // Admins must use the admin login page (/api/admin/login) to create an admin session.
        if (user.role && user.role === 'admin') {
            return res.json({ success: false, message: 'Admin accounts must sign in at the admin login page' });
        }

        const valid = await verifyPassword(password, user.password);

        if (!valid) {
            return res.json({ success: false, message: 'Invalid credentials' });
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

    try {
        const [users] = await pool.execute(
            "SELECT * FROM users WHERE email = ? AND role = 'admin'",
            [email]
        );

        if (users.length === 0) {
            return res.json({ success: false, message: 'Invalid admin credentials' });
        }

        const user = users[0];
        const valid = await verifyPassword(password, user.password);

        if (!valid) {
            return res.json({ success: false, message: 'Invalid admin credentials' });
        }

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

    if (!token) {
        return res.status(400).json({ success: false, message: 'No token provided' });
    }

    try {
        await pool.execute('DELETE FROM sessions WHERE session_token = ?', [token]);
        res.json({ success: true, message: 'Logged out successfully' });
    } catch (err) {
        console.error('Logout error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ---------------------
// PROFILE
// ---------------------
app.get('/api/profile/:id', async (req, res) => {
    try {
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

// ---------------------
// START SERVER
// ---------------------
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});