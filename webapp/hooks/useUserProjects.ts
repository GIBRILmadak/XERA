import { useState, useEffect } from 'react';

// Dans une application réelle, cela appellerait une API backend
// pour vérifier le nombre de projets de l'utilisateur.
export const useUserProjects = () => {
    const [hasProjects, setHasProjects] = useState<boolean>(true); // Initialisé à true pour l'exemple
    const [loading, setLoading] = useState<boolean>(true);

    useEffect(() => {
        // Simulation d'appel API
        setTimeout(() => {
            // Pour tester l'onboarding, changez ceci à 'false'
            setHasProjects(false); 
            setLoading(false);
        }, 1000);
    }, []);

    return { hasProjects, loading };
};
