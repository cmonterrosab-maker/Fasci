import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DrogueriaAuthProvider, useDrogueriaAuth } from './contexts/DrogueriaAuthContext';
import { AdminAuthProvider, useAdminAuth } from './contexts/AdminAuthContext';

import Index from './pages/Index';
import Login from './pages/Login';
import AdminLogin from './pages/AdminLogin';
import DrogueriaDashboard from './pages/drogueria/Dashboard';
import DrogueriaCatalogo from './pages/drogueria/Catalogo';
import DrogueriaPedidos from './pages/drogueria/Pedidos';
import DrogueriaInventario from './pages/drogueria/Inventario';
import AdminDashboard from './pages/admin/Dashboard';
import AdminDroguerias from './pages/admin/Droguerias';
import AdminMedicamentos from './pages/admin/Medicamentos';
import AdminPedidos from './pages/admin/Pedidos';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60 * 5,
    },
  },
});

function ProtectedDrogueriaRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useDrogueriaAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function ProtectedAdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAdminAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Publica */}
      <Route path="/" element={<Index />} />
      <Route path="/login" element={<Login />} />
      <Route path="/admin/login" element={<AdminLogin />} />

      {/* Drogueria - protegidas */}
      <Route
        path="/drogueria/dashboard"
        element={
          <ProtectedDrogueriaRoute>
            <DrogueriaDashboard />
          </ProtectedDrogueriaRoute>
        }
      />
      <Route
        path="/drogueria/catalogo"
        element={
          <ProtectedDrogueriaRoute>
            <DrogueriaCatalogo />
          </ProtectedDrogueriaRoute>
        }
      />
      <Route
        path="/drogueria/pedidos"
        element={
          <ProtectedDrogueriaRoute>
            <DrogueriaPedidos />
          </ProtectedDrogueriaRoute>
        }
      />
      <Route
        path="/drogueria/inventario"
        element={
          <ProtectedDrogueriaRoute>
            <DrogueriaInventario />
          </ProtectedDrogueriaRoute>
        }
      />

      {/* Admin - protegidas */}
      <Route
        path="/admin/dashboard"
        element={
          <ProtectedAdminRoute>
            <AdminDashboard />
          </ProtectedAdminRoute>
        }
      />
      <Route
        path="/admin/droguerias"
        element={
          <ProtectedAdminRoute>
            <AdminDroguerias />
          </ProtectedAdminRoute>
        }
      />
      <Route
        path="/admin/medicamentos"
        element={
          <ProtectedAdminRoute>
            <AdminMedicamentos />
          </ProtectedAdminRoute>
        }
      />
      <Route
        path="/admin/pedidos"
        element={
          <ProtectedAdminRoute>
            <AdminPedidos />
          </ProtectedAdminRoute>
        }
      />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <DrogueriaAuthProvider>
        <AdminAuthProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AdminAuthProvider>
      </DrogueriaAuthProvider>
    </QueryClientProvider>
  );
}
