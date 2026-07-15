// server/adapters/github-adapter.js
const crypto = require('crypto');

async function fetchData(accessToken) {
  // Exemple d'appel API GitHub pour les derniers commits
  const response = await fetch('https://api.github.com/user/repos?sort=updated&per_page=5', {
    headers: { Authorization: `token ${accessToken}` }
  });
  return await response.json();
}

function normalize(repo, userId) {
  return {
    id: crypto.randomUUID(), // Devrait être basé sur l'ID GitHub pour éviter les doublons
    userId,
    source: 'github',
    type: 'commit', // Normalisation
    timestamp: repo.updated_at,
    title: repo.name,
    description: repo.description,
    content: { html_url: repo.html_url },
    metadata: { skills: [repo.language].filter(Boolean), relevanceScore: 1, isPublic: !repo.private }
  };
}

module.exports = { fetchData, normalize };
