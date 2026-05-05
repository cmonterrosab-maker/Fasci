import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../integrations/supabase/client';
import type { Session, User } from '@supabase/supabase-js';

interface AdminProfile {
  id: string;
  email: string;
  nombre: string;
  rol: 'super_admin' | 'admin';
}

interface AdminAuthState {
  admin: AdminProfile | null;
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAuthenticated: boolean;
}

interface AdminAuthContextType extends AdminAuthState {
  login: (email: string, password: string) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);
const ADMIN_EMAILS_FALLBACK = (import.meta.env.VITE_ADMIN_EMAILS || 'soporte@promidamos.org')
  .split(',')
  .map((email: string) => email.trim().toLowerCase())
  .filter(Boolean);

interface AdminAuthProviderProps {
  children: ReactNode;
}

export function AdminAuthProvider({ children }: AdminAuthProviderProps) {
  const [state, setState] = useState<AdminAuthState>({
    admin: null,
    user: null,
    session: null,
    loading: true,
    isAuthenticated: false,
  });

  const fetchAdminProfile = async (userId: string): Promise<AdminProfile | null> => {
    try {
      const { data, error } = await supabase
        .from('admins')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        console.error('Error fetching admin profile:', error);
        return null;
      }
      return data as AdminProfile;
    } catch (err) {
      console.error('Error fetching admin profile:', err);
      return null;
    }
  };

  const buildFallbackAdminProfile = (user: User): AdminProfile | null => {
    const email = user.email?.toLowerCase();
    if (!email || !ADMIN_EMAILS_FALLBACK.includes(email)) return null;

    return {
      id: user.id,
      email,
      nombre: user.user_metadata?.nombre || 'Soporte Promidamos',
      rol: 'super_admin',
    };
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const admin = buildFallbackAdminProfile(session.user) || await fetchAdminProfile(session.user.id);
        setState({
          admin,
          user: session.user,
          session,
          loading: false,
          isAuthenticated: !!admin,
        });
      } else {
        setState(prev => ({ ...prev, loading: false }));
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const admin = buildFallbackAdminProfile(session.user) || await fetchAdminProfile(session.user.id);
        setState({
          admin,
          user: session.user,
          session,
          loading: false,
          isAuthenticated: !!admin,
        });
      } else if (event === 'SIGNED_OUT') {
        setState({
          admin: null,
          user: null,
          session: null,
          loading: false,
          isAuthenticated: false,
        });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (email: string, password: string): Promise<{ error: string | null }> => {
    setState(prev => ({ ...prev, loading: true }));
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        setState(prev => ({ ...prev, loading: false }));
        if (error.message.includes('Invalid login credentials')) {
          return { error: 'Email o contrasena incorrectos.' };
        }
        return { error: error.message };
      }

      if (data.user) {
        const admin = buildFallbackAdminProfile(data.user) || await fetchAdminProfile(data.user.id);
        if (!admin) {
          await supabase.auth.signOut();
          setState(prev => ({ ...prev, loading: false }));
          return { error: 'Acceso no autorizado. Este usuario no es administrador.' };
        }
        setState({
          admin,
          user: data.user,
          session: data.session,
          loading: false,
          isAuthenticated: true,
        });
      }

      return { error: null };
    } catch (err) {
      setState(prev => ({ ...prev, loading: false }));
      return { error: 'Error inesperado. Por favor intenta de nuevo.' };
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setState({
      admin: null,
      user: null,
      session: null,
      loading: false,
      isAuthenticated: false,
    });
  };

  return (
    <AdminAuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth(): AdminAuthContextType {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth debe usarse dentro de AdminAuthProvider');
  }
  return context;
}
