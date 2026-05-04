'use strict';

/**
 * CacheService - Cache en memoria con TTL automático.
 * Patrón Speady adaptado para Droguería Virtual.
 */
class CacheService {
  /**
   * @param {number} ttlSeconds - Tiempo de vida de cada entrada en segundos.
   */
  constructor(ttlSeconds = 300) {
    this._ttlMs = ttlSeconds * 1000;
    /** @type {Map<string, { value: any, expiresAt: number }>} */
    this._store = new Map();

    // Limpieza periódica de entradas expiradas cada 60 segundos
    this._cleanupInterval = setInterval(() => this._cleanup(), 60 * 1000);

    // Evitar que el intervalo bloquee el cierre del proceso
    if (this._cleanupInterval.unref) {
      this._cleanupInterval.unref();
    }
  }

  /**
   * Recupera un valor del cache.
   * @param {string} key
   * @returns {any} El valor almacenado, o undefined si no existe o expiró.
   */
  get(key) {
    const entry = this._store.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this._store.delete(key);
      return undefined;
    }

    return entry.value;
  }

  /**
   * Almacena un valor en el cache.
   * @param {string} key
   * @param {any} value
   * @param {number} [ttlSeconds] - TTL personalizado para esta entrada. Usa el del constructor si se omite.
   */
  set(key, value, ttlSeconds) {
    const ttlMs = ttlSeconds !== undefined ? ttlSeconds * 1000 : this._ttlMs;
    this._store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  /**
   * Elimina una entrada del cache.
   * @param {string} key
   * @returns {boolean} true si existía y fue eliminada.
   */
  delete(key) {
    return this._store.delete(key);
  }

  /**
   * Limpia todas las entradas del cache.
   */
  clear() {
    this._store.clear();
  }

  /**
   * Retorna el número de entradas activas (no expiradas) en el cache.
   * @returns {number}
   */
  size() {
    this._cleanup();
    return this._store.size;
  }

  /**
   * Verifica si una clave existe y no está expirada.
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    return this.get(key) !== undefined;
  }

  /**
   * Retorna todas las claves activas del cache.
   * @returns {string[]}
   */
  keys() {
    this._cleanup();
    return Array.from(this._store.keys());
  }

  /**
   * Obtiene un valor; si no existe, lo genera con la función proporcionada y lo almacena.
   * @param {string} key
   * @param {() => any | Promise<any>} fetchFn
   * @param {number} [ttlSeconds]
   * @returns {Promise<any>}
   */
  async getOrSet(key, fetchFn, ttlSeconds) {
    const cached = this.get(key);
    if (cached !== undefined) return cached;

    const value = await fetchFn();
    this.set(key, value, ttlSeconds);
    return value;
  }

  /**
   * Detiene el intervalo de limpieza. Llama esto al apagar la app.
   */
  destroy() {
    clearInterval(this._cleanupInterval);
    this._store.clear();
  }

  /**
   * Elimina internamente las entradas expiradas.
   * @private
   */
  _cleanup() {
    const now = Date.now();
    for (const [key, entry] of this._store.entries()) {
      if (now > entry.expiresAt) {
        this._store.delete(key);
      }
    }
  }
}

module.exports = CacheService;
