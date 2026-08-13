/**
 * ANORAK - Core Models & Entity Schema
 * Modelo orientado a Entidades e Atributos flexíveis
 */

export const ItemType = {
  PROJECT: 'project',
  TASK: 'task',
  IDEA: 'idea'
};

export const ProjectStatus = {
  PLANNING: 'planejamento',       // Chave 1: Cobre
  HOMOLOGATION: 'homologacao',   // Chave 2: Jade
  PRODUCTION: 'producao',        // Chave 3: Cristal
  SAAS: 'saas'
};

export const TaskStatus = {
  PENDING: 'pendente',
  IN_VALIDATION: 'em_validacao',
  COMPLETED: 'concluido'
};

export const IdeaStatus = {
  BACKLOG: 'backlog',
  DRAFT: 'rascunho',
  PRIORITIZED: 'priorizado'
};

/**
 * Criação da Entidade Item genérica com atributos flexíveis
 */
export class Item {
  constructor({
    id = crypto.randomUUID ? crypto.randomUUID() : 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    type = ItemType.PROJECT,
    title = '',
    description = '',
    status = '',
    priority = 'media', // 'baixa', 'media', 'alta', 'critica'
    impact = 'medio',   // 'baixo', 'medio', 'alto'
    urgency = 'media',  // 'baixa', 'media', 'alta'
    tags = [],
    contextLinks = { driveFolder: '', githubRepo: '', liveUrl: '' },
    tasks = [],
    validationHistory = [],
    createdAt = new Date().toISOString(),
    updatedAt = new Date().toISOString()
  } = {}) {
    this.id = id;
    this.type = type;
    this.title = title;
    this.description = description;
    this.tags = Array.isArray(tags) ? tags : [];
    this.contextLinks = {
      driveFolder: contextLinks.driveFolder || '',
      githubRepo: contextLinks.githubRepo || '',
      liveUrl: contextLinks.liveUrl || ''
    };
    this.priority = priority;
    this.impact = impact;
    this.urgency = urgency;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;

    // Ajusta o status padrão conforme o Tipo
    if (!status) {
      if (this.type === ItemType.PROJECT) this.status = ProjectStatus.HOMOLOGATION;
      else if (this.type === ItemType.IDEA) this.status = IdeaStatus.DRAFT;
      else this.status = TaskStatus.PENDING;
    } else {
      this.status = status;
    }

    // Tarefas de Homologação (para Projetos)
    this.tasks = (tasks || []).map(t => ({
      id: t.id || 'task_' + Math.random().toString(36).substr(2, 6),
      title: t.title || '',
      category: t.category || 'Geral', // 'Ambiente', 'Integração', 'Segurança', 'Validação de Usuário'
      status: t.status || TaskStatus.PENDING,
      completed: !!t.completed,
      validatedAt: t.validatedAt || null,
      notes: t.notes || ''
    }));

    this.validationHistory = validationHistory || [];
  }

  /**
   * Calcula o progresso percentual e as chaves conquistadas (Cobre, Jade, Cristal)
   */
  getEvolution() {
    if (this.type !== ItemType.PROJECT || !this.tasks.length) {
      return { percentage: 0, copper: false, jade: false, crystal: false, total: 0, completed: 0 };
    }
    const completedCount = this.tasks.filter(t => t.completed).length;
    const totalCount = this.tasks.length;
    const percentage = Math.round((completedCount / totalCount) * 100);

    return {
      percentage,
      total: totalCount,
      completed: completedCount,
      copper: percentage >= 20 || this.status !== ProjectStatus.PLANNING,
      jade: percentage >= 60 || this.status === ProjectStatus.HOMOLOGATION || this.status === ProjectStatus.PRODUCTION || this.status === ProjectStatus.SAAS,
      crystal: percentage === 100 || this.status === ProjectStatus.PRODUCTION || this.status === ProjectStatus.SAAS
    };
  }

  /**
   * Atualiza status de uma tarefa e registra no histórico de homologação
   */
  toggleTask(taskId) {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) return null;

    task.completed = !task.completed;
    task.status = task.completed ? TaskStatus.COMPLETED : TaskStatus.PENDING;
    task.validatedAt = task.completed ? new Date().toISOString() : null;
    this.updatedAt = new Date().toISOString();

    // Registra gatilho no histórico de validação
    this.validationHistory.unshift({
      timestamp: new Date().toISOString(),
      action: task.completed ? 'Etapa Homologada' : 'Etapa Reaberta',
      taskTitle: task.title,
      taskId: task.id
    });

    // Auto-ajuste de status do projeto com base no progresso
    const evo = this.getEvolution();
    if (evo.percentage === 100 && this.status === ProjectStatus.HOMOLOGATION) {
      this.status = ProjectStatus.PRODUCTION;
    } else if (evo.percentage < 100 && this.status === ProjectStatus.PRODUCTION) {
      this.status = ProjectStatus.HOMOLOGATION;
    }

    return task;
  }
}
