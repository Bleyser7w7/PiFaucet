/**
 * Login y registro contra /api/auth/*
 */
(function () {
  'use strict';

  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const formLogin = document.getElementById('form-login');
  const formRegister = document.getElementById('form-register');

  if (tabLogin && tabRegister) {
    tabLogin.addEventListener('click', function () {
      tabLogin.classList.add('active');
      tabRegister.classList.remove('active');
      formLogin.classList.remove('hidden');
      formRegister.classList.add('hidden');
    });
    tabRegister.addEventListener('click', function () {
      tabRegister.classList.add('active');
      tabLogin.classList.remove('active');
      formRegister.classList.remove('hidden');
      formLogin.classList.add('hidden');
    });
  }

  const params = new URLSearchParams(window.location.search);
  const refFromUrl = params.get('ref');
  if (refFromUrl && document.getElementById('reg-referrer')) {
    document.getElementById('reg-referrer').value = refFromUrl;
  }

  if (PiFaucet.getToken()) {
    PiFaucet.api('/api/me', { method: 'GET' })
        .then(function () {
          window.location.href = '/dashboard.html';
        })
        .catch(function () {
          PiFaucet.setToken(null);
        });
  }

  function authErrorMessage(err) {
    return (err && err.message) || 'Error de autenticación';
  }

  formLogin.addEventListener('submit', async function (e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const pass = document.getElementById('login-pass').value;
    try {
      const data = await PiFaucet.api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email, password: pass }),
      });
      PiFaucet.setToken(data.token);
      PiFaucet.toast('Bienvenido', 'success');
      window.location.href = '/dashboard.html';
    } catch (err) {
      PiFaucet.toast(authErrorMessage(err), 'error');
    }
  });

  formRegister.addEventListener('submit', async function (e) {
    e.preventDefault();
    const bot = document.getElementById('reg-bot-field');
    if (bot && bot.value) {
      PiFaucet.toast('No se pudo completar el registro.', 'error');
      return;
    }
    const email = document.getElementById('reg-email').value.trim();
    const pass = document.getElementById('reg-pass').value;
    const referrerInput = document.getElementById('reg-referrer');
    const referrerUid = referrerInput ? referrerInput.value.trim() : '';
    try {
      const data = await PiFaucet.api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: email,
          password: pass,
          referrerUid: referrerUid || undefined,
        }),
      });
      PiFaucet.setToken(data.token);
      if (referrerUid) {
        PiFaucet.toast('Cuenta creada. Referido aplicado si el UID era válido.', 'success');
      } else {
        PiFaucet.toast('Cuenta creada', 'success');
      }
      window.location.href = '/dashboard.html';
    } catch (err) {
      PiFaucet.toast(authErrorMessage(err), 'error');
    }
  });
})();
