import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';

const NAV = [
  { to: '/', label: 'Dashboard', icon: '▦', end: true },
  { to: '/inbox', label: 'Email Inbox', icon: '✉', end: false },
];

function Logo() {
  return (
    <div className="flex items-center gap-2 font-extrabold text-base px-2.5 pt-1 pb-4 text-brand-dark">
      <span className="w-7 h-7 rounded-lg bg-brand text-white inline-flex items-center justify-center text-sm font-extrabold">
        R
      </span>
      ReceiptPilot
    </div>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col md:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-[200px] flex-shrink-0 bg-white border-r border-border p-5 px-3 flex-col gap-1">
        <Logo />
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium no-underline ${
                isActive ? 'bg-brand-soft text-brand-dark font-semibold' : 'text-ink-2 hover:bg-canvas'
              }`
            }
          >
            <span className="w-[18px] text-center">{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
        <span className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium text-ink-3 cursor-default select-none">
          <span className="w-[18px] text-center">⚙</span>
          Settings
          <span className="text-[10px]">soon</span>
        </span>
        <button
          onClick={() => navigate('/upload')}
          className="mt-4 bg-brand hover:bg-brand-dark text-white rounded-[10px] py-2.5 text-sm font-semibold"
        >
          + Add Receipt
        </button>
        <div className="flex-1" />
        <div className="text-[11px] text-ink-3 px-2.5">v1 preview</div>
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden flex items-center justify-between bg-white border-b border-border px-4 py-3">
        <Logo />
        <button
          onClick={() => navigate('/upload')}
          className="bg-brand text-white rounded-[10px] px-3.5 py-2 text-sm font-semibold"
        >
          + Add
        </button>
      </header>

      <main className="flex-1 min-w-0 p-4 md:p-7 pb-24 md:pb-7">{children}</main>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-border flex items-center justify-around py-2 z-20">
        {NAV.map((n) => {
          const active = n.end ? location.pathname === n.to : location.pathname.startsWith(n.to);
          return (
            <NavLink
              key={n.to}
              to={n.to}
              className={`flex flex-col items-center text-[11px] gap-0.5 px-4 ${
                active ? 'text-brand-dark font-semibold' : 'text-ink-3'
              }`}
            >
              <span className="text-lg leading-none">{n.icon}</span>
              {n.label}
            </NavLink>
          );
        })}
        <button
          onClick={() => navigate('/upload')}
          className="flex flex-col items-center text-[11px] gap-0.5 px-4 text-brand-dark font-semibold"
        >
          <span className="text-lg leading-none">＋</span>
          Add
        </button>
      </nav>
    </div>
  );
}
