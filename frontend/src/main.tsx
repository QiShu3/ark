import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Route, Routes } from 'react-router-dom';

import App from './App';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import AdminUiLibraryPage from './pages/AdminUiLibraryPage';
import AppCenter from './pages/AppCenter';
import AdminSetSnapshots from './pages/AdminSetSnapshots';
import TestFocusWork from './pages/TestFocusWork';
import VocabMistakes from './pages/Vocab/Mistakes';
import VocabReview from './pages/Vocab/Review';
import VocabStudy from './pages/Vocab/Study';
import VocabToday from './pages/Vocab/Today';
import VocabWordDetail from './pages/Vocab/WordDetail';
import DynamicSubAppHome from './pages/DynamicSubAppHome';
import NotFound from './pages/NotFound';
import RequireAdmin from './routes/RequireAdmin';
import RequireAuth from './routes/RequireAuth';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route element={<RequireAuth />}>
          <Route path="/" element={<App />} />
          <Route element={<RequireAdmin />}>
            <Route path="/admin/ui" element={<AdminUiLibraryPage />} />
            <Route path="/admin/snapshots" element={<AdminSetSnapshots />} />
            <Route path="/test-focus" element={<TestFocusWork />} />
          </Route>
          <Route path="/apps" element={<AppCenter />} />
          <Route path="/:appId" element={<DynamicSubAppHome />} />
          {/* Vocab sub-pages */}
          <Route path="/vocab/today" element={<VocabToday />} />
          <Route path="/vocab/study" element={<VocabStudy />} />
          <Route path="/vocab/review" element={<VocabReview />} />
          <Route path="/vocab/mistakes" element={<VocabMistakes />} />
          <Route path="/vocab/words/:wordId" element={<VocabWordDetail />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </HashRouter>
  </StrictMode>,
)
