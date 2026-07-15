import React, { lazy, Suspense, useState, useEffect } from 'react';
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Inbox, Ticket, Users, BookOpen, FileText, Monitor, UserCircle, LogOut, Menu, X, Settings } from 'lucide-react';
import { useAuth } from './context/AuthContext';
import './index.css';

// M9: Code splitting with React.lazy
const LoginPage = lazy(() => import('./pages/Login'));
const DashboardPage = lazy(() => import('./pages/Dashboard'));
const LeadsInbox = lazy(() => import('./pages/LeadsInbox'));
const Tickets = lazy(() => import('./pages/Tickets'));
const TicketDetail = lazy(() => import('./pages/TicketDetail'));
const Clients = lazy(() => import('./pages/Clients'));
const KnowledgeBase = lazy(() => import('./pages/KnowledgeBase'));
const Invoices = lazy(() => import('./pages/Invoices'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const RustDeskPage = lazy(() => import('./pages/RustDesk'));
const VoiceAgentSettings = lazy(() => import('./pages/VoiceAgentSettings'));

function PageLoader() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '60vh', fontSize: 16, color: '#888',
    }}>
      <div className="loading-spinner" style={{ marginRight: 12 }} />
      Loading…
    </div>
  );
}

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/leads', icon: Inbox, label: 'Leads' },
  { to: '/tickets', icon: Ticket, label: 'Tickets' },
  { to: '/clients', icon: Users, label: 'Clients' },
  { to: '/rustdesk', icon: Monitor, label: 'Remote', techOnly: true },
  { to: '/knowledge-base', icon: BookOpen, label: 'KB' },
  { to: '/invoices', icon: FileText, label: 'Invoices', techOnly: true },
  { to: '/users', icon: UserCircle, label: 'Users', adminOnly: true },
  { to: '/voice-settings', icon: Settings, label: 'Voice & AI', adminOnly: true },
];

function Sidebar({ mobileOpen, onClose }) {
  const { user, logout, isTech, isAdmin } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (mobileOpen) onClose();
  }, [location.pathname]);

  const filteredNav = NAV_ITEMS.filter(item => {
    if (item.adminOnly && !isAdmin) return false;
    if (item.techOnly && !isTech) return false;
    return true;
  });

  return (
    <>
      {mobileOpen && <div className="sidebar-overlay" onClick={onClose} />}
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <h1>Fiji IT</h1>
            <p style={{ fontSize: 11, color: '#888', marginTop: 2 }}>Service Desk</p>
          </div>
          <button className="sidebar-close-btn" onClick={onClose}><X size={20} /></button>
        </div>
        <nav className="sidebar-nav">
          <div className="nav-label">Main</div>
          {filteredNav.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => isActive ? 'active' : ''}>
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-name">{user?.name || 'User'}</div>
          <div className="user-role">{user?.role || 'Guest'}</div>
          <div style={{ marginTop: 6, fontSize: 10, color: '#666', lineHeight: 1.4 }}>
            <div>AI: OWL Alpha</div>
            <div style={{ color: '#555' }}>v1.0.0 • {import.meta.env.VITE_PUBLIC_HOSTNAME || window.location.hostname}</div>
          </div>
          <button className="btn btn-outline btn-sm" style={{ marginTop: 8, width: '100%', color: '#aaa', borderColor: '#444' }} onClick={logout}>
            <LogOut size={14} /> Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}

function MobileHeader({ onMenuToggle }) {
  return (
    <header className="mobile-header">
      <button className="mobile-menu-btn" onClick={onMenuToggle}><Menu size={22} /></button>
      <span className="mobile-header-title">Fiji IT Solutions — Service Desk</span>
    </header>
  );
}

function AppLayout() {
  const { user, loading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (loading) return <div className="loading-spinner">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="app-layout">
      <Sidebar mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="main-content">
        <MobileHeader onMenuToggle={() => setSidebarOpen(true)} />
        <div className="main-content-inner">
          {/* M9: Wrap routes in Suspense for lazy-loaded components */}
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/leads" element={<LeadsInbox />} />
              <Route path="/tickets" element={<Tickets />} />
              <Route path="/tickets/:id" element={<TicketDetail />} />
              <Route path="/clients" element={<Clients />} />
              <Route path="/knowledge-base" element={<KnowledgeBase />} />
              <Route path="/invoices" element={<Invoices />} />
              <Route path="/rustdesk" element={<RustDeskPage />} />
              <Route path="/users" element={<UserManagement />} />
              <Route path="/voice-settings" element={<VoiceAgentSettings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </div>
        <div style={{
          padding: '10px 24px',
          borderTop: '1px solid #2a2a3a',
          background: '#12121c',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 11,
          color: '#666',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ color: '#888', fontWeight: 600 }}>Fiji IT Solutions</span>
            <span style={{ color: '#444' }}>|</span>
            <span>Service Desk</span>
            <span style={{ color: '#444' }}>|</span>
            <span>AI: OWL Alpha</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span>v1.0.0</span>
            <span style={{ color: '#444' }}>|</span>
            <span style={{ color: '#555' }}>{import.meta.env.VITE_PUBLIC_HOSTNAME || window.location.hostname}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  // AuthProvider is supplied once by the canonical entry point (main.jsx),
  // which wraps <BrowserRouter><AuthProvider><App/></AuthProvider></BrowserRouter>.
  // App must not re-wrap it: a nested second provider created a separate auth
  // state tree that shadowed the outer one.
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<AppLayout />} />
      </Routes>
    </Suspense>
  );
}
