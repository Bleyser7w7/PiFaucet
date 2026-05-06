/**
 * Cliente API (JWT), toasts y utilidades. Sin Firebase.
 */
(function () {
  'use strict';

  const TOKEN_KEY = 'pi_faucet_token';

  window.PiFaucet = window.PiFaucet || {};

  /** Misma origen que la página (Express sirve public + /api). */
  const API_BASE = '';

  PiFaucet.setToken = function (token) {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  };

  PiFaucet.getToken = function () {
    return localStorage.getItem(TOKEN_KEY);
  };

  /**
   * @param {string} path ej. /api/me
   * @param {RequestInit=} options
   * @return {Promise<any>}
   */
  PiFaucet.api = async function (path, options) {
    const opts = options || {};
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    const token = PiFaucet.getToken();
    if (token) {
      headers.Authorization = 'Bearer ' + token;
    }
    const r = await fetch(API_BASE + path, Object.assign({}, opts, { headers: headers }));
    const data = await r.json().catch(function () {
      return {};
    });
    if (!r.ok) {
      const err = new Error(data.error || r.statusText || 'Error');
      err.code = data.code;
      err.details = data.details;
      err.status = r.status;
      throw err;
    }
    return data;
  };

  PiFaucet.formatPi = function (n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return '0.0000';
    return x.toFixed(4);
  };

  PiFaucet.formatDate = function (ms) {
    if (ms == null) return '—';
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('es-ES', {
      dateStyle: 'short',
      timeStyle: 'medium',
    });
  };

  const TOAST_DURATION = 4200;

  PiFaucet.toast = function (message, type) {
    const host = document.getElementById('toast-host');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'toast toast-' + (type || 'info');
    el.textContent = message;
    host.appendChild(el);
    requestAnimationFrame(function () {
      el.classList.add('toast-visible');
    });
    setTimeout(function () {
      el.classList.remove('toast-visible');
      setTimeout(function () {
        el.remove();
      }, 320);
    }, TOAST_DURATION);
  };

  PiFaucet.requireSession = async function () {
    if (!PiFaucet.getToken()) {
      throw new Error('no-auth');
    }
    return PiFaucet.api('/api/me', { method: 'GET' });
  };

  PiFaucet.logout = function () {
    PiFaucet.setToken(null);
    window.location.href = '/index.html';
  };
})();
