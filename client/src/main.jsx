import React from 'react';
import ReactDOM from 'react-dom/client';
import { initAppPreferences, getNotificationsEnabled } from './appPreferences.js';
import { setAppNotificationsEnabled } from './browserNotification.js';
import App from './App.jsx';
import './index.css';
import './chat/chatShell.css';

initAppPreferences();
setAppNotificationsEnabled(getNotificationsEnabled());

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
