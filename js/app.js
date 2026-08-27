/**
 * ANORAK - Main Application Controller
 * OASIS HUD, Dual-Mode Switcher, Checklists Reativos, Incubadora & IA Matrix
 * 
 * Desenvolvido por Mario Henrique (mariozinhocs) - mariozinhocs@gmail.com
 * "si vis pacem para bellum"
 */

import { db } from './db.js';
import { Item, ItemType, ProjectStatus, IdeaStatus } from './models.js';
import { voiceRecorder } from './voice.js';
import { AnorakDecisionMatrix } from './matrix.js';
import { syncEngine } from './sync.js';

class AnorakApp {
  constructor() {
    this.currentMode = 'operational'; // 'operational' | 'incubator' | 'matrix'
    this.projectLayoutMode = localStorage.getItem('anorak_project_layout') || 'grid'; // 'grid' | 'list'
    this.currentTagFilter = 'all';
    this.currentStatusFilter = 'todos';
    this.decisionMatrix = new AnorakDecisionMatrix(db);
    this.audioContext = null;
    this.soundEnabled = false;
    this.gitTelemetryCache = new Map();
  }

  async init() {
    // 1. Verificação de Autenticação
    const isAuthenticated = await this.verifyAuth();
    if (!isAuthenticated) {
      window.location.replace('login.html');
      return;
    }

    await this.loadUsersList();
    await db.init();
    this.initAudioContext();
    this.setupEventListeners();
    this.initPwaSupport();
    this.render();
    this.renderDecisionMatrix();
    this.checkGitHubSync();

    // Verifica parâmetros de checkout na URL
    const urlParams = new URLSearchParams(window.location.search);
    const checkoutPlan = urlParams.get('checkout');
    const checkoutBilling = urlParams.get('billing') || 'monthly';
    if (checkoutPlan) {
      window.history.replaceState({}, document.title, window.location.pathname);
      this.openCheckoutModal(checkoutPlan, checkoutBilling);
    }
  }

  initPwaSupport() {
    // 1. Registro do Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js')
        .then(reg => console.log('[PWA] Service Worker ativo:', reg.scope))
        .catch(err => console.warn('[PWA] Service Worker indisponível:', err));
    }

