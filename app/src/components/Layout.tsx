import { NavLink, Outlet } from 'react-router-dom';
import { useTheme } from '../lib/theme';
import './Layout.css';

const NAV = [
  { to: '/insight', label: 'Port Insight' },
  { to: '/berth', label: '선석배정' },
  { to: '/vessel', label: '선박 위치' },
  { to: '/cargo', label: '화물 추적' },
  { to: '/route', label: '경로 분석' },
  { to: '/status', label: '데이터 현황' },
];

export default function Layout() {
  const { theme, toggle } = useTheme();
  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="container header-inner">
          <NavLink to="/" className="brand" aria-label="TWL Control Tower 홈">
            <span className="brand-dot" aria-hidden />
            <span className="brand-text">
              <b>TWL</b> Control Tower
            </span>
          </NavLink>
          <nav className="site-nav" aria-label="주요 메뉴">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive ? 'active' : '')}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <button className="theme-toggle" onClick={toggle} aria-label="테마 전환" title="라이트/다크 전환">
            {theme === 'dark' ? '☀' : '☾'}
          </button>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="container">
          태웅로직스 · TWL Control Tower · 문의 itt@twsc.co.kr · 시각 표기 KST
        </div>
      </footer>
    </div>
  );
}
