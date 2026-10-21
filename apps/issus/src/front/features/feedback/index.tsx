import {ko} from '../../resources/index.js';

/** Feedback is positive and queryable in every asynchronous state. */
export function Feedback({errors = [], loading = false, empty = false, status}: {errors?: readonly string[]; loading?: boolean; empty?: boolean; status?: string}) {
  if (errors.length) return <div role="alert">{errors.map((message, index) => <p key={index}>{message}</p>)}</div>;
  if (loading) return <p role="status" aria-busy="true">{ko.loading}</p>;
  if (empty) return <p role="status">{ko.empty}</p>;
  return status ? <p role="status">{status}</p> : null;
}
