/**
 * ANORAK - Passive & Active Sync Engine (GitHub API & Context Links)
 * Monitoramento passivo e consulta ativa de repositórios Git com telemetria
 * 
 * Desenvolvido por Mario Henrique (mariozinhocs) - mariozinhocs@gmail.com
 * "si vis pacem para bellum"
 */

export class AnorakSyncEngine {
  constructor() {
    this.cache = new Map();
  }

  /**
   * Extrai o owner e repo de uma URL do GitHub
   * Ex: https://github.com/usuario/projeto.git -> { owner: 'usuario', repo: 'projeto' }
   */
  parseGitHubUrl(url) {
    if (!url) return null;
    const cleanUrl = url.trim().replace(/\.git\/?$/i, '').replace(/\/+$/, '');
    const match = cleanUrl.match(/github\.com[\/:]([^\/]+)\/([^\/]+)/i);
    if (match) {
      return { owner: match[1].trim(), repo: match[2].trim() };
    }
    return null;
  }

  /**
   * Formata uma data ISO em tempo relativo amigável (pt-BR)
   */
  getRelativeTime(isoString) {
    if (!isoString) return '';
    try {
      const now = new Date();
      const past = new Date(isoString);
      const diffMs = now.getTime() - past.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHours = Math.floor(diffMin / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffSec < 60) return 'agora mesmo';
      if (diffMin < 60) return `há ${diffMin} min`;
      if (diffHours < 24) return `há ${diffHours} ${diffHours === 1 ? 'hora' : 'horas'}`;
      if (diffDays === 1) return 'ontem';
      if (diffDays < 30) return `há ${diffDays} dias`;
      return past.toLocaleDateString('pt-BR');
    } catch (e) {
      return '';
    }
  }

  /**
   * Consulta a API do GitHub para obter detalhes do último commit e status do repositório
   * @param {string} url - URL do repositório GitHub
   * @param {boolean} forceRefresh - Se verdadeiro, ignora o cache e busca em tempo real
   */
  async pingGitHub(url, forceRefresh = false) {
    const parsed = this.parseGitHubUrl(url);
    if (!parsed) return { status: 'invalid_url', message: 'URL do GitHub inválida' };

    const cacheKey = `${parsed.owner}/${parsed.repo}`;
    if (!forceRefresh && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      // Cache de 3 minutos
      if (Date.now() - cached.time < 180000) {
        return cached.data;
      }
    }

    const headers = {
      'Accept': 'application/vnd.github.v3+json'
    };

    const savedToken = localStorage.getItem('anorak_github_token');
    if (savedToken) {
      headers['Authorization'] = `token ${savedToken}`;
    }

    try {
      const response = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/commits?per_page=1`, {
        headers
      });

      if (!response.ok) {
        if (response.status === 404) {
          return { status: 'error', code: 404, message: 'Repositório não encontrado ou privado' };
        }
        if (response.status === 403 || response.status === 401) {
          return { status: 'error', code: response.status, message: 'Limite de taxa ou autenticação necessária' };
        }
        return { status: 'error', code: response.status, message: `Erro HTTP ${response.status}` };
      }

      const commits = await response.json();
      if (commits && commits.length > 0) {
        const lastCommit = commits[0];
        const rawMessage = lastCommit.commit.message || '';
        const shortMessage = rawMessage.split('\n')[0].trim();
        const authorName = lastCommit.author?.login || lastCommit.commit.author?.name || 'anônimo';
        const dateIso = lastCommit.commit.author?.date || '';
        const shaShort = (lastCommit.sha || '').substring(0, 7);

        const data = {
          status: 'ok',
          owner: parsed.owner,
          repo: parsed.repo,
          sha: lastCommit.sha,
          shaShort: shaShort,
          lastCommitDate: dateIso,
          relativeTime: this.getRelativeTime(dateIso),
          lastCommitMessage: rawMessage,
          shortMessage: shortMessage,
          author: authorName,
          authorAvatar: lastCommit.author?.avatar_url || null,
          commitUrl: lastCommit.html_url || `https://github.com/${parsed.owner}/${parsed.repo}/commit/${lastCommit.sha}`,
          repoUrl: `https://github.com/${parsed.owner}/${parsed.repo}`,
          fetchedAt: new Date().toISOString()
        };

        this.cache.set(cacheKey, { time: Date.now(), data });
        return data;
      }

      return { status: 'empty', message: 'Repositório sem commits' };
    } catch (e) {
      return { status: 'offline', error: e.message, message: 'Falha de conexão com GitHub' };
    }
  }
}

export const syncEngine = new AnorakSyncEngine();
