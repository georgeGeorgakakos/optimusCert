import { useState } from 'react';
import SortableList from './SortableList.jsx';

let counter = 0;
const uid = (p = 'x') => `${p}${Date.now().toString(36).slice(-3)}${counter++}`;

const TEMPLATES = {
  single: () => ({
    options: [{ id: uid('o'), text: 'Option A' }, { id: uid('o'), text: 'Option B' }, { id: uid('o'), text: 'Option C' }, { id: uid('o'), text: 'Option D' }],
    correct: []
  }),
  multi: () => ({
    options: [{ id: uid('o'), text: 'Option A' }, { id: uid('o'), text: 'Option B' }, { id: uid('o'), text: 'Option C' }, { id: uid('o'), text: 'Option D' }],
    correct: [], selectCount: 2
  }),
  dragdrop: () => ({
    items: [{ id: uid('i'), text: 'Item 1' }, { id: uid('i'), text: 'Item 2' }],
    targets: [{ id: uid('t'), label: 'Category 1', correct: '' }, { id: uid('t'), label: 'Category 2', correct: '' }]
  }),
  hotspot: () => ({
    statements: [{ id: uid('s'), text: 'Statement 1', correct: 'yes' }, { id: uid('s'), text: 'Statement 2', correct: 'no' }]
  }),
  dropdown: () => ({
    segments: [
      { type: 'text', id: uid('g'), text: 'The correct answer is ' },
      { type: 'blank', id: uid('b'), options: ['option one', 'option two'], correct: 'option one' },
      { type: 'text', id: uid('g'), text: '.' }
    ]
  })
};

const TYPES = [
  { key: 'single', label: 'Single choice', icon: '◉' },
  { key: 'multi', label: 'Multiple choice', icon: '☑' },
  { key: 'dragdrop', label: 'Drag & drop', icon: '⇄' },
  { key: 'hotspot', label: 'Yes / No grid', icon: '⊟' },
  { key: 'dropdown', label: 'Fill the blanks', icon: '▾' }
];

export default function QuestionBuilder({ question, onSave, onClose }) {
  const [type, setType] = useState(question?.type || 'single');
  const [prompt, setPrompt] = useState(question?.prompt || '');
  const [explanation, setExplanation] = useState(question?.explanation || '');
  const [points, setPoints] = useState(question?.points || 1);
  const [data, setData] = useState(() => question?.data || TEMPLATES.single());

  function changeType(t) {
    setType(t);
    setData(TEMPLATES[t]());
  }
  const patch = (upd) => setData((d) => ({ ...d, ...upd }));

  function save() {
    if (!prompt.trim()) return alert('Please enter a question prompt.');
    onSave({ type, prompt, explanation, points: +points || 1, data });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 780 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>{question ? 'Edit question' : 'New question'}</h2>
          <button className="btn sm ghost" onClick={onClose}>✕</button>
        </div>

        <div className="small muted" style={{ margin: '6px 0' }}>Question type</div>
        <div className="tabs">
          {TYPES.map((t) => (
            <button key={t.key} className={'tab' + (type === t.key ? ' active' : '')}
                    onClick={() => changeType(t.key)}
                    disabled={question && type !== t.key ? false : false}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <label className="field"><span>Prompt</span>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Enter the question text…" /></label>

        <div className="divider" />
        <div className="small muted" style={{ marginBottom: 10 }}>Answer template — drag ⠿ to reorder</div>

        {(type === 'single' || type === 'multi') && (
          <ChoiceEditor type={type} data={data} patch={patch} />
        )}
        {type === 'dragdrop' && <DragDropEditor data={data} patch={patch} />}
        {type === 'hotspot' && <HotspotEditor data={data} patch={patch} />}
        {type === 'dropdown' && <DropdownEditor data={data} patch={patch} />}

        <div className="divider" />
        <div className="row">
          <label className="field"><span>Points</span>
            <input type="number" min="1" value={points} onChange={(e) => setPoints(e.target.value)} /></label>
          <label className="field" style={{ flex: 3 }}><span>Explanation (shown in review)</span>
            <input value={explanation} onChange={(e) => setExplanation(e.target.value)} placeholder="Why the correct answer is correct…" /></label>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save}>{question ? 'Save changes' : 'Add question'}</button>
        </div>
      </div>
    </div>
  );
}

let c2 = 0;
const nid = (p) => `${p}${Date.now().toString(36).slice(-3)}${c2++}`;

function ChoiceEditor({ type, data, patch }) {
  const options = data.options || [];
  const correct = data.correct || [];
  function setText(id, text) { patch({ options: options.map((o) => (o.id === id ? { ...o, text } : o)) }); }
  function toggle(id) {
    if (type === 'single') patch({ correct: [id] });
    else patch({ correct: correct.includes(id) ? correct.filter((x) => x !== id) : [...correct, id] });
  }
  function add() { patch({ options: [...options, { id: nid('o'), text: '' }] }); }
  function remove(id) { patch({ options: options.filter((o) => o.id !== id), correct: correct.filter((x) => x !== id) }); }

  return (
    <div>
      <SortableList items={options} onReorder={(o) => patch({ options: o })}
        renderItem={(o) => (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" className={'btn sm ' + (correct.includes(o.id) ? 'primary' : 'ghost')}
                    onClick={() => toggle(o.id)} title="Mark correct" style={{ minWidth: 44 }}>
              {correct.includes(o.id) ? '✓' : type === 'single' ? '◯' : '☐'}
            </button>
            <input value={o.text} onChange={(e) => setText(o.id, e.target.value)} placeholder="Answer text" />
            <button type="button" className="btn sm danger" onClick={() => remove(o.id)}>✕</button>
          </div>
        )} />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6 }}>
        <button type="button" className="btn sm ghost" onClick={add}>+ Add option</button>
        {type === 'multi' && (
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', margin: 0 }} className="small muted">
            Choose exactly
            <input type="number" min="1" style={{ width: 64 }} value={data.selectCount || 2}
                   onChange={(e) => patch({ selectCount: +e.target.value })} />
          </label>
        )}
      </div>
      <p className="small muted" style={{ marginTop: 8 }}>Click the box to mark the correct {type === 'single' ? 'answer' : 'answers'}.</p>
    </div>
  );
}

