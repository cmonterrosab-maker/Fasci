import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ShieldCheck, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';
import { useAdminAuth } from '../contexts/AdminAuthContext';

interface LoginFormValues {
  email: string;
  password: string;
}

export default function AdminLogin() {
  const { login } = useAdminAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>();

  const onSubmit = async (values: LoginFormValues) => {
    setErrorMsg(null);
    const { error } = await login(values.email, values.password);
    if (error) {
      setErrorMsg(error);
    } else {
      navigate('/admin/dashboard');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex flex-col items-center gap-2">
            <div className="bg-green-600 p-3 rounded-2xl shadow-lg">
              <ShieldCheck className="h-10 w-10 text-white" />
            </div>
            <span className="font-bold text-2xl text-white">Panel Administrativo</span>
            <span className="text-gray-400 text-sm">Drogueria Virtual</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          <h1 className="text-xl font-bold text-gray-900 mb-6">Acceso de Administrador</h1>

          {errorMsg && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-6">
              <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <span className="text-sm">{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Email de administrador
              </label>
              <input
                type="email"
                placeholder="admin@drogueriavirtual.com"
                className={`input-field ${errors.email ? 'border-red-400' : ''}`}
                {...register('email', {
                  required: 'El email es requerido',
                  pattern: {
                    value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                    message: 'Email invalido',
                  },
                })}
              />
              {errors.email && (
                <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Contrasena
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Contrasena"
                  className={`input-field pr-10 ${errors.password ? 'border-red-400' : ''}`}
                  {...register('password', {
                    required: 'La contrasena es requerida',
                  })}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white py-3 rounded-xl font-semibold hover:bg-gray-800 transition-colors disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Verificando...
                </>
              ) : (
                'Ingresar'
              )}
            </button>
          </form>
        </div>

        <div className="text-center mt-4">
          <Link to="/" className="text-sm text-gray-400 hover:text-white transition-colors">
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
