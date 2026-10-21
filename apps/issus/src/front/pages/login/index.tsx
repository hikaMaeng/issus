import {ko} from '../../resources/index.js';

/** The shell owns the one compatible connection form. */
export function Login() {return <><h1>{ko.connection}</h1><p role="status">{ko.authRequired}</p></>;}
