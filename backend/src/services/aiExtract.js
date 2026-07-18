import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.AI_MODEL || 'claude-3-5-sonnet-latest';
const MAX_CHUNKS = parseInt(process.env.AI_MAX_CHUNKS || '10', 10);
const CHUNK_SIZE = 11000;

const SCHEMA_INSTRUCTIONS = `
You convert raw certification-exam text into structured JSON questions.
Return ONLY a JSON object: {"questions":[ ... ]} with no prose, no markdown fences.

Each question object has:
  "type": one of "single" | "multi" | "dragdrop" | "hotspot" | "dropdown"
  "prompt": the question text (string)
  "explanation": short rationale if present, else ""
  "points": integer (default 1)
  "data": shape depends on type:

  single (one correct answer):
    { "options":[{"id":"a","text":"..."},...], "correct":["a"] }
  multi (2+ correct, "choose two/three"):
    { "options":[{"id":"a","text":"..."},...], "correct":["a","c"], "selectCount":2 }
  dragdrop (match/associate items to categories or ordered steps):
    { "items":[{"id":"i1","text":"..."}], "targets":[{"id":"t1","label":"...","correct":"i1"}] }
  hotspot (Yes/No statement grid):
    { "statements":[{"id":"s1","text":"...","correct":"yes"|"no"}] }
  dropdown (sentence completion with inline dropdowns):
    { "segments":[ {"type":"text","text":"..."}, {"type":"blank","id":"b1","options":["...","..."],"correct":"..."} ] }

Rules:
- Choose the most appropriate type for each question.
- Option ids must be short unique strings ("a","b","c"...).
- Always include the correct answer(s). If the source does not state the answer, infer the best correct answer.
- Skip page headers, footers, watermarks, copyright lines and answer-key noise.
- If a chunk contains no real questions, return {"questions":[]}.
`;

function chunkText(text) {
  const chunks = [];
  for (let i = 0; i < text.length && chunks.length < MAX_CHUNKS; i += CHUNK_SIZE) {
    chunks.push(text.slice(i, i + CHUNK_SIZE));
  }
  return chunks;
}

function safeParse(raw) {
  if (!raw) return [];
  let s = raw.trim();
  // strip accidental code fences
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1) return [];
  try {
    const obj = JSON.parse(s.slice(start, end + 1));
    return Array.isArray(obj.questions) ? obj.questions : [];
  } catch {
    return [];
  }
}

export function hasApiKey() {
  return !!process.env.ANTHROPIC_API_KEY;
}

export async function extractQuestions(text) {
  if (!hasApiKey()) {
    const err = new Error('ANTHROPIC_API_KEY is not configured on the server.');
    err.code = 'NO_KEY';
    throw err;
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const chunks = chunkText(text);
  const all = [];
  const truncated = text.length > chunks.length * CHUNK_SIZE;

  for (const chunk of chunks) {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SCHEMA_INSTRUCTIONS,
      messages: [{ role: 'user', content: `Extract questions from this exam text:\n\n${chunk}` }]
    });
    const raw = (msg.content || []).map((c) => (c.type === 'text' ? c.text : '')).join('');
    all.push(...safeParse(raw));
  }
  return { questions: normalize(all), truncated, chunks: chunks.length };
}

// Ensure ids and shapes are consistent enough for the grader.
function normalize(questions) {
  return questions
    .filter((q) => q && q.type && q.prompt && q.data)
    .map((q) => {
      const d = q.data;
      if ((q.type === 'single' || q.type === 'multi') && Array.isArray(d.options)) {
        d.options = d.options.map((o, i) => ({ id: o.id || String.fromCharCode(97 + i), text: o.text ?? String(o) }));
        d.correct = Array.isArray(d.correct) ? d.correct : (d.correct != null ? [d.correct] : []);
      }
      return {
        type: q.type,
        prompt: String(q.prompt),
        explanation: q.explanation || '',
        points: Number.isInteger(q.points) ? q.points : 1,
        data: d
      };
    });
}
