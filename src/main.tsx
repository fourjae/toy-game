import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './style.css';
// Small-screen corrections must load after the shared stylesheet so its compact HUD wins the cascade.
import './components/MobileGame.css';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
