/* ========================================
   AMÉLIORATIONS UX - XERA
   Indicateurs de chargement, persistance, animations
   ======================================== */

// Gestion des états de chargement pour les boutons
class LoadingManager {
    static setLoading(button, isLoading = true) {
        if (!button) return;
        
        if (isLoading) {
            // Sauvegarder le texte original si pas déjà fait
            if (!button.dataset.originalText) {
                button.dataset.originalText = button.innerHTML;
            }
            
            // Ajouter le spinner et désactiver
            button.classList.add('btn-loading');
            button.disabled = true;
            
            // Ajouter le spinner si pas présent
            if (!button.querySelector('.loading-spinner')) {
                const spinner = document.createElement('div');
                spinner.className = 'loading-spinner';
                button.appendChild(spinner);
            }
        } else {
            // Enlever l'état de chargement
            button.classList.remove('btn-loading');
            button.disabled = false;
            
            // Enlever le spinner
            const spinner = button.querySelector('.loading-spinner');
            if (spinner) {
                spinner.remove();
            }
        }
    }
    
    static async withLoading(button, asyncFunction) {
        this.setLoading(button, true);
        try {
            const result = await asyncFunction();
            return result;
        } finally {
            this.setLoading(button, false);
        }
    }
}

// Système de notifications Toast
class ToastManager {
    static init() {
        // Créer le conteneur s'il n'existe pas
        if (!document.getElementById('toast-container')) {
            const container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);
        }
    }
    
    static show(title, message, type = 'info', duration = 5000) {
        this.init();
        
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icons = {
            success: '✓',
            error: '✕', 
            info: 'ℹ',
            warning: '⚠'
        };
        
        toast.innerHTML = `
            <div class="toast-icon">${icons[type] || icons.info}</div>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close">✕</button>
        `;
        
        // Ajouter le toast
        container.appendChild(toast);
        
        // Animation d'entrée
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });
        
        // Gestion de la fermeture
        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => this.remove(toast));
        
        // Auto-suppression
        if (duration > 0) {
            setTimeout(() => this.remove(toast), duration);
        }
        
        return toast;
    }
    
    static remove(toast) {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }
    
    static success(title, message, duration) {
        return this.show(title, message, 'success', duration);
    }
    
    static error(title, message, duration) {
        return this.show(title, message, 'error', duration);
    }
    
    static info(title, message, duration) {
        return this.show(title, message, 'info', duration);
    }
}

// Gestion de la persistance de session
class SessionManager {
    static SESSION_KEY = 'rize_user_session';
    static EXPIRY_KEY = 'rize_session_expiry';
    
    static saveSession(user, expiresIn = 7 * 24 * 60 * 60 * 1000) { // 7 jours par défaut
        const expiry = Date.now() + expiresIn;
        localStorage.setItem(this.SESSION_KEY, JSON.stringify(user));
        localStorage.setItem(this.EXPIRY_KEY, expiry.toString());
    }
    
    static loadSession() {
        try {
            const expiry = localStorage.getItem(this.EXPIRY_KEY);
            
            // Vérifier si la session a expiré
            if (expiry && Date.now() > parseInt(expiry)) {
                this.clearSession();
                return null;
            }
            
            const sessionData = localStorage.getItem(this.SESSION_KEY);
            return sessionData ? JSON.parse(sessionData) : null;
        } catch (error) {
            console.error('Erreur chargement session:', error);
            this.clearSession();
            return null;
        }
    }
    
    static clearSession() {
        localStorage.removeItem(this.SESSION_KEY);
        localStorage.removeItem(this.EXPIRY_KEY);
    }
    
    static extendSession(additionalTime = 7 * 24 * 60 * 60 * 1000) {
        const expiry = Date.now() + additionalTime;
        localStorage.setItem(this.EXPIRY_KEY, expiry.toString());
    }
}

// Améliorations des animations
class AnimationManager {
    static fadeInElements(selector, delay = 100) {
        const elements = document.querySelectorAll(selector);
        elements.forEach((el, index) => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(20px)';
            
            setTimeout(() => {
                el.style.transition = 'all 0.6s cubic-bezier(0.23, 1, 0.32, 1)';
                el.style.opacity = '1';
                el.style.transform = 'translateY(0)';
            }, index * delay);
        });
    }
    
    static bounceIn(element) {
        if (element) {
            element.classList.add('animate-bounce-in');
            setTimeout(() => {
                element.classList.remove('animate-bounce-in');
            }, 600);
        }
    }
    
    static slideUp(element) {
        if (element) {
            element.classList.add('animate-slide-up');
            setTimeout(() => {
                element.classList.remove('animate-slide-up');
            }, 400);
        }
    }
}

// États de chargement pour les listes
class LoadingStateManager {
    static showSpinner(container, message = 'Veuillez patienter pendant le chargement des trajectoires...') {
        if (!container) return;

        // Privilégier des squelettes visuels plutôt qu'un spinner
        if (this.showSmartSkeleton(container)) return;
        
        container.innerHTML = `
            <div class="loading-state-container" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; width: 100%; grid-column: 1 / -1; min-height: 300px;">
                <div class="loading-spinner" style="width: 50px; height: 50px; border-width: 3px;"></div>
                <p style="color: var(--text-secondary); font-size: 1rem; margin-top: 20px; text-align: center; animation: pulse 2s infinite;">${message}</p>
            </div>
        `;
        
        // Add pulse keyframes if not exists
        if (!document.getElementById('pulse-keyframes')) {
            const style = document.createElement('style');
            style.id = 'pulse-keyframes';
            style.textContent = `
                @keyframes pulse {
                    0% { opacity: 0.6; }
                    50% { opacity: 1; }
                    100% { opacity: 0.6; }
                }
            `;
            document.head.appendChild(style);
        }
    }

