const express = require('express');
const router  = express.Router();
const { Student, Competition, Score } = require('../models');

// ─────────────────────────────────────
// STUDENTS
// ─────────────────────────────────────
router.get('/students', async (req, res) => {
  try {
    const students = await Student.find().sort({ name: 1 });
    res.json(students);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/students', async (req, res) => {
  try {
    const { name, dept } = req.body;
    if (!name || !dept) return res.status(400).json({ error: 'name and dept required' });
    const student = await Student.create({ name, dept });
    res.status(201).json(student);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/students/:id', async (req, res) => {
  try {
    await Student.findByIdAndDelete(req.params.id);
    await Score.deleteMany({ student: req.params.id });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────
// COMPETITIONS
// ─────────────────────────────────────
router.get('/competitions', async (req, res) => {
  try {
    const comps = await Competition.find().sort({ createdAt: 1 });
    res.json(comps);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/competitions', async (req, res) => {
  try {
    const { name, category, date } = req.body;
    if (!name || !category) return res.status(400).json({ error: 'name and category required' });
    const comp = await Competition.create({ name, category, date });
    res.status(201).json(comp);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/competitions/:id', async (req, res) => {
  try {
    await Competition.findByIdAndDelete(req.params.id);
    await Score.deleteMany({ competition: req.params.id });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────
// SCORES
// ─────────────────────────────────────
router.get('/scores', async (req, res) => {
  try {
    const scores = await Score.find()
      .populate('student', 'name dept')
      .populate('competition', 'name category')
      .sort({ updatedAt: -1 });
    res.json(scores);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Upsert score (create or update)
router.post('/scores', async (req, res) => {
  try {
    const { studentId, competitionId, points } = req.body;
    if (!studentId || !competitionId || points == null)
      return res.status(400).json({ error: 'studentId, competitionId, points required' });

    const score = await Score.findOneAndUpdate(
      { student: studentId, competition: competitionId },
      { points, updatedAt: new Date() },
      { upsert: true, new: true }
    ).populate('student', 'name dept').populate('competition', 'name category');

    res.json(score);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/scores/:id', async (req, res) => {
  try {
    await Score.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────
// LEADERBOARD  (aggregated)
// ─────────────────────────────────────
router.get('/leaderboard', async (req, res) => {
  try {
    // Per-category totals
    const catMeta = {
      ace1:   { label: 'Ramadan Code Quest',       dept: 'ACE',   emoji: '🖥️'  },
      ace2:   { label: 'Fast-Tech Firdaus',         dept: 'ACE',   emoji: '⚡'  },
      arena1: { label: 'Crescent Creative Studio',  dept: 'ARENA', emoji: '🎨' },
      arena2: { label: 'Digital Suhoor Designers',  dept: 'ARENA', emoji: '🌟' },
    };

    const scores = await Score.find()
      .populate('student', 'name dept')
      .populate('competition', 'name category');

    // Build map: studentId -> { info, categories: { catId -> total } }
    const map = {};
    for (const s of scores) {
      const sid   = s.student._id.toString();
      const cat   = s.competition.category;
      if (!map[sid]) map[sid] = { student: s.student, cats: {} };
      map[sid].cats[cat] = (map[sid].cats[cat] || 0) + s.points;
    }

    // Build rows
    const rows = Object.values(map).map(({ student, cats }) => {
      const total = Object.values(cats).reduce((a, b) => a + b, 0);
      return { student, cats, total };
    }).sort((a, b) => b.total - a.total);

    // Per-category leaders
    const catLeaders = {};
    for (const catId of Object.keys(catMeta)) {
      const sorted = rows
        .filter(r => r.cats[catId] != null)
        .sort((a, b) => (b.cats[catId] || 0) - (a.cats[catId] || 0));
      catLeaders[catId] = sorted.slice(0, 5).map((r, i) => ({
        rank: i + 1,
        studentId: r.student._id,
        name: r.student.name,
        dept: r.student.dept,
        points: r.cats[catId] || 0,
      }));
    }

    res.json({ overall: rows.slice(0, 10), catLeaders, catMeta });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
