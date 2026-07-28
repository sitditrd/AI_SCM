import { HashRouter, Routes, Route } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import Layout from './components/Layout';
import Home from './screens/Home';
import './styles/grid-cells.css';

/* 화면 코드 스플릿 — 각 라우트 진입 시에만 로드 */
const Berth = lazy(() => import('./screens/Berth'));
const Status = lazy(() => import('./screens/Status'));
const Insight = lazy(() => import('./screens/Insight'));
const Vessel = lazy(() => import('./screens/Vessel'));
const Cargo = lazy(() => import('./screens/Cargo'));
const RouteView = lazy(() => import('./screens/RouteView'));

function Loading() {
  return <div className="container" style={{ padding: '60px 0', textAlign: 'center', color: 'var(--muted)' }}>불러오는 중…</div>;
}

export default function App() {
  return (
    <HashRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="berth" element={<Berth />} />
            <Route path="insight" element={<Insight />} />
            <Route path="vessel" element={<Vessel />} />
            <Route path="cargo" element={<Cargo />} />
            <Route path="route" element={<RouteView />} />
            <Route path="status" element={<Status />} />
            <Route path="*" element={<Home />} />
          </Route>
        </Routes>
      </Suspense>
    </HashRouter>
  );
}
