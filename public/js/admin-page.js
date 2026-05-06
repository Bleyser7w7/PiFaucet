/**
 * Admin: /api/admin/*
 */
(function () {
  'use strict';

  const denied = document.getElementById('admin-denied');
  const content = document.getElementById('admin-content');
  const pendBody = document.getElementById('pend-body');
  const usersBody = document.getElementById('users-body');

  document.getElementById('btn-logout').addEventListener('click', function () {
    PiFaucet.logout();
  });

  function renderPending(list) {
    pendBody.innerHTML = '';
    if (!list || !list.length) {
      pendBody.innerHTML = '<tr><td colspan="6" class="muted">Sin pendientes</td></tr>';
      return;
    }
    list.forEach(function (w) {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="muted" style="max-width:120px;word-break:break-all">' +
        w.id +
        '</td><td class="muted" style="max-width:140px;word-break:break-all">' +
        w.userId +
        '</td><td>' +
        (w.piUsername || '—') +
        '</td><td>' +
        PiFaucet.formatPi(w.amount) +
        '</td><td>' +
        PiFaucet.formatDate(w.createdAt) +
        '</td><td><div class="row-actions">' +
        '<button type="button" class="btn btn-success" data-a="' +
        w.id +
        '">Aprobar</button>' +
        '<button type="button" class="btn btn-danger" data-r="' +
        w.id +
        '">Rechazar</button>' +
        '</div></td>';
      pendBody.appendChild(tr);
    });

    pendBody.querySelectorAll('[data-a]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        const id = btn.getAttribute('data-a');
        try {
          await PiFaucet.api('/api/admin/approve-withdrawal', {
            method: 'POST',
            body: JSON.stringify({ withdrawalId: id }),
          });
          PiFaucet.toast('Retiro aprobado', 'success');
          await refresh();
        } catch (e) {
          PiFaucet.toast(e.message || 'Error al aprobar', 'error');
        }
      });
    });
    pendBody.querySelectorAll('[data-r]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        const id = btn.getAttribute('data-r');
        try {
          await PiFaucet.api('/api/admin/reject-withdrawal', {
            method: 'POST',
            body: JSON.stringify({ withdrawalId: id }),
          });
          PiFaucet.toast('Retiro rechazado', 'success');
          await refresh();
        } catch (e) {
          PiFaucet.toast(e.message || 'Error al rechazar', 'error');
        }
      });
    });
  }

  function renderUsers(users) {
    usersBody.innerHTML = '';
    if (!users || !users.length) {
      usersBody.innerHTML = '<tr><td colspan="5" class="muted">Sin datos</td></tr>';
      return;
    }
    users.forEach(function (u) {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="muted" style="max-width:160px;word-break:break-all">' +
        u.uid +
        '</td><td>' +
        (u.email || '—') +
        '</td><td>' +
        (u.role || 'user') +
        '</td><td>' +
        PiFaucet.formatPi(u.balance) +
        '</td><td>' +
        PiFaucet.formatDate(u.createdAt) +
        '</td>';
      usersBody.appendChild(tr);
    });
  }

  async function refresh() {
    const data = await PiFaucet.api('/api/admin/stats', { method: 'GET' });
    document.getElementById('st-users').textContent = String(data.totalUsers);
    document.getElementById('st-pi').textContent = PiFaucet.formatPi(data.totalPiDelivered);
    document.getElementById('st-pend').textContent = String(data.pendingWithdrawalsCount || 0);
    renderPending(data.pendingWithdrawals);
    renderUsers(data.users);
  }

  async function init() {
    if (!PiFaucet.getToken()) {
      window.location.href = '/index.html';
      return;
    }
    try {
      const me = await PiFaucet.api('/api/me', { method: 'GET' });
      if (me.role !== 'admin') {
        denied.classList.remove('hidden');
        content.classList.add('hidden');
        return;
      }
      denied.classList.add('hidden');
      content.classList.remove('hidden');
      await refresh();
    } catch (e) {
      if (e.status === 401) {
        PiFaucet.logout();
        return;
      }
      PiFaucet.toast(e.message || 'Error', 'error');
      denied.classList.remove('hidden');
    }
  }

  init();
})();
