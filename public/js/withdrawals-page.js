/**
 * Retiros: /api/me y POST /api/withdrawals
 */
(function () {
  'use strict';

  const form = document.getElementById('form-w');
  const balanceEl = document.getElementById('balance-val');
  const tbody = document.getElementById('wd-body');
  const minEl = document.getElementById('min-w');
  const navAdmin = document.getElementById('nav-admin');

  document.getElementById('btn-logout').addEventListener('click', function () {
    PiFaucet.logout();
  });

  function statusClass(s) {
    if (s === 'pending') return 'status-pending';
    if (s === 'approved') return 'status-approved';
    if (s === 'rejected') return 'status-rejected';
    return '';
  }

  function renderRows(list) {
    tbody.innerHTML = '';
    if (!list || !list.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="muted">Sin solicitudes</td></tr>';
      return;
    }
    list.forEach(function (w) {
      const tr = document.createElement('tr');
      const st = w.status || 'pending';
      tr.innerHTML =
        '<td>' +
        PiFaucet.formatDate(w.createdAt) +
        '</td><td>' +
        (w.piUsername || '—') +
        '</td><td>' +
        PiFaucet.formatPi(w.amount) +
        '</td><td class="' +
        statusClass(st) +
        '">' +
        st +
        '</td>';
      tbody.appendChild(tr);
    });
  }

  async function load() {
    if (!PiFaucet.getToken()) {
      window.location.href = '/index.html';
      return;
    }
    try {
      const data = await PiFaucet.api('/api/me', { method: 'GET' });
      balanceEl.textContent = PiFaucet.formatPi(data.balance);
      if (data.minWithdrawalPi != null && minEl) {
        minEl.textContent = String(data.minWithdrawalPi);
        document.getElementById('pi-amt').min = String(data.minWithdrawalPi);
      }
      if (data.role === 'admin' && navAdmin) {
        navAdmin.classList.remove('hidden');
      }
      renderRows(data.withdrawals);
    } catch (e) {
      if (e.status === 401) {
        PiFaucet.logout();
        return;
      }
      PiFaucet.toast(e.message || 'Error al cargar', 'error');
    }
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    const piUsername = document.getElementById('pi-user').value.trim();
    const amount = Number(document.getElementById('pi-amt').value);
    try {
      await PiFaucet.api('/api/withdrawals', {
        method: 'POST',
        body: JSON.stringify({ piUsername: piUsername, amount: amount }),
      });
      PiFaucet.toast('Solicitud creada (pendiente)', 'success');
      form.reset();
      await load();
    } catch (err) {
      PiFaucet.toast(err.message || 'Error al solicitar retiro', 'error');
    }
  });

  load();
})();
