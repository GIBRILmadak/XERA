// server/adapters/github-adapter.js
const crypto = require('crypto');

async function fetchData(accessToken) {
  // 1. Récupérer le dépôt le plus récemment mis à jour
  const reposResponse = await fetch('https://api.github.com/user/repos?sort=updated&per_page=1', {
    headers: { Authorization: `token ${accessToken}` }
  });
  const repos = await reposResponse.json();

  if (!repos.length) return [];

  const repo = repos[0];
  
  // 2. Récupérer le dernier commit
  const commitsResponse = await fetch(`https://api.github.com/repos/${repo.owner.login}/${repo.name}/commits?per_page=1`, {
    headers: { Authorization: `token ${accessToken}` }
  });
  const commits = await commitsResponse.json();
  const commit = commits[0];
  if (!commit) return [];

  // 3. Récupérer les détails du commit pour la liste des fichiers
  const commitDetailResponse = await fetch(commit.url, {
    headers: { Authorization: `token ${accessToken}` }
  });
  const commitDetail = await commitDetailResponse.json();
  
  let codeSnippet = "// Aucun code source modifié identifiable.";

  // 4. Extraire un fragment de code
  const codeFile = commitDetail.files?.find(f => f.filename.match(/\.(js|ts|py|cpp|java|go|rs|css|html)$/));
  
  if (codeFile) {
    const contentResponse = await fetch(`https://api.github.com/repos/${repo.owner.login}/${repo.name}/contents/${codeFile.filename}?ref=${commit.sha}`, {
      headers: { Authorization: `token ${accessToken}` }
    });
    const contentData = await contentResponse.json();
    if (contentData.content) {
      const decoded = Buffer.from(contentData.content, 'base64').toString('utf-8');
      codeSnippet = decoded.split('\n').slice(0, 10).join('\n'); // 10 premières lignes
    }
  }
  
  return [{ ...commit, repository_name: repo.name, codeSnippet }];
}

function normalize(commitData, userId) {
  return {
    id: commitData.sha,
    userId,
    source: 'github',
    type: 'commit',
    timestamp: commitData.commit.author.date,
    title: `Commit: ${commitData.commit.message.split('\n')[0]}`,
    description: `Dépôt ${commitData.repository_name}`,
    content: { html_url: commitData.html_url },
    codeSnippet: commitData.codeSnippet,
    metadata: { relevanceScore: 1, isPublic: true }
  };
}

module.exports = { fetchData, normalize };
