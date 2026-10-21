import {composerKo} from '../../resources/composer.js';
import {issueKo} from '../../resources/issue.js';
/** The raw protocol input remains available beside explicit date/time and offset editing aids. */
export function TimeAssist({field, id, value, onChange}: {field: string; id: string; value: string; onChange: (value: string) => void}) {
  const match = /^(.*?)([+-]\d{2}:\d{2})$/.exec(value), local = match?.[1] ?? '', offset = match?.[2] ?? '+09:00';
  return <details><summary>{composerKo.timeAssist(field)}</summary><label htmlFor={`${id}-local`}>{field} {issueKo.deadline}</label><input id={`${id}-local`} type="datetime-local" step="1" value={local} onChange={event => onChange(event.target.value ? event.target.value + offset : '')}/>
    <label htmlFor={`${id}-offset`}>{field} {issueKo.offset}</label><input id={`${id}-offset`} value={offset} onChange={event => onChange(local + event.target.value)}/></details>;
}