function DragDropEditor({ data, patch }) {
  const items = data.items || [];
  const targets = data.targets || [];
  return (
    <div>
      <h3 className="small muted">Draggable items</h3>
      <SortableList items={items} onReorder={(v) => patch({ items: v })}
        renderItem={(it) => (
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={it.text} onChange={(e) => patch({ items: items.map((x) => x.id === it.id ? { ...x, text: e.target.value } : x) })} placeholder="Item text" />
            <button type="button" className="btn sm danger"
              onClick={() => patch({ items: items.filter((x) => x.id !== it.id), targets: targets.map((t) => t.correct === it.id ? { ...t, correct: '' } : t) })}>✕</button>
          </div>
        )} />
      <button type="button" className="btn sm ghost" onClick={() => patch({ items: [...items, { id: nid('i'), text: '' }] })}>+ Add item</button>

      <h3 className="small muted" style={{ marginTop: 16 }}>Drop targets (with correct item)</h3>
      <SortableList items={targets} onReorder={(v) => patch({ targets: v })}
        renderItem={(t) => (
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={t.label} onChange={(e) => patch({ targets: targets.map((x) => x.id === t.id ? { ...x, label: e.target.value } : x) })} placeholder="Target label" />
            <select value={t.correct} onChange={(e) => patch({ targets: targets.map((x) => x.id === t.id ? { ...x, correct: e.target.value } : x) })} style={{ flex: 1 }}>
              <option value="">— correct item —</option>
              {items.map((it) => <option key={it.id} value={it.id}>{it.text || '(untitled)'}</option>)}
            </select>
            <button type="button" className="btn sm danger" onClick={() => patch({ targets: targets.filter((x) => x.id !== t.id) })}>✕</button>
          </div>
        )} />
      <button type="button" className="btn sm ghost" onClick={() => patch({ targets: [...targets, { id: nid('t'), label: '', correct: '' }] })}>+ Add target</button>
    </div>
  );
}

function HotspotEditor({ data, patch }) {
  const statements = data.statements || [];
  return (
    <div>
      <SortableList items={statements} onReorder={(v) => patch({ statements: v })}
        renderItem={(s) => (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input value={s.text} onChange={(e) => patch({ statements: statements.map((x) => x.id === s.id ? { ...x, text: e.target.value } : x) })} placeholder="Statement" />
            <div style={{ display: 'flex', gap: 4 }}>
              {['yes', 'no'].map((v) => (
                <button key={v} type="button" className={'btn sm ' + (s.correct === v ? 'primary' : 'ghost')}
                        onClick={() => patch({ statements: statements.map((x) => x.id === s.id ? { ...x, correct: v } : x) })}>
                  {v === 'yes' ? 'Yes' : 'No'}
                </button>
              ))}
            </div>
            <button type="button" className="btn sm danger" onClick={() => patch({ statements: statements.filter((x) => x.id !== s.id) })}>✕</button>
          </div>
        )} />
      <button type="button" className="btn sm ghost" onClick={() => patch({ statements: [...statements, { id: nid('s'), text: '', correct: 'yes' }] })}>+ Add statement</button>
    </div>
  );
}

function DropdownEditor({ data, patch }) {
  const segments = data.segments || [];
  function update(id, upd) { patch({ segments: segments.map((s) => s.id === id ? { ...s, ...upd } : s) }); }
  return (
    <div>
      <SortableList items={segments} onReorder={(v) => patch({ segments: v })}
        renderItem={(s) => (
          s.type === 'text' ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="type-tag">TEXT</span>
              <input value={s.text} onChange={(e) => update(s.id, { text: e.target.value })} placeholder="Sentence text" />
              <button type="button" className="btn sm danger" onClick={() => patch({ segments: segments.filter((x) => x.id !== s.id) })}>✕</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="type-tag" style={{ background: 'rgba(18,183,166,0.16)', color: 'var(--accent)' }}>BLANK</span>
              <input style={{ flex: 2, minWidth: 160 }} value={(s.options || []).join(', ')}
                     onChange={(e) => update(s.id, { options: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })}
                     placeholder="options, comma, separated" />
              <select value={s.correct} onChange={(e) => update(s.id, { correct: e.target.value })}>
                <option value="">— correct —</option>
                {(s.options || []).map((op) => <option key={op} value={op}>{op}</option>)}
              </select>
              <button type="button" className="btn sm danger" onClick={() => patch({ segments: segments.filter((x) => x.id !== s.id) })}>✕</button>
            </div>
          )
        )} />
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <button type="button" className="btn sm ghost" onClick={() => patch({ segments: [...segments, { type: 'text', id: nid('g'), text: '' }] })}>+ Add text</button>
        <button type="button" className="btn sm ghost" onClick={() => patch({ segments: [...segments, { type: 'blank', id: nid('b'), options: [], correct: '' }] })}>+ Add blank</button>
      </div>
    </div>
  );
}
