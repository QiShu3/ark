import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';

import App from './App';
import Login from './pages/Login';
import AppCenter from './pages/AppCenter';
import AgentConsole from './pages/AgentConsole';
import Arxiv from './pages/Arxiv';
import VocabHome from './pages/Vocab/Home';
import VocabMistakes from './pages/Vocab/Mistakes';
import VocabReview from './pages/Vocab/Review';
import VocabStudy from './pages/Vocab/Study';
import VocabToday from './pages/Vocab/Today';
import VocabWordDetail from './pages/Vocab/WordDetail';
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
          <Route path="/agent-console" element={<AgentConsole />} />
          <Route path="/arxiv" element={<Arxiv />} />
          <Route path="/vocab" element={<VocabHome />} />
          <Route path="/vocab/today" element={<VocabToday />} />
          <Route path="/vocab/study" element={<VocabStudy />} />
          <Route path="/vocab/review" element={<VocabReview />} />
          <Route path="/vocab/mistakes" element={<VocabMistakes />} />
          <Route path="/vocab/words/:wordId" element={<VocabWordDetail />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  </StrictMode>,
)
