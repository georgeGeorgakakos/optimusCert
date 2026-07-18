import { Router } from 'express';
import multer from 'multer';
import { createRequire } from 'module';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { extractQuestions, hasApiKey } from '../services/aiExtract.js';
import { parseStructured } from '../services/parseText.js';

// pdf-parse is CommonJS; load it via createRequire to avoid its debug entrypoint.
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

router.get('/status', requireAuth, requireAdmin, (req, res) => {
  res.json({ aiEnabled: hasApiKey(), model: process.env.AI_MODEL || 'claude-3-5-sonnet-latest' });
});

async function runExtraction(method, text) {
  if (method === 'structured') {
    const { questions, count } = parseStructured(text);
    return { questions, count, truncated: false, method: 'structured' };
  }
  const result = await extractQuestions(text); // AI
  return { questions: result.questions, count: result.questions.length, truncated: result.truncated, method: 'ai' };
}

// Upload a PDF -> extract text -> (AI | structured) -> return preview (not saved)
router.post('/pdf', requireAuth, requireAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded (field name: file)' });
    const method = req.body?.method === 'structured' ? 'structured' : 'ai';
    if (method === 'ai' && !hasApiKey()) {
      return res.status(400).json({
        error: 'AI extraction is not configured. Set ANTHROPIC_API_KEY, or switch to the “Structured parser” which needs no key.'
      });
    }
    const parsed = await pdfParse(req.file.buffer);
    const text = (parsed.text || '').trim();
    if (!text) return res.status(422).json({ error: 'Could not extract any text from this PDF (it may be a scanned image).' });

    const result = await runExtraction(method, text);
    if (method === 'structured' && result.count === 0) {
      return res.status(422).json({ error: 'The structured parser found no questions. Check that the PDF matches the expected format (numbered questions, A–D options, an "Answer:" line), or use AI extraction.' });
    }
    res.json({ fileName: req.file.originalname, textChars: text.length, pages: parsed.numpages, ...result });
  } catch (err) {
    console.error('[import] error', err);
    if (err.code === 'NO_KEY') return res.status(400).json({ error: err.message });
    res.status(500).json({ error: err.message || 'Import failed' });
  }
});

// Accept pasted raw text instead of a PDF
router.post('/text', requireAuth, requireAdmin, async (req, res) => {
  try {
    const text = (req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'No text provided' });
    const method = req.body?.method === 'structured' ? 'structured' : 'ai';
    if (method === 'ai' && !hasApiKey()) {
      return res.status(400).json({ error: 'AI extraction is not configured. Set ANTHROPIC_API_KEY, or use the Structured parser.' });
    }
    const result = await runExtraction(method, text);
    res.json({ textChars: text.length, ...result });
  } catch (err) {
    console.error('[import] error', err);
    res.status(500).json({ error: err.message || 'Import failed' });
  }
});

export default router;
