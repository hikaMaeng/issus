/** Canonical envelope keys and values stay visible as a definition list. */
export function Envelope({fields}: {fields: object}) {
  return <dl>{Object.entries(fields).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>;
}
