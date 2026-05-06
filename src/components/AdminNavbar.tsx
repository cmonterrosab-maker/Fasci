import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Store, Pill, ShoppingBag, Activity,
  Bike, LogOut, Menu, X, Package,
} from 'lucide-react';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { useCanal } from '../contexts/CanalContext';

const NAV_B2C = [
  { to: '/admin/dashboard',    label: 'Dashboard',  icon: LayoutDashboard },
  { to: '/admin/metricas',     label: 'Métricas',   icon: Activity },
  { to: '/admin/pedidos',      label: 'Pedidos',    icon: ShoppingBag },
  { to: '/admin/mensajeros',   label: 'Mensajeros', icon: Bike },
  { to: '/admin/medicamentos', label: 'Catálogo',   icon: Pill },
];

const NAV_B2B = [
  { to: '/admin/dashboard',    label: 'Dashboard',  icon: LayoutDashboard },
  { to: '/admin/ordenes-b2b',  label: 'Órdenes',    icon: Package },
  { to: '/admin/droguerias',   label: 'Socios',     icon: Store },
  { to: '/admin/mensajeros',   label: 'Mensajeros', icon: Bike },
  { to: '/admin/medicamentos', label: 'Catálogo',   icon: Pill },
];

function Initials({ name }: { name: string }) {
  const parts = (name || 'A').trim().split(' ');
  const ini = parts.length >= 2
    ? parts[0][0] + parts[parts.length - 1][0]
    : parts[0].slice(0, 2);
  return (
    <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
      <span className="text-[11px] font-semibold text-white uppercase tracking-wide">{ini}</span>
    </div>
  );
}

export default function AdminNavbar() {
  const { admin, logout } = useAdminAuth();
  const { canal, setCanal } = useCanal();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = canal === 'b2b' ? NAV_B2B : NAV_B2C;
  const isActive = (path: string) => location.pathname === path;
  const accent = canal === 'b2b' ? 'text-indigo-400' : 'text-green-400';
  const accentBorder = canal === 'b2b' ? 'border-indigo-400' : 'border-green-400';

  return (
    <nav className="bg-[#111318] border-b border-white/[0.06] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-5">
        <div className="flex items-center h-14 gap-6">

          {/* Logo */}
          <Link to="/admin/dashboard" className="flex items-center gap-2 flex-shrink-0 mr-2">
            <span className="font-semibold text-white text-[15px] tracking-tight">Droguería Virtual</span>
            <span className="text-[10px] font-medium text-white/30 bg-white/[0.07] px-1.5 py-0.5 rounded">
              Admin
            </span>
          </Link>

          {/* Toggle B2C / B2B — segmented control */}
          <div className="flex items-center bg-white/[0.07] rounded-lg p-0.5 gap-px flex-shrink-0">
            {(['b2c', 'b2b'] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCanal(c)}
                className={`px-3 py-1 rounded-md text-[12px] font-semibold tracking-wide uppercase transition-all duration-150 ${
                  canal === c
                    ? c === 'b2b'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-green-600 text-white shadow-sm'
                    : 'text-white/40 hover:text-white/70'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="h-5 w-px bg-white/[0.08] flex-shrink-0" />

          {/* Nav links desktop */}
          <div className="hidden md:flex items-center gap-0.5 flex-1">
            {navLinks.map(({ to, label, icon: Icon }) => {
              const active = isActive(to);
              return (
                <Link
                  key={to}
                  to={to}
                  className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors duration-100 group
                    ${active ? `${accent}` : 'text-white/45 hover:text-white/80'}`}
                >
                  <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                  {label}
                  {/* active underline */}
                  {active && (
                    <span className={`absolute bottom-0 left-2 right-2 h-px ${accentBorder} border-b-2 rounded-full`} />
                  )}
                </Link>
              );
            })}
          </div>

          {/* User */}
          <div className="hidden md:flex items-center gap-2 ml-auto flex-shrink-0">
            <Initials name={admin?.nombre || 'Admin'} />
            <div className="leading-none">
              <div className="text-[13px] font-medium text-white/80">{admin?.nombre || 'Admin'}</div>
            </div>
            <button
              onClick={logout}
              title="Cerrar sesión"
              className="ml-1 p-1.5 rounded-md text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden ml-auto p-1.5 rounded-md text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-[#111318] border-t border-white/[0.06] px-4 py-3 space-y-0.5">
          {navLinks.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors ${
                isActive(to)
                  ? `${accent} bg-white/[0.05]`
                  : 'text-white/45 hover:text-white/80 hover:bg-white/[0.04]'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
          <button
            onClick={() => { setMobileOpen(false); logout(); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium text-red-400/70 hover:text-red-400 hover:bg-white/[0.04] transition-colors mt-2"
          >
            <LogOut className="h-4 w-4" /> Cerrar sesión
          </button>
        </div>
      )}
    </nav>
  );
}
