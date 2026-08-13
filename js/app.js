/**
 * ANORAK - Main Application Controller
 * OASIS HUD, Dual-Mode Switcher, Checklists Reativos, Incubadora & IA Matrix
 */

import { db } from './db.js';
import { Item, ItemType, ProjectStatus, IdeaStatus } from './models.js';
import { voiceRecorder } from './voice.js';
import { AnorakDecisionMatrix } from './matrix.js';
import { syncEngine } from './sync.js';

class AnorakApp {
  constructor() {
    this.currentMode = 'operational'; // 'operational' | 'incubator' | 'matrix'
    this.currentTagFilter = 'all';
    this.decisionMatrix = new AnorakDecisionMatrix(db);
    this.audioContext = null;
    this.soundEnabled = true;
  }

  async init() {
    // 1. Verificação de Autenticação
    const isAuthenticated = await this.verifyAuth();
    if (!isAuthenticated) {
      window.location.replace('login.html');
      return;
    }

    await db.init();
    this.initAudioContext();
    this.setupEventListeners();
    this.render();
    this.renderDecisionMatrix();
    this.checkGitHubSync();
  }

  async verifyAuth() {
    try {
      const res = await fetch('api/auth/check_auth.php');
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          const userEl = document.getElementById('currentUserName');
          if (userEl) userEl.textContent = `👤 ${data.user.username}`;
          return true;
        }
      }
    } catch (e) {
      console.warn('Erro ao checar auth:', e);
    }
    return false;
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

    // Botão de Gravação de Voz
    const btnVoice = document.getElementById('btnVoiceRecord');
    if (btnVoice) {
      btnVoice.addEventListener('click', () => this.toggleVoiceRecording());
    }

    // Modal Close buttons
    document.querySelectorAll('.modal-close, .btn-modal-cancel').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('active'));
        voiceRecorder.stop();
      });
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
    const incView = document.getElementById('viewIncubator');
    const matView = document.getElementById('viewMatrix');

    if (opView) opView.style.display = mode === 'operational' ? 'flex' : 'none';
    if (incView) incView.style.display = mode === 'incubator' ? 'flex' : 'none';
    if (matView) matView.style.display = mode === 'matrix' ? 'grid' : 'none';

    this.playCyberChime(660, 'triangle', 0.1);
  }

  render() {
    this.renderStatsBar();
    this.renderOperationalProjects();
    this.renderIncubatorIdeas();
  }

  renderStatsBar() {
    const items = db.getAll();
    const projects = items.filter(i => i.type === ItemType.PROJECT);
    const ideas = items.filter(i => i.type === ItemType.IDEA);

    const elProjCount = document.getElementById('statActiveProjects');
    if (elProjCount) elProjCount.textContent = projects.length;

    let totalTasks = 0;
    let completedTasks = 0;
    projects.forEach(p => {
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
  renderOperationalProjects() {
    const container = document.getElementById('projectsContainer');
    if (!container) return;

    const projects = db.getByType(ItemType.PROJECT);
    if (projects.length === 0) {
      container.innerHTML = `<div class="glass-panel" style="padding: 2rem; text-align: center; color: var(--text-muted);">Nenhum projeto cadastrado. Crie um projeto ou promova uma ideia na Incubadora!</div>`;
      return;
    }

    container.innerHTML = projects.map(proj => {
      const evo = proj.getEvolution();
      return `
        <article class="glass-panel project-card" data-project-id="${proj.id}">
          <div class="project-card-header">
            <div>
              <h3 class="project-title">${this.escapeHTML(proj.title)}</h3>
              <p class="project-desc">${this.escapeHTML(proj.description || 'Sem descrição cadastrada.')}</p>
            </div>
            
            <!-- Chaves de Halliday -->
            <div class="halliday-keys-box" title="Conquistas de Estágio: Cobre (Planejamento), Jade (Homologação), Cristal (Produção)">
              <span class="key-badge copper ${evo.copper ? 'active' : ''}" title="Chave de Cobre: Arquitetura & Planejamento">🗝️</span>
              <span class="key-badge jade ${evo.jade ? 'active' : ''}" title="Chave de Jade: Homologação Ativa">🗝️</span>
              <span class="key-badge crystal ${evo.crystal ? 'active' : ''}" title="Chave de Cristal: Produção Concluída">💎</span>
            </div>
          </div>

          <!-- Barra de Progresso de Homologação -->
          <div class="phase-progress-wrap">
            <div class="progress-labels">
              <span>Status: <strong style="color: var(--primary-cyan); text-transform: uppercase;">${proj.status}</strong></span>
              <span class="mono">${evo.completed}/${evo.total} etapas (${evo.percentage}%)</span>
            </div>
            <div class="progress-bar-bg">
              <div class="progress-bar-fill" style="width: ${evo.percentage}%;"></div>
            </div>
          </div>

          <!-- Checklist Interativo de Homologação -->
          <div class="checklist-section">
            <div class="checklist-title">
              <span>Etapas de Homologação</span>
              <button class="btn-icon" style="width: 24px; height: 24px; font-size: 0.8rem;" title="Adicionar Etapa" onclick="window.anorakApp.promptAddTask('${proj.id}')">+</button>
            </div>
            <div class="checklist-items">
              ${proj.tasks.length === 0 ? '<div style="font-size: 0.8rem; color: var(--text-muted); padding: 0.5rem;">Nenhuma etapa de validação cadastrada.</div>' : ''}
              ${proj.tasks.map(task => `
                <div class="check-item ${task.completed ? 'done' : ''}" onclick="window.anorakApp.handleToggleTask('${proj.id}', '${task.id}')">
                  <div class="custom-checkbox">${task.completed ? '✓' : ''}</div>
                  <div class="check-info">
                    <span class="check-title">${this.escapeHTML(task.title)}</span>
                    ${task.validatedAt ? `<span class="check-timestamp">Validado em: ${new Date(task.validatedAt).toLocaleDateString('pt-BR')} às ${new Date(task.validatedAt).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}</span>` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Context Links & Ações -->
          <div class="project-footer">
            <div class="context-links">
              ${proj.contextLinks.githubRepo ? `
                <a href="${proj.contextLinks.githubRepo}" target="_blank" rel="noopener" class="context-link-btn" title="Repositório GitHub">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
                  GitHub
                </a>
              ` : ''}
              ${proj.contextLinks.driveFolder ? `
                <a href="${proj.contextLinks.driveFolder}" target="_blank" rel="noopener" class="context-link-btn" title="Pasta no Drive">
                  📁 Drive
                </a>
              ` : ''}
              ${proj.contextLinks.liveUrl ? `
                <a href="${proj.contextLinks.liveUrl}" target="_blank" rel="noopener" class="context-link-btn" title="Ambiente de Homologação / Live">
                  🌐 Live
                </a>
              ` : ''}
            </div>
            
            <button class="btn-icon" style="width: 28px; height: 28px; font-size: 0.8rem;" title="Opções do Projeto" onclick="window.anorakApp.handleDeleteProject('${proj.id}')">🗑️</button>
          </div>
        </article>
      `;
    }).join('');
  }

  handleToggleTask(projectId, taskId) {
    const project = db.getById(projectId);
    if (!project) return;

    const task = project.toggleTask(taskId);
    db.save(project);
    this.playCyberChime(task && task.completed ? 880 : 380, 'sine', 0.15);

    if (task && task.completed) {
      this.showToast(`Etapa "${task.title}" homologada!`);
    }

    this.render();
    this.renderDecisionMatrix();
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
      status: 'pendente'
    });

    db.save(project);
    this.showToast('Nova etapa adicionada à homologação!');
    this.render();
  }

  handleDeleteProject(projectId) {
    const proj = db.getById(projectId);
    if (!proj) return;
    if (confirm(`Tem certeza que deseja excluir o projeto "${proj.title}"?`)) {
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

      return `
        <article class="glass-panel idea-card" data-idea-id="${idea.id}">
          <div class="idea-header">
            <h4 class="idea-title">${this.escapeHTML(idea.title)}</h4>
            <span class="badge ${badgeClass}">${badgeLabel}</span>
          </div>

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
            <button class="btn-icon" style="width: 28px; height: 28px; font-size: 0.75rem;" title="Excluir Ideia" onclick="window.anorakApp.handleDeleteIdea('${idea.id}')">🗑️</button>
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

    // Redireciona para a visão operacional
    this.switchMode('operational');
  }

  // =========================================================================
  // MATRIZ DE DECISÃO ("Onde investir meu tempo hoje?")
  // =========================================================================
  renderDecisionMatrix() {
    const analysis = this.decisionMatrix.analyze();
    const { quadrants, advice } = analysis;

    const renderList = (items) => {
      if (!items || items.length === 0) return '<div style="font-size: 0.75rem; color: var(--text-muted);">Nenhum item nesta zona.</div>';
      return items.map(i => `
        <div class="quadrant-item">
          <strong>${this.escapeHTML(i.title)}</strong>
        </div>
      `).join('');
    };

    const q1El = document.getElementById('quadrantQ1');
    const q2El = document.getElementById('quadrantQ2');
    const q3El = document.getElementById('quadrantQ3');
    const q4El = document.getElementById('quadrantQ4');

    if (q1El) q1El.innerHTML = renderList(quadrants.q1);
    if (q2El) q2El.innerHTML = renderList(quadrants.q2);
    if (q3El) q3El.innerHTML = renderList(quadrants.q3);
    if (q4El) q4El.innerHTML = renderList(quadrants.q4);

    const adviceQuoteEl = document.getElementById('advisorQuote');
    if (adviceQuoteEl) {
      adviceQuoteEl.textContent = `"${advice.message}"`;
    }
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
      }
    );
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

    if (!title) return;

    const project = new Item({
      type: ItemType.PROJECT,
      title,
      description,
      status: ProjectStatus.HOMOLOGATION,
      contextLinks: { driveFolder, githubRepo, liveUrl: '' },
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
