import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Pill, Eye, EyeOff, MessageCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useDrogueriaAuth } from '../contexts/DrogueriaAuthContext';

interface LoginFormValues {
  email: string;
  password: string;
}

export default function Login() {
  const { login } = useDrogueriaAuth();
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
      navigate('/drogueria/dashboard');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex flex-col items-center gap-2">
            <div className="bg-green-600 p-3 rounded-2xl shadow-lg">
              <Pill className="h-10 w-10 text-white" />
            </div>
            <span className="font-bold text-2xl text-green-700">Drogueria Virtual</span>
          </Link>
          <p className="text-gray-500 mt-2">Portal de Droguerias</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Iniciar sesion</h1>
          <p className="text-gray-500 text-sm mb-6">
            Ingresa con las credenciales de tu drogueria
          </p>

          {errorMsg && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-6">
              <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <span className="text-sm">{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Correo electronico
              </label>
              <input
                type="email"
                placeholder="drogueria@ejemplo.com"
                className={`input-field ${errors.email ? 'border-red-400 focus:ring-red-500' : ''}`}
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
                  placeholder="Tu contrasena"
                  className={`input-field pr-10 ${errors.password ? 'border-red-400 focus:ring-red-500' : ''}`}
                  {...register('password', {
                    required: 'La contrasena es requerida',
                    minLength: {
                      value: 6,
                      message: 'La contrasena debe tener al menos 6 caracteres',
                    },
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
              className="w-full flex items-center justify-center gap-2 bg-green-600 text-white py-3 rounded-xl font-semibold hover:bg-green-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Ingresando...
                </>
              ) : (
                'Ingresar al portal'
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-gray-100">
            <p className="text-center text-sm text-gray-500 mb-4">
              ¿No tienes una cuenta aun?
            </p>
            <a
              href="https://wa.me/573001234567?text=Hola%2C%20quiero%20afiliar%20mi%20drogueria"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 border border-green-600 text-green-700 py-3 rounded-xl font-medium hover:bg-green-50 transition-colors text-sm"
            >
              <MessageCircle className="h-5 w-5" />
              Registra tu drogueria por WhatsApp
            </a>
          </div>
        </div>

        <div className="text-center mt-4">
          <Link to="/" className="text-sm text-gray-500 hover:text-green-700 transition-colors">
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
