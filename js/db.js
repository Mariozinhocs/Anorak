/**
 * ANORAK - Storage Layer
 * Persistência reativa com IndexedDB e LocalStorage, com suporte a backup JSON
 */

import { Item, ItemType, ProjectStatus, IdeaStatus } from './models.js';

const STORAGE_KEY = 'anorak_core_db_v1';

export class AnorakDB {
  constructor() {
    this.items = [];
    this.isInitialized = false;
  }

  async init() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.items = parsed.map(data => new Item(data));
      } else {
        // Seeding inicial com as 3 frentes ativas de homologação e ideias iniciais
        this.seedInitialData();
      }
      this.isInitialized = true;

      // Sincronização em segundo plano com a API MySQL (se disponível)
      this.syncWithServer();

      return this.items;
    } catch (e) {
      console.error('Erro ao carregar dados do Anorak:', e);
      this.seedInitialData();
      return this.items;
    }
  }

  async syncWithServer() {
    try {
      const res = await fetch('api/items.php');
      if (res.ok) {
        const result = await res.json();
        if (result.status === 'success' && Array.isArray(result.data) && result.data.length > 0) {
          this.items = result.data.map(data => new Item(data));
          this.saveToStorage(false); // Salva sem disparar re-sync
          window.dispatchEvent(new CustomEvent('anorak-db-updated', { detail: { count: this.items.length } }));
        }
      }
    } catch (err) {
      // Servidor ou API offline; mantém dados locais do LocalStorage
      console.log('Operando em modo offline/local:', err.message);
    }
  }

  saveToStorage(syncServer = true) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.items));
      window.dispatchEvent(new CustomEvent('anorak-db-updated', { detail: { count: this.items.length } }));
    } catch (e) {
      console.error('Erro ao salvar no LocalStorage:', e);
    }
  }

  getAll() {
    return this.items;
  }

  getByType(type) {
    return this.items.filter(item => item.type === type);
  }

  getById(id) {
    return this.items.find(item => item.id === id);
  }

  save(itemData) {
    const existingIndex = this.items.findIndex(i => i.id === itemData.id);
    let itemInstance;

    if (itemData instanceof Item) {
      itemInstance = itemData;
    } else {
      itemInstance = new Item(itemData);
    }

    itemInstance.updatedAt = new Date().toISOString();

    if (existingIndex >= 0) {
      this.items[existingIndex] = itemInstance;
    } else {
      this.items.unshift(itemInstance);
    }

    this.saveToStorage();

    // Sincroniza de forma não-bloqueante com o MySQL via API
    fetch('api/items.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(itemInstance)
    }).catch(err => console.warn('Sync server save falhou (offline):', err.message));

    return itemInstance;
  }

  delete(id) {
    this.items = this.items.filter(item => item.id !== id);
    this.saveToStorage();

    // Sincroniza exclusão no MySQL via API
    fetch(`api/items.php?id=${encodeURIComponent(id)}`, {
      method: 'DELETE'
    }).catch(err => console.warn('Sync server delete falhou (offline):', err.message));
  }

  seedInitialData() {
    this.items = [
      // PROJETO 1: RetroVerse VR (Em Homologação)
      new Item({
        id: 'proj_retroverse_vr',
        type: ItemType.PROJECT,
        title: 'RetroVerse VR',
        description: 'Plataforma imersiva de emuladores retrô 3D, salas virtuais multiplayer e painel de controle do OASIS.',
        status: ProjectStatus.HOMOLOGATION,
        priority: 'alta',
        impact: 'alto',
        urgency: 'alta',
        tags: ['Retro', 'VR', 'OASIS', 'Three.js'],
        contextLinks: {
          driveFolder: 'https://drive.google.com/drive/folders/retroverse-vr',
          githubRepo: 'https://github.com/Mariozinhocs/retroverse-vr.git',
          liveUrl: 'https://retroverse.oasis'
        },
        tasks: [
          { id: 't_360_1', title: 'Integração e limpeza do emulador NES (clean_emu.php)', category: 'Backend', completed: true, validatedAt: '2026-08-10T14:30:00Z' },
          { id: 't_360_2', title: 'Refatoração dos shaders WebGL e helper_render.php', category: 'Segurança', completed: true, validatedAt: '2026-08-11T18:00:00Z' },
          { id: 't_360_3', title: 'Homologação do lobby multiplayer e transição de salas', category: 'Frontend', completed: true, validatedAt: '2026-08-12T10:15:00Z' },
          { id: 't_360_4', title: 'Validação final de carregamento de ROMs & Assets', category: 'Deploy', completed: false },
          { id: 't_360_5', title: 'Aceite de usabilidade com óculos de realidade virtual', category: 'QA', completed: false }
        ]
      }),

      // PROJETO 2: OASIS Engine (Mago do OASIS)
      new Item({
        id: 'proj_oasis_engine',
        type: ItemType.PROJECT,
        title: 'OASIS Engine',
        description: 'Motor inteligente de processamento de voz com IA, alocação dinâmica de recursos e lógica da matriz de priorização.',
        status: ProjectStatus.HOMOLOGATION,
        priority: 'alta',
        impact: 'alto',
        urgency: 'alta',
        tags: ['Gestão', 'Incubadora', 'OASIS', 'IA'],
        contextLinks: {
          driveFolder: 'https://drive.google.com/drive/folders/oasis-engine',
          githubRepo: 'https://github.com/Mariozinhocs/oasis-engine.git',
          liveUrl: 'https://engine.oasis'
        },
        tasks: [
          { id: 't_ano_1', title: 'Arquitetura de dados orientada a Entidades e Atributos', category: 'Arquitetura', completed: true, validatedAt: '2026-08-12T23:00:00Z' },
          { id: 't_ano_2', title: 'Dashboard Dual Mode: Operacional & Incubadora', category: 'Frontend', completed: true, validatedAt: '2026-08-12T23:45:00Z' },
          { id: 't_ano_3', title: 'Checklists interativos com gatilhos e Chaves de Halliday', category: 'Lógica', completed: true, validatedAt: '2026-08-12T23:50:00Z' },
          { id: 't_ano_4', title: 'Integração da IA de processamento de áudio e Matriz de Decisão', category: 'Inteligência', completed: false },
          { id: 't_ano_5', title: 'Deploy no Hostinger (engine.hubdigital360.com)', category: 'Deploy', completed: false }
        ]
      }),

      // PROJETO 3: SyncLink API / SaaS
      new Item({
        id: 'proj_synclink_api',
        type: ItemType.PROJECT,
        title: 'SyncLink API',
        description: 'Módulo de automação de propostas, integrações seguras com APIs externas e canais de sincronização offline-first.',
        status: ProjectStatus.HOMOLOGATION,
        priority: 'media',
        impact: 'alto',
        urgency: 'media',
        tags: ['Automação', 'Offline-First', 'API'],
        contextLinks: {
          driveFolder: 'https://drive.google.com/drive/folders/synclink-api',
          githubRepo: 'https://github.com/Mariozinhocs/synclink-api.git',
          liveUrl: ''
        },
        tasks: [
          { id: 't_hub_1', title: 'Estruturação do fluxo de propostas automáticas', category: 'Planejamento', completed: true, validatedAt: '2026-08-05T11:00:00Z' },
          { id: 't_hub_2', title: 'Validação de assinaturas de Webhooks & Segurança', category: 'Integração', completed: false },
          { id: 't_hub_3', title: 'Testes de homologação com clientes beta', category: 'Validação', completed: false },
          { id: 't_hub_4', title: 'Geração de relatórios em tempo real', category: 'Backend', completed: false }
        ]
      }),

      // IDEIAS NA INCUBADORA
      new Item({
        id: 'idea_ai_prompt_builder',
        type: ItemType.IDEA,
        title: 'Gerador Automático de Briefings com IA',
        description: 'Um assistente integrado para transformar áudios desestruturados de reuniões em especificações técnicas completas e tarefas de homologação.',
        status: IdeaStatus.PRIORITIZED,
        priority: 'alta',
        impact: 'alto',
        urgency: 'alta',
        tags: ['IA', 'Automação', 'Speech-to-Text'],
        contextLinks: {}
      }),
      new Item({
        id: 'idea_client_portal_white_label',
        type: ItemType.IDEA,
        title: 'Ready Player Hub: Customização de Clãs',
        description: 'Permitir que clãs de jogadores acessem relatórios de conquistas e inventário personalizado com marca própria.',
        status: IdeaStatus.DRAFT,
        priority: 'media',
        impact: 'alto',
        urgency: 'media',
        tags: ['SaaS', 'WhiteLabel', 'OASIS'],
        contextLinks: {}
      }),
      new Item({
        id: 'idea_offline_sync_pwa',
        type: ItemType.IDEA,
        title: 'PWA com Suporte Offline Completo',
        description: 'Capacidade de validar checklists de homologação em campo mesmo sem internet e sincronizar com o Hostinger ao reconectar.',
        status: IdeaStatus.BACKLOG,
        priority: 'baixa',
        impact: 'medio',
        urgency: 'baixa',
        tags: ['PWA', 'Offline', 'Mobile'],
        contextLinks: {}
      })
    ];

    this.saveToStorage();
  }

  exportDataJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.items, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `anorak_backup_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  async importDataJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const parsed = JSON.parse(e.target.result);
          if (Array.isArray(parsed)) {
            this.items = parsed.map(d => new Item(d));
            this.saveToStorage();
            resolve(this.items);
          } else {
            reject(new Error('Formato de JSON inválido'));
          }
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }
}

export const db = new AnorakDB();
