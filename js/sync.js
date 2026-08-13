/**
 * ANORAK - Passive Sync Engine (GitHub API & Drive Links)
 * Monitoramento passivo de repositórios e links de contexto
 */

export class AnorakSyncEngine {
  constructor() {
    this.cache = new Map();
  }

  /**
   * Extrai o owner e repo de uma URL do GitHub
   * Ex: https://github.com/Mariozinhocs/360-studio.git -> { owner: 'Mariozinhocs', repo: '360-studio' }
   */
  parseGitHubUrl(url) {
    if (!url) return null;
    const cleanUrl = url.trim().replace(/\.git$/, '');
    const match = cleanUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/i);
    if (match) {
      return { owner: match[1], repo: match[2] };
    }
    return null;
  }

  /**
   * Ping passivo na API pública do GitHub para obter último commit e status
   */
  async pingGitHub(url) {
    const parsed = this.parseGitHubUrl(url);
    if (!parsed) return { status: 'invalid_url' };

    const cacheKey = `${parsed.owner}/${parsed.repo}`;
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      // Cache de 5 minutos
      if (Date.now() - cached.time < 300000) {
        return cached.data;
      }
    }

    try {
      const response = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/commits?per_page=1`, {
        headers: { 'Accept': 'application/vnd.github.v3+json' }
      });

      if (!response.ok) {
        return { status: 'error', code: response.status, message: 'Repositório privado ou limite de requisições' };
      }

      const commits = await response.json();
      if (commits && commits.length > 0) {
        const lastCommit = commits[0];
        const data = {
          status: 'ok',
          lastCommitDate: lastCommit.commit.author.date,
          lastCommitMessage: lastCommit.commit.message,
          author: lastCommit.commit.author.name,
          url: lastCommit.html_url
        };
        this.cache.set(cacheKey, { time: Date.now(), data });
        return data;
      }
      return { status: 'empty' };
    } catch (e) {
      return { status: 'offline', error: e.message };
    }
  }
}

export const syncEngine = new AnorakSyncEngine();
