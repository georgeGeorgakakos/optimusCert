// Grading engine for every supported question type.
// Each grader returns { correct: bool, partial: 0..1 } so we can support
// all-or-nothing scoring while keeping partial info for review.

function arrEq(a = [], b = []) {
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.length === sb.length && sa.every((v, i) => v === sb[i]);
}

export function gradeQuestion(question, response) {
  const data = typeof question.data === 'string' ? JSON.parse(question.data) : question.data;
  const type = question.type;
  const points = question.points || 1;
  let partial = 0;

  switch (type) {
    case 'single': {
      const chosen = Array.isArray(response) ? response[0] : response;
      partial = data.correct && data.correct[0] === chosen ? 1 : 0;
      break;
    }
    case 'multi': {
      const chosen = Array.isArray(response) ? response : [];
      partial = arrEq(chosen, data.correct || []) ? 1 : 0;
      break;
    }
    case 'dragdrop': {
      // response = { targetId: itemId }
      const resp = response || {};
      const targets = data.targets || [];
      if (targets.length === 0) { partial = 0; break; }
      let ok = 0;
      for (const t of targets) if (resp[t.id] === t.correct) ok++;
      partial = ok / targets.length === 1 ? 1 : 0; // all-or-nothing for pass
      break;
    }
    case 'hotspot': {
      // response = { statementId: 'yes'|'no' }
      const resp = response || {};
      const st = data.statements || [];
      if (st.length === 0) { partial = 0; break; }
      let ok = 0;
      for (const s of st) if (resp[s.id] === s.correct) ok++;
      partial = ok / st.length === 1 ? 1 : 0;
      break;
    }
    case 'dropdown': {
      // response = { blankId: value }
      const resp = response || {};
      const blanks = (data.segments || []).filter((s) => s.type === 'blank');
      if (blanks.length === 0) { partial = 0; break; }
      let ok = 0;
      for (const b of blanks) if (resp[b.id] === b.correct) ok++;
      partial = ok / blanks.length === 1 ? 1 : 0;
      break;
    }
    default:
      partial = 0;
  }

  return {
    correct: partial === 1,
    earned: partial === 1 ? points : 0,
    points
  };
}

export function gradeAttempt(questions, answers) {
  let earned = 0;
  let total = 0;
  const detail = [];
  for (const question of questions) {
    const resp = answers[question.id];
    const r = gradeQuestion(question, resp);
    earned += r.earned;
    total += r.points;
    detail.push({ questionId: question.id, correct: r.correct, earned: r.earned, points: r.points });
  }
  const scorePercent = total > 0 ? Math.round((earned / total) * 1000) / 10 : 0;
  return { earned, total, scorePercent, detail };
}
