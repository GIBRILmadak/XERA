// Point d'entrée pour Render
const path = require('path');

// Charger le serveur avec le chemin absolu
const serverPath = path.join(__dirname, 'server', 'monetization-server.js');
require(serverPath);
