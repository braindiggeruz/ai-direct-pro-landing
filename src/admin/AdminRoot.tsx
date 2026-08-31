import { BrowserRouter, Routes, Route } from 'react-router';
import AdminApp from './AdminApp';
import AdminUpdateNotice from './components/AdminUpdateNotice';

// Router lives inside the lazy admin chunk so react-router never ships in the
// public landing bundle. Mounted by src/main.tsx only when the path starts
// with /admin-tools.
export default function AdminRoot() {
  return (
    <BrowserRouter>
      <AdminUpdateNotice />
      <Routes>
        <Route path="/admin-tools/*" element={<AdminApp />} />
      </Routes>
    </BrowserRouter>
  );
}
