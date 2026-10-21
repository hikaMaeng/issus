import {useState} from 'react';
import type {Principal} from '../../entry/client/index.js';
import type {ComposerDraft} from '../../features/composer/index.js';
import {serializeDraft} from '../../features/composer/index.js';
import {boardKo} from '../../resources/board.js';

/** Board sharing follows the canonical template and remains an editable draft until explicit posting. */
export function BoardNote({principal, onDraft}: {principal: Principal; onDraft: (draft: ComposerDraft) => void}) {
  const [reply, setReply] = useState(''), [report, setReport] = useState(''), [result, setResult] = useState(''), [lessons, setLessons] = useState(''), [artifacts, setArtifacts] = useState('');
  return <form aria-label={boardKo.template} onSubmit={event => {event.preventDefault(); onDraft({key: crypto.randomUUID(), body: serializeDraft({fields: {FROM: `${principal.alias}/${principal.sid ?? 's1'}`, TO: 'ALL', TYPE: 'NOTE', 'REPLY-IN': reply, RE: report}, text: boardKo.note({result, lessons, artifacts, report})})});}}>
    <h2>{boardKo.template}</h2><p>{boardKo.required}</p>
    {([{key: 'reply', label: boardKo.reply, value: reply, set: setReply}, {key: 'report', label: boardKo.report, value: report, set: setReport}, {key: 'result', label: boardKo.result, value: result, set: setResult}, {key: 'lessons', label: boardKo.lessons, value: lessons, set: setLessons}, {key: 'artifacts', label: boardKo.artifacts, value: artifacts, set: setArtifacts}]).map(field => <div key={field.key}><label htmlFor={`board-note-${field.key}`}>{field.label}</label>{field.key === 'lessons' ? <textarea id={`board-note-${field.key}`} value={field.value} onChange={event => field.set(event.target.value)} required/> : <input id={`board-note-${field.key}`} value={field.value} onChange={event => field.set(event.target.value)} required/>}</div>)}
    <button type="submit" disabled={!principal.alias || lessons.split(/\r?\n/).length > 3}>{boardKo.make}</button>
  </form>;
}
