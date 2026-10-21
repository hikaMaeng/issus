import {ko} from '../../resources/index.js';

/** The exact source marker remains a level-two heading, independent of color. */
export function CompactMarker({body}: {body: string}) {
  return <header className="compact"><p>{ko.summary}</p><h2 data-testid="compact-marker">{body.split(/\r?\n/)[1]}</h2></header>;
}