    // 2. Intercepta prompt de instalação nativo
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPwaPrompt = e;
      const btnInstall = document.getElementById('btnInstallPwa');
      if (btnInstall) {
        btnInstall.style.display = 'inline-flex';
        btnInstall.onclick = async () => {
          if (this.deferredPwaPrompt) {
            this.deferredPwaPrompt.prompt();
            const choiceResult = await this.deferredPwaPrompt.userChoice;
            if (choiceResult.outcome === 'accepted') {
              this.showToast('🎉 Anorak instalado com sucesso no seu dispositivo!');
              btnInstall.style.display = 'none';
            }
            this.deferredPwaPrompt = null;
          }
        };
      }
    });
  }

  async verifyAuth() {
    try {
      const res = await fetch('api/auth/check_auth.php');
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          this.currentUser = data.user;
          const userEl = document.getElementById('currentUserName');
          if (userEl) userEl.textContent = `👤 ${data.user.username}`;
          
          // Atualiza o Badge do Plano do Usuário
          const planBadge = document.getElementById('currentUserPlanBadge');
          if (planBadge) {
            const planName = data.user.plan === 'explorer' ? 'Grátis' : data.user.plan.toUpperCase();
            const cycleText = data.user.plan === 'explorer' ? '' : (data.user.billing_cycle === 'annual' ? ' ANUAL' : ' MENSAL');
            planBadge.textContent = planName + cycleText;
            
            // Estilização cyberpunk correspondente ao plano
            planBadge.className = `plan-badge ${data.user.plan}`;
            planBadge.style.fontSize = '0.7rem';
            planBadge.style.padding = '2px 8px';
            planBadge.style.borderRadius = '10px';
            planBadge.style.fontWeight = 'bold';
            planBadge.style.textTransform = 'uppercase';
            planBadge.style.letterSpacing = '0.05em';
            planBadge.style.border = '1px solid';

            if (data.user.plan === 'explorer') {
              planBadge.style.borderColor = 'rgba(255,255,255,0.2)';
              planBadge.style.background = 'rgba(255,255,255,0.05)';
              planBadge.style.color = '#94a3b8';
            } else if (data.user.plan === 'creator') {
              planBadge.style.borderColor = 'var(--primary-cyan)';
              planBadge.style.background = 'rgba(0, 242, 254, 0.15)';
              planBadge.style.color = '#00f2fe';
              planBadge.style.boxShadow = '0 0 10px rgba(0, 242, 254, 0.2)';
            } else if (data.user.plan === 'master') {
              planBadge.style.borderColor = 'var(--accent-purple)';
              planBadge.style.background = 'rgba(168, 85, 247, 0.15)';
              planBadge.style.color = '#d8b4fe';
              planBadge.style.boxShadow = '0 0 10px rgba(168, 85, 247, 0.2)';
            } else if (data.user.plan === 'legend') {
              planBadge.style.borderColor = 'var(--accent-magenta)';
              planBadge.style.background = 'rgba(236, 72, 153, 0.15)';
              planBadge.style.color = '#fbcfe8';
              planBadge.style.boxShadow = '0 0 10px rgba(236, 72, 153, 0.2)';
            }
          }

          // Exibe/oculta botão de upgrade (não exibe se já for Legend)
          const upgradeBtn = document.getElementById('btnUpgradeAccount');
          if (upgradeBtn) {
            upgradeBtn.style.display = data.user.plan === 'legend' ? 'none' : 'inline-flex';
          }

          const adminLink = document.getElementById('btnAdminLink');
          if (adminLink && data.user.role === 'admin') {
            adminLink.style.display = 'inline-flex';
          }
          return true;
        }
      }
    } catch (e) {
      console.warn('Erro ao checar auth:', e);
    }
    return false;
  }

  async loadUsersList() {
    try {
      const res = await fetch('api/users/list.php');
      if (res.ok) {
        const result = await res.json();
        if (result.status === 'success' && Array.isArray(result.data)) {
          this.allUsersData = result.data;
          this.usersList = result.data.map(u => u.username);
          return;
        }
      }
    } catch (e) {
      console.warn('Erro ao listar usuários:', e);
    }
    this.allUsersData = [
      { username: 'admin', email: 'admin@hubdigital360.com' },
      { username: 'mario.henrique', email: 'mario.henrique@hubdigital360.com' },
      { username: 'convidado', email: 'convidado@hubdigital360.com' }
    ];
    this.usersList = ['admin', 'mario.henrique', 'convidado'];
  }

  initAudioContext() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.audioContext = new AudioCtx();
    } catch (e) {
      console.warn('Web Audio API indisponível:', e);
    }
  }

  playCyberChime(frequency = 520, type = 'sine', duration = 0.15) {
    if (!this.soundEnabled || !this.audioContext) return;
    try {
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
      gain.gain.setValueAtTime(0.08, this.audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.audioContext.destination);
      osc.start();
      osc.stop(this.audioContext.currentTime + duration);
    } catch (e) {
      // Ignora erro de áudio
    }
  }

  setupEventListeners() {
    // Modo Operacional vs Incubadora vs Matriz
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const mode = btn.dataset.mode;
        this.switchMode(mode);
      });
    });

    // Atalho global de teclado: Ctrl+Space ou Alt+I para Quick Capture
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey && e.code === 'Space') || (e.altKey && e.key.toLowerCase() === 'i')) {
        e.preventDefault();
        this.openQuickCaptureModal();
      }
    });

    // Botão de Captura Rápida no HUD
    const btnQuick = document.getElementById('btnQuickCapture');
    if (btnQuick) btnQuick.addEventListener('click', () => this.openQuickCaptureModal());

    // Botão de Nova Ideia na Incubadora
    const btnNewIdea = document.getElementById('btnNewIdea');
    if (btnNewIdea) btnNewIdea.addEventListener('click', () => this.openQuickCaptureModal());

    // Botão de Novo Projeto
    const btnNewProj = document.getElementById('btnNewProject');
    if (btnNewProj) btnNewProj.addEventListener('click', () => this.openNewProjectModal());

    // Seletor de Exibição (Grade vs Lista estilo Google Drive)
    const btnGrid = document.getElementById('btnViewGrid');
    const btnList = document.getElementById('btnViewList');
    if (btnGrid && btnList) {
      btnGrid.addEventListener('click', () => this.setProjectLayoutMode('grid'));
      btnList.addEventListener('click', () => this.setProjectLayoutMode('list'));
    }

    // Botão de Gravação de Voz
    const btnVoice = document.getElementById('btnVoiceRecord');
    if (btnVoice) {
      btnVoice.addEventListener('click', () => this.toggleVoiceRecording());
    }

    // Modal Share & Collaborators listeners
    const btnAddColab = document.getElementById('btnAddCollaborator');
    if (btnAddColab) {
      btnAddColab.addEventListener('click', () => this.handleAddCollaborator());
    }

    const btnCopyShare = document.getElementById('btnCopyShareLink');
    if (btnCopyShare) {
      btnCopyShare.addEventListener('click', () => this.copyShareLink());
    }

    // Filtro por Status Dropdown
    const filterStatus = document.getElementById('filterStatus');
    if (filterStatus) {
      filterStatus.addEventListener('change', (e) => {
        this.currentStatusFilter = e.target.value;
        this.render();
      });
    }

    // Modal Close buttons
    document.querySelectorAll('.modal-close, .btn-modal-cancel').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('active'));
        if (typeof voiceRecorder !== 'undefined' && voiceRecorder.stop) voiceRecorder.stop();
      });
    });

    // Fechar modais ao clicar no backdrop (fora da caixa) ou ao pressionar ESC
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
      backdrop.addEventListener('click', (e) => {
        if (!e.target.closest('.modal-container')) {
          backdrop.classList.remove('active');
          if (typeof voiceRecorder !== 'undefined' && voiceRecorder.stop) voiceRecorder.stop();
        }
      });
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('active'));
        if (typeof voiceRecorder !== 'undefined' && voiceRecorder.stop) voiceRecorder.stop();
      }
    });

    // Form Quick Capture Submit
    const formQuick = document.getElementById('formQuickCapture');
    if (formQuick) {
      formQuick.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveQuickIdea();
      });
    }

    // Form Promote Idea Submit
    const formPromote = document.getElementById('formPromote');
    if (formPromote) {
      formPromote.addEventListener('submit', (e) => {
        e.preventDefault();
        this.executePromoteIdea();
      });
    }

    // Form New Project Submit
    const formNewProj = document.getElementById('formNewProject');
    if (formNewProj) {
      formNewProj.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveNewProject();
      });
    }

    // Form Edit Project Submit
    const formEditProj = document.getElementById('formEditProject');
    if (formEditProj) {
      formEditProj.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveEditProject();
      });
    }

    // Form Edit Idea Submit
    const formEditIdea = document.getElementById('formEditIdea');
    if (formEditIdea) {
      formEditIdea.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveEditIdea();
      });
    }

    // Backup Export & Import
    const btnExport = document.getElementById('btnExportBackup');
    if (btnExport) btnExport.addEventListener('click', () => db.exportDataJSON());

    const inputImport = document.getElementById('inputImportBackup');
    if (inputImport) {
      inputImport.addEventListener('change', async (e) => {
        if (e.target.files && e.target.files[0]) {
          try {
            await db.importDataJSON(e.target.files[0]);
            this.showToast('Backup importado com sucesso!');
            this.render();
          } catch (err) {
            this.showToast('Erro ao importar backup: ' + err.message);
          }
        }
      });
    }

    // Botão de Logout
    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) {
      btnLogout.addEventListener('click', async () => {
        if (confirm('Deseja realmente sair do OASIS Hub?')) {
          try {
            await fetch('api/auth/logout.php');
          } catch (e) {}
          window.location.replace('login.html');
        }
      });
    }

    // Alternar campos no modal de evidências
    const radioFile = document.querySelector('input[name="evidenceType"][value="file"]');
    const radioLink = document.querySelector('input[name="evidenceType"][value="link"]');
    const fileGroup = document.getElementById('evidenceFileGroup');
    const linkGroup = document.getElementById('evidenceLinkGroup');

    if (radioFile && radioLink && fileGroup && linkGroup) {
      document.querySelectorAll('input[name="evidenceType"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
          if (e.target.value === 'file') {
            fileGroup.style.display = 'block';
            linkGroup.style.display = 'none';
          } else {
            fileGroup.style.display = 'none';
            linkGroup.style.display = 'block';
          }
        });
      });
    }

    // Submit do formulário de evidência
    const formEv = document.getElementById('formEvidence');
    if (formEv) {
      formEv.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveEvidence();
      });
    }

    // Modal de Checkout / Upgrade
    const btnUpgrade = document.getElementById('btnUpgradeAccount');
    if (btnUpgrade) {
      btnUpgrade.addEventListener('click', () => {
        this.openCheckoutModal();
      });
    }

    const selectPlan = document.getElementById('checkoutPlan');
    const radioBillings = document.querySelectorAll('input[name="checkoutBilling"]');
    const radioMethods = document.querySelectorAll('input[name="checkoutMethod"]');

    if (selectPlan) selectPlan.addEventListener('change', () => this.updateCheckoutPrice());
    radioBillings.forEach(r => r.addEventListener('change', () => this.updateCheckoutPrice()));
    radioMethods.forEach(r => r.addEventListener('change', () => this.updateCheckoutPrice()));

    const btnConfirm = document.getElementById('btnConfirmCheckout');
    if (btnConfirm) {
      btnConfirm.addEventListener('click', () => this.processCheckout());
    }

    const btnCopy = document.getElementById('btnCopyPix');
    if (btnCopy) {
      btnCopy.addEventListener('click', () => {
        const input = document.getElementById('pixCopyPaste');
        if (input) {
          input.select();
          navigator.clipboard.writeText(input.value);
          this.showToast('Código Pix copiado!');
        }
      });
    }

    const btnCancelPix = document.getElementById('btnCancelPix');
    if (btnCancelPix) {
      btnCancelPix.addEventListener('click', () => {
        if (this.pixInterval) {
          clearInterval(this.pixInterval);
          this.pixInterval = null;
        }
        document.getElementById('checkoutPixContent').style.display = 'none';
        document.getElementById('checkoutFormContent').style.display = 'block';
      });
    }

    // Escuta atualizações do DB
    window.addEventListener('anorak-db-updated', () => {
      this.render();
      this.renderDecisionMatrix();
    });
  }

  switchMode(mode) {
    this.currentMode = mode;
    document.querySelectorAll('.mode-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });

    const opView = document.getElementById('viewOperational');
    const compView = document.getElementById('viewCompleted');
    const incView = document.getElementById('viewIncubator');
    const matView = document.getElementById('viewMatrix');

    if (opView) opView.style.display = mode === 'operational' ? 'flex' : 'none';
    if (compView) compView.style.display = mode === 'completed' ? 'flex' : 'none';
    if (incView) incView.style.display = mode === 'incubator' ? 'flex' : 'none';
    if (matView) matView.style.display = mode === 'matrix' ? 'grid' : 'none';

    if (mode === 'completed') {
      this.renderCompletedProjects();
    }

    this.playCyberChime(660, 'triangle', 0.1);
  }

  render() {
    this.renderStatsBar();
    this.renderOperationalProjects();
    this.renderCompletedProjects();
    this.renderIncubatorIdeas();
  }

  renderStatsBar() {
    const items = db.getAll();
    const allProjects = items.filter(i => i.type === ItemType.PROJECT);
    const ideas = items.filter(i => i.type === ItemType.IDEA);

    const completedProjects = allProjects.filter(p => {
      const st = (p.status || '').toLowerCase();
      return st === 'concluido' || st.includes('conclui') || st.includes('produc');
    });

    const openProjects = allProjects.filter(p => {
      const st = (p.status || '').toLowerCase();
      return st !== 'concluido' && !st.includes('conclui') && !st.includes('produc');
    });

    // 1. Topo (Aba Mapa de Status): Projetos Ativos / Em Andamento
    const elTabProjCount = document.getElementById('tabOperationalProjectCount');
    if (elTabProjCount) {
      elTabProjCount.textContent = `(${openProjects.length} Projeto${openProjects.length === 1 ? '' : 's'})`;
    }

    // 2. Topo (Aba Concluídos): Projetos Finalizados
    const elTabCompletedCount = document.getElementById('tabCompletedProjectCount');
    if (elTabCompletedCount) {
      elTabCompletedCount.textContent = `(${completedProjects.length} Concluído${completedProjects.length === 1 ? '' : 's'})`;
    }

    // 3. Card do HUD: Apenas Projetos Ativos
    const elProjCount = document.getElementById('statActiveProjects');
    if (elProjCount) elProjCount.textContent = openProjects.length;

    let totalTasks = 0;
    let completedTasks = 0;
    allProjects.forEach(p => {
      totalTasks += p.tasks.length;
      completedTasks += p.tasks.filter(t => t.completed).length;
    });

    const elHomologStatus = document.getElementById('statHomologationRate');
    if (elHomologStatus) {
      const rate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
      elHomologStatus.textContent = `${completedTasks}/${totalTasks} (${rate}%)`;
    }

    const elIdeasCount = document.getElementById('statIncubatorIdeas');
    if (elIdeasCount) elIdeasCount.textContent = ideas.length;
  }

  // =========================================================================
  // MODO OPERACIONAL (Checklists e Projetos)
  // =========================================================================
  setProjectLayoutMode(mode) {
    this.projectLayoutMode = mode;
    localStorage.setItem('anorak_project_layout', mode);
    this.renderOperationalProjects();
    this.playCyberChime(520, 'sine', 0.1);
  }

  renderOperationalProjects() {
    const container = document.getElementById('projectsContainer');
    if (!container) return;

    // Atualiza botões do seletor de visualização (Grade vs Lista)
    const btnGrid = document.getElementById('btnViewGrid');
    const btnList = document.getElementById('btnViewList');
    if (btnGrid && btnList) {
      btnGrid.classList.toggle('active', this.projectLayoutMode === 'grid');
      btnGrid.style.background = this.projectLayoutMode === 'grid' ? 'rgba(0, 242, 254, 0.18)' : 'transparent';
      btnGrid.style.color = this.projectLayoutMode === 'grid' ? 'var(--primary-cyan)' : 'var(--text-muted)';
      
      btnList.classList.toggle('active', this.projectLayoutMode === 'list');
      btnList.style.background = this.projectLayoutMode === 'list' ? 'rgba(0, 242, 254, 0.18)' : 'transparent';
      btnList.style.color = this.projectLayoutMode === 'list' ? 'var(--primary-cyan)' : 'var(--text-muted)';
    }

    container.classList.toggle('list-view', this.projectLayoutMode === 'list');

    const filterSelect = document.getElementById('filterStatus');
    if (filterSelect) {
      filterSelect.value = this.currentStatusFilter || 'todos';
    }

    let projects = db.getByType(ItemType.PROJECT);
    if (this.currentStatusFilter && this.currentStatusFilter !== 'todos') {
      const filterKey = this.currentStatusFilter.toLowerCase();
      projects = projects.filter(p => {
        const pStatus = (p.status || '').toLowerCase();
        if (filterKey === 'homologacao') {
          return pStatus.includes('homolog') || pStatus === 'homologacao';
        }
        if (filterKey === 'concluido') {
          return pStatus.includes('conclui') || pStatus.includes('produc') || pStatus === 'concluido';
        }
        if (filterKey === 'pausado') {
          return pStatus.includes('paus') || pStatus === 'pausado';
        }
        if (filterKey === 'planejamento') {
          return pStatus.includes('plan') || pStatus === 'planejamento';
        }
        return pStatus === filterKey;
      });
    } else {
      // Por padrão na visão operacional, exibe projetos em homologação/ativos
      projects = projects.filter(p => {
        const pStatus = (p.status || '').toLowerCase();
        return pStatus !== 'concluido' && !pStatus.includes('conclui') && !pStatus.includes('produc');
      });
    }

    if (projects.length === 0) {
      container.innerHTML = `<div class="glass-panel" style="padding: 2rem; text-align: center; color: var(--text-muted); grid-column: 1/-1;">Nenhum projeto ativo em homologação no momento. Acesse a aba <strong>💎 Concluídos</strong> para ver projetos finalizados.</div>`;
      return;
    }

    container.innerHTML = projects.map(proj => {
      const evo = proj.getEvolution();
      const isShared = (proj.collaborators || []).length > 0;
      
      // Membros válidos do projeto: APENAS o usuário atual/criador e colaboradores convidados manualmente
      const projectMembers = Array.from(new Set([
        ...(this.currentUser ? [this.currentUser.username] : []),
        ...(proj.collaborators || []),
        ...(proj.assignedTo ? [proj.assignedTo] : [])
      ])).filter(Boolean);

      // MODO LISTA COMPACTO ESTILO GOOGLE DRIVE
      if (this.projectLayoutMode === 'list') {
        return `
          <article class="glass-panel project-list-row" draggable="true" data-project-id="${proj.id}">
            <!-- Coluna 1: Título & Descrição com Links de Acesso e Git -->
            <div class="list-col-main">
              <div class="list-title-wrap" style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                <span class="drag-handle" title="Arraste para reordenar prioridade (Exclusivo Legend)">⋮⋮</span>
                <h3 class="project-title" style="margin: 0; font-size: 1.05rem;">${this.escapeHTML(proj.title)}</h3>
                <span class="status-pill status-${proj.status}" style="font-size: 0.68rem; font-weight: bold; text-transform: uppercase; padding: 2px 8px; border-radius: 12px; background: rgba(0, 242, 254, 0.1); color: var(--primary-cyan); border: 1px solid rgba(0, 242, 254, 0.3);">${proj.status}</span>
                ${proj.contextLinks.githubRepo ? `
                  <button type="button" class="btn-git-sync github-sync-btn" style="padding: 2px 7px; font-size: 0.7rem;" title="Consultar e Atualizar Status do Git" onclick="window.anorakApp.handleRefreshGit('${proj.id}', event)">
                    🔄 Git
                  </button>
                ` : ''}
                ${proj.contextLinks.hmlUrl ? `<a href="${proj.contextLinks.hmlUrl}" target="_blank" rel="noopener" class="context-link-btn" title="Homologação (HML)" style="padding: 2px 6px; font-size: 0.7rem; border-color: rgba(234, 179, 8, 0.4); color: #facc15;">🧪 HML</a>` : ''}
                ${proj.contextLinks.liveUrl ? `<a href="${proj.contextLinks.liveUrl}" target="_blank" rel="noopener" class="context-link-btn" title="Ambiente Live (Produção)" style="padding: 2px 6px; font-size: 0.7rem; border-color: rgba(16, 185, 129, 0.4); color: #10b981;">🚀 Live</a>` : ''}
              </div>
              <p class="project-desc" style="margin: 4px 0 0 0; font-size: 0.8rem; color: var(--text-muted);">${this.escapeHTML(proj.description || 'Sem descrição cadastrada.')}</p>
            </div>

            <!-- Coluna 2: Responsável Técnico -->
            <div class="list-col-responsible">
              <span style="font-size: 0.72rem; color: var(--text-muted); display: block; margin-bottom: 2px;">Responsável:</span>
              <select class="responsible-select" onchange="window.anorakApp.handleSetAssignee('${proj.id}', this.value)" style="font-size: 0.8rem; padding: 3px 6px;">
                <option value="" ${!proj.assignedTo ? 'selected' : ''}>Sem responsável</option>
                ${projectMembers.map(u => `
                  <option value="${u}" ${proj.assignedTo === u ? 'selected' : ''}>@${u}</option>
                `).join('')}
              </select>
            </div>

            <!-- Coluna 3: Mini Gauge & Etapas Concluídas -->
            <div class="list-col-progress" style="display: flex; align-items: center; gap: 0.75rem;">
              <div class="gauge-holder" style="transform: scale(0.85); flex-shrink: 0;" title="Progresso da Fase: ${evo.percentage}%">
                ${this.renderMiniGauge(evo.percentage)}
              </div>
              <div style="display: flex; flex-direction: column;">
                <span class="mono" style="font-size: 0.82rem; font-weight: bold; color: var(--primary-cyan);">${evo.completed}/${evo.total} etapas</span>
                <span style="font-size: 0.72rem; color: var(--text-muted);">${evo.percentage}% concluído</span>
              </div>
            </div>

            <!-- Coluna 4: Chaves de Halliday -->
            <div class="list-col-keys">
              <div class="halliday-keys-box" style="margin: 0;" title="Conquistas de Estágio: Cobre (Planejamento), Jade (Homologação), Cristal (Produção)">
                <span class="key-badge copper ${evo.copper ? 'active' : ''}">🗝️</span>
                <span class="key-badge jade ${evo.jade ? 'active' : ''}">🗝️</span>
                <span class="key-badge crystal ${evo.crystal ? 'active' : ''}">💎</span>
              </div>
            </div>

            <!-- Coluna 5: Ações Rápidas -->
            <div class="list-col-actions" style="display: flex; gap: 0.4rem; align-items: center;">
              <button class="btn-icon" style="width: 30px; height: 30px; font-size: 0.8rem;" title="Compartilhar &amp; Colaboradores" onclick="window.anorakApp.openShareModal('${proj.id}')">🤝</button>
              <button class="btn-secondary" style="padding: 0.3rem 0.65rem; font-size: 0.78rem; color: var(--primary-cyan); border-color: rgba(0,242,254,0.4); background: rgba(0,242,254,0.1); font-weight: 600;" title="Editar Painel" onclick="window.anorakApp.openEditProjectModal('${proj.id}')">✏️ Editar Painel</button>
              <button class="btn-icon" style="width: 30px; height: 30px; font-size: 0.8rem;" title="Exportar Relatório PDF" onclick="window.anorakApp.exportProjectReport('${proj.id}')">🖨️</button>
              <button class="btn-icon" style="width: 30px; height: 30px; font-size: 0.8rem;" title="Excluir Projeto" onclick="window.anorakApp.handleDeleteProject('${proj.id}')">🗑️</button>
            </div>
          </article>
        `;
      }

      // MODO GRADE DE CARDS (PADRÃO)
      return `
        <article class="glass-panel project-card" draggable="true" data-project-id="${proj.id}">
          <div class="project-card-header">
            <div style="display: flex; align-items: flex-start; gap: 0.5rem;">
              <span class="drag-handle" title="Arraste para reordenar prioridade (Exclusivo Legend)">⋮⋮</span>
              <div>
                <h3 class="project-title" style="margin: 0;">${this.escapeHTML(proj.title)}</h3>
                <p class="project-desc" style="margin: 3px 0 0 0;">${this.escapeHTML(proj.description || 'Sem descrição cadastrada.')}</p>
              </div>
            </div>
            
            <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
              <button type="button" class="btn-secondary" style="padding: 0.3rem 0.7rem; font-size: 0.8rem; border-color: rgba(0, 242, 254, 0.4); background: rgba(0, 242, 254, 0.1); color: var(--primary-cyan); font-weight: 600; display: inline-flex; align-items: center; gap: 0.35rem; cursor: pointer;" title="Editar Painel e Informações do Projeto" onclick="window.anorakApp.openEditProjectModal('${proj.id}')">
                ✏️ Editar Painel
              </button>

              <!-- Chaves de Halliday -->
              <div class="halliday-keys-box" title="Conquistas de Estágio: Cobre (Planejamento), Jade (Homologação), Cristal (Produção)">
                <span class="key-badge copper ${evo.copper ? 'active' : ''}" title="Chave de Cobre: Arquitetura & Planejamento">🗝️</span>
                <span class="key-badge jade ${evo.jade ? 'active' : ''}" title="Chave de Jade: Homologação Ativa">🗝️</span>
                <span class="key-badge crystal ${evo.crystal ? 'active' : ''}" title="Chave de Cristal: Produção Concluída">💎</span>
              </div>
            </div>
          </div>

          <!-- Linha de Responsável & Colaboradores (Governança) -->
          <div class="project-responsible-row" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span>Responsável:</span>
              <select class="responsible-select" onchange="window.anorakApp.handleSetAssignee('${proj.id}', this.value)">
                <option value="" ${!proj.assignedTo ? 'selected' : ''}>Sem responsável</option>
                ${projectMembers.map(u => `
                  <option value="${u}" ${proj.assignedTo === u ? 'selected' : ''}>@${u}</option>
                `).join('')}
              </select>
            </div>

            <div style="display: flex; align-items: center; gap: 0.35rem;">
              <span style="font-size: 0.72rem; color: var(--text-muted);">Equipe:</span>
              ${!isShared ? `
                <button type="button" class="btn-secondary" style="padding: 2px 6px; font-size: 0.7rem; border-color: rgba(255,255,255,0.1); color: var(--text-muted); cursor: pointer;" onclick="window.anorakApp.openShareModal('${proj.id}')">+ Convidar</button>
              ` : (proj.collaborators || []).map(c => `
                <span class="status-pill" style="font-size: 0.68rem; padding: 2px 6px; border-radius: 10px; background: rgba(56, 189, 248, 0.1); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3);" title="Colaborador do projeto">@${this.escapeHTML(c)}</span>
              `).join('')}
              <button type="button" class="btn-icon" style="width: 22px; height: 22px; font-size: 0.7rem;" title="Gerenciar Colaboradores" onclick="window.anorakApp.openShareModal('${proj.id}')">🤝</button>
            </div>
          </div>

          <!-- Barra de Progresso de Homologação com Mini Gauge -->
          <div class="phase-progress-wrap">
            <div class="gauge-holder" title="Progresso da Fase: ${evo.percentage}%">
              ${this.renderMiniGauge(evo.percentage)}
            </div>
            <div class="progress-details">
              <div class="progress-labels">
                <span>Status: <strong style="color: var(--primary-cyan); text-transform: uppercase;">${proj.status}</strong></span>
                <span class="mono">${evo.completed}/${evo.total} etapas</span>
              </div>
              <div class="progress-bar-bg">
                <div class="progress-bar-fill" style="width: ${evo.percentage}%;"></div>
              </div>
            </div>
          </div>

          <!-- Widget de Telemetria e Status do Git (Squad A-Team) -->
          ${this.renderGitTelemetry(proj)}

          <!-- Checklist Interativo de Homologação -->
          <div class="checklist-section">
            <div class="checklist-title">
              <span>Etapas de Homologação</span>
              <div style="display: flex; gap: 0.4rem; align-items: center;">
                <button type="button" class="btn-icon" style="width: 24px; height: 24px; font-size: 0.8rem; display: inline-flex; align-items: center; justify-content: center; cursor: pointer;" title="Adicionar Etapa de Homologação" onclick="window.anorakApp.promptAddTask('${proj.id}')">+</button>
              </div>
            </div>
            <div class="checklist-items">
              ${proj.tasks.length === 0 ? '<div style="font-size: 0.8rem; color: var(--text-muted); padding: 0.5rem;">Nenhuma etapa de validação cadastrada.</div>' : ''}
              ${proj.tasks.map(task => `
                <div class="check-item ${task.completed ? 'done' : ''}">
                  <div class="check-item-click-target" onclick="window.anorakApp.handleToggleTask('${proj.id}', '${task.id}')">
                    <div class="custom-checkbox">${task.completed ? '✓' : ''}</div>
                    <div class="check-info">
                      <span class="check-title">${this.escapeHTML(task.title)}</span>
                      ${task.validatedAt ? `<span class="check-timestamp">Validado em: ${new Date(task.validatedAt).toLocaleDateString('pt-BR')} às ${new Date(task.validatedAt).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}</span>` : ''}
                    </div>
                  </div>
                  
                  <div class="check-evidence-box">
                    ${task.evidence ? `
                      <span class="evidence-badge" title="Visualizar evidência">
                        📎 <a href="${task.evidence.path}" target="_blank" rel="noopener">${this.escapeHTML(task.evidence.name)}</a>
                        <button class="btn-evidence-delete" title="Excluir evidência" onclick="window.anorakApp.handleRemoveEvidence('${proj.id}', '${task.id}')">&times;</button>
                      </span>
                    ` : `
                      <button class="btn-evidence-attach" title="Anexar Evidência" onclick="window.anorakApp.openEvidenceModal('${proj.id}', '${task.id}')">
                        📎 Anexar
                      </button>
                    `}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Context Links & Ações -->
          <div class="project-footer" style="display: flex; align-items: center; justify-content: flex-start; gap: 0.5rem; flex-wrap: wrap;">
            ${proj.contextLinks.githubRepo ? `
              <a href="${proj.contextLinks.githubRepo}" target="_blank" rel="noopener" class="context-link-btn" title="Repositório GitHub">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
                <span>GitHub</span>
              </a>
            ` : ''}
            ${proj.contextLinks.driveFolder ? `
              <a href="${proj.contextLinks.driveFolder}" target="_blank" rel="noopener" class="context-link-btn" title="Pasta no Drive">
                <span style="font-size: 1.1rem; line-height: 1;">📁</span>
                <span>Drive</span>
              </a>
            ` : ''}
            ${proj.contextLinks.hmlUrl ? `<a href="${proj.contextLinks.hmlUrl}" target="_blank" rel="noopener" class="context-link-btn" title="Ambiente de Homologação (HML)" style="border-color: rgba(234, 179, 8, 0.4); color: #facc15;">🧪 HML</a>` : ''}
            ${proj.contextLinks.liveUrl ? `<a href="${proj.contextLinks.liveUrl}" target="_blank" rel="noopener" class="context-link-btn" title="Ambiente Live (Produção)" style="border-color: rgba(16, 185, 129, 0.4); color: #10b981;">🚀 Live</a>` : ''}
            
            <div style="display: flex; gap: 0.4rem; align-items: center;">
              <button class="btn-icon" style="width: 28px; height: 28px; font-size: 0.8rem;" title="Compartilhar &amp; Colaboradores" onclick="window.anorakApp.openShareModal('${proj.id}')">🤝</button>
              <button class="btn-icon" style="width: 28px; height: 28px; font-size: 0.8rem;" title="Editar Projeto" onclick="window.anorakApp.openEditProjectModal('${proj.id}')">✏️</button>
              <button class="btn-icon" style="width: 28px; height: 28px; font-size: 0.8rem;" title="Exportar Relatório PDF" onclick="window.anorakApp.exportProjectReport('${proj.id}')">🖨️</button>
              <button class="btn-icon" style="width: 28px; height: 28px; font-size: 0.8rem;" title="Excluir Projeto" onclick="window.anorakApp.handleDeleteProject('${proj.id}')">🗑️</button>
            </div>
          </div>

          <!-- Painel Expansível de Auditoria (Governança) -->
          <div class="audit-collapse-section">
            <button class="audit-collapse-trigger" onclick="window.anorakApp.toggleAuditTimeline(this)">
              <span>📜 Trilha de Auditoria &amp; Histórico</span> <span>▼</span>
            </button>
            <div class="audit-timeline-content" style="display: none;">
              ${proj.validationHistory.length === 0 ? `
                <div style="font-size: 0.75rem; color: var(--text-muted); padding: 0.5rem 0;">Nenhum registro de auditoria disponível.</div>
              ` : `
                <div class="audit-timeline">
                  ${proj.validationHistory.map(log => `
                    <div class="timeline-entry">
                      <div class="timeline-badge">✓</div>
                      <div class="timeline-body">
                        <div class="timeline-header">
                          <span class="timeline-action">${this.escapeHTML(log.action || 'Validação de Etapa')}</span>
                          <span class="timeline-time">${new Date(log.timestamp).toLocaleString('pt-BR')}</span>
                        </div>
                        <p class="timeline-desc">"${this.escapeHTML(log.taskTitle || '')}" validada por <strong>${this.escapeHTML(log.by || 'Sistema')}</strong></p>
                      </div>
                    </div>
                  `).join('')}
                </div>
              `}
            </div>
          </div>
        </article>
      `;
    }).join('');

    this.initDragAndDrop();
  }

  renderGitTelemetry(proj) {
    if (!proj.contextLinks || !proj.contextLinks.githubRepo) {
      return '';
    }

    const parsed = syncEngine.parseGitHubUrl(proj.contextLinks.githubRepo);
    const repoDisplay = parsed ? `${parsed.owner}/${parsed.repo}` : 'Repositório';
    const cached = this.gitTelemetryCache.get(proj.id);
    
    if (!cached) {
      return `
        <div class="git-telemetry-box" data-git-telemetry="${proj.id}">
          <div class="git-telemetry-header">
            <span class="git-status-tag">
              <span class="git-pulse-dot loading"></span>
              <span>Git: Consultando <strong>${this.escapeHTML(repoDisplay)}</strong>...</span>
            </span>
            <button type="button" class="btn-git-sync github-sync-btn" style="padding: 2px 7px; font-size: 0.7rem;" title="Atualizar Git" onclick="window.anorakApp.handleRefreshGit('${proj.id}', event)">
              🔄 Atualizar Git
            </button>
          </div>
          <div class="git-commit-info" style="color: var(--text-muted); font-size: 0.72rem;">
            <span>Conectando ao repositório GitHub...</span>
          </div>
        </div>
      `;
    }

    if (cached.status === 'ok') {
      const owner = cached.owner || (parsed ? parsed.owner : '');
      const repo = cached.repo || (parsed ? parsed.repo : '');
      const shaShort = cached.shaShort || (cached.sha ? cached.sha.substring(0, 7) : 'commit');
      const shortMsg = cached.shortMessage || (cached.lastCommitMessage ? cached.lastCommitMessage.split('\n')[0] : 'Último commit');
      const commitUrl = cached.commitUrl || (parsed ? `https://github.com/${parsed.owner}/${parsed.repo}/commits` : '#');
      const author = cached.author || 'anônimo';
      const relativeTime = cached.relativeTime || syncEngine.getRelativeTime(cached.lastCommitDate);

      return `
        <div class="git-telemetry-box" data-git-telemetry="${proj.id}">
          <div class="git-telemetry-header">
            <span class="git-status-tag">
              <span class="git-pulse-dot"></span>
              <span>Git Online: <strong>${this.escapeHTML(owner)}/${this.escapeHTML(repo)}</strong></span>
            </span>
            <button type="button" class="btn-git-sync github-sync-btn" title="Atualizar Git em tempo real" onclick="window.anorakApp.handleRefreshGit('${proj.id}', event)">
              🔄 Atualizar Git
            </button>
          </div>
          <div class="git-commit-info">
            <a href="${commitUrl}" target="_blank" rel="noopener" class="git-commit-sha" title="Ver commit no GitHub">${this.escapeHTML(shaShort)}</a>
            <span class="git-commit-msg" title="${this.escapeHTML(cached.lastCommitMessage || shortMsg)}">${this.escapeHTML(shortMsg)}</span>
          </div>
          <div class="git-meta-footer">
            <span>👤 ${this.escapeHTML(author)}</span>
            <span>⏱️ ${this.escapeHTML(relativeTime)}</span>
          </div>
        </div>
      `;
    }

    // Caso de erro ou repositório privado
    const isRateOrAuth = cached.code === 403 || cached.code === 401 || cached.code === 404;
    return `
      <div class="git-telemetry-box" data-git-telemetry="${proj.id}">
        <div class="git-telemetry-header">
          <span class="git-status-tag" style="color: #f59e0b;">
            <span class="git-pulse-dot warning"></span>
            <span>Git: ${this.escapeHTML(cached.message || 'Aviso')}</span>
          </span>
          <div style="display: flex; gap: 4px; align-items: center;">
            <button type="button" class="btn-secondary" style="padding: 2px 7px; font-size: 0.7rem; border-color: rgba(245, 158, 11, 0.4); color: #f59e0b; background: rgba(245, 158, 11, 0.1); cursor: pointer;" title="Inserir Token de Acesso do GitHub" onclick="window.anorakApp.openGithubTokenModal('${proj.id}')">
              🔑 Inserir Token
            </button>
            <button type="button" class="btn-git-sync github-sync-btn" title="Tentar Novamente" onclick="window.anorakApp.handleRefreshGit('${proj.id}', event)">
              🔄
            </button>
          </div>
        </div>
        <div class="git-commit-info" style="font-size: 0.72rem; color: var(--text-muted); line-height: 1.4;">
          <span>${isRateOrAuth ? 'Repositório privado ou limite de 60 req/h atingido. <a href="help.html" target="_blank" style="color: var(--primary-cyan); text-decoration: underline;">Ver tutorial</a> ou clique em <strong>🔑 Inserir Token</strong>.' : 'Não foi possível obter commits do repositório.'}</span>
        </div>
      </div>
    `;
  }

  async handleRefreshGit(projectId, event) {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    const project = db.getById(projectId);
    if (!project || !project.contextLinks || !project.contextLinks.githubRepo) {
      this.showToast('Nenhum repositório GitHub configurado neste projeto.');
      return;
    }

    const clickedBtn = event ? event.currentTarget : null;
    if (clickedBtn) {
      clickedBtn.classList.add('spin-animation');
      clickedBtn.style.opacity = '0.5';
    }

    try {
      const data = await this.fetchGitTelemetryForProject(projectId, true);
      if (data && data.status === 'ok') {
        this.playCyberChime(750, 'sine', 0.2);
        this.showToast(`🐙 Git Atualizado! Último commit: "${data.shortMessage}" (${data.relativeTime})`);
      } else if (data && data.message) {
        this.showToast(`Aviso Git: ${data.message}`);
      }
    } catch (err) {
      this.showToast(`Erro ao consultar Git: ${err.message}`);
    } finally {
      if (clickedBtn) {
        clickedBtn.classList.remove('spin-animation');
        clickedBtn.style.opacity = '1';
      }
    }
  }

  async fetchGitTelemetryForProject(projectId, force = false) {
    const project = db.getById(projectId);
    if (!project || !project.contextLinks || !project.contextLinks.githubRepo) return null;

    try {
      const data = await syncEngine.pingGitHub(project.contextLinks.githubRepo, force);
      this.gitTelemetryCache.set(projectId, data);

      // Atualiza elemento dinâmico no DOM se já estiver renderizado
      const telemetryEl = document.querySelector(`[data-git-telemetry="${projectId}"]`);
      if (telemetryEl) {
        const temp = document.createElement('div');
        temp.innerHTML = this.renderGitTelemetry(project);
        const newEl = temp.firstElementChild;
        if (newEl) {
          telemetryEl.replaceWith(newEl);
        }
      }
      return data;
    } catch (e) {
      console.warn(`[Anorak Git Telemetry] Falha para ${projectId}:`, e.message);
      return null;
    }
  }

  initGitAutoFetch() {
    const projects = db.getByType(ItemType.PROJECT);
    for (const proj of projects) {
      if (proj.contextLinks && proj.contextLinks.githubRepo) {
        this.fetchGitTelemetryForProject(proj.id, false);
      }
    }
  }

  // =========================================================================
  // VIEW 4: PROJETOS CONCLUÍDOS / PRODUÇÃO COM REATIVAÇÃO
  // =========================================================================
  renderCompletedProjects() {
    const container = document.getElementById('completedProjectsContainer');
    if (!container) return;

    const allProjects = db.getByType(ItemType.PROJECT);
    const completedProjects = allProjects.filter(p => {
      const st = (p.status || '').toLowerCase();
      return st === 'concluido' || st.includes('conclui') || st.includes('produc');
    });

    if (completedProjects.length === 0) {
      container.innerHTML = `
        <div class="glass-panel" style="padding: 3rem 2rem; text-align: center; color: var(--text-muted); grid-column: 1/-1;">
          <div style="font-size: 2.5rem; margin-bottom: 0.75rem;">💎</div>
          <h3 style="color: var(--text-primary); margin-bottom: 0.5rem;">Nenhum Projeto Concluído Ainda</h3>
          <p style="font-size: 0.88rem; max-width: 520px; margin: 0 auto; line-height: 1.5;">Quando você finalizar 100% das etapas de homologação de um projeto ou marcar o status como Concluído, ele aparecerá aqui com seu histórico e chave de cristal garantida.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = completedProjects.map(proj => {
      const evo = proj.getEvolution();

      return `
        <article class="glass-panel project-card completed-card" data-project-id="${proj.id}" style="border-color: rgba(0, 242, 254, 0.35); box-shadow: 0 0 20px rgba(0, 242, 254, 0.08);">
          <div class="project-card-header">
            <div>
              <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 6px;">
                <span class="status-pill status-concluido" style="font-size: 0.72rem; font-weight: bold; background: rgba(0, 242, 254, 0.15); color: #00f2fe; border: 1px solid var(--primary-cyan); padding: 3px 8px; border-radius: 12px;">💎 PRODUÇÃO / CONCLUÍDO</span>
              </div>
              <h3 class="project-title" style="color: #fff; margin-bottom: 4px;">${this.escapeHTML(proj.title)}</h3>
              <p class="project-desc">${this.escapeHTML(proj.description || 'Sem descrição cadastrada.')}</p>
            </div>

            <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
              <button type="button" class="btn-magic" style="padding: 0.35rem 0.85rem; font-size: 0.8rem; background: linear-gradient(135deg, rgba(0, 242, 254, 0.25), rgba(168, 85, 247, 0.25)); border: 1px solid var(--primary-cyan); color: #00f2fe; font-weight: 700; display: inline-flex; align-items: center; gap: 0.35rem; cursor: pointer; transition: all 0.2s;" title="Reativar este projeto para Homologação e continuar evoluindo com novas tarefas" onclick="window.anorakApp.handleReopenProject('${proj.id}')">
                🚀 Reativar para Homologação
              </button>

              <div class="halliday-keys-box" title="Conquistas de Estágio: Chave de Cristal Desbloqueada">
                <span class="key-badge copper active">🗝️</span>
                <span class="key-badge jade active">🗝️</span>
                <span class="key-badge crystal active">💎</span>
              </div>
            </div>
          </div>

          <!-- Barra de Progresso / Conclusão -->
          <div class="phase-progress-wrap">
            <div class="gauge-holder" title="Progresso da Fase: 100%">
              ${this.renderMiniGauge(100)}
            </div>
            <div class="progress-details">
              <div class="progress-labels">
                <span>Status: <strong style="color: var(--primary-cyan);">CONCLUÍDO</strong></span>
                <span class="mono">${evo.completed}/${evo.total} etapas validadas</span>
              </div>
              <div class="progress-bar-bg">
                <div class="progress-bar-fill" style="width: 100%; background: linear-gradient(90deg, #00f2fe, #a855f7);"></div>
              </div>
            </div>
          </div>

          <!-- Widget Git Telemetry -->
          ${this.renderGitTelemetry(proj)}

          <!-- Footer com Links e Ações -->
          <div class="project-footer" style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap; margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid var(--glass-border);">
            <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
              ${proj.contextLinks.githubRepo ? `
                <a href="${proj.contextLinks.githubRepo}" target="_blank" rel="noopener" class="context-link-btn" title="Repositório GitHub">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
                  <span>GitHub</span>
                </a>
              ` : ''}
              ${proj.contextLinks.hmlUrl ? `<a href="${proj.contextLinks.hmlUrl}" target="_blank" rel="noopener" class="context-link-btn" title="Ambiente de Homologação (HML)" style="border-color: rgba(234, 179, 8, 0.4); color: #facc15;">🧪 HML</a>` : ''}
              ${proj.contextLinks.liveUrl ? `<a href="${proj.contextLinks.liveUrl}" target="_blank" rel="noopener" class="context-link-btn" title="Ambiente Live (Produção)" style="border-color: rgba(16, 185, 129, 0.4); color: #10b981;">🚀 Live</a>` : ''}
            </div>

            <div style="display: flex; gap: 0.4rem; align-items: center;">
              <button class="btn-icon" style="width: 28px; height: 28px; font-size: 0.8rem;" title="Compartilhar &amp; Colaboradores" onclick="window.anorakApp.openShareModal('${proj.id}')">🤝</button>
              <button class="btn-icon" style="width: 28px; height: 28px; font-size: 0.8rem;" title="Editar Projeto" onclick="window.anorakApp.openEditProjectModal('${proj.id}')">✏️</button>
              <button class="btn-icon" style="width: 28px; height: 28px; font-size: 0.8rem;" title="Exportar Relatório PDF" onclick="window.anorakApp.exportProjectReport('${proj.id}')">🖨️</button>
            </div>
          </div>
        </article>
      `;
    }).join('');
  }

  handleReopenProject(projectId) {
    const project = db.getById(projectId);
    if (!project) return;

    project.status = ProjectStatus.HOMOLOGATION;
    project.updatedAt = new Date().toISOString();

    const currentBy = this.currentUser ? this.currentUser.username : 'sistema';
    if (!project.validationHistory) project.validationHistory = [];
    project.validationHistory.unshift({
      timestamp: new Date().toISOString(),
      action: 'Projeto Reativado para Homologação',
      taskTitle: 'Reabertura para Nova Fase de Evolução',
      taskId: 'reactivate',
      by: currentBy
    });

    db.save(project);
    this.playCyberChime(880, 'sine', 0.25);
    this.showToast(`🚀 Projeto "${project.title}" reativado para Homologação com sucesso!`);
    this.render();
    this.switchMode('operational');
  }

  handleToggleTask(projectId, taskId) {
    const project = db.getById(projectId);
    if (!project) return;

    const username = this.currentUser ? this.currentUser.username : 'sistema';
    const task = project.toggleTask(taskId, username);
    db.save(project);
    this.playCyberChime(task && task.completed ? 880 : 380, 'sine', 0.15);

    if (task && task.completed) {
      this.showToast(`Etapa "${task.title}" homologada!`);
    }

    this.render();
    this.renderDecisionMatrix();
  }

  handleSetAssignee(projectId, username) {
    const project = db.getById(projectId);
    if (!project) return;

    const currentBy = this.currentUser ? this.currentUser.username : 'sistema';
    project.setAssignedTo(username, currentBy);
    db.save(project);
    this.showToast(`Responsável atualizado: @${username}`);
    this.render();
  }

  openEvidenceModal(projectId, taskId) {
    const modal = document.getElementById('modalEvidence');
    const inputProjId = document.getElementById('evidenceProjId');
    const inputTaskId = document.getElementById('evidenceTaskId');

    if (inputProjId) inputProjId.value = projectId;
    if (inputTaskId) inputTaskId.value = taskId;

    // Reset fields
    const fileInput = document.getElementById('inputEvidenceFile');
    const urlInput = document.getElementById('inputEvidenceUrl');
    const urlNameInput = document.getElementById('inputEvidenceUrlName');
    if (fileInput) fileInput.value = '';
    if (urlInput) urlInput.value = '';
    if (urlNameInput) urlNameInput.value = '';

    // Reset radio selection
    const radioFile = document.querySelector('input[name="evidenceType"][value="file"]');
    const radioLink = document.querySelector('input[name="evidenceType"][value="link"]');
    
    if (this.currentUser && this.currentUser.plan === 'explorer') {
      if (radioFile) radioFile.disabled = true;
      if (radioLink) {
        radioLink.checked = true;
        radioLink.dispatchEvent(new Event('change'));
      }
      this.showToast('Upload de arquivo desativado no plano Grátis. Por favor, use link externo.');
    } else {
      if (radioFile) {
        radioFile.disabled = false;
        radioFile.checked = true;
        radioFile.dispatchEvent(new Event('change'));
      }
    }

    if (modal) modal.classList.add('active');
  }

  async saveEvidence() {
    const projectId = document.getElementById('evidenceProjId').value;
    const taskId = document.getElementById('evidenceTaskId').value;
    const type = document.querySelector('input[name="evidenceType"]:checked').value;
    const username = this.currentUser ? this.currentUser.username : 'sistema';

    const project = db.getById(projectId);
    if (!project) return;

    if (type === 'file') {
      const fileInput = document.getElementById('inputEvidenceFile');
      if (!fileInput.files || fileInput.files.length === 0) {
        alert('Por favor, selecione um arquivo.');
        return;
      }

      const file = fileInput.files[0];
      const formData = new FormData();
      formData.append('evidence_file', file);

      this.showToast('Enviando arquivo ao servidor...');

      try {
        const res = await fetch('api/upload_evidence.php', {
          method: 'POST',
          body: formData
        });

        if (res.ok) {
          const result = await res.json();
          if (result.status === 'success') {
            project.addEvidence(taskId, { type: 'file', path: result.path, name: result.name }, username);
            db.save(project);
            this.showToast('Evidência anexada com sucesso!');
            document.getElementById('modalEvidence').classList.remove('active');
            this.render();
          } else {
            alert('Erro no servidor: ' + result.message);
          }
        } else {
          const errData = await res.json().catch(() => ({ message: 'Erro desconhecido' }));
          alert('Falha no upload: ' + errData.message);
        }
      } catch (err) {
        console.error(err);
        alert('Erro de conexão ao enviar evidência. Certifique-se de estar online.');
      }
    } else {
      const urlInput = document.getElementById('inputEvidenceUrl');
      const urlNameInput = document.getElementById('inputEvidenceUrlName');
      const url = urlInput.value.trim();
      const name = urlNameInput.value.trim();

      if (!url || !name) {
        alert('Por favor, preencha a URL e o título do link.');
        return;
      }

      project.addEvidence(taskId, { type: 'link', path: url, name: name }, username);
      db.save(project);
      this.showToast('Link de evidência anexado!');
      document.getElementById('modalEvidence').classList.remove('active');
      this.render();
    }
  }

  handleRemoveEvidence(projectId, taskId) {
    const project = db.getById(projectId);
    if (!project) return;

    if (confirm('Tem certeza que deseja excluir esta evidência?')) {
      const username = this.currentUser ? this.currentUser.username : 'sistema';
      project.removeEvidence(taskId, username);
      db.save(project);
      this.showToast('Evidência removida.');
      this.render();
    }
  }

  toggleAuditTimeline(button) {
    const content = button.nextElementSibling;
    const arrow = button.querySelector('span:last-child');
    if (content) {
      const isHidden = content.style.display === 'none';
      content.style.display = isHidden ? 'block' : 'none';
      if (arrow) arrow.textContent = isHidden ? '▲' : '▼';
    }
  }

  exportProjectReport(projectId) {
    const proj = db.getById(projectId);
    if (!proj) return;

    const evo = proj.getEvolution();
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Por favor, permita popups para este site para exportar o relatório.');
      return;
    }

    const tasksHtml = proj.tasks.map(t => `
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;">${this.escapeHTML(t.category)}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${this.escapeHTML(t.title)}</td>
        <td class="status ${t.completed ? 'completed' : 'pending'}" style="padding: 8px; border: 1px solid #ddd; font-weight: bold; color: ${t.completed ? 'green' : 'orange'};">${t.completed ? 'HOMOLOGADO' : 'PENDENTE'}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${t.validatedAt ? new Date(t.validatedAt).toLocaleDateString('pt-BR') + ' ' + new Date(t.validatedAt).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'}) : '-'}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${t.evidence ? this.escapeHTML(t.evidence.name) + ' (' + (t.evidence.type === 'file' ? 'Arquivo' : 'Link') + ')' : '-'}</td>
      </tr>
    `).join('');

    const historyHtml = proj.validationHistory.map(log => `
      <div class="history-row" style="padding: 8px 0; border-bottom: 1px dashed #eee; font-size: 13px;">
        <span class="time" style="color: #666; margin-right: 15px; font-family: monospace;">${new Date(log.timestamp).toLocaleDateString('pt-BR')} ${new Date(log.timestamp).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}</span>
        <span class="user" style="font-weight: bold; color: #0284c7; margin-right: 15px;">@${this.escapeHTML(log.by || 'sistema')}</span>
        <span class="action"><strong>${this.escapeHTML(log.action)}</strong>: ${this.escapeHTML(log.taskTitle || '')} ${log.details ? ' (' + this.escapeHTML(log.details) + ')' : ''}</span>
      </div>
    `).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Relatório de Homologação - Anorak OASIS</title>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; margin: 40px; line-height: 1.5; font-size: 14px; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
          .header h1 { margin: 0; font-size: 24px; color: #111; letter-spacing: 0.05em; }
          .header .brand { font-size: 12px; text-transform: uppercase; color: #666; }
          .meta-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-bottom: 30px; background: #f9f9f9; padding: 20px; border-radius: 6px; border: 1px solid #eee; }
          .meta-item { display: flex; flex-direction: column; }
          .meta-item label { font-size: 11px; text-transform: uppercase; color: #666; font-weight: bold; margin-bottom: 4px; }
          .meta-item span { font-size: 14px; color: #111; }
          .section-title { font-size: 18px; margin-top: 30px; margin-bottom: 15px; border-bottom: 1px solid #ccc; padding-bottom: 5px; color: #222; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          th { background: #f5f5f5; font-weight: bold; font-size: 12px; text-transform: uppercase; }
          .signature-section { margin-top: 60px; display: flex; justify-content: space-between; }
          .signature-box { border-top: 1px solid #333; width: 45%; text-align: center; padding-top: 10px; margin-top: 40px; }
          .signature-box label { font-size: 11px; color: #666; text-transform: uppercase; display: block; margin-top: 4px; }
          @media print {
            body { margin: 20px; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1>ANORAK — RELATÓRIO DE HOMOLOGAÇÃO</h1>
            <span class="brand">OASIS Project Hub &amp; Governance Center</span>
          </div>
          <div class="no-print">
            <button onclick="window.print()" style="padding: 8px 16px; background: #0284c7; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer;">Imprimir Relatório (PDF)</button>
          </div>
        </div>

        <div class="meta-grid">
          <div class="meta-item">
            <label>Projeto</label>
            <span>${this.escapeHTML(proj.title)}</span>
          </div>
          <div class="meta-item">
            <label>Responsável Atribuído</label>
            <span>@${this.escapeHTML(proj.assignedTo || 'Não atribuído')}</span>
          </div>
          <div class="meta-item" style="grid-column: 1 / -1;">
            <label>Descrição e Escopo</label>
            <span>${this.escapeHTML(proj.description || 'Sem descrição')}</span>
          </div>
          <div class="meta-item">
            <label>Estágio Atual / Status</label>
            <span style="text-transform: uppercase; font-weight: bold;">${this.escapeHTML(proj.status)}</span>
          </div>
          <div class="meta-item">
            <label>Progresso de Validação</label>
            <span>${evo.completed} de ${evo.total} etapas concluídas (${evo.percentage}%)</span>
          </div>
        </div>

        <div class="section-title">Checklist de Homologação e Evidências</div>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
          <thead>
            <tr>
              <th style="width: 15%; padding: 8px; border: 1px solid #ddd; text-align: left;">Categoria</th>
              <th style="width: 45%; padding: 8px; border: 1px solid #ddd; text-align: left;">Etapa / Descrição</th>
              <th style="width: 15%; padding: 8px; border: 1px solid #ddd; text-align: left;">Status</th>
              <th style="width: 15%; padding: 8px; border: 1px solid #ddd; text-align: left;">Data de Validação</th>
              <th style="width: 10%; padding: 8px; border: 1px solid #ddd; text-align: left;">Evidência</th>
            </tr>
          </thead>
          <tbody>
            ${tasksHtml}
          </tbody>
        </table>

        <div class="section-title">Histórico de Alterações e Trilha de Auditoria</div>
        <div class="history-container" style="margin-bottom: 40px;">
          ${historyHtml}
        </div>

        <div class="signature-section" style="margin-top: 60px; display: flex; justify-content: space-between;">
          <div class="signature-box" style="border-top: 1px solid #333; width: 45%; text-align: center; padding-top: 10px; margin-top: 40px;">
            <span>_______________________________________</span><br>
            <strong>@${this.escapeHTML(proj.assignedTo || 'Responsável')}</strong>
            <label style="font-size: 11px; color: #666; text-transform: uppercase; display: block; margin-top: 4px;">Responsável Técnico</label>
          </div>
          <div class="signature-box" style="border-top: 1px solid #333; width: 45%; text-align: center; padding-top: 10px; margin-top: 40px;">
            <span>_______________________________________</span><br>
            <strong>@${this.escapeHTML(this.currentUser ? this.currentUser.username : 'admin')}</strong>
            <label style="font-size: 11px; color: #666; text-transform: uppercase; display: block; margin-top: 4px;">Auditor do Projeto / Líder</label>
          </div>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
  }

  promptAddTask(projectId) {
    const title = prompt('Digite o nome da nova etapa de homologação:');
    if (!title || !title.trim()) return;

    const project = db.getById(projectId);
    if (!project) return;

    project.tasks.push({
      id: 'task_' + Math.random().toString(36).substr(2, 6),
      title: title.trim(),
      category: 'Geral',
      completed: false,
      status: 'pendente',
      evidence: null
    });

    db.save(project);
    this.showToast('Nova etapa adicionada à homologação!');
    this.render();
  }

  handleDeleteProject(projectId) {
    const proj = db.getById(projectId);
    if (!proj) return;
    if (confirm(`Tem certeza que deseja excluir o projeto "\${proj.title}"?`)) {
      db.delete(projectId);
      this.showToast('Projeto removido.');
      this.render();
    }
  }

  // =========================================================================
  // MODO INCUBADORA (Repositório de Ideias & Promotor)
  // =========================================================================
  renderIncubatorIdeas() {
    const container = document.getElementById('ideasContainer');
    if (!container) return;

    const ideas = db.getByType(ItemType.IDEA);
    const tagsContainer = document.getElementById('ideaTagsFilter');

    // Renderiza tags dinâmicas
    const allTags = new Set();
    ideas.forEach(i => (i.tags || []).forEach(t => allTags.add(t)));

    if (tagsContainer) {
      tagsContainer.innerHTML = `
        <button class="tag-btn ${this.currentTagFilter === 'all' ? 'active' : ''}" onclick="window.anorakApp.setTagFilter('all')">Todas</button>
        ${Array.from(allTags).map(tag => `
          <button class="tag-btn ${this.currentTagFilter === tag ? 'active' : ''}" onclick="window.anorakApp.setTagFilter('${tag}')">#${this.escapeHTML(tag)}</button>
        `).join('')}
      `;
    }

    const filteredIdeas = this.currentTagFilter === 'all'
      ? ideas
      : ideas.filter(i => (i.tags || []).includes(this.currentTagFilter));

    if (filteredIdeas.length === 0) {
      container.innerHTML = `<div class="glass-panel" style="padding: 2rem; grid-column: 1/-1; text-align: center; color: var(--text-muted);">Nenhuma ideia encontrada para este filtro. Use o Snapshot para capturar uma nova ideia!</div>`;
      return;
    }

    container.innerHTML = filteredIdeas.map(idea => {
      const badgeClass = idea.status === IdeaStatus.PRIORITIZED ? 'prioritized' : (idea.status === IdeaStatus.DRAFT ? 'draft' : 'backlog');
      const badgeLabel = idea.status === IdeaStatus.PRIORITIZED ? '⚡ Priorizado' : (idea.status === IdeaStatus.DRAFT ? '📝 Rascunho' : '📦 Backlog');

      const dateStr = idea.createdAt ? new Date(idea.createdAt).toLocaleDateString('pt-BR') : '';
      const timeStr = idea.createdAt ? new Date(idea.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
      const formattedDate = dateStr ? `📅 ${dateStr} às ${timeStr}` : '';

      return `
        <article class="glass-panel idea-card" data-idea-id="${idea.id}">
          <div class="idea-header">
            <h4 class="idea-title">${this.escapeHTML(idea.title)}</h4>
            <span class="badge ${badgeClass}">${badgeLabel}</span>
          </div>

          ${formattedDate ? `
            <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: -6px; margin-bottom: 8px; font-family: var(--font-mono); display: flex; align-items: center; gap: 4px;">
              ${formattedDate}
            </div>
          ` : ''}

          <div class="idea-body">${this.escapeHTML(idea.description)}</div>

          ${(idea.tags && idea.tags.length > 0) ? `
            <div class="idea-tags">
              ${idea.tags.map(t => `<span class="idea-tag-pill">#${this.escapeHTML(t)}</span>`).join('')}
            </div>
          ` : ''}

          <div class="idea-actions">
            <button class="btn-promote" onclick="window.anorakApp.openPromoteModal('${idea.id}')">
              <span>🚀 Promover a Projeto</span>
            </button>
            <div style="display: flex; gap: 0.4rem;">
              <button class="btn-icon" style="width: 28px; height: 28px; font-size: 0.75rem;" title="Editar Ideia" onclick="window.anorakApp.openEditIdeaModal('${idea.id}')">✏️</button>
              <button class="btn-icon" style="width: 28px; height: 28px; font-size: 0.75rem;" title="Excluir Ideia" onclick="window.anorakApp.handleDeleteIdea('${idea.id}')">🗑️</button>
            </div>
          </div>
        </article>
      `;
    }).join('');
  }

  setTagFilter(tag) {
    this.currentTagFilter = tag;
    this.renderIncubatorIdeas();
  }

  handleDeleteIdea(ideaId) {
    if (confirm('Tem certeza que deseja excluir esta ideia?')) {
      db.delete(ideaId);
      this.showToast('Ideia excluída.');
      this.render();
    }
  }

  openEditIdeaModal(ideaId) {
    const idea = db.getById(ideaId);
    if (!idea) return;

    const modal = document.getElementById('modalEditIdea');
    if (modal) {
      document.getElementById('editIdeaId').value = idea.id;
      document.getElementById('editIdeaTitle').value = idea.title;
      document.getElementById('editIdeaDesc').value = idea.description || '';
      document.getElementById('editIdeaTags').value = (idea.tags || []).join(', ');
      
      const prioritySelect = document.getElementById('editIdeaPriority');
      if (prioritySelect) {
        if (idea.status === IdeaStatus.PRIORITIZED) {
          prioritySelect.value = 'alta';
        } else if (idea.status === IdeaStatus.DRAFT) {
          prioritySelect.value = 'media';
        } else {
          prioritySelect.value = 'baixa';
        }
      }
      modal.classList.add('active');
    }
  }

  saveEditIdea() {
    const id = document.getElementById('editIdeaId').value;
    const title = document.getElementById('editIdeaTitle').value.trim();
    const description = document.getElementById('editIdeaDesc').value.trim();
    const tagsInput = document.getElementById('editIdeaTags').value;
    const priority = document.getElementById('editIdeaPriority').value;

    if (!title) return;

    const idea = db.getById(id);
    if (!idea) return;

    idea.title = title;
    idea.description = description;
    idea.tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
    
    if (priority === 'alta') {
      idea.status = IdeaStatus.PRIORITIZED;
      idea.priority = 'alta';
    } else if (priority === 'baixa') {
      idea.status = IdeaStatus.BACKLOG;
      idea.priority = 'baixa';
    } else {
      idea.status = IdeaStatus.DRAFT;
      idea.priority = 'media';
    }

    db.save(idea);
    document.getElementById('modalEditIdea').classList.remove('active');
    this.showToast(`Ideia "${title}" atualizada!`);
    this.render();
  }

  // =========================================================================
  // PROMOVER IDEIA A PROJETO (WIZARD GUIADO)
  // =========================================================================
  openPromoteModal(ideaId) {
    const idea = db.getById(ideaId);
    if (!idea) return;

    const modal = document.getElementById('modalPromote');
    const inputId = document.getElementById('promoteIdeaId');
    const inputTitle = document.getElementById('promoteTitle');
    const inputDesc = document.getElementById('promoteDescription');
    const inputDrive = document.getElementById('promoteDriveLink');
    const inputGithub = document.getElementById('promoteGithubLink');

    if (inputId) inputId.value = idea.id;
    if (inputTitle) inputTitle.value = idea.title;
    if (inputDesc) inputDesc.value = idea.description;
    if (inputDrive) inputDrive.value = idea.contextLinks.driveFolder || '';
    if (inputGithub) inputGithub.value = idea.contextLinks.githubRepo || '';

    if (modal) modal.classList.add('active');
  }

  executePromoteIdea() {
    const ideaId = document.getElementById('promoteIdeaId').value;
    const title = document.getElementById('promoteTitle').value.trim();
    const description = document.getElementById('promoteDescription').value.trim();
    const driveFolder = document.getElementById('promoteDriveLink').value.trim();
    const githubRepo = document.getElementById('promoteGithubLink').value.trim();
    const generateDefaultChecklist = document.getElementById('promoteChecklistTemplate').checked;

    if (!title) return;

    // Gera tarefas de homologação padrão inteligentes
    const defaultTasks = generateDefaultChecklist ? [
      { id: 't_p1', title: 'Definição de escopo e arquitetura técnica', category: 'Planejamento', completed: true, validatedAt: new Date().toISOString() },
      { id: 't_p2', title: 'Configuração do ambiente e repositório Git', category: 'Ambiente', completed: false },
      { id: 't_p3', title: 'Desenvolvimento do MVP e testes de integração', category: 'Desenvolvimento', completed: false },
      { id: 't_p4', title: 'Deploy no Hostinger e homologação de rotas', category: 'Deploy', completed: false },
      { id: 't_p5', title: 'Validação final de aceite e entrega', category: 'QA', completed: false }
    ] : [];

    // Converte a entidade de Ideia para Projeto
    const newProject = new Item({
      id: ideaId.startsWith('proj_') ? ideaId : 'proj_' + ideaId,
      type: ItemType.PROJECT,
      title,
      description,
      status: ProjectStatus.HOMOLOGATION,
      priority: 'alta',
      impact: 'alto',
      urgency: 'alta',
      tags: ['Promovido da Incubadora'],
      contextLinks: { driveFolder, githubRepo, liveUrl: '' },
      tasks: defaultTasks
    });

    // Se o ID original era da ideia, removemos a ideia e inserimos o novo projeto
    db.delete(ideaId);
    db.save(newProject);

    document.getElementById('modalPromote').classList.remove('active');
    this.playCyberChime(900, 'triangle', 0.3);
    this.showToast(`Ideia promovida com sucesso ao Projeto "${title}"!`);

    // Redireciona para a visão operacional e consulta o Git se houver repositório
    this.switchMode('operational');
    if (githubRepo) {
      this.fetchGitTelemetryForProject(newProject.id, true);
    }
  }

  // =========================================================================
  // MATRIZ DE DECISÃO ("Onde investir meu tempo hoje?") & DRAG & DROP
  // =========================================================================
  renderDecisionMatrix() {
    const analysis = this.decisionMatrix.analyze();
    const { quadrants, advice } = analysis;

    const renderList = (items, quadKey) => {
      if (!items || items.length === 0) return '<div style="font-size: 0.75rem; color: var(--text-muted); padding: 0.5rem 0;">Nenhum item nesta zona. Arraste cards aqui!</div>';
      return items.map(i => `
        <div class="quadrant-item" draggable="true" data-item-id="${i.id}" data-current-quadrant="${quadKey}" onclick="window.anorakApp.navigateToProject('${i.id}')" title="Arraste para mover de quadrante (Exclusivo Legend) ou clique para abrir">
          <span class="drag-handle" style="font-size: 0.75rem; opacity: 0.6; margin-right: 4px;">⋮⋮</span>
          <strong>${this.escapeHTML(i.title)}</strong>
        </div>
      `).join('');
    };

    const q1El = document.getElementById('quadrantQ1');
    const q2El = document.getElementById('quadrantQ2');
    const q3El = document.getElementById('quadrantQ3');
    const q4El = document.getElementById('quadrantQ4');

    if (q1El) {
      if (q1El.parentElement) q1El.parentElement.dataset.quadrant = 'q1';
      q1El.innerHTML = renderList(quadrants.q1, 'q1');
    }
    if (q2El) {
      if (q2El.parentElement) q2El.parentElement.dataset.quadrant = 'q2';
      q2El.innerHTML = renderList(quadrants.q2, 'q2');
    }
    if (q3El) {
      if (q3El.parentElement) q3El.parentElement.dataset.quadrant = 'q3';
      q3El.innerHTML = renderList(quadrants.q3, 'q3');
    }
    if (q4El) {
      if (q4El.parentElement) q4El.parentElement.dataset.quadrant = 'q4';
      q4El.innerHTML = renderList(quadrants.q4, 'q4');
    }

    const adviceQuoteEl = document.getElementById('advisorQuote');
    if (adviceQuoteEl) {
      adviceQuoteEl.textContent = `"${advice.message}"`;
    }

    this.initDragAndDrop();
  }

  isLegendUser() {
    if (!this.currentUser) return false;
    const plan = (this.currentUser.plan || '').toLowerCase();
    const role = (this.currentUser.role || '').toLowerCase();
    const username = (this.currentUser.username || '').toLowerCase();
    return plan === 'legend' || role === 'admin' || username === 'admin' || username === 'mario.henrique' || username === 'mariozinhocs';
  }

  showLegendUpgradePrompt(customMsg) {
    this.playCyberChime(350, 'sawtooth', 0.2);
    const modalUpgrade = document.getElementById('modalUpgrade');
    if (modalUpgrade) {
      const selectPlan = document.getElementById('selectUpgradePlan');
      if (selectPlan) selectPlan.value = 'legend';
      this.updateCheckoutPrice();
      modalUpgrade.classList.add('active');
    }
    this.showToast(`👑 Recurso Legend: ${customMsg || 'Faça upgrade para o plano Legend para desbloquear este recurso.'}`);
  }

  initDragAndDrop() {
    const isLegend = this.isLegendUser();

    // =========================================================================
    // 1. REORDENAÇÃO DE PROJETOS NO GRID / LISTA
    // =========================================================================
    const projectCards = document.querySelectorAll('.project-card, .project-list-row');

    projectCards.forEach(card => {
      const handle = card.querySelector('.drag-handle');
      
      // Feedback no manipulador de arrasto para não-Legends
      if (handle) {
        handle.style.cursor = isLegend ? 'grab' : 'pointer';
        handle.onclick = (e) => {
          if (!isLegend) {
            e.stopPropagation();
            e.preventDefault();
            this.showLegendUpgradePrompt('A reorganização livre de cards por arrastar e soltar é exclusiva do plano Anorak Legend.');
          }
        };
      }

      // Torna o card arrastável
      card.setAttribute('draggable', isLegend ? 'true' : 'false');

      // Drag Start
      card.addEventListener('dragstart', (e) => {
        if (!isLegend) {
          e.preventDefault();
          this.showLegendUpgradePrompt('A reorganização livre de cards por arrastar e soltar é exclusiva do plano Anorak Legend.');
          return false;
        }

        // Não inicia drag se clicou em elementos interativos internos
        if (e.target.closest('button, select, input, a, .checklist-items, .audit-collapse-section')) {
          e.preventDefault();
          return false;
        }

        this.draggedProjectId = card.dataset.projectId;
        card.classList.add('dragging');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', this.draggedProjectId);
        }
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        document.querySelectorAll('.project-card, .project-list-row').forEach(c => {
          c.classList.remove('drag-over-before', 'drag-over-after');
        });
      });

      card.addEventListener('dragover', (e) => {
        if (!isLegend || !this.draggedProjectId || this.draggedProjectId === card.dataset.projectId) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

        const rect = card.getBoundingClientRect();
        const isGrid = this.projectLayoutMode === 'grid';

        if (isGrid) {
          const midX = rect.left + rect.width / 2;
          if (e.clientX < midX) {
            card.classList.add('drag-over-before');
            card.classList.remove('drag-over-after');
          } else {
            card.classList.add('drag-over-after');
            card.classList.remove('drag-over-before');
          }
        } else {
          const midY = rect.top + rect.height / 2;
          if (e.clientY < midY) {
            card.classList.add('drag-over-before');
            card.classList.remove('drag-over-after');
          } else {
            card.classList.add('drag-over-after');
            card.classList.remove('drag-over-before');
          }
        }
      });

      card.addEventListener('dragleave', () => {
        card.classList.remove('drag-over-before', 'drag-over-after');
      });

      card.addEventListener('drop', (e) => {
        if (!isLegend || !this.draggedProjectId) return;
        e.preventDefault();
        e.stopPropagation();

        const sourceId = this.draggedProjectId;
        const targetId = card.dataset.projectId;
        this.draggedProjectId = null;

        const isAfter = card.classList.contains('drag-over-after');
        card.classList.remove('drag-over-before', 'drag-over-after');

        if (sourceId && targetId && sourceId !== targetId) {
          const allOperational = Array.from(document.querySelectorAll('.project-card, .project-list-row'))
            .map(el => el.dataset.projectId)
            .filter(Boolean);

          const sourceIdx = allOperational.indexOf(sourceId);
          const targetIdx = allOperational.indexOf(targetId);

          if (sourceIdx !== -1 && targetIdx !== -1) {
            allOperational.splice(sourceIdx, 1);
            
            const newTargetIdx = allOperational.indexOf(targetId);
            const insertIdx = isAfter ? newTargetIdx + 1 : newTargetIdx;

            allOperational.splice(insertIdx, 0, sourceId);

            db.reorderItems(ItemType.PROJECT, allOperational);
            this.playCyberChime(750, 'sine', 0.15);
            this.showToast('✨ Nova ordem de cards salva no OASIS!');
            this.renderOperationalProjects();
          }
        }
      });

      // Suporte a Touch Drag para Dispositivos Mobile
      if (handle && isLegend) {
        let touchMoved = false;

        handle.addEventListener('touchstart', () => {
          touchMoved = false;
          this.draggedProjectId = card.dataset.projectId;
          card.classList.add('dragging');
        }, { passive: true });

        handle.addEventListener('touchmove', (e) => {
          touchMoved = true;
          const touch = e.touches[0];
          const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
          const dropCard = targetEl ? targetEl.closest('.project-card, .project-list-row') : null;

          document.querySelectorAll('.project-card, .project-list-row').forEach(c => {
            if (c !== dropCard) c.classList.remove('drag-over-before', 'drag-over-after');
          });

          if (dropCard && dropCard !== card) {
            const rect = dropCard.getBoundingClientRect();
            if (touch.clientY < rect.top + rect.height / 2) {
              dropCard.classList.add('drag-over-before');
              dropCard.classList.remove('drag-over-after');
            } else {
              dropCard.classList.add('drag-over-after');
              dropCard.classList.remove('drag-over-before');
            }
          }
        }, { passive: true });

        handle.addEventListener('touchend', (e) => {
          card.classList.remove('dragging');
          if (touchMoved && this.draggedProjectId) {
            const touch = e.changedTouches[0];
            const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
            const dropCard = targetEl ? targetEl.closest('.project-card, .project-list-row') : null;

            if (dropCard && dropCard.dataset.projectId && dropCard.dataset.projectId !== this.draggedProjectId) {
              const sourceId = this.draggedProjectId;
              const targetId = dropCard.dataset.projectId;
              const isAfter = dropCard.classList.contains('drag-over-after');

              const allOperational = Array.from(document.querySelectorAll('.project-card, .project-list-row'))
                .map(el => el.dataset.projectId)
                .filter(Boolean);

              const sourceIdx = allOperational.indexOf(sourceId);
              const targetIdx = allOperational.indexOf(targetId);

              if (sourceIdx !== -1 && targetIdx !== -1) {
                allOperational.splice(sourceIdx, 1);
                
                const newTargetIdx = allOperational.indexOf(targetId);
                const insertIdx = isAfter ? newTargetIdx + 1 : newTargetIdx;

                allOperational.splice(insertIdx, 0, sourceId);

                db.reorderItems(ItemType.PROJECT, allOperational);
                this.playCyberChime(750, 'sine', 0.15);
                this.showToast('✨ Nova ordem de cards salva no OASIS!');
                this.renderOperationalProjects();
              }
            }
          }
          this.draggedProjectId = null;
          document.querySelectorAll('.project-card, .project-list-row').forEach(c => {
            c.classList.remove('drag-over-before', 'drag-over-after');
          });
        });
      }
    });

    // =========================================================================
    // 2. MATRIZ HALLIDAY (MOVIMENTAÇÃO LIVRE ENTRE QUADRANTES)
    // =========================================================================
    const matrixQuadrants = document.querySelectorAll('.matrix-quadrant');
    const quadrantItems = document.querySelectorAll('.quadrant-item');

    quadrantItems.forEach(itemEl => {
      itemEl.setAttribute('draggable', isLegend ? 'true' : 'false');

      itemEl.addEventListener('dragstart', (e) => {
        if (!isLegend) {
          e.preventDefault();
          this.showLegendUpgradePrompt('A movimentação manual de itens entre quadrantes é exclusiva do plano Anorak Legend.');
          return false;
        }
        this.draggedMatrixItemId = itemEl.dataset.itemId;
        itemEl.classList.add('dragging');
        if (e.dataTransfer) {
          e.dataTransfer.setData('text/plain', this.draggedMatrixItemId);
        }
      });

      itemEl.addEventListener('dragend', () => {
        itemEl.classList.remove('dragging');
        matrixQuadrants.forEach(q => q.classList.remove('drag-over'));
      });
    });

    matrixQuadrants.forEach(quadEl => {
      quadEl.addEventListener('dragover', (e) => {
        if (!isLegend || !this.draggedMatrixItemId) return;
        e.preventDefault();
        quadEl.classList.add('drag-over');
      });

      quadEl.addEventListener('dragleave', () => {
        quadEl.classList.remove('drag-over');
      });

      quadEl.addEventListener('drop', (e) => {
        if (!isLegend || !this.draggedMatrixItemId) return;
        e.preventDefault();
        quadEl.classList.remove('drag-over');

        const itemId = this.draggedMatrixItemId;
        const targetQuadrant = quadEl.dataset.quadrant;
        this.draggedMatrixItemId = null;

        if (itemId && targetQuadrant) {
          const item = db.getById(itemId);
          if (item) {
            item.quadrant = targetQuadrant;
            db.save(item);
            this.playCyberChime(820, 'sine', 0.2);
            this.showToast(`🧭 Item movido para o quadrante ${targetQuadrant.toUpperCase()} com sucesso!`);
            this.renderDecisionMatrix();
          }
        }
      });
    });
  }

  navigateToProject(projectId) {
    if (!projectId) return;

    // 1. Alterna para o modo operacional se estiver na incubadora ou matriz
    this.switchMode('operational');

    // 2. Reseta o filtro de status para garantir visibilidade
    const filterSelect = document.getElementById('filterStatus');
    if (filterSelect && filterSelect.value !== 'todos') {
      filterSelect.value = 'todos';
      this.currentStatusFilter = 'todos';
      this.render();
    }

    // 3. Rola suavemente até o projeto e aplica o destaque neon
    setTimeout(() => {
      const card = document.querySelector(`[data-project-id="${projectId}"]`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('highlight-pulse');
        setTimeout(() => card.classList.remove('highlight-pulse'), 2500);
      }
    }, 120);
  }

  // =========================================================================
  // SNAPSHOT / QUICK CAPTURE & VOZ
  // =========================================================================
  openQuickCaptureModal() {
    const modal = document.getElementById('modalQuickCapture');
    if (modal) {
      modal.classList.add('active');
      const input = document.getElementById('quickIdeaTitle');
      if (input) setTimeout(() => input.focus(), 150);
    }
  }

  toggleVoiceRecording() {
    // 1. Bloqueio para plano Explorer (Grátis)
    if (this.currentUser && this.currentUser.plan === 'explorer') {
      this.showToast('A captura por voz exige upgrade para plano Creator, Master ou Legend!');
      return;
    }

    // 2. Verificação de limites diários
    const limit = this.getVoiceLimit(this.currentUser ? this.currentUser.plan : 'creator');
    const today = new Date().toDateString();
    let currentCount = parseInt(localStorage.getItem('anorak_speech_count') || '0');
    const lastDate = localStorage.getItem('anorak_speech_date') || '';

    if (lastDate !== today) {
      currentCount = 0;
      localStorage.setItem('anorak_speech_date', today);
      localStorage.setItem('anorak_speech_count', '0');
    }

    // Se estiver prestes a iniciar gravação, checa limite
    if (!voiceRecorder.isRecording) {
      if (currentCount >= limit) {
        if (limit === 100) {
          this.showToast('Você atingiu o limite de 100 áudios hoje. Compre pacotes extras no perfil!');
        } else {
          this.showToast(`Você atingiu o limite diário de ${limit} transcrições. Faça o upgrade de plano!`);
        }
        return;
      }
    }

    const btn = document.getElementById('btnVoiceRecord');
    const pulse = document.querySelector('.voice-pulse');
    const statusText = document.getElementById('voiceStatusText');
    const textarea = document.getElementById('quickIdeaDesc');

    voiceRecorder.toggle(
      (transcript) => {
        if (textarea) textarea.value = transcript;
      },
      (error) => {
        this.showToast('Microfone: ' + error);
      },
      (isRecording) => {
        if (pulse) pulse.classList.toggle('recording', isRecording);
        if (btn) btn.style.color = isRecording ? '#ef4444' : 'var(--text-secondary)';
        if (statusText) statusText.textContent = isRecording ? 'Ouvindo... Fale sua ideia livremente' : 'Reconhecimento por voz pronto';
        
        // Ao finalizar gravação com sucesso
        if (!isRecording) {
          const newCount = currentCount + 1;
          localStorage.setItem('anorak_speech_count', newCount.toString());
          console.log(`[Voz Anorak] Transcrições usadas hoje: ${newCount}/${limit}`);
        }
      }
    );
  }

  getVoiceLimit(plan) {
    switch (plan) {
      case 'creator': return 15;
      case 'master': return 50;
      case 'legend': return 100;
      default: return 0;
    }
  }

  saveQuickIdea() {
    const titleInput = document.getElementById('quickIdeaTitle');
    const descInput = document.getElementById('quickIdeaDesc');
    const tagsInput = document.getElementById('quickIdeaTags');
    const prioritySelect = document.getElementById('quickIdeaPriority');

    const title = titleInput.value.trim();
    if (!title) return;

    const tags = tagsInput.value.split(',').map(t => t.trim()).filter(Boolean);

    const newIdea = new Item({
      type: ItemType.IDEA,
      title,
      description: descInput.value.trim(),
      status: prioritySelect.value === 'alta' ? IdeaStatus.PRIORITIZED : IdeaStatus.DRAFT,
      priority: prioritySelect.value || 'media',
      tags
    });

    db.save(newIdea);
    voiceRecorder.stop();
    document.getElementById('modalQuickCapture').classList.remove('active');

    // Limpa formulário
    titleInput.value = '';
    descInput.value = '';
    tagsInput.value = '';

    this.playCyberChime(750, 'sine', 0.2);
    this.showToast('Ideia capturada no Snapshot!');
    this.render();
  }

  // =========================================================================
  // NOVO PROJETO MANUAL
  // =========================================================================
  openNewProjectModal() {
    const modal = document.getElementById('modalNewProject');
    if (modal) {
      modal.classList.add('active');
      const input = document.getElementById('newProjTitle');
      if (input) setTimeout(() => input.focus(), 150);
    }
  }

  saveNewProject() {
    const title = document.getElementById('newProjTitle').value.trim();
    const description = document.getElementById('newProjDesc').value.trim();
    const driveFolder = document.getElementById('newProjDrive').value.trim();
    const githubRepo = document.getElementById('newProjGithub').value.trim();
    const hmlUrl = document.getElementById('newProjHml') ? document.getElementById('newProjHml').value.trim() : '';
    const liveUrl = document.getElementById('newProjLive') ? document.getElementById('newProjLive').value.trim() : '';

    if (!title) return;

    const project = new Item({
      type: ItemType.PROJECT,
      title,
      description,
      status: ProjectStatus.HOMOLOGATION,
      contextLinks: { driveFolder, githubRepo, hmlUrl, liveUrl },
      tasks: [
        { id: 't_init_1', title: 'Configuração inicial do repositório e ambiente', category: 'Ambiente', completed: true, validatedAt: new Date().toISOString() },
        { id: 't_init_2', title: 'Testes de homologação de funcionalidades principais', category: 'QA', completed: false },
        { id: 't_init_3', title: 'Deploy no Hostinger e homologação final', category: 'Deploy', completed: false }
      ]
    });

    db.save(project);
    document.getElementById('modalNewProject').classList.remove('active');
    this.showToast(`Projeto "${title}" criado!`);
    this.render();

    // Consulta imediata do Git se houver repositório configurado
    if (githubRepo) {
      this.fetchGitTelemetryForProject(project.id, true);
    }
  }

  openEditProjectModal(projectId) {
    const project = db.getById(projectId);
    if (!project) return;

    const modal = document.getElementById('modalEditProject');
    if (modal) {
      document.getElementById('editProjId').value = project.id;
      document.getElementById('editProjTitle').value = project.title;
      document.getElementById('editProjDesc').value = project.description || '';
      if (document.getElementById('editProjStatus')) document.getElementById('editProjStatus').value = project.status || 'homologacao';
      if (document.getElementById('editProjPriority')) document.getElementById('editProjPriority').value = project.priority || 'media';
      
      const cl = project.contextLinks || {};
      document.getElementById('editProjGithub').value = cl.githubRepo || cl.github_repo || '';
      document.getElementById('editProjDrive').value = cl.driveFolder || cl.drive_folder || '';
      if (document.getElementById('editProjHml')) document.getElementById('editProjHml').value = cl.hmlUrl || cl.hml_url || cl.hml || '';
      if (document.getElementById('editProjLive')) document.getElementById('editProjLive').value = cl.liveUrl || cl.live_url || cl.live || '';
      
      modal.classList.add('active');
    }
  }

  saveEditProject() {
    const id = document.getElementById('editProjId').value;
    const title = document.getElementById('editProjTitle').value.trim();
    const description = document.getElementById('editProjDesc').value.trim();
    const status = document.getElementById('editProjStatus') ? document.getElementById('editProjStatus').value : 'homologacao';
    const priority = document.getElementById('editProjPriority') ? document.getElementById('editProjPriority').value : 'media';
    const githubRepo = document.getElementById('editProjGithub').value.trim();
    const driveFolder = document.getElementById('editProjDrive').value.trim();
    const hmlUrl = document.getElementById('editProjHml') ? document.getElementById('editProjHml').value.trim() : '';
    const liveUrl = document.getElementById('editProjLive') ? document.getElementById('editProjLive').value.trim() : '';

    if (!title) return;

    const project = db.getById(id);
    if (!project) return;

    project.title = title;
    project.description = description;
    project.status = status;
    project.priority = priority;

    if (!project.contextLinks) project.contextLinks = {};
    project.contextLinks.githubRepo = githubRepo;
    project.contextLinks.driveFolder = driveFolder;
    project.contextLinks.hmlUrl = hmlUrl;
    project.contextLinks.hml_url = hmlUrl;
    project.contextLinks.hml = hmlUrl;
    project.contextLinks.liveUrl = liveUrl;
    project.contextLinks.live_url = liveUrl;
    project.contextLinks.live = liveUrl;

    db.save(project);
    document.getElementById('modalEditProject').classList.remove('active');
    this.showToast(`Projeto "${title}" atualizado!`);
    this.render();

    // Consulta imediata do Git se houver repositório configurado
    if (githubRepo) {
      this.fetchGitTelemetryForProject(project.id, true);
    }
  }

  // =========================================================================
  // GESTÃO DE COLABORADORES & COMPARTILHAMENTO
  // =========================================================================
  openShareModal(projectId) {
    const project = db.getById(projectId);
    if (!project) return;

    const modal = document.getElementById('modalShareProject');
    if (!modal) return;

    document.getElementById('shareProjId').value = project.id;
    document.getElementById('shareProjTitle').innerText = project.title;

    // Limpa o input de convite
    const inputEl = document.getElementById('shareUserInput');
    if (inputEl) inputEl.value = '';

    // Preenche o datalist com os usuários registrados
    const datalist = document.getElementById('registeredUsersDatalist');
    if (datalist && Array.isArray(this.allUsersData)) {
      const activeColabs = project.collaborators || [];
      datalist.innerHTML = this.allUsersData
        .filter(u => u.username !== project.assignedTo && !activeColabs.includes(u.username))
        .map(u => `<option value="@${u.username}">${u.email ? u.email : ''}</option><option value="${u.email}">${u.username}</option>`).join('');
    }

    // Direct link
    const directLinkInput = document.getElementById('shareDirectLink');
    if (directLinkInput) {
      directLinkInput.value = `${window.location.origin}${window.location.pathname}?project=${project.id}`;
    }

    this.renderCollaboratorsList(project);
    modal.classList.add('active');
  }

  renderCollaboratorsList(project) {
    const listContainer = document.getElementById('collaboratorsList');
    if (!listContainer) return;

    const collaborators = project.collaborators || [];
    if (collaborators.length === 0) {
      listContainer.innerHTML = `<div style="font-size: 0.8rem; color: var(--text-muted); padding: 0.5rem; text-align: center; background: rgba(0,0,0,0.2); border-radius: 6px;">Nenhum colaborador adicionado ainda.</div>`;
      return;
    }

    listContainer.innerHTML = collaborators.map(colab => `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.4rem 0.75rem; background: rgba(255,255,255,0.04); border: 1px solid var(--border-subtle); border-radius: 6px;">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span style="font-size: 0.9rem;">👤</span>
          <span style="font-size: 0.85rem; font-weight: 600; color: #38bdf8;">@${this.escapeHTML(colab)}</span>
          <span style="font-size: 0.7rem; color: var(--text-muted); background: rgba(0,0,0,0.3); padding: 1px 6px; border-radius: 4px;">Colaborador</span>
        </div>
        <button type="button" class="btn-icon" style="width: 24px; height: 24px; font-size: 0.75rem; color: #f87171;" title="Remover Colaborador" onclick="window.anorakApp.handleRemoveCollaborator('${project.id}', '${colab}')">❌</button>
      </div>
    `).join('');
  }

  async handleAddCollaborator() {
    const projectId = document.getElementById('shareProjId').value;
    const inputEl = document.getElementById('shareUserInput');
    let val = inputEl ? inputEl.value.trim() : '';

    if (!val) {
      this.showToast('Digite o username ou e-mail do colaborador.');
      return;
    }

    const project = db.getById(projectId);
    if (!project) return;

    // Limpa o prefixo @ se fornecido
    const cleanQuery = val.startsWith('@') ? val.substring(1).trim() : val.trim();
    const lowerQuery = cleanQuery.toLowerCase();

    // Procura se o usuário digitado já está registrado no banco
    let foundUser = null;
    if (Array.isArray(this.allUsersData)) {
      foundUser = this.allUsersData.find(u => 
        (u.username && u.username.toLowerCase() === lowerQuery) || 
        (u.email && u.email.toLowerCase() === lowerQuery)
      );
    }

    if (foundUser) {
      // Usuário cadastrado encontrado
      const targetUsername = foundUser.username;
      if (!project.collaborators) project.collaborators = [];
      if (project.collaborators.includes(targetUsername)) {
        this.showToast(`@${targetUsername} já é colaborador deste projeto.`);
        return;
      }

      project.collaborators.push(targetUsername);
      db.save(project);
      this.showToast(`@${targetUsername} adicionado como colaborador!`);
      if (inputEl) inputEl.value = '';
      this.openShareModal(projectId);
      this.render();
      return;
    }

    // Se não encontrou usuário registrado, verifica se é um e-mail válido para enviar convite por e-mail
    const isEmail = cleanQuery.includes('@') && cleanQuery.includes('.');
    if (isEmail) {
      const wantInvite = confirm(`O e-mail "${cleanQuery}" não possui uma conta cadastrada no Anorak.\n\nDeseja enviar um convite por e-mail para que esta pessoa crie uma conta e colabore nesta frente de projeto?`);
      if (wantInvite) {
        try {
          const res = await fetch('api/users/invite.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: cleanQuery, project_id: projectId })
          });
          const inviteData = await res.json();
          if (res.ok && inviteData.status === 'success') {
            this.showToast(`📧 Convite por e-mail disparado para ${cleanQuery}!`);
            if (inputEl) inputEl.value = '';
          } else {
            this.showToast(`Convite enviado para ${cleanQuery}!`);
            if (inputEl) inputEl.value = '';
          }
        } catch (err) {
          this.showToast(`📧 Convite por e-mail registrado para ${cleanQuery}!`);
          if (inputEl) inputEl.value = '';
        }
      }
    } else {
      this.showToast('Usuário não encontrado. Digite um @username cadastrado ou um e-mail válido.');
    }
  }

  handleRemoveCollaborator(projectId, username) {
    const project = db.getById(projectId);
    if (!project || !project.collaborators) return;

    project.collaborators = project.collaborators.filter(u => u !== username);
    db.save(project);
    this.showToast(`@${username} removido dos colaboradores.`);
    this.openShareModal(projectId);
    this.render();
  }

  copyShareLink() {
    const linkInput = document.getElementById('shareDirectLink');
    if (linkInput && linkInput.value) {
      navigator.clipboard.writeText(linkInput.value);
      this.showToast('Link direto copiado para a área de transferência!');
    }
  }

  // =========================================================================
  // SINCRONIZADOR PASSIVO GITHUB
  // =========================================================================
  async checkGitHubSync() {
    const projects = db.getByType(ItemType.PROJECT);
    for (const proj of projects) {
      if (proj.contextLinks.githubRepo) {
        const pingResult = await syncEngine.pingGitHub(proj.contextLinks.githubRepo);
        if (pingResult && pingResult.status === 'ok') {
          console.log(`[Anorak Passivo] GitHub Sync para ${proj.title}: Último commit em ${pingResult.lastCommitDate}`);
        }
      }
    }
  }

  // =========================================================================
  // SINCRONIZADOR INTEGRADO DO GITHUB (SQUAD A-TEAM)
  // =========================================================================
  /*
    Desenvolvido por Mario Henrique (mariozinhocs) - mariozinhocs@gmail.com
    "si vis pacem para bellum"
  */
  async syncGithubTasks(projectId, event) {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }

    const project = db.getById(projectId);
    if (!project) return;

    if (!project.contextLinks || !project.contextLinks.githubRepo) {
      this.showToast('Este projeto não possui um repositório GitHub associado.');
      return;
    }

    const parsed = syncEngine.parseGitHubUrl(project.contextLinks.githubRepo);
    if (!parsed) {
      this.showToast('URL do GitHub inválida. Verifique o formato.');
      return;
    }

    // Procura o botão no DOM para aplicar a animação de rotação (spin)
    let syncBtn = null;
    if (event && event.currentTarget) {
      syncBtn = event.currentTarget;
    } else {
      syncBtn = document.querySelector(`[data-project-id="${projectId}"] .github-sync-btn`);
    }

    if (syncBtn) {
      if (syncBtn.classList.contains('spin-animation')) return; // Evita cliques múltiplos paralelos
      syncBtn.classList.add('spin-animation');
      syncBtn.style.opacity = '0.5';
    }

    // Lê o Token salvo no LocalStorage
    const savedToken = localStorage.getItem('anorak_github_token');
    const headers = {
      'Accept': 'application/vnd.github.v3+json'
    };
    if (savedToken) {
      headers['Authorization'] = `token ${savedToken}`;
    }

    try {
      const response = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/issues?state=all&per_page=100`, { headers });

      if (!response.ok) {
        // Se der erro de acesso (404/403/401), pode ser repositório privado
        if (response.status === 404 || response.status === 403 || response.status === 401) {
          this.pendingSyncProjectId = projectId;
          const tokenModal = document.getElementById('modalGithubTokenHelp');
          if (tokenModal) {
            const tokenInput = document.getElementById('githubTokenInput');
            if (tokenInput) tokenInput.value = savedToken || '';
            tokenModal.classList.add('active');
          } else {
            this.showToast('Erro ao abrir o modal auxiliar do GitHub.');
          }
          return;
        } else {
          throw new Error(`Erro HTTP: ${response.status}`);
        }
      }

      const issues = await response.json();
      
      // Filtra Pull Requests, pois a API de Issues do GitHub retorna ambos juntos
      const issuesOnly = issues.filter(issue => !issue.pull_request);

      if (issuesOnly.length === 0) {
        this.showToast('Nenhuma tarefa/issue encontrada no repositório do GitHub.');
        return;
      }

      // Preserva tarefas normais (geradas localmente sem o ID "git_")
      const localTasks = (project.tasks || []).filter(t => !t.id.startsWith('git_'));

      // Cria dicionário de tarefas locais já existentes do tipo "git_" para persistir notas
      const existingGitTasks = {};
      (project.tasks || []).forEach(t => {
        if (t.id.startsWith('git_')) {
          existingGitTasks[t.id] = t;
        }
      });

      // Mapeia as issues retornadas do GitHub
      const gitTasks = issuesOnly.map(issue => {
        const gitId = `git_issue_${issue.number}`;
        const isClosed = issue.state === 'closed';
        const existingTask = existingGitTasks[gitId] || {};

        // Mapeia labels do GitHub para categorias correspondentes do Anorak
        let category = 'GitHub';
        if (issue.labels && issue.labels.length > 0) {
          const validCategories = ['Planejamento', 'Ambiente', 'Desenvolvimento', 'Deploy', 'QA', 'Integração', 'Segurança', 'Validação'];
          const matchedLabel = issue.labels.find(l => 
            validCategories.some(vc => vc.toLowerCase() === l.name.toLowerCase())
          );
          if (matchedLabel) {
            category = matchedLabel.name;
          } else {
            category = issue.labels[0].name;
          }
        }

        return {
          id: gitId,
          title: `[#${issue.number}] ${issue.title}`,
          category: category,
          completed: isClosed,
          status: isClosed ? 'concluido' : 'pendente',
          validatedAt: isClosed ? (issue.closed_at || new Date().toISOString()) : null,
          notes: existingTask.notes || '',
          evidence: isClosed ? { type: 'link', path: issue.html_url, name: `GitHub Issue #${issue.number}` } : null
        };
      });

      // Ordena tarefas por número da issue do GitHub
      gitTasks.sort((a, b) => {
        const numA = parseInt(a.id.replace('git_issue_', ''), 10);
        const numB = parseInt(b.id.replace('git_issue_', ''), 10);
        return numA - numB;
      });

      // Junta as tarefas manuais locais com as do Git (Merge Não-Destrutivo)
      project.tasks = [...localTasks, ...gitTasks];
      project.updatedAt = new Date().toISOString();

      // Ajusta status do projeto com base nas tarefas homologadas
      const evo = project.getEvolution();
      if (evo.percentage === 100 && project.status === 'homologacao') {
        project.status = 'producao';
      } else if (evo.percentage < 100 && project.status === 'producao') {
        project.status = 'homologacao';
      }

      // Trilha de auditoria da governança
      if (!project.validationHistory) project.validationHistory = [];
      project.validationHistory.unshift({
        timestamp: new Date().toISOString(),
        action: 'Sincronização do GitHub',
        taskTitle: 'Importação de Issues',
        taskId: 'github_sync',
        details: `Sincronizadas ${gitTasks.length} tarefas obtidas do GitHub.`,
        by: this.currentUser ? this.currentUser.username : 'sistema'
      });

      // Salva via DB (atualiza local e envia para Hostinger MySQL em background)
      db.save(project);

      // Feedback visual & sonoro
      this.playCyberChime(880, 'sine', 0.2);
      this.showToast(`Sincronização realizada: ${gitTasks.length} tarefas do GitHub carregadas!`);
      this.render();
      this.renderDecisionMatrix();

    } catch (err) {
      console.error(err);
      this.showToast(`Erro de sincronização: ${err.message}`);
    } finally {
      if (syncBtn) {
        syncBtn.classList.remove('spin-animation');
        syncBtn.style.opacity = '1';
      }
    }
  }

  openGithubTokenModal(projectId = null) {
    this.pendingSyncProjectId = projectId;
    const tokenModal = document.getElementById('modalGithubTokenHelp');
    if (tokenModal) {
      const savedToken = localStorage.getItem('anorak_github_token');
      const tokenInput = document.getElementById('githubTokenInput');
      if (tokenInput) tokenInput.value = savedToken || '';
      tokenModal.classList.add('active');
    }
  }

  saveGithubToken() {
    const tokenInput = document.getElementById('githubTokenInput');
    if (!tokenInput) return;

    const token = tokenInput.value.trim();
    if (token) {
      localStorage.setItem('anorak_github_token', token);
      this.showToast('Token de Acesso do GitHub salvo com sucesso!');
    } else {
      localStorage.removeItem('anorak_github_token');
      this.showToast('Token de Acesso removido do navegador.');
    }

    const tokenModal = document.getElementById('modalGithubTokenHelp');
    if (tokenModal) {
      tokenModal.classList.remove('active');
    }

    // Se havia uma sincronização bloqueada ou projeto pendente, consulta o Git agora
    if (this.pendingSyncProjectId) {
      const pid = this.pendingSyncProjectId;
      this.pendingSyncProjectId = null;
      this.fetchGitTelemetryForProject(pid, true);
    } else {
      this.initGitAutoFetch();
    }
  }

  // =========================================================================
  // UTILITÁRIOS
  // =========================================================================
  showToast(message) {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span>🗝️</span> <span>${this.escapeHTML(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(40px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  renderMiniGauge(percentage) {
    const radius = 30;
    const circumference = 2 * Math.PI * radius; // ~188.5
    const maxSweep = 270; // 270 degrees sweep
    const arcLength = (maxSweep / 360) * circumference; // ~141.37
    const activeLength = (percentage / 100) * arcLength;
    const angle = 135 + (percentage / 100) * maxSweep; // Needle rotation from bottom-left (135deg) to bottom-right (405deg)

    return `
      <svg class="mini-gauge-svg" width="64" height="64" viewBox="0 0 100 100" style="overflow: visible;">
        <defs>
          <filter id="gauge-neon-cyan" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          <filter id="gauge-neon-pink" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          <radialGradient id="gauge-metal" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#15203b" />
            <stop offset="70%" stop-color="#0a0f1d" />
            <stop offset="100%" stop-color="#050811" />
          </radialGradient>
        </defs>

        <!-- Housing / Outer Metal Bezel -->
        <circle cx="50" cy="50" r="47" fill="none" stroke="#1b2438" stroke-width="3" />
        
        <!-- Screws on Bezel -->
        <circle cx="50" cy="6" r="1.5" fill="#4b5563" />
        <circle cx="94" cy="50" r="1.5" fill="#4b5563" />
        <circle cx="50" cy="94" r="1.5" fill="#4b5563" />
        <circle cx="6" cy="50" r="1.5" fill="#4b5563" />

        <!-- Gauge Metallic Face -->
        <circle cx="50" cy="50" r="44" fill="url(#gauge-metal)" stroke="#0e1726" stroke-width="1" />

        <!-- Neon Pink Outer Glow Ring -->
        <circle cx="50" cy="50" r="41" fill="none" stroke="#f43f5e" stroke-width="2" filter="url(#gauge-neon-pink)" opacity="0.85" />
        <circle cx="50" cy="50" r="41" fill="none" stroke="#ff85a2" stroke-width="0.75" opacity="0.9" />

        <!-- Inner ticks (cyan) -->
        <circle cx="50" cy="50" r="35" fill="none" stroke="rgba(0, 242, 254, 0.25)" stroke-width="1.5" stroke-dasharray="1, 4" transform="rotate(135, 50, 50)" />

        <!-- Progress track (faint cyan) -->
        <circle cx="50" cy="50" r="30" fill="none" stroke="rgba(0, 242, 254, 0.08)" stroke-width="3.5" stroke-dasharray="${arcLength}, ${circumference}" transform="rotate(135, 50, 50)" stroke-linecap="round" />
        
        <!-- Active Progress track (glowing cyan) -->
        <circle cx="50" cy="50" r="30" fill="none" stroke="#00f2fe" stroke-width="3.5" stroke-dasharray="${activeLength}, ${circumference}" transform="rotate(135, 50, 50)" stroke-linecap="round" filter="url(#gauge-neon-cyan)" />

        <!-- Needle / Pointer (glowing cyan) -->
        <g transform="rotate(${angle}, 50, 50)">
          <line x1="50" y1="50" x2="50" y2="16" stroke="#00f2fe" stroke-width="2.5" stroke-linecap="round" filter="url(#gauge-neon-cyan)" />
          <polygon points="48,22 52,22 50,15" fill="#00f2fe" filter="url(#gauge-neon-cyan)" />
        </g>

        <!-- Center Knob -->
        <circle cx="50" cy="50" r="8" fill="#0a0f1d" stroke="#1e293b" stroke-width="1.5" />
        <circle cx="50" cy="50" r="3" fill="#00f2fe" filter="url(#gauge-neon-cyan)" />

        <!-- Digital Value at bottom -->
        <text x="50" y="77" text-anchor="middle" fill="#00f2fe" font-family="monospace" font-size="10" font-weight="bold" filter="url(#gauge-neon-cyan)" style="letter-spacing: -0.5px;">${percentage}%</text>
      </svg>
    `;
  }

  // =========================================================================
  // CHECKOUT E UPGRADE DE PLANO (MERCADO PAGO)
  // =========================================================================
  openCheckoutModal(selectedPlan = 'creator', selectedBilling = 'monthly') {
    const modal = document.getElementById('modalCheckout');
    if (!modal) return;

    // explorer não é contratável por aqui
    if (selectedPlan === 'explorer') {
      selectedPlan = 'creator';
    }

    const selectPlan = document.getElementById('checkoutPlan');
    if (selectPlan) selectPlan.value = selectedPlan;

    const radioBilling = document.querySelector(`input[name="checkoutBilling"][value="${selectedBilling}"]`);
    if (radioBilling) {
      radioBilling.checked = true;
    }

    // Reset views
    document.getElementById('checkoutFormContent').style.display = 'block';
    document.getElementById('checkoutLoadingContent').style.display = 'none';
    document.getElementById('checkoutPixContent').style.display = 'none';

    if (this.pixInterval) {
      clearInterval(this.pixInterval);
      this.pixInterval = null;
    }

    this.updateCheckoutPrice();
    modal.classList.add('active');
  }

  updateCheckoutPrice() {
    const plan = document.getElementById('checkoutPlan').value;
    const billing = document.querySelector('input[name="checkoutBilling"]:checked').value;
    const method = document.querySelector('input[name="checkoutMethod"]:checked').value;

    const prices = {
      monthly: { creator: 49.00, master: 119.00, legend: 199.00 },
      annual: { creator: 490.00, master: 1190.00, legend: 1990.00 }
    };

    const amount = prices[billing][plan];
    const formattedPrice = amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const priceText = document.getElementById('checkoutPriceText');
    if (priceText) priceText.textContent = formattedPrice;

    const billingText = document.getElementById('checkoutBillingText');
    if (billingText) {
      if (method === 'pix') {
        billingText.textContent = `Pagamento único via Pix (${billing === 'annual' ? 'Anual' : 'Mensal'})`;
      } else {
        billingText.textContent = `Assinatura recorrente autorrecarga (${billing === 'annual' ? 'Anual' : 'Mensal'})`;
      }
    }
  }

  async processCheckout() {
    const plan = document.getElementById('checkoutPlan').value;
    const billing = document.querySelector('input[name="checkoutBilling"]:checked').value;
    const method = document.querySelector('input[name="checkoutMethod"]:checked').value;

    const formContent = document.getElementById('checkoutFormContent');
    const loadingContent = document.getElementById('checkoutLoadingContent');
    const loadingText = document.getElementById('checkoutLoadingText');

    if (formContent) formContent.style.display = 'none';
    if (loadingContent) loadingContent.style.display = 'block';
    if (loadingText) loadingText.textContent = 'Gerando solicitação de pagamento no Mercado Pago...';

    try {
      const res = await fetch('api/payments/create_checkout.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan,
          billing,
          method,
          email: this.currentUser ? this.currentUser.email : '',
          username: this.currentUser ? this.currentUser.username : ''
        })
      });

      if (!res.ok) {
        throw new Error('Erro ao processar requisição no servidor.');
      }

      const result = await res.json();

      if (result.status === 'success') {
        const isSimulated = result.mode === 'simulated';
        
        if (method === 'pix') {
          // Pix: Exibe QR code e copia e cola
          if (loadingContent) loadingContent.style.display = 'none';
          document.getElementById('checkoutPixContent').style.display = 'block';

          const qrImg = document.getElementById('pixQrImage');
          if (qrImg) {
            qrImg.src = isSimulated ? 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=' + encodeURIComponent(result.data.qr_code) : (result.data.qr_code_base64 ? 'data:image/png;base64,' + result.data.qr_code_base64 : result.data.ticket_url);
          }

          const inputCopy = document.getElementById('pixCopyPaste');
          if (inputCopy) inputCopy.value = result.data.qr_code;

          this.startPixPolling(result.data.payment_id, isSimulated);
        } else {
          // Cartão de crédito: Redireciona para o Mercado Pago
          if (loadingText) loadingText.textContent = 'Redirecionando para o ambiente de faturamento seguro...';
          setTimeout(() => {
            window.location.href = result.data.init_point;
          }, 1000);
        }
      } else {
        alert(result.message || 'Erro ao gerar checkout.');
        if (formContent) formContent.style.display = 'block';
        if (loadingContent) loadingContent.style.display = 'none';
      }
    } catch (err) {
      console.error(err);
      alert('Falha na comunicação com a API de Pagamentos: ' + err.message);
      if (formContent) formContent.style.display = 'block';
      if (loadingContent) loadingContent.style.display = 'none';
    }
  }

  startPixPolling(paymentId, isSimulated = false) {
    if (this.pixInterval) clearInterval(this.pixInterval);
    let counter = 0;

    this.pixInterval = setInterval(async () => {
      counter++;

      // Simulação rápida para desenvolvedor em sandbox
      if (isSimulated && counter >= 3) {
        clearInterval(this.pixInterval);
        this.pixInterval = null;
        this.completeSimulatedPayment(paymentId);
        return;
      }

      try {
        const res = await fetch(`api/payments/check_status.php?payment_id=${paymentId}`);
        if (res.ok) {
          const check = await res.json();
          if (check.status === 'success' && check.approved) {
            clearInterval(this.pixInterval);
            this.pixInterval = null;
            this.handlePaymentSuccess(check.plan);
          }
        }
      } catch (err) {
        console.warn('Erro ao pollar status de pagamento:', err);
      }
    }, 3000);
  }

  async completeSimulatedPayment(paymentId) {
    this.showToast('Simulando aprovação de pagamento no banco local...');
    try {
      const plan = document.getElementById('checkoutPlan').value;
      const billing = document.querySelector('input[name="checkoutBilling"]:checked').value;
      const prices = {
        monthly: { creator: 49.00, master: 119.00, legend: 199.00 },
        annual: { creator: 490.00, master: 1190.00, legend: 1990.00 }
      };
      const amount = prices[billing][plan];
      const durationDays = billing === 'annual' ? 365 : 30;

      const res = await fetch('api/admin/add_payment.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: this.currentUser ? this.currentUser.id : 1,
          plan: plan,
          amount: amount,
          payment_method: 'pix',
          duration_days: durationDays,
          transaction_id: paymentId
        })
      });

      if (res.ok) {
        this.handlePaymentSuccess(plan);
      } else {
        this.handlePaymentSuccess(plan);
      }
    } catch (e) {
      this.handlePaymentSuccess(plan);
    }
  }

  handlePaymentSuccess(planName) {
    this.playCyberChime(880, 'sine', 0.4);
    this.showToast(`Parabéns! Sua assinatura do Plano ${planName.toUpperCase()} foi ativada!`);
    
    if (this.currentUser) {
      this.currentUser.plan = planName;
    }
    
    document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('active'));
    this.verifyAuth();
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

// Inicializa a aplicação
window.addEventListener('DOMContentLoaded', () => {
  window.anorakApp = new AnorakApp();
  window.anorakApp.init();
});
