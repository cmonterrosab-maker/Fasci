'use strict';

require('dotenv').config();
const twilio = require('twilio');

// ─── Cliente Twilio ───────────────────────────────────────────────────────────

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER; // ej: whatsapp:+573001234567

let client;

function getClient() {
  if (!client) {
    if (!accountSid || !authToken) {
      throw new Error('Credenciales Twilio no configuradas (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN)');
    }
    client = twilio(accountSid, authToken);
  }
  return client;
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

/**
 * Normaliza el número destino al formato whatsapp:+57XXXXXXXXXX.
 * @param {string} to
 * @returns {string}
 */
function formatWhatsAppNumber(to) {
  let number = to.replace(/\s+/g, '').replace(/[^+\d]/g, '');

  if (!number.startsWith('whatsapp:')) {
    if (!number.startsWith('+')) {
      // Asumir Colombia si no tiene código de país
      number = number.startsWith('57') ? `+${number}` : `+57${number}`;
    }
    number = `whatsapp:${number}`;
  }

  return number;
}

/**
 * Espera un tiempo dado en milisegundos.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Envía un mensaje con reintentos y backoff exponencial.
 * @param {Function} fn - Función asíncrona a reintentar.
 * @param {number} maxRetries
 * @param {number} baseDelayMs
 * @returns {Promise<any>}
 */
async function withRetry(fn, maxRetries = 3, baseDelayMs = 500) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isRetryable = err.status >= 500 || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT';

      if (!isRetryable || attempt === maxRetries) break;

      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      console.warn(`[WhatsApp] Intento ${attempt} fallido. Reintentando en ${delay}ms...`, err.message);
      await sleep(delay);
    }
  }

  throw lastError;
}

// ─── Funciones principales ────────────────────────────────────────────────────

/**
 * Muestra la burbuja "escribiendo..." antes de enviar la respuesta del bot.
 * Intenta el PersistentAction typing_on de Twilio; falla silenciosamente si
 * la cuenta no lo soporta. El delay proporcional siempre se aplica.
 *
 * @param {string} to      - Número destino
 * @param {string} msgBody - Texto que se va a enviar (para calcular el delay)
 */
async function sendTypingIndicator(to, msgBody = '') {
  const toFormatted = formatWhatsAppNumber(to);
  // 600 ms para mensajes cortos, hasta 1500 ms para mensajes largos (~150 chars)
  const delayMs = Math.min(1500, Math.max(600, Math.round(msgBody.length * 10)));

  // Intento: Twilio admite PersistentAction=typing_on en algunas cuentas WhatsApp Business.
  // Si la cuenta o la versión del API no lo soportan, el error se ignora y
  // el mensaje real igual llega después del delay.
  try {
    await getClient().messages.create({
      from: fromNumber,
      to: toFormatted,
      persistentAction: ['typing_on'],
    });
  } catch {
    // Silent fail — la cuenta no soporta typing indicators
  }

  await sleep(delayMs);
}

/**
 * Envía un mensaje de texto simple por WhatsApp.
 * @param {string} to - Número destino (ej: "+573001234567" o "whatsapp:+573001234567")
 * @param {string} body - Texto del mensaje
 * @returns {Promise<{ sid: string, status: string }>}
 */
async function sendWhatsAppMessage(to, body) {
  const toFormatted = formatWhatsAppNumber(to);

  if (!body || body.trim().length === 0) {
    throw new Error('El cuerpo del mensaje no puede estar vacío.');
  }

  const result = await withRetry(async () => {
    const message = await getClient().messages.create({
      from: fromNumber,
      to: toFormatted,
      body: body.trim(),
    });
    return message;
  });

  console.log(`[WhatsApp] Mensaje enviado a ${toFormatted} | SID: ${result.sid} | Status: ${result.status}`);
  return { sid: result.sid, status: result.status };
}

/**
 * Envía un mensaje usando una plantilla de Twilio Content API.
 * @param {string} to - Número destino
 * @param {string} contentSid - SID de la plantilla (ej: HXxxxxxxxxxx)
 * @param {Object} [variables={}] - Variables de la plantilla (ej: { "1": "Carlos", "2": "Pedido #123" })
 * @returns {Promise<{ sid: string, status: string }>}
 */
async function sendWhatsAppTemplate(to, contentSid, variables = {}) {
  const toFormatted = formatWhatsAppNumber(to);

  if (!contentSid) {
    throw new Error('Se requiere el SID de la plantilla (contentSid).');
  }

  const result = await withRetry(async () => {
    const messageParams = {
      from: fromNumber,
      to: toFormatted,
      contentSid,
    };

    if (Object.keys(variables).length > 0) {
      messageParams.contentVariables = JSON.stringify(variables);
    }

    const message = await getClient().messages.create(messageParams);
    return message;
  });

  console.log(`[WhatsApp] Plantilla enviada a ${toFormatted} | ContentSID: ${contentSid} | SID: ${result.sid}`);
  return { sid: result.sid, status: result.status };
}

/**
 * Envía un mensaje con lista de opciones simulada mediante texto formateado.
 * (Twilio WhatsApp no soporta listas nativas fuera de plantillas aprobadas.)
 * @param {string} to
 * @param {string} header - Título/encabezado
 * @param {Array<{ id: string|number, label: string, description?: string }>} items
 * @param {string} [footer] - Texto al pie
 * @returns {Promise<{ sid: string, status: string }>}
 */
async function sendWhatsAppList(to, header, items, footer) {
  const lines = [`*${header}*`, ''];

  items.forEach((item, index) => {
    const num = item.id !== undefined ? item.id : index + 1;
    const desc = item.description ? ` - ${item.description}` : '';
    lines.push(`${num}. ${item.label}${desc}`);
  });

  if (footer) {
    lines.push('', `_${footer}_`);
  }

  return sendWhatsAppMessage(to, lines.join('\n'));
}

/**
 * Envía un mensaje con botones simulados mediante texto numerado.
 * @param {string} to
 * @param {string} body - Cuerpo del mensaje
 * @param {Array<{ id: string|number, title: string }>} buttons
 * @returns {Promise<{ sid: string, status: string }>}
 */
async function sendWhatsAppButtons(to, body, buttons) {
  const lines = [body, ''];

  buttons.forEach((btn, index) => {
    lines.push(`${btn.id !== undefined ? btn.id : index + 1}. ${btn.title}`);
  });

  return sendWhatsAppMessage(to, lines.join('\n'));
}

// ─── Exportaciones ────────────────────────────────────────────────────────────

module.exports = {
  sendWhatsAppMessage,
  sendWhatsAppTemplate,
  sendWhatsAppList,
  sendWhatsAppButtons,
  sendTypingIndicator,
  formatWhatsAppNumber,
};
