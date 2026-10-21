import { createRoot } from 'react-dom/client';
import {App} from './app/index.js';
import {ko} from '../resources/index.js';
import '../styles/index.css';

const root = document.getElementById('root');
if (!root) throw new Error(ko.rootMissing);
createRoot(root).render(<App/>);
