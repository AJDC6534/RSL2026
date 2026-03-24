require('dotenv').config();
const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const path     = require('path');
const session  = require('express-session');
const MongoStore = require('connect-mongo');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── MIDDLEWARE ──
app.use(cors());
app.use(express.json());

// ── MONGODB ──
const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error('❌  MONGODB_URI environment variable not set!');
  process.exit(1);
}

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('✅  MongoDB connected');
    
    // ── TRUST PROXY (for Render) ──
    app.set('trust proxy', 1);
    
    // ── SESSION ──
    app.use(session({
      secret: process.env.SESSION_SECRET || 'ramadan-league-secret-2026',
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({
        mongoUrl: MONGO_URI,
        touchAfter: 24 * 3600
      }),
      cookie: { 
        secure: true,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'lax'
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

    // ── PUBLIC API ROUTES (no auth - for public leaderboard) ──
    app.get('/api/leaderboard', async (req, res) => {
      try {
        const { Student, Competition, Score } = require('./models');
        
        const catMeta = {
          ace1:   { label: 'Ramadan Code Quest',       dept: 'ACE',   emoji: '🖥️'  },
          ace2:   { label: 'Fast-Tech Firdaus',         dept: 'ACE',   emoji: '⚡'  },
          arena1: { label: 'Crescent Creative Studio',  dept: 'ARENA', emoji: '🎨' },
          arena2: { label: 'Digital Suhoor Designers',  dept: 'ARENA', emoji: '🌟' },
        };

        const scores = await Score.find()
          .populate('student', 'name dept')
          .populate('competition', 'name category');

        const map = {};
        for (const s of scores) {
          const sid = s.student._id.toString();
          const cat = s.competition.category;
          if (!map[sid]) map[sid] = { student: s.student, cats: {} };
          map[sid].cats[cat] = (map[sid].cats[cat] || 0) + s.points;
        }

        const rows = Object.values(map).map(({ student, cats }) => {
          const total = Object.values(cats).reduce((a, b) => a + b, 0);
          return { student, cats, total };
        }).sort((a, b) => b.total - a.total);

        // Assign tie-aware ranks to overall
        rows.forEach((row, i) => {
          if (i > 0 && row.total === rows[i - 1].total) {
            row.rank = rows[i - 1].rank;
          } else {
            row.rank = i + 1;
          }
        });

        const catLeaders = {};
        for (const catId of Object.keys(catMeta)) {
          const sorted = rows
            .filter(r => r.cats[catId] != null)
            .sort((a, b) => (b.cats[catId] || 0) - (a.cats[catId] || 0));

          // Build array with tie-aware ranks using a loop (not .map)
          const leaders = [];
          for (let i = 0; i < sorted.length; i++) {
            const r = sorted[i];
            const pts = r.cats[catId] || 0;
            let rank;
            if (i > 0 && pts === leaders[i - 1].points) {
              rank = leaders[i - 1].rank; // same rank as previous
            } else {
              rank = i + 1;
            }
            leaders.push({
              rank,
              studentId: r.student._id,
              name: r.student.name,
              dept: r.student.dept,
              points: pts,
            });
          }
          catLeaders[catId] = leaders;
        }

        res.json({ overall: rows, catLeaders, catMeta });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });

    app.get('/api/students', async (req, res) => {
      try {
        const { Student } = require('./models');
        const students = await Student.find().sort({ name: 1 });
        res.json(students);
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });

    app.get('/api/competitions', async (req, res) => {
      try {
        const { Competition } = require('./models');
        const comps = await Competition.find().sort({ createdAt: 1 });
        res.json(comps);
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });

    app.get('/api/scores', async (req, res) => {
      try {
        const { Score } = require('./models');
        const scores = await Score.find()
          .populate('student', 'name dept')
          .populate('competition', 'name category')
          .sort({ updatedAt: -1 });
        res.json(scores);
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });

    // ── UPDATE STUDENT (enrollments) - protected ──
    app.put('/api/students/:id', requireAuth, async (req, res) => {
      try {
        const { Student } = require('./models');
        const update = {};
        if (req.body.name) update.name = req.body.name;
        if (req.body.dept) update.dept = req.body.dept;
        if (req.body.enrolledCompetitions !== undefined) {
          update.enrolledCompetitions = req.body.enrolledCompetitions;
        }
        const student = await Student.findByIdAndUpdate(
          req.params.id,
          update,
          { new: true }
        );
        if (!student) return res.status(404).json({ error: 'Student not found' });
        res.json(student);
      } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // ── PROTECTED API ROUTES (admin only - requires auth) ──
    app.use('/api', requireAuth, require('./routes/api'));

    // ── PAGE ROUTES ──
    app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'login.html'));
    });

    app.get('/admin', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    app.get('/leaderboard.html', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'leaderboard.html'));
    });
    
    app.get('/scores.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'scores.html'));
    });
    
    app.get('/winners.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'scores.html'));
    });
    
    // ── START SERVER ──
    app.listen(PORT, () => console.log(`🚀  Server running on port ${PORT}`));
  })
  .catch(err => {
    console.error('❌  MongoDB connection error:', err.message);
    process.exit(1);
  });
