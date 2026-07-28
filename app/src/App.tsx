import { HashRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './screens/Home';
import Berth from './screens/Berth';
import Status from './screens/Status';
import Placeholder from './screens/Placeholder';
import './styles/grid-cells.css';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="berth" element={<Berth />} />
          <Route path="insight" element={<Placeholder id="insight" />} />
          <Route path="vessel" element={<Placeholder id="vessel" />} />
          <Route path="cargo" element={<Placeholder id="cargo" />} />
          <Route path="route" element={<Placeholder id="route" />} />
          <Route path="status" element={<Status />} />
          <Route path="*" element={<Home />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
