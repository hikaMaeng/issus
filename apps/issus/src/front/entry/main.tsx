import { createRoot } from 'react-dom/client';

const root = document.getElementById('root');
if (!root) throw new Error('root element missing');
createRoot(root).render(<main><h1>issus</h1></main>);
