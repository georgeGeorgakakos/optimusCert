// Rule-based (no-AI) parser for predictably-formatted exam text.
//
// Supported layout (the most common exam-dump / study-guide format):
//
//   1. What does CPU stand for?
//   A. Central Processing Unit
//   B) Computer Personal Unit
//   C. Central Process Union
//   D. Central Processing Union
//   Answer: A
//   Explanation: CPU = Central Processing Unit.
//
//   2. Which are programming languages? (Choose two)
//   A. Python
//   B. HTML
//   C. Java
//   Answer: A, C
//
// Rules it tolerates:
//  - Question numbering: "1.", "1)", "Q1.", "Question 1:"  (or none — a blank
//    line before the next option-block also starts a new question).
//  - Option labels: "A.", "A)", "(A)", "A -"  for letters A–H.
//  - Answer line: "Answer:", "Correct Answer:", "Ans:", "Answer(s):".
//    Multiple letters ("A, C" / "AC" / "A and C") => multiple-choice question.
//  - Optional "Explanation:" / "Rationale:" line.

const OPTION_RE = /^\s*\(?([A-Ha-h])\s*[\.\)\:\-]\s+(.*\S)\s*$/;
const QNUM_RE = /^\s*(?:Q(?:uestion)?\s*)?(\d{1,4})\s*[\.\)\:]\s+(.*\S)\s*$/i;
const ANSWER_RE = /^\s*(?:correct\s+)?answ?e?r?s?(?:\s*\(s\))?\s*[\:\-]\s*(.+)$/i;
const EXPLAIN_RE = /^\s*(?:explanation|rationale|explain)\s*[\:\-]\s*(.*)$/i;

function letterToIndex(l) {
  return l.toUpperCase().charCodeAt(0) - 65; // A->0
}

function finalize(block) {
  if (!block || !block.prompt || block.options.length < 2 || block.correct.length === 0) return null;
  const options = block.options.map((text, i) => ({ id: String.fromCharCode(97 + i), text }));
  const correctIds = block.correct
    .filter((idx) => idx >= 0 && idx < options.length)
    .map((idx) => options[idx].id);
  if (correctIds.length === 0) return null;
  const isMulti = correctIds.length > 1;
  return {
    type: isMulti ? 'multi' : 'single',
    prompt: block.prompt.trim(),
    explanation: (block.explanation || '').trim(),
    points: 1,
    data: isMulti
      ? { options, correct: correctIds, selectCount: correctIds.length }
      : { options, correct: correctIds }
  };
}

export function parseStructured(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const questions = [];
  let block = null;
  let phase = 'idle'; // idle -> prompt -> options -> (answer/explanation)

  const push = () => { const q = finalize(block); if (q) questions.push(q); block = null; };

  for (let raw of lines) {
    const line = raw.replace(/\t/g, ' ');
    if (!line.trim()) {
      // blank line: if we already have a complete-ish block, close it
      if (block && block.correct.length) push();
      continue;
    }

    const qnum = line.match(QNUM_RE);
    const opt = line.match(OPTION_RE);
    const ans = line.match(ANSWER_RE);
    const exp = line.match(EXPLAIN_RE);

    // A numbered line that is NOT an option label starts a new question
    if (qnum && !opt) {
      if (block) push();
      block = { prompt: qnum[2], options: [], correct: [], explanation: '' };
      phase = 'prompt';
      continue;
    }

    if (opt) {
      if (!block) { block = { prompt: '', options: [], correct: [], explanation: '' }; }
      block.options.push(opt[2]);
      phase = 'options';
      continue;
    }

    if (ans && block) {
      const letters = (ans[1].match(/[A-Ha-h]/g) || []);
      // de-dupe while keeping order
      const seen = new Set();
      for (const l of letters) {
        const idx = letterToIndex(l);
        if (!seen.has(idx)) { seen.add(idx); block.correct.push(idx); }
      }
      phase = 'answered';
      continue;
    }

    if (exp && block) {
      block.explanation = exp[1] || '';
      phase = 'explain';
      continue;
    }

    // Continuation lines
    if (block) {
      if (phase === 'prompt' || (phase === 'idle')) {
        block.prompt = (block.prompt ? block.prompt + ' ' : '') + line.trim();
      } else if (phase === 'options' && block.options.length) {
        // wrapped option text
        block.options[block.options.length - 1] += ' ' + line.trim();
      } else if (phase === 'explain') {
        block.explanation += ' ' + line.trim();
      }
      // lines after an answer with no explanation marker are ignored (Section:, Reference:, etc.)
    }
  }
  if (block) push();

  return { questions, count: questions.length };
}
