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
    this.soundEnabled = false;
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
          this.currentUser = data.user;
          const userEl = document.getElementById('currentUserName');
          if (userEl) userEl.textContent = `👤 ${data.user.username}`;
          
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
          this.usersList = result.data.map(u => u.username);
          return;
        }
      }
    } catch (e) {
      console.warn('Erro ao listar usuários:', e);
    }
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

    // Form Edit Project Submit
    const formEditProj = document.getElementById('formEditProject');
    if (formEditProj) {
      formEditProj.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveEditProject();
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

          <!-- Linha de Responsável (Governança) -->
          <div class="project-responsible-row">
            <span>Responsável:</span>
            <select class="responsible-select" onchange="window.anorakApp.handleSetAssignee('${proj.id}', this.value)">
              <option value="" ${!proj.assignedTo ? 'selected' : ''}>Sem responsável</option>
              ${(this.usersList || []).map(u => `
                <option value="${u}" ${proj.assignedTo === u ? 'selected' : ''}>@${u}</option>
              `).join('')}
            </select>
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

          <!-- Checklist Interativo de Homologação -->
          <div class="checklist-section">
            <div class="checklist-title">
              <span>Etapas de Homologação</span>
              <button class="btn-icon" style="width: 24px; height: 24px; font-size: 0.8rem;" title="Adicionar Etapa" onclick="window.anorakApp.promptAddTask('${proj.id}')">+</button>
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
            
            <div style="display: flex; gap: 0.5rem;">
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
                    <div class="audit-timeline-item">
                      <div class="audit-timeline-meta">
                        <span class="audit-time">${new Date(log.timestamp).toLocaleDateString('pt-BR')} ${new Date(log.timestamp).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}</span>
                        <span class="audit-user">@${this.escapeHTML(log.by || 'sistema')}</span>
                      </div>
                      <div class="audit-timeline-action">
                        <strong>${this.escapeHTML(log.action)}</strong>: ${this.escapeHTML(log.taskTitle || '')}
                        ${log.details ? `<div class="audit-timeline-details">${this.escapeHTML(log.details)}</div>` : ''}
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
      document.getElementById('editProjGithub').value = project.contextLinks.githubRepo || '';
      document.getElementById('editProjDrive').value = project.contextLinks.driveFolder || '';
      document.getElementById('editProjLive').value = project.contextLinks.liveUrl || '';
      
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
    const liveUrl = document.getElementById('editProjLive').value.trim();

    if (!title) return;

    const project = db.getById(id);
    if (!project) return;

    project.title = title;
    project.description = description;
    project.status = status;
    project.priority = priority;
    project.contextLinks.githubRepo = githubRepo;
    project.contextLinks.driveFolder = driveFolder;
    project.contextLinks.liveUrl = liveUrl;

    db.save(project);
    document.getElementById('modalEditProject').classList.remove('active');
    this.showToast(`Projeto "${title}" atualizado!`);
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
