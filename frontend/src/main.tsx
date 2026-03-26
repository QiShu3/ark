import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';

import App from './App';
import Login from './pages/Login';
import AppCenter from './pages/AppCenter';
import AgentDesk from './pages/AgentDesk';
import Arxiv from './pages/Arxiv';
import RequireAuth from './routes/RequireAuth';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<RequireAuth />}>
          <Route path="/" element={<App />} />
          <Route path="/apps" element={<AppCenter />} />
          <Route path="/agent" element={<AgentDesk />} />
          <Route path="/arxiv" element={<Arxiv />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  </StrictMode>,
)
