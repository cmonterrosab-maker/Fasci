import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ShieldCheck,
  LayoutDashboard,
  Store,
  Pill,
  ShoppingBag,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { useAdminAuth } from '../contexts/AdminAuthContext';

const navLinks = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { to: '/admin/droguerias', label: 'Droguerias', icon: <Store className="h-4 w-4" /> },
  { to: '/admin/medicamentos', label: 'Medicamentos', icon: <Pill className="h-4 w-4" /> },
  { to: '/admin/pedidos', label: 'Pedidos', icon: <ShoppingBag className="h-4 w-4" /> },
];

export default function AdminNavbar() {
  const { admin, logout } = useAdminAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="bg-gray-900 border-b border-gray-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/admin/dashboard" className="flex items-center gap-2 flex-shrink-0">
            <div className="bg-green-600 p-1.5 rounded-lg">
              <ShieldCheck className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-lg text-white hidden sm:block">Admin Panel</span>
            <span className="text-gray-500 text-xs hidden sm:block">Drogueria Virtual</span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive(link.to)
                    ? 'bg-green-700 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                {link.icon}
                {link.label}
              </Link>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-medium text-white">{admin?.nombre || 'Administrador'}</div>
              <div className="text-xs text-gray-500 capitalize">{admin?.rol?.replace('_', ' ') || 'Admin'}</div>
            </div>
            <button
              onClick={logout}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Salir
            </button>
          </div>

          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden bg-gray-900 border-t border-gray-800 px-4 py-3 space-y-1">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                isActive(link.to)
                  ? 'bg-green-700 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              {link.icon}
              {link.label}
            </Link>
          ))}
          <button
            onClick={() => { setMobileOpen(false); logout(); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-red-400 hover:bg-gray-800 transition-colors mt-2"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesion
          </button>
        </div>
      )}
    </nav>
  );
}
