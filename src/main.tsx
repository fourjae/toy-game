import React from 'react';
import ReactDOM from 'react-dom/client';
import Root from './Root';
import './style.css';
// Small-screen corrections must load after the shared stylesheet so its compact HUD wins the cascade.
import './components/MobileGame.css';
import './hub.css';
import './lostCities.css';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Root /></React.StrictMode>);
