/**
 * ANORAK - Administration Panel Controller
 * Handles user list, search & filters, plan editing, batch operations,
 * payment logs, and simulated manual transactions. Also runs server deploy & database migrations.
 */

class AnorakAdmin {
  constructor() {
    this.currentUser = null;
    this.users = [];
    this.payments = [];
    this.selectedUserIds = new Set();
    this.currentTab = 'accounts'; // 'accounts' | 'payments' | 'deploy'
    this.searchTimeout = null;
  }

  async init() {
    // 1. Bloqueio de Acesso e Verificação de Permissões
    const authorized = await this.verifyAuth();
    if (!authorized) {
      window.location.replace('app.html');
      return;
    }

    // 2. Configuração de Listeners de UI
    this.setupEventListeners();

    // 3. Carga Inicial de Dados
    this.loadStats();
    this.loadUsers();
    this.loadPayments();
    this.loadUsersDropdown();
  }

  async verifyAuth() {
    try {
      const res = await fetch('api/auth/check_auth.php');
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          if (data.user.role === 'admin') {
            this.currentUser = data.user;
            return true;
          } else {
            console.warn('Acesso negado: Não é administrador.');
          }
        }
      }
    } catch (e) {
      console.error('Falha de verificação de autenticação:', e);
    }
    return false;
  }

  setupEventListeners() {
    const bindClick = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', fn);
    };
    const bindEvent = (id, event, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener(event, fn);
    };

    // Alternância de Abas
    bindClick('btnTabAccounts', () => this.switchTab('accounts'));
    bindClick('btnTabPayments', () => this.switchTab('payments'));
    bindClick('btnTabConfig', () => this.switchTab('config'));
    bindClick('btnRefreshLogs', () => this.loadAuditLogs());

    // Busca e Filtros
    bindEvent('inputSearchUsers', 'input', () => {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = setTimeout(() => this.loadUsers(), 300);
    });
    bindEvent('selectFilterPlan', 'change', () => this.loadUsers());
    bindEvent('selectFilterStatus', 'change', () => this.loadUsers());

    // Checkbox de Selecionar Todos
    bindEvent('chkSelectAllUsers', 'change', (e) => {
      const checked = e.target.checked;
      document.querySelectorAll('.chk-user-select').forEach(chk => {
        chk.checked = checked;
        const id = parseInt(chk.dataset.userId);
        if (checked) {
          this.selectedUserIds.add(id);
        } else {
          this.selectedUserIds.delete(id);
        }
      });
      this.updateBatchActionBar();
    });

    // Fechamento de Modais
    document.querySelectorAll('.modal-close, .btn-modal-cancel').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('active'));
      });
    });

    // Form Submits
    bindEvent('formEditUser', 'submit', (e) => {
      e.preventDefault();
      this.saveUserSettings();
    });

    bindEvent('formResetPassword', 'submit', (e) => {
      e.preventDefault();
      this.saveUserPassword();
    });

    bindEvent('formAddPayment', 'submit', (e) => {
      e.preventDefault();
      this.saveManualPayment();
    });

    bindEvent('formBatchEdit', 'submit', (e) => {
      e.preventDefault();
      this.saveBatchSettings();
    });

    // Ações Lote Clicks
    bindClick('btnBatchEdit', () => this.openBatchEditModal());
    bindClick('btnBatchDelete', () => this.executeBatchDelete());
    bindClick('btnBatchRestore', () => this.executeBatchRestore());

    // Registrar Pagamento Manual click
    bindClick('btnOpenAddPayment', () => this.openAddPaymentModal());

    // Gerador de Senha no modal de redefinição
    bindClick('btnGeneratePwd', () => {
      const randomPwd = Math.random().toString(36).substring(2, 10);
      const input = document.getElementById('newPasswordInput');
      if (input) input.value = randomPwd;
    });

    // Ajustar opções de expiração em lote
    const batchExpirySelect = document.getElementById('batchExpiresOption');
    const batchExpiryInput = document.getElementById('batchExpiresAt');
    if (batchExpirySelect && batchExpiryInput) {
      batchExpirySelect.addEventListener('change', (e) => {
        batchExpiryInput.style.display = e.target.value === 'set' ? 'block' : 'none';
      });
    }

    // Botão de Deletar Físico no Modal de Edição
    bindClick('btnDeleteUserPhysical', () => {
      const input = document.getElementById('editUserId');
      const id = input ? parseInt(input.value) : null;
      if (id && confirm('ATENÇÃO: Isso excluirá permanentemente a conta e TODOS os dados deste usuário no sistema. Deseja prosseguir?')) {
        this.executeDeleteUser(id, 'hard_delete');
      }
    });

    // Logout
    bindClick('btnLogout', async () => {
      if (confirm('Deseja realmente sair da sessão administrativa?')) {
        try {
          await fetch('api/auth/logout.php');
        } catch (e) {}
        window.location.replace('login.html');
      }
    });
  }

  switchTab(tab) {
    this.currentTab = tab;
    document.getElementById('btnTabAccounts').classList.toggle('active', tab === 'accounts');
    document.getElementById('btnTabPayments').classList.toggle('active', tab === 'payments');
    document.getElementById('btnTabConfig').classList.toggle('active', tab === 'config');

    document.getElementById('viewAccounts').style.display = tab === 'accounts' ? 'flex' : 'none';
    document.getElementById('viewPayments').style.display = tab === 'payments' ? 'flex' : 'none';
    document.getElementById('viewConfig').style.display = tab === 'config' ? 'flex' : 'none';

    if (tab === 'config') {
      this.loadAuditLogs();
    }
  }

  // =========================================================================
  // CARGA DE DADOS & APIS
  // =========================================================================
  async loadStats() {
    try {
      const res = await fetch('api/admin/get_stats.php');
      if (res.ok) {
        const result = await res.json();
        if (result.status === 'success') {
          const stats = result.data;
          document.getElementById('statMRR').textContent = `R$ ${stats.mrr.toFixed(2).replace('.', ',')}`;
          document.getElementById('statSalesVolume').textContent = `R$ ${stats.sales_volume.toFixed(2).replace('.', ',')}`;
          
          const paidSubsCount = stats.plans.creator + stats.plans.master + stats.plans.legend;
          document.getElementById('statActiveSubscribers').textContent = `${paidSubsCount} / ${stats.total_users}`;
        }
      }
    } catch (err) {
      console.error('Erro ao buscar estatísticas:', err);
    }
  }

  async loadUsers() {
    const tableBody = document.getElementById('tableUsersBody');
    tableBody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 3rem;">
          <div class="spinner"></div> Carregando clientes do sistema...
        </td>
      </tr>
    `;

    // Reseta lote ao recarregar a lista
    this.selectedUserIds.clear();
    document.getElementById('chkSelectAllUsers').checked = false;
    this.updateBatchActionBar();

    const search = encodeURIComponent(document.getElementById('inputSearchUsers').value);
    const plan = encodeURIComponent(document.getElementById('selectFilterPlan').value);
    const status = encodeURIComponent(document.getElementById('selectFilterStatus').value);

    // Ajusta botão de lixeira em lote
    const btnRestoreBatch = document.getElementById('btnBatchRestore');
    if (btnRestoreBatch) {
      btnRestoreBatch.style.display = status === 'deleted' ? 'inline-flex' : 'none';
    }

    try {
      const res = await fetch(`api/admin/list_users.php?search=${search}&plan=${plan}&status=${status}`);
      if (res.ok) {
        const result = await res.json();
        if (result.status === 'success') {
          this.users = result.data;
          this.renderUsers();
          return;
        }
      }
      const errText = res.ok ? 'Resposta inválida' : `HTTP ${res.status}`;
      tableBody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; color: var(--accent-magenta); padding: 2rem;">
            ⚠️ Falha ao carregar lista de usuários (${errText}). 
            <button type="button" class="btn-secondary" style="margin-left: 10px; padding: 4px 10px; font-size: 0.8rem; cursor: pointer;" onclick="window.anorakAdmin.loadUsers()">🔄 Tentar Novamente</button>
          </td>
        </tr>
      `;
    } catch (err) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; color: var(--accent-magenta); padding: 2rem;">
            ❌ Falha de comunicação ao carregar usuários. 
            <button type="button" class="btn-secondary" style="margin-left: 10px; padding: 4px 10px; font-size: 0.8rem; cursor: pointer;" onclick="window.anorakAdmin.loadUsers()">🔄 Tentar Novamente</button>
          </td>
        </tr>
      `;
    }
  }

  renderUsers() {
    const tableBody = document.getElementById('tableUsersBody');
    if (this.users.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 3rem;">
            Nenhuma conta de cliente corresponde aos filtros aplicados.
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = this.users.map(u => {
      // Formata expiração do acesso
      let expiresText = 'Permanente';
      if (u.plan_expires_at) {
        const date = new Date(u.plan_expires_at);
        expiresText = date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        // Se já expirou
        if (new Date() > date) {
          expiresText = `<span style="color: var(--accent-magenta);" title="Expirado em ${expiresText}">⚠️ Expirado</span>`;
        }
      }

      // Checkbox desabilitado para o próprio admin conectado
      const isSelf = u.id === this.currentUser.id;
      const chkDisabled = isSelf ? 'disabled' : '';
      const chkTitle = isSelf ? 'Sua própria conta ativa' : '';

      return `
        <tr>
          <td style="text-align: center;">
            <input type="checkbox" class="chk-user-select" data-user-id="${u.id}" ${chkDisabled} title="${chkTitle}">
          </td>
          <td>
            <div class="user-identity">
              <span class="username">${this.escapeHTML(u.username)} ${isSelf ? '<span style="font-size: 0.7rem; color: var(--primary-cyan);">(Você)</span>' : ''}</span>
              <span class="email">${this.escapeHTML(u.email)}</span>
            </div>
          </td>
          <td>
            <span style="font-weight: 500; font-family: var(--font-mono); font-size: 0.8rem; color: ${u.role === 'admin' ? 'var(--primary-cyan)' : 'var(--text-secondary)'};">
              ${u.role.toUpperCase()}
            </span>
          </td>
          <td>
            <span class="plan-badge ${u.plan}">
              ${u.plan === 'explorer' ? 'Grátis' : u.plan.toUpperCase()}
            </span>
          </td>
          <td>
            <span class="status-dot ${u.deleted_at ? 'deleted' : u.plan_status}">
              ${u.deleted_at ? 'Lixeira' : this.translateStatus(u.plan_status)}
            </span>
          </td>
          <td>
            <span style="font-size: 0.85rem;">${expiresText}</span>
          </td>
          <td style="text-align: center; font-family: var(--font-mono); font-size: 0.85rem;">
            <span style="color: var(--primary-cyan);" title="Projetos Ativos">${u.projects_count}</span> / 
            <span style="color: #fbbf24;" title="Ideias na Incubadora">${u.ideas_count}</span>
          </td>
          <td>
            <div class="table-actions">
              <button type="button" class="btn-table-action" title="Editar Assinatura" onclick="window.anorakAdmin.openEditUserModal(${u.id})">
                ⚙️
              </button>
              <button type="button" class="btn-table-action" title="Redefinir Chave/Senha" onclick="window.anorakAdmin.openResetPwdModal(${u.id})">
                🔑
              </button>
              ${u.deleted_at ? `
                <button type="button" class="btn-table-action" title="Restaurar da Lixeira" onclick="window.anorakAdmin.executeDeleteUser(${u.id}, 'restore')">
                  🔄
                </button>
              ` : `
                <button type="button" class="btn-table-action delete" title="Enviar para Lixeira" ${isSelf ? 'disabled style="opacity: 0.3; cursor: not-allowed;"' : ''} onclick="window.anorakAdmin.executeDeleteUser(${u.id}, 'delete')">
                  🗑️
                </button>
              `}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Adiciona listener nos checkboxes individuais
    document.querySelectorAll('.chk-user-select').forEach(chk => {
      chk.addEventListener('change', (e) => {
        const id = parseInt(e.target.dataset.userId);
        if (e.target.checked) {
          this.selectedUserIds.add(id);
        } else {
          this.selectedUserIds.delete(id);
        }
        this.updateBatchActionBar();
      });
    });
  }

  async loadPayments() {
    const tableBody = document.getElementById('tablePaymentsBody');
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 3rem;">
          Carregando histórico...
        </td>
      </tr>
    `;

    try {
      const res = await fetch('api/admin/list_payments.php');
      if (res.ok) {
        const result = await res.json();
        if (result.status === 'success') {
          this.payments = result.data;
          this.renderPayments();
        }
      }
    } catch (err) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; color: var(--accent-magenta); padding: 2rem;">
            Erro ao carregar histórico financeiro.
          </td>
        </tr>
      `;
    }
  }

  renderPayments() {
    const tableBody = document.getElementById('tablePaymentsBody');
    if (this.payments.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 3rem;">
            Nenhuma transação financeira registrada até o momento.
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = this.payments.map(p => {
      const date = new Date(p.created_at);
      const dateFormatted = date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      return `
        <tr>
          <td style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--primary-cyan);">
            ${p.transaction_id}
          </td>
          <td>
            <div class="user-identity">
              <span class="username">${this.escapeHTML(p.username)}</span>
              <span class="email">${this.escapeHTML(p.email)}</span>
            </div>
          </td>
          <td>
            <span class="plan-badge ${p.plan}">
              ${p.plan.toUpperCase()}
            </span>
          </td>
          <td style="font-family: var(--font-mono); font-weight: 700;">
            R$ ${p.amount.toFixed(2).replace('.', ',')}
          </td>
          <td>
            <span style="text-transform: uppercase; font-size: 0.8rem; font-weight: 500;">
              ${p.payment_method === 'credit_card' ? 'Cartão de Crédito' : p.payment_method.toUpperCase()}
            </span>
          </td>
          <td>
            <span class="status-dot ${p.status === 'completed' ? 'active' : 'suspended'}">
              ${p.status === 'completed' ? 'Aprovado' : 'Pendente'}
            </span>
          </td>
          <td style="font-size: 0.85rem; color: var(--text-secondary);">
            ${dateFormatted}
          </td>
        </tr>
      `;
    }).join('');
  }

  async loadUsersDropdown() {
    const select = document.getElementById('payUserId');
    try {
      const res = await fetch('api/admin/list_users.php');
      if (res.ok) {
        const result = await res.json();
        if (result.status === 'success') {
          const activeUsers = result.data.filter(u => !u.deleted_at);
          select.innerHTML = '<option value="">-- Selecione o Cliente --</option>' + 
            activeUsers.map(u => `
              <option value="${u.id}">${this.escapeHTML(u.username)} (${this.escapeHTML(u.email)})</option>
            `).join('');
        }
      }
    } catch (e) {
      select.innerHTML = '<option value="">Falha ao listar usuários</option>';
    }
  }

  // =========================================================================
  // OPERAÇÕES UNITÁRIAS
  // =========================================================================
  openEditUserModal(userId) {
    const user = this.users.find(u => u.id === userId);
    if (!user) return;

    document.getElementById('editUserId').value = user.id;
    document.getElementById('editUsername').value = user.username;
    document.getElementById('editEmail').value = user.email;
    document.getElementById('editRole').value = user.role;
    document.getElementById('editPlan').value = user.plan;
    document.getElementById('editPlanStatus').value = user.plan_status;
    
    const cycleSelect = document.getElementById('editBillingCycle');
    if (cycleSelect) cycleSelect.value = user.billing_cycle || 'monthly';

    // Reseta data de expiração
    const expInput = document.getElementById('editPlanExpires');
    if (user.plan_expires_at) {
      // Ajusta data ISO para datetime-local (yyyy-MM-ddThh:mm)
      const d = new Date(user.plan_expires_at);
      const isoStr = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      expInput.value = isoStr;
    } else {
      expInput.value = '';
    }

    document.getElementById('modalEditUser').classList.add('active');
  }

  async saveUserSettings() {
    const id = parseInt(document.getElementById('editUserId').value);
    const username = document.getElementById('editUsername').value.trim();
    const email = document.getElementById('editEmail').value.trim();
    const role = document.getElementById('editRole').value;
    const plan = document.getElementById('editPlan').value;
    const plan_status = document.getElementById('editPlanStatus').value;
    const plan_expires_at = document.getElementById('editPlanExpires').value;
    
    const cycleSelect = document.getElementById('editBillingCycle');
    const billing_cycle = cycleSelect ? cycleSelect.value : 'monthly';

    try {
      const res = await fetch('api/admin/update_user.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, username, email, role, plan, plan_status, plan_expires_at, billing_cycle })
      });

      const result = await res.json();
      if (res.ok && result.status === 'success') {
        this.showToast(result.message);
        document.getElementById('modalEditUser').classList.remove('active');
        this.loadStats();
        this.loadUsers();
      } else {
        alert(result.message || 'Falha ao salvar configurações.');
      }
    } catch (err) {
      alert('Erro de conexão ao salvar configurações.');
    }
  }

  openResetPwdModal(userId) {
    const user = this.users.find(u => u.id === userId);
    if (!user) return;

    document.getElementById('resetPwdUserId').value = user.id;
    document.getElementById('resetPwdUsernameText').innerHTML = `Redefinir chave de acesso para: <strong>@${this.escapeHTML(user.username)}</strong>`;
    document.getElementById('newPasswordInput').value = '';

    document.getElementById('modalResetPassword').classList.add('active');
  }

  async saveUserPassword() {
    const id = parseInt(document.getElementById('resetPwdUserId').value);
    const password = document.getElementById('newPasswordInput').value.trim();

    try {
      const res = await fetch('api/admin/reset_password.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, password })
      });

      const result = await res.json();
      if (res.ok && result.status === 'success') {
        this.showToast(result.message);
        document.getElementById('modalResetPassword').classList.remove('active');
      } else {
        alert(result.message || 'Falha ao redefinir a senha.');
      }
    } catch (err) {
      alert('Erro de conexão com o servidor.');
    }
  }

  async executeDeleteUser(userId, actionType = 'delete') {
    let confirmMsg = 'Tem certeza que deseja enviar esta conta para a lixeira?';
    if (actionType === 'restore') {
      confirmMsg = 'Deseja realmente restaurar esta conta de usuário da lixeira?';
    } else if (actionType === 'hard_delete') {
      confirmMsg = 'Deseja realmente apagar fisicamente esta conta e todos os dados associados a ela?';
    }

    if (!confirm(confirmMsg)) return;

    try {
      const res = await fetch(`api/admin/delete_user.php?id=${userId}&action=${actionType}`);
      const result = await res.json();
      if (res.ok && result.status === 'success') {
        this.showToast(result.message);
        document.getElementById('modalEditUser').classList.remove('active');
        this.loadStats();
        this.loadUsers();
      } else {
        alert(result.message || 'Falha na operação.');
      }
    } catch (err) {
      alert('Erro de comunicação com o servidor.');
    }
  }

  // =========================================================================
  // REGISTRO DE PAGAMENTO MANUAL
  // =========================================================================
  openAddPaymentModal() {
    document.getElementById('formAddPayment').reset();
    document.getElementById('payAmount').value = '49.00';
    document.getElementById('payDuration').value = '30';
    
    // Auto-update price when selecting plans
    const planSelect = document.getElementById('payPlan');
    const valInput = document.getElementById('payAmount');
    
    if (planSelect && valInput) {
      planSelect.addEventListener('change', (e) => {
        if (e.target.value === 'creator') valInput.value = '49.00';
        else if (e.target.value === 'master') valInput.value = '119.00';
        else if (e.target.value === 'legend') valInput.value = '199.00';
      });
    }

    document.getElementById('modalAddPayment').classList.add('active');
  }

  async saveManualPayment() {
    const user_id = parseInt(document.getElementById('payUserId').value);
    const plan = document.getElementById('payPlan').value;
    const amount = parseFloat(document.getElementById('payAmount').value);
    const payment_method = document.getElementById('payMethod').value;
    const duration_days = parseInt(document.getElementById('payDuration').value);
    const transaction_id = document.getElementById('payTransId').value.trim();

    if (!user_id) {
      alert('Por favor, selecione um cliente.');
      return;
    }

    try {
      const res = await fetch('api/admin/add_payment.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id, plan, amount, payment_method, duration_days, transaction_id })
      });

      const result = await res.json();
      if (res.ok && result.status === 'success') {
        this.showToast(result.message);
        document.getElementById('modalAddPayment').classList.remove('active');
        this.loadStats();
        this.loadUsers();
        this.loadPayments();
      } else {
        alert(result.message || 'Falha ao registrar pagamento.');
      }
    } catch (err) {
      alert('Erro de conexão ao registrar pagamento.');
    }
  }

  // =========================================================================
  // OPERAÇÕES EM LOTE (BATCH ACTIONS)
  // =========================================================================
  updateBatchActionBar() {
    const bar = document.getElementById('batchActionsBar');
    const text = document.getElementById('batchCountText');
    const count = this.selectedUserIds.size;

    if (count > 0) {
      text.textContent = count;
      bar.classList.add('active');
    } else {
      bar.classList.remove('active');
    }
  }

  openBatchEditModal() {
    document.getElementById('formBatchEdit').reset();
    document.getElementById('batchExpiresAt').style.display = 'none';
    document.getElementById('batchUsersCountText').textContent = this.selectedUserIds.size;

    document.getElementById('modalBatchEdit').classList.add('active');
  }

  async saveBatchSettings() {
    const ids = Array.from(this.selectedUserIds);
    const plan = document.getElementById('batchPlan').value;
    const plan_status = document.getElementById('batchStatus').value;
    const role = document.getElementById('batchRole').value;
    const expires_option = document.getElementById('batchExpiresOption').value;
    const plan_expires_at = document.getElementById('batchExpiresAt').value;

    try {
      const res = await fetch('api/admin/bulk_update.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, plan, plan_status, role, expires_option, plan_expires_at })
      });

      const result = await res.json();
      if (res.ok && result.status === 'success') {
        this.showToast(result.message);
        document.getElementById('modalBatchEdit').classList.remove('active');
        this.selectedUserIds.clear();
        this.updateBatchActionBar();
        this.loadStats();
        this.loadUsers();
      } else {
        alert(result.message || 'Falha nas alterações em lote.');
      }
    } catch (err) {
      alert('Erro de conexão ao executar alterações em lote.');
    }
  }

  async executeBatchDelete() {
    const count = this.selectedUserIds.size;
    const statusFilter = document.getElementById('selectFilterStatus').value;
    const actionType = statusFilter === 'deleted' ? 'hard_delete' : 'delete';

    let confirmMsg = `Tem certeza que deseja enviar os ${count} usuários selecionados para a lixeira?`;
    if (actionType === 'hard_delete') {
      confirmMsg = `ATENÇÃO CRÍTICA: Deseja realmente APAGAR FISICAMENTE todos os ${count} usuários selecionados do sistema de forma permanente?`;
    }

    if (!confirm(confirmMsg)) return;

    const ids = Array.from(this.selectedUserIds);

    try {
      const res = await fetch('api/admin/bulk_update.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action: actionType })
      });

      const result = await res.json();
      if (res.ok && result.status === 'success') {
        this.showToast(result.message);
        this.selectedUserIds.clear();
        this.updateBatchActionBar();
        this.loadStats();
        this.loadUsers();
      } else {
        alert(result.message || 'Falha ao processar deleção em lote.');
      }
    } catch (err) {
      alert('Erro de rede ao executar exclusão em lote.');
    }
  }

  async executeBatchRestore() {
    const count = this.selectedUserIds.size;
    if (!confirm(`Deseja realmente restaurar os ${count} usuários selecionados da lixeira?`)) return;

    const ids = Array.from(this.selectedUserIds);

    try {
      const res = await fetch('api/admin/bulk_update.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action: 'restore' })
      });

      const result = await res.json();
      if (res.ok && result.status === 'success') {
        this.showToast(result.message);
        this.selectedUserIds.clear();
        this.updateBatchActionBar();
        this.loadStats();
        this.loadUsers();
      } else {
        alert(result.message || 'Falha ao restaurar em lote.');
      }
    } catch (err) {
      alert('Erro de comunicação.');
    }
  }

  // =========================================================================
  // TRILHA GLOBAL DE AUDITORIA (M.E.L.T. / OBSERVABILIDADE)
  // =========================================================================
  async loadAuditLogs() {
    const tbody = document.getElementById('tableAuditLogsBody');
    if (!tbody) return;

    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">
          <div class="spinner"></div> Carregando registros de auditoria em tempo real...
        </td>
      </tr>
    `;

    try {
      const res = await fetch('api/activity_logs.php');
      if (res.ok) {
        const result = await res.json();
        if (result.status === 'success') {
          const logs = result.data || [];
          if (logs.length === 0) {
            tbody.innerHTML = `
              <tr>
                <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">
                  Nenhum registro de auditoria encontrado.
                </td>
              </tr>
            `;
            return;
          }

          tbody.innerHTML = logs.map(log => {
            const dateStr = log.created_at ? new Date(log.created_at).toLocaleString('pt-BR') : '-';
            let detailsText = '';
            if (log.details) {
              if (typeof log.details === 'object') {
                detailsText = Object.entries(log.details)
                  .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
                  .join(' | ');
              } else {
                detailsText = String(log.details);
              }
            }

            return `
              <tr>
                <td class="mono" style="font-size: 0.78rem; color: var(--text-muted);">${dateStr}</td>
                <td>
                  <span class="user-badge" style="font-weight: 600; color: var(--primary-cyan);">@${this.escapeHTML(log.username || 'sistema')}</span>
                </td>
                <td>
                  <span class="action-tag" style="font-weight: bold; font-size: 0.8rem; color: #fff;">${this.escapeHTML(log.action || '-')}</span>
                </td>
                <td style="font-size: 0.8rem; color: var(--text-secondary); max-width: 320px; word-break: break-word;">
                  ${this.escapeHTML(detailsText || '-')}
                </td>
                <td class="mono" style="font-size: 0.75rem; color: var(--text-muted);">${this.escapeHTML(log.ip_address || '-')}</td>
              </tr>
            `;
          }).join('');
          return;
        }
      }
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #f87171; padding: 2rem;">Falha ao carregar trilha de auditoria.</td></tr>`;
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #f87171; padding: 2rem;">Erro de conexão: ${this.escapeHTML(err.message)}</td></tr>`;
    }
  }

  // =========================================================================
  // UTILITÁRIOS
  // =========================================================================
  translateStatus(status) {
    switch (status) {
      case 'active': return 'Ativo';
      case 'suspended': return 'Suspenso';
      case 'expired': return 'Expirado';
      default: return status;
    }
  }

  showToast(message) {
    const container = document.querySelector('.toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span>🛡️</span> <span>${this.escapeHTML(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(40px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Inicializa a aplicação Admin
window.addEventListener('DOMContentLoaded', () => {
  window.anorakAdmin = new AnorakAdmin();
  window.anorakAdmin.init();
});
