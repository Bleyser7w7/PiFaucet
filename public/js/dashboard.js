/**
 * Panel: /api/me y /api/claim
 */
(function () {
  'use strict';

  const btnClaim = document.getElementById('btn-claim');
  const timerEl = document.getElementById('claim-timer');
  const balanceEl = document.getElementById('balance-val');
  const lastClaimEl = document.getElementById('last-claim');
  const claimsBody = document.getElementById('claims-body');
  const navAdmin = document.getElementById('nav-admin');
  const btnLogout = document.getElementById('btn-logout');

  let cooldownMs = 10 * 60 * 1000;
  let timerId = null;

  function clearTimer() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function formatCountdown(ms) {
    const s = Math.ceil(ms / 1000);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
  }

  function updateClaimUi(lastClaimMs) {
    clearTimer();
    let nextAt = null;
    if (lastClaimMs) {
      nextAt = lastClaimMs + cooldownMs;
    }
    function tick() {
      const t = Date.now();
      if (!nextAt || t >= nextAt) {
        timerEl.textContent = 'Listo para reclamar';
        btnClaim.disabled = false;
        clearTimer();
        return;
      }
      const left = nextAt - t;
      timerEl.textContent = 'Próximo reclamo en ' + formatCountdown(left);
      btnClaim.disabled = true;
    }
    if (nextAt && Date.now() < nextAt) {
      btnClaim.disabled = true;
      tick();
      timerId = setInterval(tick, 1000);
    } else {
      timerEl.textContent = 'Listo para reclamar';
      btnClaim.disabled = false;
    }
  }

  function renderClaims(claims) {
    claimsBody.innerHTML = '';
    if (!claims || !claims.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="3" class="muted">Sin reclamos aún</td>';
      claimsBody.appendChild(tr);
      return;
    }
    claims.forEach(function (c) {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' +
        PiFaucet.formatDate(c.timestamp) +
        '</td><td>' +
        PiFaucet.formatPi(c.amount) +
        '</td><td class="muted">' +
        (c.ip || '—') +
        '</td>';
      claimsBody.appendChild(tr);
    });
  }

  async function load() {
    if (!PiFaucet.getToken()) {
      window.location.href = '/index.html';
      return;
    }
    try {
      const data = await PiFaucet.api('/api/me', { method: 'GET' });
      cooldownMs = data.claimCooldownMs || cooldownMs;
      balanceEl.textContent = PiFaucet.formatPi(data.balance);
      lastClaimEl.textContent = data.lastClaim ? PiFaucet.formatDate(data.lastClaim) : '—';
      if (data.role === 'admin' && navAdmin) {
        navAdmin.classList.remove('hidden');
      }
      updateClaimUi(data.lastClaim);
      renderClaims(data.claims);
    } catch (e) {
      if (e.status === 401) {
        PiFaucet.logout();
        return;
      }
      console.error(e);
      PiFaucet.toast(e.message || 'Error al cargar datos', 'error');
    }
  }

  btnLogout.addEventListener('click', function () {
    PiFaucet.logout();
  });

  btnClaim.addEventListener('click', async function () {
    const hp = document.getElementById('claim-hp');
    try {
      btnClaim.disabled = true;
      const res = await PiFaucet.api('/api/claim', {
        method: 'POST',
        body: JSON.stringify({ hp: hp ? hp.value : '' }),
      });
      PiFaucet.toast('+' + PiFaucet.formatPi(res.reward) + ' π reclamados', 'success');
      balanceEl.textContent = PiFaucet.formatPi(res.balance);
      lastClaimEl.textContent = PiFaucet.formatDate(Date.now());
      updateClaimUi(Date.now());
      await load();
    } catch (e) {
      console.error(e);
      PiFaucet.toast(e.message || 'No se pudo reclamar', 'error');
      if (e.details && e.details.retryAfterMs) {
        updateClaimUi(Date.now() - cooldownMs + e.details.retryAfterMs);
      } else {
        await load();
      }
    }
  });

  load();
})();
