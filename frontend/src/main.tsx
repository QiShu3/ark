import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Route, Routes } from 'react-router-dom';

import App from './App';
import Login from './pages/Login';
import AppCenter from './pages/AppCenter';
import ERCHome from './pages/ERC/Home';
import ERCLibrary from './pages/ERC/Library';
import ERCMistakes from './pages/ERC/Mistakes';
import ERCPractice from './pages/ERC/Practice';
import ERCPracticeResult from './pages/ERC/PracticeResult';
import ERCReview from './pages/ERC/Review';
import VocabHome from './pages/Vocab/Home';
import VocabMistakes from './pages/Vocab/Mistakes';
import VocabReview from './pages/Vocab/Review';
import VocabStudy from './pages/Vocab/Study';
import VocabToday from './pages/Vocab/Today';
import VocabWordDetail from './pages/Vocab/WordDetail';
import NotFound from './pages/NotFound';
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
          <Route path="/erc" element={<ERCHome />} />
          <Route path="/erc/library" element={<ERCLibrary />} />
          <Route path="/erc/articles/:articleId/practice" element={<ERCPractice />} />
          <Route path="/erc/articles/:articleId/result" element={<ERCPracticeResult />} />
          <Route path="/erc/review" element={<ERCReview />} />
          <Route path="/erc/mistakes" element={<ERCMistakes />} />
          <Route path="/vocab" element={<VocabHome />} />
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
