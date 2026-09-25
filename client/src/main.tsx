import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <Toaster position="top-right" toastOptions={{ style: { borderRadius: '14px', fontSize: '14px', fontWeight: 500 }, success: { iconTheme: { primary: '#4f46e5', secondary: '#fff' } } }} />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