    static showSkeleton(container, type = 'card', count = 3) {
        if (!container) return;
        
        const skeletonHTML = this.generateSkeleton(type, count);
        container.innerHTML = skeletonHTML;
    }
    
    static generateSkeleton(type, count) {
        let skeletonItem = '';
        
        switch (type) {
            case 'card':
                skeletonItem = '<div class="skeleton skeleton-card"></div>';
                break;
            case 'list':
                skeletonItem = `
                    <div style="display: flex; gap: 12px; margin-bottom: 16px;">
                        <div class="skeleton skeleton-avatar"></div>
                        <div style="flex: 1;">
                            <div class="skeleton skeleton-text" style="width: 60%;"></div>
                            <div class="skeleton skeleton-text" style="width: 80%;"></div>
                        </div>
                    </div>
                `;
                break;
            case 'text':
                skeletonItem = `
                    <div class="skeleton skeleton-text" style="width: 100%; margin-bottom: 8px;"></div>
                    <div class="skeleton skeleton-text" style="width: 75%;"></div>
                `;
                break;
        }
        
        return Array(count).fill(skeletonItem).join('');
    }
    
    // Détecte le contexte pour injecter des squelettes adaptés (grille discover, profil, listes)
    static showSmartSkeleton(container) {
        const classList = container.classList
            ? container.classList
            : { contains: () => false };

        // Grille Discover : cartes placeholder
        if (classList.contains('discover-grid')) {
            const cardsHTML = this.generateSkeleton('card', 8);
            container.innerHTML = `
                <div class="loading-state-container skeleton-grid" aria-hidden="true">
                    ${cardsHTML}
                </div>
            `;
            return true;
        }

        // Page profil : squelette dédié
        if (classList.contains('profile-container')) {
            if (typeof window.getProfileSkeletonMarkup === 'function') {
                container.innerHTML = window.getProfileSkeletonMarkup();
            } else {
                const listHTML = this.generateSkeleton('list', 4);
                container.innerHTML = `<div class="loading-state-container" aria-hidden="true">${listHTML}</div>`;
            }
            return true;
        }

        // Listes / timelines génériques
        if (
            classList.contains('timeline') ||
            classList.contains('list') ||
            container.tagName === 'UL' ||
            container.tagName === 'OL'
        ) {
            const listHTML = this.generateSkeleton('list', 5);
            container.innerHTML = `<div class="loading-state-container" aria-hidden="true">${listHTML}</div>`;
            return true;
        }

        return false;
    }
    
    static showEmptyState(container, icon, title, message, actionButton = null) {
        if (!container) return;
        
        const buttonHTML = actionButton ? 
            `<button class="btn btn-primary" onclick="${actionButton.action}">${actionButton.text}</button>` : '';
        
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">${icon}</div>
                <h3>${title}</h3>
                <p>${message}</p>
                ${buttonHTML}
            </div>
        `;
    }
}

// Amélioration du feedback des interactions
class InteractionFeedback {
    static addRippleEffect(button) {
        button.addEventListener('click', function(e) {
            const ripple = document.createElement('span');
            const rect = button.getBoundingClientRect();
            const size = Math.max(rect.height, rect.width);
            const x = e.clientX - rect.left - size / 2;
            const y = e.clientY - rect.top - size / 2;
            
            ripple.style.cssText = `
                position: absolute;
                width: ${size}px;
                height: ${size}px;
                left: ${x}px;
                top: ${y}px;
                background: rgba(255, 255, 255, 0.3);
                border-radius: 50%;
                transform: scale(0);
                animation: ripple 0.6s linear;
                pointer-events: none;
            `;
            
            button.style.position = 'relative';
            button.style.overflow = 'hidden';
            button.appendChild(ripple);
            
            setTimeout(() => ripple.remove(), 600);
        });
    }
    
    static initAll() {
        // Ajouter l'effet ripple à tous les boutons
        document.querySelectorAll('.btn').forEach(btn => {
            this.addRippleEffect(btn);
        });
        
        // Observer les nouveaux boutons ajoutés dynamiquement
        if (window.MutationObserver) {
            const observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            // Nouveaux boutons
                            if (node.classList.contains('btn')) {
                                this.addRippleEffect(node);
                            }
                            // Boutons dans les nouveaux éléments
                            node.querySelectorAll && node.querySelectorAll('.btn').forEach(btn => {
                                this.addRippleEffect(btn);
                            });
                        }
                    });
                });
            });
            
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    }
}

// CSS pour l'effet ripple
const rippleCSS = `
@keyframes ripple {
    to {
        transform: scale(4);
        opacity: 0;
    }
}
`;

// Ajouter le CSS pour les effets
if (!document.getElementById('ux-enhancements-css')) {
    const style = document.createElement('style');
    style.id = 'ux-enhancements-css';
    style.textContent = rippleCSS;
    document.head.appendChild(style);
}

// Initialisation automatique
document.addEventListener('DOMContentLoaded', () => {
    ToastManager.init();
    InteractionFeedback.initAll();
});

// Export global
window.LoadingManager = LoadingManager;
window.ToastManager = ToastManager;
window.SessionManager = SessionManager;
window.AnimationManager = AnimationManager;
window.LoadingStateManager = LoadingStateManager;
window.InteractionFeedback = InteractionFeedback;
