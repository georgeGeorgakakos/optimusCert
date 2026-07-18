import DragDropQuestion from './DragDropQuestion.jsx';

const TYPE_LABEL = {
  single: 'Single choice',
  multi: 'Multiple choice',
  dragdrop: 'Drag & drop',
  hotspot: 'Yes / No',
  dropdown: 'Fill the blanks'
};

export function typeLabel(t) { return TYPE_LABEL[t] || t; }

// Renders a question for answering (review=false) or review (review=true).
export default function QuestionView({ question, value, onChange, review = false }) {
  const { type, data } = question;

  if (type === 'single' || type === 'multi') {
    const selected = Array.isArray(value) ? value : value != null ? [value] : [];
    const correct = data.correct || [];
    function toggle(id) {
      if (review) return;
      if (type === 'single') onChange([id]);
      else {
        const set = new Set(selected);
        set.has(id) ? set.delete(id) : set.add(id);
        onChange([...set]);
      }
    }
    return (
      <div>
        {data.selectCount && !review && <div className="badge warn" style={{ marginBottom: 12 }}>Choose {data.selectCount}</div>}
        {(data.options || []).map((o) => {
          const isSel = selected.includes(o.id);
          let cls = 'option ' + (type === 'single' ? 'radio' : '');
          if (review) {
            if (correct.includes(o.id)) cls += ' correct';
            else if (isSel) cls += ' incorrect';
          } else if (isSel) cls += ' selected';
          return (
            <div key={o.id} className={cls} onClick={() => toggle(o.id)}>
              <span className="marker">{isSel ? '✓' : ''}</span>
              <span>{o.text}</span>
              {review && correct.includes(o.id) && <span className="badge good" style={{ marginLeft: 'auto' }}>Correct</span>}
              {review && isSel && !correct.includes(o.id) && <span className="badge bad" style={{ marginLeft: 'auto' }}>Your pick</span>}
            </div>
          );
        })}
      </div>
    );
  }

  if (type === 'hotspot') {
    const resp = value || {};
    return (
      <div>
        {(data.statements || []).map((s) => {
          const chosen = resp[s.id];
          return (
            <div key={s.id} className="dnd-target" style={{ alignItems: 'center' }}>
              <span style={{ flex: 1 }}>{s.text}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {['yes', 'no'].map((opt) => {
                  let cls = 'btn sm';
                  if (review) {
                    if (s.correct === opt) cls += ' primary';
                    else if (chosen === opt) cls += ' danger';
                  } else if (chosen === opt) cls += ' primary';
                  return (
                    <button key={opt} className={cls} disabled={review}
                            onClick={() => !review && onChange({ ...resp, [s.id]: opt })}>
                      {opt === 'yes' ? 'Yes' : 'No'}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (type === 'dropdown') {
    const resp = value || {};
    return (
      <div style={{ fontSize: 17, lineHeight: 2.2 }}>
        {(data.segments || []).map((seg, i) => {
          if (seg.type === 'text') return <span key={i}>{seg.text}</span>;
          const chosen = resp[seg.id];
          const isCorrect = chosen === seg.correct;
          return (
            <span key={i} style={{ display: 'inline-block', margin: '0 4px' }}>
              <select
                value={chosen || ''}
                disabled={review}
                onChange={(e) => onChange({ ...resp, [seg.id]: e.target.value })}
                style={{
                  width: 'auto', display: 'inline-block', padding: '4px 10px',
                  borderColor: review ? (isCorrect ? 'var(--good)' : 'var(--bad)') : undefined,
                  color: review ? (isCorrect ? 'var(--good)' : 'var(--bad)') : undefined
                }}>
                <option value="" disabled>Select…</option>
                {(seg.options || []).map((op) => <option key={op} value={op}>{op}</option>)}
              </select>
              {review && !isCorrect && <span className="badge good" style={{ marginLeft: 6 }}>➜ {seg.correct}</span>}
            </span>
          );
        })}
      </div>
    );
  }

  if (type === 'dragdrop') {
    if (review) {
      const resp = value || {};
      const itemById = Object.fromEntries((data.items || []).map((i) => [i.id, i]));
      return (
        <div>
          {(data.targets || []).map((t) => {
            const yourItem = resp[t.id];
            const ok = yourItem === t.correct;
            return (
              <div key={t.id} className="dnd-target">
                <span className="label">{t.label}</span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className={'badge ' + (ok ? 'good' : 'bad')}>{yourItem ? itemById[yourItem]?.text : '—'}</span>
                  {!ok && <span className="badge good">➜ {itemById[t.correct]?.text}</span>}
                </div>
              </div>
            );
          })}
        </div>
      );
    }
    return <DragDropQuestion data={data} value={value || {}} onChange={onChange} />;
  }

  return <div className="muted">Unsupported question type: {type}</div>;
}
