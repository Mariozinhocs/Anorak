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
      // PROJETO 1: 360 Studio (Em Homologação)
      new Item({
        id: 'proj_360_studio',
        type: ItemType.PROJECT,
        title: '360 Studio',
        description: 'Plataforma imersiva de passeios virtuais 360°, gerenciamento de hotspots, plantas baixas e painel administrativo.',
        status: ProjectStatus.HOMOLOGATION,
        priority: 'alta',
        impact: 'alto',
        urgency: 'alta',
        tags: ['Passeio Virtual', '360', 'Hostinger', 'PHP/JS'],
        contextLinks: {
          driveFolder: 'https://drive.google.com/drive/folders/360-studio',
          githubRepo: 'https://github.com/Mariozinhocs/360-studio.git',
          liveUrl: 'https://hubdigital360.com'
        },
        tasks: [
          { id: 't_360_1', title: 'Integração e limpeza de arquivos órfãos (clean_orphans.php)', category: 'Backend', completed: true, validatedAt: '2026-08-10T14:30:00Z' },
          { id: 't_360_2', title: 'Refatoração da autenticação e admin_helper.php', category: 'Segurança', completed: true, validatedAt: '2026-08-11T18:00:00Z' },
          { id: 't_360_3', title: 'Homologação do visualizador 360 e transição de cenas', category: 'Frontend', completed: true, validatedAt: '2026-08-12T10:15:00Z' },
          { id: 't_360_4', title: 'Validação final de upload no Hostinger & Teste de Carga', category: 'Deploy', completed: false },
          { id: 't_360_5', title: 'Aceite de usabilidade em dispositivos móveis', category: 'QA', completed: false }
        ]
      }),

      // PROJETO 2: Anorak (Mago do OASIS)
      new Item({
        id: 'proj_anorak_core',
        type: ItemType.PROJECT,
        title: 'Anorak - OASIS Project Hub',
        description: 'Sistema inteligente de gestão modular de projetos em homologação, repositório de ideias e matriz de decisão.',
        status: ProjectStatus.HOMOLOGATION,
        priority: 'alta',
        impact: 'alto',
        urgency: 'alta',
        tags: ['Gestão', 'Incubadora', 'OASIS', 'Ready Player One'],
        contextLinks: {
          driveFolder: 'https://drive.google.com/drive/folders/anorak',
          githubRepo: 'https://github.com/Mariozinhocs/Anorak.git',
          liveUrl: 'https://anorak.hubdigital360.com'
        },
        tasks: [
          { id: 't_ano_1', title: 'Arquitetura de dados orientada a Entidades e Atributos', category: 'Arquitetura', completed: true, validatedAt: '2026-08-12T23:00:00Z' },
          { id: 't_ano_2', title: 'Dashboard Dual Mode: Operacional & Incubadora', category: 'Frontend', completed: true, validatedAt: '2026-08-12T23:45:00Z' },
          { id: 't_ano_3', title: 'Checklists interativos com gatilhos e Chaves de Halliday', category: 'Lógica', completed: true, validatedAt: '2026-08-12T23:50:00Z' },
          { id: 't_ano_4', title: 'Captura de ideias por voz (Web Speech) e Matriz de Decisão', category: 'Inteligência', completed: false },
          { id: 't_ano_5', title: 'Deploy no Hostinger (anorak.hubdigital360.com)', category: 'Deploy', completed: false }
        ]
      }),

      // PROJETO 3: Hub Digital Connect / SaaS
      new Item({
        id: 'proj_hub_connect',
        type: ItemType.PROJECT,
        title: 'Hub Digital Connect',
        description: 'Módulo de automação de propostas, integrações com WhatsApp API e portal do cliente para serviços digitais.',
        status: ProjectStatus.HOMOLOGATION,
        priority: 'media',
        impact: 'alto',
        urgency: 'media',
        tags: ['Automação', 'CRM', 'API'],
        contextLinks: {
          driveFolder: 'https://drive.google.com/drive/folders/hub-connect',
          githubRepo: 'https://github.com/Mariozinhocs/hub-connect.git',
          liveUrl: ''
        },
        tasks: [
          { id: 't_hub_1', title: 'Estruturação do fluxo de propostas automáticas', category: 'Planejamento', completed: true, validatedAt: '2026-08-05T11:00:00Z' },
          { id: 't_hub_2', title: 'Validação de webhooks de pagamento', category: 'Integração', completed: false },
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
        title: 'Portal do Cliente White-Label para Tours 360',
        description: 'Permitir que imobiliárias e clientes finais acessem os relatórios de visualizações dos seus passeios com a própria marca.',
        status: IdeaStatus.DRAFT,
        priority: 'media',
        impact: 'alto',
        urgency: 'media',
        tags: ['SaaS', 'WhiteLabel', '360'],
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
