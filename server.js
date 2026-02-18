require('dotenv').config();
const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const path     = require('path');
const session  = require('express-session');
const MongoStore = require('connect-mongo');  // ← ADD THIS

const app  = express();
const PORT = process.env.PORT || 3000;

// ── MIDDLEWARE ──
app.use(cors());
app.use(express.json());

// ── MONGODB FIRST (needed for session store) ──
const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error('❌  MONGODB_URI environment variable not set!');
  process.exit(1);
}

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('✅  MongoDB connected');

    app.set('trust proxy', 1);
    
    // ── SESSION (after MongoDB connection) ──
    app.use(session({
      secret: process.env.SESSION_SECRET || 'ramadan-league-secret-2026',
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({
        mongoUrl: MONGO_URI,
        touchAfter: 24 * 3600 // lazy session update (24 hours)
      }),
      cookie: { 
        secure: true,  // ← Changed to always true (Render uses HTTPS)
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'lax'  // ← ADD THIS
      }
    }));

    // ── AUTH MIDDLEWARE ──
    const requireAuth = (req, res, next) => {
      if (req.session.authenticated) {
        return next();
      }
      res.status(401).json({ error: 'Authentication required' });
    };

    // ── STATIC FILES ──
    app.use('/assets', express.static(path.join(__dirname, 'public')));

    // ── AUTH ROUTES ──
    app.post('/auth/login', (req, res) => {
      const { password } = req.body;
      const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
      
      if (password === ADMIN_PASSWORD) {
        req.session.authenticated = true;
        res.json({ success: true });
      } else {
        res.status(401).json({ error: 'Invalid password' });
      }
    });

    app.post('/auth/logout', (req, res) => {
      req.session.destroy();
      res.json({ success: true });
    });

    app.get('/auth/check', (req, res) => {
      res.json({ authenticated: !!req.session.authenticated });
    });

    // ── API ROUTES (PROTECTED) ──
    app.use('/api', requireAuth, require('./routes/api'));

    // ── ROUTES ──
    app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'login.html'));
    });

    app.get('/admin', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    app.get('/leaderboard.html', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'leaderboard.html'));
    });

    // ── START SERVER ──
    app.listen(PORT, () => console.log(`🚀  Server running on port ${PORT}`));
  })
  .catch(err => {
    console.error('❌  MongoDB connection error:', err.message);
    process.exit(1);
  });
