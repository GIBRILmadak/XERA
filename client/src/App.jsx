import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

// Pages
import Home from './pages/Home';
import Login from './pages/Login';
import Profile from './pages/Profile';
import CreatorDashboard from './pages/CreatorDashboard';
import NotFound from './pages/NotFound';

// Global CSS (original stylesheets loaded from public/ at runtime via index.html <link> tags)

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/pagepro" element={<Profile />} />
          <Route path="/stream" element={<LegacyPage src="/stream.html" />} />
          <Route path="/subscription-plans" element={<LegacyPage src="/subscription-plans.html" />} />
          <Route path="/verification" element={<LegacyPage src="/verification.html" />} />
          <Route path="/credits" element={<LegacyPage src="/credits.html" />} />

          {/* Protected routes */}
          <Route
            path="/creator-dashboard"
            element={
              <ProtectedRoute>
                <CreatorDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <LegacyPage src="/admin.html" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/analytics"
            element={
              <ProtectedRoute>
                <LegacyPage src="/analytics.html" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/create-stream"
            element={
              <ProtectedRoute>
                <LegacyPage src="/create-stream.html" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/badges-admin"
            element={
              <ProtectedRoute>
                <LegacyPage src="/badges-admin.html" />
              </ProtectedRoute>
            }
          />

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

/**
 * Temporary wrapper for pages not yet migrated to React.
 * Uses an iframe to load the legacy HTML page.
 */
function LegacyPage({ src }) {
  return (
    <iframe
      src={src}
      style={{ width: '100%', height: '100vh', border: 'none', display: 'block' }}
      title="XERA page"
    />
  );
}
