/**
 * ANORAK - Decision Matrix & Time Investment Advisor
 * "Onde investir meu tempo hoje?" - Cruzamento de Homologação vs. Ideias Priorizadas
 */

import { ItemType, ProjectStatus, IdeaStatus } from './models.js';

export class AnorakDecisionMatrix {
  constructor(db) {
    this.db = db;
  }

  analyze() {
    const items = this.db.getAll();
    const projects = items.filter(i => i.type === ItemType.PROJECT);
    const ideas = items.filter(i => i.type === ItemType.IDEA);

    // 4 Quadrantes:
    // Q1: Urgente & Alto Impacto (Fogo Cruzado / Homologação Crítica)
    // Q2: Estratégico & Alto Impacto (Inovação / Ideias Priorizadas / Próximos Lançamentos)
    // Q3: Operacional Rápido (Tarefas Simples / Rascunhos)
    // Q4: Backlog / Manutenção
    const quadrants = {
      q1: [], // Crítico / Homologação Imediata
      q2: [], // Ouro Estratégico (Inovação & Chave de Cristal)
      q3: [], // Rápido
      q4: []  // Backlog
    };

    // Classifica Projetos e suas tarefas
    projects.forEach(project => {
      const evo = project.getEvolution();
      const pendingTasks = project.tasks.filter(t => !t.completed);

      if (project.quadrant && quadrants[project.quadrant]) {
        quadrants[project.quadrant].push({
          id: project.id,
          title: `[Projeto] ${project.title}`,
          context: project.title,
          badge: project.quadrant.toUpperCase(),
          type: 'project'
        });
        return;
      }

      if (project.status === ProjectStatus.HOMOLOGATION && pendingTasks.length > 0) {
        quadrants.q1.push({
          id: project.id,
          title: `[Homologar] ${project.title} (${pendingTasks.length} etapas pendentes)`,
          context: project.title,
          badge: `${evo.percentage}% Concluído`,
          type: 'project'
        });
      } else if (project.status === ProjectStatus.PRODUCTION || evo.percentage === 100) {
        quadrants.q2.push({
          id: project.id,
          title: `[Deploy / SaaS] ${project.title} (Chave de Cristal Desbloqueada)`,
          context: project.title,
          badge: 'Pronto p/ Produção',
          type: 'project'
        });
      }
    });

    // Classifica Ideias
    ideas.forEach(idea => {
      if (idea.quadrant && quadrants[idea.quadrant]) {
        quadrants[idea.quadrant].push({
          id: idea.id,
          title: idea.title,
          context: 'Incubadora',
          badge: idea.quadrant.toUpperCase(),
          type: 'idea'
        });
        return;
      }

      if (idea.status === IdeaStatus.PRIORITIZED || (idea.impact === 'alto' && idea.urgency === 'alta')) {
        quadrants.q2.push({
          id: idea.id,
          title: `[Incubadora] Promover "${idea.title}"`,
          context: 'Ideia Priorizada',
          badge: 'Pronto p/ Projeto',
          type: 'idea'
        });
      } else if (idea.status === IdeaStatus.DRAFT) {
        quadrants.q3.push({
          id: idea.id,
          title: `[Rascunho] Refinar "${idea.title}"`,
          context: 'Ideia em Rascunho',
          badge: 'Rascunho',
          type: 'idea'
        });
      } else {
        quadrants.q4.push({
          id: idea.id,
          title: idea.title,
          context: 'Backlog',
          badge: 'Backlog',
          type: 'idea'
        });
      }
    });

    // Análise e Conselho do Mago Anorak
    const advice = this.generateHallidayAdvice(quadrants, projects);

    return {
      quadrants,
      advice,
      summary: {
        criticalCount: quadrants.q1.length,
        strategicCount: quadrants.q2.length,
        quickCount: quadrants.q3.length,
        backlogCount: quadrants.q4.length
      }
    };
  }

  generateHallidayAdvice(quadrants, projects) {
    if (quadrants.q1.length > 0) {
      const topCritical = quadrants.q1[0];
      return {
        focus: 'Validação & Homologação',
        highlight: topCritical.title,
        message: `Foco total em destravar a homologação ativa: "${topCritical.context}". Completar os testes pendentes liberará a Chave de Cristal para o próximo estágio.`,
        actionType: 'homologation'
      };
    }

    if (quadrants.q2.length > 0) {
      const topStrategic = quadrants.q2[0];
      return {
        focus: 'Expansão & Promoção',
        highlight: topStrategic.title,
        message: `Nenhum bloqueador crítico de homologação! Momento ideal para promover ideias estratégicas na Incubadora ou finalizar deploys em produção.`,
        actionType: 'promote'
      };
    }

    return {
      focus: 'Criação Livre',
      highlight: 'Incubadora Aberta',
      message: 'Todos os projetos estão estáveis. Use o Snapshot de Ideias para desenhar novas frentes para o ecossistema.',
      actionType: 'ideate'
    };
  }
}
