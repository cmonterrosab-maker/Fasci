import React from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  MessageCircle,
  Package,
  CheckCircle,
  Phone,
  MapPin,
  Clock,
  ShieldCheck,
  ChevronRight,
  Pill,
  Star,
} from 'lucide-react';

const WHATSAPP_NUMBER = '+573001234567';
const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER.replace('+', '')}?text=Hola%2C%20quiero%20buscar%20medicamentos`;

export default function Index() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header / Nav */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <div className="bg-green-600 p-1.5 rounded-lg">
              <Pill className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-xl text-green-700">Drogueria Virtual</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="text-sm text-gray-600 hover:text-green-700 font-medium transition-colors"
            >
              Acceso Droguerias
            </Link>
            <a
              href={WHATSAPP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-br from-green-600 via-green-700 to-green-800 text-white py-20 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <div className="flex justify-center mb-6">
            <div className="bg-white/20 backdrop-blur-sm p-4 rounded-2xl">
              <Pill className="h-16 w-16 text-white" />
            </div>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold mb-6 leading-tight">
            Drogueria Virtual
          </h1>
          <p className="text-xl sm:text-2xl text-green-100 mb-4 font-medium">
            Tu farmacia al alcance de WhatsApp
          </p>
          <p className="text-green-200 max-w-2xl mx-auto mb-10 text-lg">
            Busca medicamentos en las droguerias de tu ciudad, compara precios y recibe tu pedido en casa sin salir.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href={WHATSAPP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-3 bg-white text-green-700 px-8 py-4 rounded-xl font-bold text-lg hover:bg-green-50 transition-colors shadow-lg"
            >
              <MessageCircle className="h-6 w-6" />
              Pedir por WhatsApp
            </a>
            <a
              href="#como-funciona"
              className="flex items-center justify-center gap-2 border-2 border-white text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-white/10 transition-colors"
            >
              Como funciona
              <ChevronRight className="h-5 w-5" />
            </a>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-6 max-w-2xl mx-auto mt-16 pt-10 border-t border-white/20">
            <div>
              <div className="text-3xl font-extrabold">50+</div>
              <div className="text-green-200 text-sm">Droguerias afiliadas</div>
            </div>
            <div>
              <div className="text-3xl font-extrabold">5.000+</div>
              <div className="text-green-200 text-sm">Medicamentos disponibles</div>
            </div>
            <div>
              <div className="text-3xl font-extrabold">10 min</div>
              <div className="text-green-200 text-sm">Respuesta promedio</div>
            </div>
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" className="py-20 px-4 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Como funciona
            </h2>
            <p className="text-gray-600 text-lg max-w-xl mx-auto">
              En tres simples pasos tienes tus medicamentos en casa
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: <Search className="h-8 w-8 text-green-600" />,
                step: '01',
                title: 'Busca',
                description:
                  'Envia un mensaje por WhatsApp con el nombre del medicamento que necesitas. Nuestro bot busca en todas las droguerias de tu ciudad.',
              },
              {
                icon: <MessageCircle className="h-8 w-8 text-green-600" />,
                step: '02',
                title: 'Pide',
                description:
                  'Elige la drogueria con mejor precio y disponibilidad. Confirma tu pedido directamente por chat con los datos de entrega.',
              },
              {
                icon: <Package className="h-8 w-8 text-green-600" />,
                step: '03',
                title: 'Recibe',
                description:
                  'La drogueria confirma tu pedido y lo envia a domicilio. Puedes hacer seguimiento en tiempo real por WhatsApp.',
              },
            ].map((item) => (
              <div key={item.step} className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 text-center relative">
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-green-600 text-white text-sm font-bold w-8 h-8 rounded-full flex items-center justify-center">
                  {item.step}
                </div>
                <div className="flex justify-center mb-5 mt-2">
                  <div className="bg-green-50 p-4 rounded-xl">
                    {item.icon}
                  </div>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{item.title}</h3>
                <p className="text-gray-600">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Beneficios */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-6">
                Por que elegir Drogueria Virtual
              </h2>
              <div className="space-y-6">
                {[
                  {
                    icon: <Clock className="h-6 w-6 text-green-600" />,
                    title: 'Disponible 24/7',
                    desc: 'El bot de WhatsApp atiende a cualquier hora, incluso cuando las droguerias estan cerradas.',
                  },
                  {
                    icon: <MapPin className="h-6 w-6 text-green-600" />,
                    title: 'Busqueda local',
                    desc: 'Encontramos medicamentos en droguerias cercanas a tu ubicacion en Colombia.',
                  },
                  {
                    icon: <ShieldCheck className="h-6 w-6 text-green-600" />,
                    title: 'Droguerias verificadas',
                    desc: 'Todas las farmacias en nuestra plataforma estan registradas y verificadas.',
                  },
                  {
                    icon: <Star className="h-6 w-6 text-green-600" />,
                    title: 'Mejores precios',
                    desc: 'Compara precios entre multiples droguerias y elige la mejor opcion.',
                  },
                ].map((item) => (
                  <div key={item.title} className="flex gap-4">
                    <div className="bg-green-50 p-2 rounded-lg h-fit flex-shrink-0">
                      {item.icon}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{item.title}</h3>
                      <p className="text-gray-600 text-sm">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-green-50 rounded-2xl p-8">
              <div className="bg-white rounded-xl p-6 shadow-sm mb-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-green-600 p-2 rounded-full">
                    <MessageCircle className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">Drogueria Virtual Bot</div>
                    <div className="text-xs text-green-600">En linea</div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="bg-gray-100 rounded-lg rounded-tl-none px-4 py-2 text-sm max-w-xs">
                    Hola! Necesito ibuprofeno 400mg
                  </div>
                  <div className="bg-green-600 text-white rounded-lg rounded-tr-none px-4 py-2 text-sm max-w-xs ml-auto">
                    Encontre 5 droguerias con ibuprofeno 400mg cerca de ti. La mas cercana tiene precio desde $3.500. Quieres ver opciones?
                  </div>
                  <div className="bg-gray-100 rounded-lg rounded-tl-none px-4 py-2 text-sm max-w-xs">
                    Si, mostrame las opciones
                  </div>
                  <div className="bg-green-600 text-white rounded-lg rounded-tr-none px-4 py-2 text-sm max-w-xs ml-auto">
                    Aqui estan las mejores opciones disponibles ahora mismo...
                  </div>
                </div>
              </div>
              <p className="text-center text-sm text-gray-500">
                Conversacion real con nuestro bot de WhatsApp
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Para droguerias */}
      <section className="py-20 px-4 bg-green-700 text-white">
        <div className="max-w-7xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-6">
            ¿Eres propietario de una drogueria?
          </h2>
          <p className="text-green-100 text-lg max-w-2xl mx-auto mb-10">
            Afilia tu drogueria a Drogueria Virtual y empieza a recibir pedidos por WhatsApp. Administra tu catalogo, inventario y pedidos desde nuestro portal.
          </p>
          <div className="grid sm:grid-cols-3 gap-6 max-w-3xl mx-auto mb-10">
            {[
              { icon: <CheckCircle className="h-6 w-6" />, text: 'Registro gratuito' },
              { icon: <CheckCircle className="h-6 w-6" />, text: 'Portal de gestion completo' },
              { icon: <CheckCircle className="h-6 w-6" />, text: 'Clientes por WhatsApp' },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-3 bg-white/10 rounded-xl p-4">
                <div className="text-green-300">{item.icon}</div>
                <span className="font-medium">{item.text}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href={`https://wa.me/${WHATSAPP_NUMBER.replace('+', '')}?text=Hola%2C%20quiero%20afiliar%20mi%20drogueria`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-white text-green-700 px-8 py-4 rounded-xl font-bold hover:bg-green-50 transition-colors"
            >
              <MessageCircle className="h-5 w-5" />
              Registra tu drogueria por WhatsApp
            </a>
            <Link
              to="/login"
              className="flex items-center justify-center gap-2 border-2 border-white text-white px-8 py-4 rounded-xl font-bold hover:bg-white/10 transition-colors"
            >
              Acceder al portal
              <ChevronRight className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* WhatsApp CTA */}
      <section className="py-16 px-4 bg-white">
        <div className="max-w-2xl mx-auto text-center">
          <div className="flex justify-center mb-6">
            <div className="bg-green-100 p-4 rounded-full">
              <Phone className="h-10 w-10 text-green-600" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">
            Contactanos directamente
          </h2>
          <p className="text-gray-600 mb-6">
            Nuestro numero de WhatsApp para pedidos y soporte:
          </p>
          <a
            href={WHATSAPP_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 bg-green-600 text-white px-8 py-4 rounded-xl font-bold text-xl hover:bg-green-700 transition-colors shadow-lg"
          >
            <MessageCircle className="h-7 w-7" />
            {WHATSAPP_NUMBER}
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid sm:grid-cols-3 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="bg-green-600 p-1.5 rounded-lg">
                  <Pill className="h-4 w-4 text-white" />
                </div>
                <span className="font-bold text-white text-lg">Drogueria Virtual</span>
              </div>
              <p className="text-sm">
                Plataforma de farmacias colombianas conectadas por WhatsApp.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-3">Accesos</h3>
              <ul className="space-y-2 text-sm">
                <li><a href={WHATSAPP_LINK} className="hover:text-white transition-colors">Pedir medicamentos</a></li>
                <li><Link to="/login" className="hover:text-white transition-colors">Portal droguerias</Link></li>
                <li><Link to="/admin/login" className="hover:text-white transition-colors">Administracion</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-3">Contacto</h3>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4" />
                  <span>{WHATSAPP_NUMBER}</span>
                </li>
                <li className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  <span>Colombia</span>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 text-center text-sm">
            <p>&copy; {new Date().getFullYear()} Drogueria Virtual. Todos los derechos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
