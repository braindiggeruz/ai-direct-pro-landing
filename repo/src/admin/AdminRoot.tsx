import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AdminApp from './AdminApp';

// Router lives inside the lazy admin chunk so react-router never ships in the
// public landing bundle. Mounted by src/main.tsx only when the path starts
// with /admin-tools.
export default function AdminRoot() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin-tools/*" element={<AdminApp />} />
      </Routes>
    </BrowserRouter>
  );
}
