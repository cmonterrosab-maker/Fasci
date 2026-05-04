'use strict';

const bcrypt = require('bcryptjs');

// ─── Constantes ───────────────────────────────────────────────────────────────

const BCRYPT_ROUNDS = 12;

/** Patrones considerados spam */
const SPAM_PATTERNS = [
  /https?:\/\/[^\s]+/gi,            // URLs
  /\b(gratis|free|oferta|gana|premio|ganaste|congratulations)\b/gi,
  /\b(click here|haz clic|ingresa aquí)\b/gi,
  /(\d{4}[\s-]?){4}/g,              // Secuencias tipo número de tarjeta
  /(.)\1{6,}/g,                      // Caracteres repetidos 6+ veces (aaaaaaa)
  /[A-Z]{10,}/g,                     // 10+ mayúsculas seguidas
];

/** Regex para teléfonos colombianos */
const COLOMBIAN_MOBILE_REGEX = /^(3\d{9})$/;            // Celular: 3XXXXXXXXX (10 dígitos)
const COLOMBIAN_LANDLINE_REGEX = /^([1-8]\d{6,7})$/;   // Fijo: 1-8 dígitos locales
const FULL_COLOMBIAN_REGEX = /^(\+?57)?(3\d{9}|[1-8]\d{6,7})$/;

/** Caracteres peligrosos para inyección */
const DANGEROUS_CHARS_REGEX = /[<>"'`\\]/g;
const SQL_INJECTION_REGEX = /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/gi;
const XSS_REGEX = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>|javascript:|on\w+\s*=/gi;

// ─── Clase SecurityService ────────────────────────────────────────────────────

class SecurityService {
  /**
   * Limpia caracteres peligrosos de un string de entrada.
   * Elimina XSS, inyección SQL básica y caracteres de escape.
   * @param {string} text
   * @returns {string}
   */
  sanitizeInput(text) {
    if (typeof text !== 'string') return '';

    return text
      .replace(XSS_REGEX, '')
      .replace(SQL_INJECTION_REGEX, '')
      .replace(DANGEROUS_CHARS_REGEX, '')
      .replace(/\0/g, '')               // Null bytes
      .replace(/\r?\n|\r/g, ' ')        // Saltos de línea → espacio
      .trim()
      .substring(0, 2000);              // Límite de longitud
  }

  /**
   * Valida si un número de teléfono es colombiano.
   * Acepta formatos: 3001234567, +573001234567, 573001234567
   * @param {string} phone
   * @returns {boolean}
   */
  validatePhone(phone) {
    if (!phone || typeof phone !== 'string') return false;
    const cleaned = phone.replace(/[\s\-().+]/g, '');
    return FULL_COLOMBIAN_REGEX.test(cleaned);
  }

  /**
   * Normaliza un número de teléfono colombiano a 10 dígitos (sin código de país).
   * Ejemplo: "+573001234567" → "3001234567"
   * @param {string} phone
   * @returns {string|null} Número normalizado o null si no es válido.
   */
  normalizePhone(phone) {
    if (!this.validatePhone(phone)) return null;

    let cleaned = phone.replace(/[\s\-().+]/g, '');

    // Quitar prefijo 57
    if (cleaned.startsWith('57') && cleaned.length > 10) {
      cleaned = cleaned.slice(2);
    }

    // Quitar prefijo 0 en fijos locales
    if (cleaned.startsWith('0')) {
      cleaned = cleaned.slice(1);
    }

    // Validar que sea móvil (10 dígitos) o fijo (7-8 dígitos)
    if (COLOMBIAN_MOBILE_REGEX.test(cleaned) || COLOMBIAN_LANDLINE_REGEX.test(cleaned)) {
      return cleaned;
    }

    return null;
  }

  /**
   * Detecta si un mensaje parece ser spam.
   * @param {string} message
   * @returns {{ isSpam: boolean, reasons: string[] }}
   */
  detectSpam(message) {
    if (!message || typeof message !== 'string') {
      return { isSpam: false, reasons: [] };
    }

    const reasons = [];

    // Longitud excesiva
    if (message.length > 1500) {
      reasons.push('Mensaje demasiado largo');
    }

    // Demasiados emojis (más de 20)
    const emojiMatches = message.match(/[\u{1F300}-\u{1FFFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu);
    if (emojiMatches && emojiMatches.length > 20) {
      reasons.push('Exceso de emojis');
    }

    // Revisar patrones de spam
    for (const pattern of SPAM_PATTERNS) {
      pattern.lastIndex = 0; // Resetear regex global
      if (pattern.test(message)) {
        reasons.push(`Patrón sospechoso detectado: ${pattern.source.substring(0, 30)}`);
        break;
      }
    }

    // Proporción de mayúsculas
    const letters = message.replace(/[^a-zA-Z]/g, '');
    if (letters.length > 20) {
      const upperRatio = (message.replace(/[^A-Z]/g, '').length / letters.length);
      if (upperRatio > 0.7) {
        reasons.push('Exceso de mayúsculas');
      }
    }

    return {
      isSpam: reasons.length > 0,
      reasons,
    };
  }

  /**
   * Genera un hash bcrypt de un dato (contraseña, token, etc).
   * @param {string} data - Dato a hashear
   * @param {number} [rounds=12] - Rondas de bcrypt
   * @returns {Promise<string>} Hash bcrypt
   */
  async hashData(data, rounds = BCRYPT_ROUNDS) {
    if (!data || typeof data !== 'string') {
      throw new Error('El dato a hashear debe ser un string no vacío.');
    }
    return bcrypt.hash(data, rounds);
  }

  /**
   * Compara un dato plano con un hash bcrypt.
   * @param {string} data - Dato en texto plano
   * @param {string} hash - Hash bcrypt almacenado
   * @returns {Promise<boolean>}
   */
  async compareHash(data, hash) {
    if (!data || !hash) return false;
    return bcrypt.compare(data, hash);
  }

  /**
   * Valida que un email tenga formato correcto.
   * @param {string} email
   * @returns {boolean}
   */
  validateEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim()) && email.length <= 254;
  }

  /**
   * Genera un token aleatorio seguro (hex string).
   * @param {number} [bytes=32]
   * @returns {string}
   */
  generateToken(bytes = 32) {
    const crypto = require('crypto');
    return crypto.randomBytes(bytes).toString('hex');
  }
}

// ─── Exportar instancia única (singleton) y clase ─────────────────────────────

const securityService = new SecurityService();

module.exports = securityService;
module.exports.SecurityService = SecurityService;
