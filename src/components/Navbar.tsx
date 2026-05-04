import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Pill,
  LayoutDashboard,
  BookOpen,
  ShoppingBag,
  Package,
  LogOut,
  Menu,
  X,
  ChevronDown,
} from 'lucide-react';
import { useDrogueriaAuth } from '../contexts/DrogueriaAuthContext';

const navLinks = [
  { to: '/drogueria/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { to: '/drogueria/catalogo', label: 'Catalogo', icon: <BookOpen className="h-4 w-4" /> },
  { to: '/drogueria/pedidos', label: 'Pedidos', icon: <ShoppingBag className="h-4 w-4" /> },
  { to: '/drogueria/inventario', label: 'Inventario', icon: <Package className="h-4 w-4" /> },
];

export default function Navbar() {
  const { drogueria, logout } = useDrogueriaAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/drogueria/dashboard" className="flex items-center gap-2 flex-shrink-0">
            <div className="bg-green-600 p-1.5 rounded-lg">
              <Pill className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-lg text-green-700 hidden sm:block">Drogueria Virtual</span>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive(link.to)
                    ? 'bg-green-50 text-green-700'
                    : 'text-gray-600 hover:text-green-700 hover:bg-green-50'
                }`}
              >
                {link.icon}
                {link.label}
              </Link>
            ))}
          </div>

          {/* Right side - user menu */}
          <div className="hidden md:flex items-center gap-3">
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm hover:bg-gray-100 transition-colors"
              >
                <div className="bg-green-100 p-1 rounded-full">
                  <Pill className="h-4 w-4 text-green-700" />
                </div>
                <div className="text-left">
                  <div className="font-medium text-gray-900 max-w-[120px] truncate">
                    {drogueria?.nombre || 'Mi Drogueria'}
                  </div>
                  <div className="text-xs text-gray-500">{drogueria?.ciudad || ''}</div>
                </div>
                <ChevronDown className="h-4 w-4 text-gray-400" />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <p className="text-xs font-medium text-gray-900 truncate">{drogueria?.nombre}</p>
                    <p className="text-xs text-gray-500 truncate">{drogueria?.email}</p>
                  </div>
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      logout();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    Cerrar sesion
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
          >
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-white border-t border-gray-100 px-4 py-3 space-y-1">
          {/* Drogueria info */}
          <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg mb-3">
            <div className="bg-green-100 p-1.5 rounded-full">
              <Pill className="h-5 w-5 text-green-700" />
            </div>
            <div>
              <div className="font-medium text-gray-900 text-sm">{drogueria?.nombre || 'Mi Drogueria'}</div>
              <div className="text-xs text-gray-500">{drogueria?.ciudad}</div>
            </div>
          </div>

          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                isActive(link.to)
                  ? 'bg-green-50 text-green-700'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {link.icon}
              {link.label}
            </Link>
          ))}

          <button
            onClick={() => {
              setMobileOpen(false);
              logout();
            }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors mt-2"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesion
          </button>
        </div>
      )}
    </nav>
  );
}
