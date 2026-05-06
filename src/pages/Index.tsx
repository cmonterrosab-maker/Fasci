import React from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Pill } from 'lucide-react';

const WHATSAPP_LINK = `https://wa.me/573001234567?text=Hola%2C%20quiero%20pedir%20un%20medicamento`;

export default function Index() {
  return (
    <div className="min-h-screen bg-white flex flex-col">

      {/* Nav — solo acceso admin, discreto */}
      <header className="flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-2">
          <div className="bg-green-600 p-1.5 rounded-lg">
            <Pill className="h-4 w-4 text-white" />
          </div>
          <span className="font-semibold text-gray-900 text-sm">Droguería Virtual</span>
        </div>
        <Link
          to="/admin/login"
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors font-medium"
        >
          Acceso admin
        </Link>
      </header>

      {/* Centro */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 text-center">

        {/* Marca */}
        <div className="bg-green-50 p-5 rounded-3xl mb-8">
          <Pill className="h-10 w-10 text-green-600" />
        </div>

        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 tracking-tight mb-3">
          Droguería Virtual
        </h1>

        <p className="text-gray-500 text-lg max-w-sm mb-10 leading-relaxed">
          Pide tus medicamentos por WhatsApp y recíbelos a domicilio.
        </p>

        {/* CTA principal */}
        <a
          href={WHATSAPP_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-3 bg-green-600 hover:bg-green-700 active:scale-[0.98]
                     text-white font-semibold px-8 py-4 rounded-2xl text-base
                     shadow-[0_4px_20px_rgba(22,163,74,0.35)] hover:shadow-[0_6px_24px_rgba(22,163,74,0.45)]
                     transition-all duration-150"
        >
          <MessageCircle className="h-5 w-5" />
          Pedir por WhatsApp
        </a>

        {/* Accesos secundarios */}
        <div className="flex items-center gap-6 mt-10">
          <Link
            to="/login"
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors font-medium"
          >
            Acceso droguerías
          </Link>
          <span className="text-gray-200">·</span>
          <Link
            to="/admin/login"
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors font-medium"
          >
            Panel admin
          </Link>
        </div>
      </main>

      {/* Footer mínimo */}
      <footer className="px-8 py-5 text-center">
        <p className="text-xs text-gray-300">
          © {new Date().getFullYear()} Droguería Virtual · Colombia
        </p>
      </footer>

    </div>
  );
}
