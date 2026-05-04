import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../integrations/supabase/client';
import type { Session, User } from '@supabase/supabase-js';

interface Drogueria {
  id: string;
  nombre: string;
  email: string;
  telefono: string;
  direccion: string;
  ciudad: string;
  estado: 'activa' | 'suspendida' | 'pendiente';
  numero_whatsapp?: string;
}

interface DrogueriaAuthState {
  drogueria: Drogueria | null;
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAuthenticated: boolean;
}

interface DrogueriaAuthContextType extends DrogueriaAuthState {
  login: (email: string, password: string) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
}

const DrogueriaAuthContext = createContext<DrogueriaAuthContextType | undefined>(undefined);

interface DrogueriaAuthProviderProps {
  children: ReactNode;
}

export function DrogueriaAuthProvider({ children }: DrogueriaAuthProviderProps) {
  const [state, setState] = useState<DrogueriaAuthState>({
    drogueria: null,
    user: null,
    session: null,
    loading: true,
    isAuthenticated: false,
  });

  const fetchDrogueriaProfile = async (userId: string): Promise<Drogueria | null> => {
    try {
      const { data, error } = await supabase
        .from('droguerias')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        console.error('Error fetching drogueria profile:', error);
        return null;
      }
      return data as Drogueria;
    } catch (err) {
      console.error('Error fetching drogueria profile:', err);
      return null;
    }
  };

  useEffect(() => {
    // Obtener sesion inicial
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const drogueria = await fetchDrogueriaProfile(session.user.id);
        setState({
          drogueria,
          user: session.user,
          session,
          loading: false,
          isAuthenticated: !!drogueria,
        });
      } else {
        setState(prev => ({ ...prev, loading: false }));
      }
    });

    // Escuchar cambios de autenticacion
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const drogueria = await fetchDrogueriaProfile(session.user.id);
        setState({
          drogueria,
          user: session.user,
          session,
          loading: false,
          isAuthenticated: !!drogueria,
        });
      } else if (event === 'SIGNED_OUT') {
        setState({
          drogueria: null,
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
        const drogueria = await fetchDrogueriaProfile(data.user.id);
        if (!drogueria) {
          await supabase.auth.signOut();
          setState(prev => ({ ...prev, loading: false }));
          return { error: 'No se encontro una drogueria asociada a este usuario.' };
        }
        setState({
          drogueria,
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
      drogueria: null,
      user: null,
      session: null,
      loading: false,
      isAuthenticated: false,
    });
  };

  return (
    <DrogueriaAuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </DrogueriaAuthContext.Provider>
  );
}

export function useDrogueriaAuth(): DrogueriaAuthContextType {
  const context = useContext(DrogueriaAuthContext);
  if (!context) {
    throw new Error('useDrogueriaAuth debe usarse dentro de DrogueriaAuthProvider');
  }
  return context;
}
