const mongoose = require('mongoose');

// ── STUDENT ──
const studentSchema = new mongoose.Schema({
  name:      { type: String, required: true, trim: true },
  dept:      { type: String, enum: ['ACE', 'ARENA'], required: true },
  createdAt: { type: Date, default: Date.now },
});
const Student = mongoose.model('Student', studentSchema);

// ── COMPETITION ──
const competitionSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true },
  category: {
    type: String,
    enum: ['ace1', 'ace2', 'arena1', 'arena2'],
    required: true,
  },
  date:      { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});
const Competition = mongoose.model('Competition', competitionSchema);

// ── SCORE ──
const scoreSchema = new mongoose.Schema({
  student:     { type: mongoose.Schema.Types.ObjectId, ref: 'Student',     required: true },
  competition: { type: mongoose.Schema.Types.ObjectId, ref: 'Competition', required: true },
  points:      { type: Number, required: true, min: 0, max: 100 },
  createdAt:   { type: Date, default: Date.now },
  updatedAt:   { type: Date, default: Date.now },
});
// One score record per student per competition
scoreSchema.index({ student: 1, competition: 1 }, { unique: true });
const Score = mongoose.model('Score', scoreSchema);

module.exports = { Student, Competition, Score };
