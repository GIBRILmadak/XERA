// Point d'entrée pour Render
const path = require('path');

// Charger le serveur avec le chemin absolu
const serverPath = path.join(__dirname, 'server', 'monetization-server.js');
const app = require(serverPath);

// Le port est géré par l'environnement ou par défaut dans monetization-server.js
// Mais nous devons nous assurer que le serveur écoute
const PORT = process.env.PORT || 5050;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`API endpoints available at /api/*`);
    
    // Démarrer les tâches de fond si nécessaire
    if (app.sweepExpiredSubscriptions) {
        const SUBSCRIPTION_SWEEP_MS = parseInt(process.env.SUBSCRIPTION_SWEEP_MS, 10) || 10 * 60 * 1000;
        if (SUBSCRIPTION_SWEEP_MS > 0) {
            app.sweepExpiredSubscriptions();
            setInterval(app.sweepExpiredSubscriptions, SUBSCRIPTION_SWEEP_MS);
        }
    }
});
