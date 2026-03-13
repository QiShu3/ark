import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import App from './App';
import Login from './pages/Login';
import AppCenter from './pages/AppCenter';
import Arxiv from './pages/Arxiv';
import RequireAuth from './routes/RequireAuth';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<RequireAuth />}>
          <Route path="/" element={<App />} />
          <Route path="/apps" element={<AppCenter />} />
          <Route path="/arxiv" element={<Arxiv />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
