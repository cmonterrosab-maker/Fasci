const rateLimit = require('express-rate-limit');
const cors = require('cors');
const helmet = require('helmet');

// ─── Rate Limiters ────────────────────────────────────────────────────────────

/**
 * Rate limiter general: 100 requests cada 15 minutos por IP.
 */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 429,
    error: 'Demasiadas solicitudes. Por favor intenta de nuevo en 15 minutos.',
  },
  handler: (req, res, next, options) => {
    console.warn(`[RateLimit] IP bloqueada: ${req.ip} - ${req.method} ${req.path}`);
    res.status(options.statusCode).json(options.message);
  },
});

/**
 * Rate limiter para webhook de WhatsApp: 20 requests por minuto por IP.
 */
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 429,
    error: 'Límite de mensajes WhatsApp alcanzado. Espera un momento.',
  },
  handler: (req, res, next, options) => {
    console.warn(`[WebhookRateLimit] IP bloqueada: ${req.ip} - ${req.method} ${req.path}`);
    res.status(options.statusCode).json(options.message);
  },
});

// ─── CORS ─────────────────────────────────────────────────────────────────────

const allowedOrigins = [
  'https://drogueria-virtual.com',
  'https://www.drogueria-virtual.com',
  'https://admin.drogueria-virtual.com',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8080',
];

const corsOptions = {
  origin: (origin, callback) => {
    // Permitir requests sin origin (apps móviles, curl, Postman en dev)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.warn(`[CORS] Origen no permitido: ${origin}`);
    callback(new Error(`Origen no permitido por CORS: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  optionsSuccessStatus: 204,
};

const corsMiddleware = cors(corsOptions);

// ─── Helmet ───────────────────────────────────────────────────────────────────

const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,
});

// ─── Sanitización de inputs ───────────────────────────────────────────────────

/**
 * Elimina caracteres potencialmente peligrosos de un string.
 * @param {string} value
 * @returns {string}
 */
function sanitizeString(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
}

/**
 * Sanitiza recursivamente un objeto/array.
 * @param {any} data
 * @returns {any}
 */
function sanitizeDeep(data) {
  if (typeof data === 'string') return sanitizeString(data);
  if (Array.isArray(data)) return data.map(sanitizeDeep);
  if (data !== null && typeof data === 'object') {
    const clean = {};
    for (const [key, val] of Object.entries(data)) {
      clean[sanitizeString(key)] = sanitizeDeep(val);
    }
    return clean;
  }
  return data;
}

/**
 * Middleware que sanitiza req.body, req.query y req.params.
 */
function sanitizeInputs(req, res, next) {
  if (req.body) req.body = sanitizeDeep(req.body);
  if (req.query) req.query = sanitizeDeep(req.query);
  if (req.params) req.params = sanitizeDeep(req.params);
  next();
}

// ─── Logger de requests ───────────────────────────────────────────────────────

function requestLogger(req, res, next) {
  const start = Date.now();
  const { method, path, ip } = req;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const { statusCode } = res;
    const level = statusCode >= 500 ? 'ERROR' : statusCode >= 400 ? 'WARN' : 'INFO';
    console.log(`[${level}] ${new Date().toISOString()} ${method} ${path} ${statusCode} ${duration}ms - IP: ${ip}`);
  });

  next();
}

// ─── Exportaciones ────────────────────────────────────────────────────────────

module.exports = {
  generalLimiter,
  webhookLimiter,
  corsMiddleware,
  helmetMiddleware,
  sanitizeInputs,
  requestLogger,

  /**
   * Aplica todos los middlewares de seguridad generales a una app Express.
   * @param {import('express').Application} app
   */
  applySecurityMiddleware(app) {
    app.use(helmetMiddleware);
    app.use(corsMiddleware);
    app.use(requestLogger);
    app.use(sanitizeInputs);
    app.use(generalLimiter);
  },
};
