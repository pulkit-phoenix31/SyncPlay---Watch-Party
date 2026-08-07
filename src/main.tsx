import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Suppress unhandled cross-origin script errors (e.g. from YouTube iframe postMessage)
window.addEventListener('error', (event) => {
  if (event.message === 'Script error.' || event.message?.includes('Script error')) {
    event.preventDefault();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

