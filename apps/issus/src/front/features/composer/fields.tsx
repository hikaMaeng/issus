import type {ValidationReason} from '../../entry/client/index.js';
import {STATES, fieldFeedback} from './model.js';
import {TimeAssist} from './time.js';

/** Exact server reasons form the accessible description; React escapes their text. */
export function FieldErrors({feedback}: {feedback: ReturnType<typeof fieldFeedback>}) {
  return <>{feedback.messages.map(reason => <p key={reason.id} id={reason.id}>{reason.message}</p>)}</>;
}

/** Stateless envelope control shared by the live composer and SSR accessibility checks. */
export function ComposerField({field, value, reasons, required, readOnly, stateDisabled, onChange}: {
  field: string; value: string; reasons: readonly ValidationReason[]; required: boolean;
  readOnly: boolean; stateDisabled: boolean; onChange: (value: string) => void;
}) {
  const id = `composer-field-${field}`, feedback = fieldFeedback(reasons, field, id);
  const attributes = {id, value, required, 'aria-invalid': feedback.invalid, 'aria-describedby': feedback.describedBy};
  return <div><label htmlFor={id}>{field}</label>
    {field === 'STATE' ? <select {...attributes} onChange={event => onChange(event.target.value)} disabled={stateDisabled}><option value=""/>{STATES.map(state => <option key={state}>{state}</option>)}</select> :
      <input {...attributes} list={field === 'TO' ? 'composer-alias-candidates' : undefined} readOnly={readOnly} onChange={event => onChange(event.target.value)}/>}
    {['DUE','ACK-BY'].includes(field) && <TimeAssist field={field} id={id} value={value} onChange={onChange}/>}
    <FieldErrors feedback={feedback}/>
  </div>;
}
