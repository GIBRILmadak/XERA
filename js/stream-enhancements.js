/* ========================================
   AMÉLIORATIONS STREAM - XERA
   Chat amélioré, actions interactives, plein écran
   ======================================== */

// Gestionnaire pour les actions de stream
class StreamActionsManager {
    static init() {
        this.initializeActions();
        this.setupFullscreen();
    }
    
    static initializeActions() {
        const likeBtn = document.getElementById('like-btn');
        const followBtn = document.getElementById('follow-btn');
        const shareBtn = document.getElementById('share-btn');
        
        if (likeBtn) {
            likeBtn.addEventListener('click', () => this.handleLike(likeBtn));
        }
        
        if (followBtn) {
            followBtn.addEventListener('click', () => this.handleFollow(followBtn));
        }
        
        if (shareBtn) {
            shareBtn.addEventListener('click', () => this.handleShare(shareBtn));
        }
    }
    
    static async handleLike(button) {
        await LoadingManager.withLoading(button, async () => {
            // Simuler un appel API
            await new Promise(resolve => setTimeout(resolve, 800));
            
            const isLiked = button.classList.toggle('active');
            const text = button.querySelector('.btn-text');
            
            if (isLiked) {
                text.textContent = '❤️ Aimé';
                ToastManager.success('Like ajouté', 'Merci pour votre soutien !');
                AnimationManager.bounceIn(button);
            } else {
                text.textContent = 'J\'aime';
                ToastManager.info('Like retiré', '');
            }
        });
    }
    
    static async handleFollow(button) {
        await LoadingManager.withLoading(button, async () => {
            // Simuler un appel API
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const isFollowing = button.classList.toggle('active');
            const text = button.querySelector('.btn-text');
            
            if (isFollowing) {
                text.textContent = '✓ Abonné';
                ToastManager.success('Abonnement confirmé', 'Vous ne raterez plus aucun live !');
            } else {
                text.textContent = 'Suivre';
                ToastManager.info('Désabonnement', 'Vous ne suivez plus ce streameur');
            }
        });
    }
    
    static async handleShare(button) {
        await LoadingManager.withLoading(button, async () => {
            const url = window.location.href;
            
            if (navigator.share) {
                try {
                    await navigator.share({
                        title: 'Live Stream sur XERA',
                        text: 'Regardez ce live stream sur XERA !',
                        url: url
                    });
                    ToastManager.success('Partagé', 'Merci de faire connaître XERA !');
                } catch (err) {
                    if (err.name !== 'AbortError') {
                        this.fallbackShare(url);
                    }
                }
            } else {
                this.fallbackShare(url);
            }
        });
    }
    
    static fallbackShare(url) {
        navigator.clipboard.writeText(url).then(() => {
            ToastManager.success('Lien copié', 'Le lien a été copié dans le presse-papiers');
        }).catch(() => {
            ToastManager.error('Erreur', 'Impossible de copier le lien');
        });
    }
    
    static setupFullscreen() {
        window.toggleFullscreen = () => {
            const videoContainer = document.querySelector('.stream-video-container');
            
            if (!document.fullscreenElement) {
                videoContainer.requestFullscreen().then(() => {
                    videoContainer.classList.add('stream-fullscreen');
                    ToastManager.info('Mode plein écran', 'Appuyez sur Échap pour quitter');
                }).catch(() => {
                    ToastManager.error('Erreur', 'Impossible de passer en plein écran');
                });
            } else {
                document.exitFullscreen().then(() => {
                    videoContainer.classList.remove('stream-fullscreen');
                });
            }
        };
        
        // Détecter la sortie du plein écran
        document.addEventListener('fullscreenchange', () => {
            const videoContainer = document.querySelector('.stream-video-container');
            if (!document.fullscreenElement) {
                videoContainer.classList.remove('stream-fullscreen');
            }
        });
    }
    
    static enhanceChat() {
        this.setupChatSubmission();
        this.addSampleMessages();
    }
    
    static setupChatSubmission() {
        const chatForm = document.getElementById('stream-chat-form');
        const chatInput = document.getElementById('stream-chat-input');
        
        if (chatForm && chatInput) {
            chatForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const message = chatInput.value.trim();
                
                if (message) {
                    const sendButton = chatForm.querySelector('.stream-chat-send');
                    
                    await LoadingManager.withLoading(sendButton, async () => {
                        // Simuler envoi
                        await new Promise(resolve => setTimeout(resolve, 500));
                        
                        this.addChatMessage({
                            username: 'Vous',
                            message: message,
                            timestamp: new Date(),
                            isOwn: true
                        });
                        
                        chatInput.value = '';
                        ToastManager.success('Message envoyé', '');
                    });
                }
            });
        }
    }
    
    static addChatMessage(data) {
        const chatMessages = document.getElementById('stream-chat-messages');
        if (!chatMessages) return;
        
        const messageElement = document.createElement('div');
        messageElement.className = 'chat-message';
        
        const time = data.timestamp.toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        messageElement.innerHTML = `
            <div class="chat-message-meta">
                <span class="chat-username" style="${data.isOwn ? 'color: var(--accent-color);' : ''}">${data.username}</span>
                <span class="chat-timestamp">${time}</span>
            </div>
            <div class="chat-message-content">${this.escapeHtml(data.message)}</div>
        `;
        
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // Animation d'apparition
        AnimationManager.slideUp(messageElement);
    }
    
    static addSampleMessages() {
        const sampleMessages = [
            { username: 'Alice', message: 'Salut tout le monde ! 👋' },
            { username: 'Bob', message: 'Super stream, merci pour le contenu !' },
            { username: 'Charlie', message: 'Des conseils pour débuter ?' },
            { username: 'Diana', message: 'Excellent travail ! Continue comme ça' }
        ];
        
        // Ajouter des messages avec délai
        sampleMessages.forEach((msg, index) => {
            setTimeout(() => {
                this.addChatMessage({
                    ...msg,
                    timestamp: new Date(),
                    isOwn: false
                });
            }, (index + 1) * 2000);
        });
        
        // Continuer à ajouter des messages aléatoirement
        this.startRandomMessages();
    }
    
    static startRandomMessages() {
        const messages = [
            'Génial ce projet !',
            'Merci pour les explications',
            'Question : combien de temps ça prend ?',
            'J\'adore l\'approche',
            'Très instructif !',
            'Peux-tu refaire cette partie ?',
            'Excellent ! 🔥',
            'Merci pour le partage',
            'Super technique !',
            'J\'apprends beaucoup'
        ];
        
        const names = ['Alex', 'Maya', 'Jules', 'Léa', 'Tom', 'Sarah', 'Louis', 'Emma', 'Noah', 'Lisa'];
        
        setInterval(() => {
            if (Math.random() < 0.3) { // 30% de chance
                const randomMessage = messages[Math.floor(Math.random() * messages.length)];
                const randomName = names[Math.floor(Math.random() * names.length)];
                
                this.addChatMessage({
                    username: randomName,
                    message: randomMessage,
                    timestamp: new Date(),
                    isOwn: false
                });
            }
        }, 5000);
    }
    
    static escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Gestionnaire de statistiques en temps réel (Désactivé - géré par streaming.js)
class StreamStatsManager {
    static init() {
        // Laisser streaming.js gérer les vraies stats
    }
}

// Gestionnaire de breadcrumb
class StreamNavigationManager {
    static init() {
        this.updateBreadcrumb();
    }
    
    static updateBreadcrumb() {
        const breadcrumbTitle = document.getElementById('stream-breadcrumb-title');
        const streamTitle = document.getElementById('stream-title');
        
        if (breadcrumbTitle && streamTitle) {
            // Observer les changements du titre
            const observer = new MutationObserver(() => {
                const title = streamTitle.textContent;
                if (title && title !== 'Titre du Stream') {
                    breadcrumbTitle.textContent = title;
                }
            });
            
            observer.observe(streamTitle, {
                childList: true,
                characterData: true,
                subtree: true
            });
        }
    }
}

// Initialisation automatique
document.addEventListener('DOMContentLoaded', () => {
    StreamActionsManager.init();
    StreamStatsManager.init();
    StreamNavigationManager.init();
});

// Export global
window.StreamActionsManager = StreamActionsManager;
window.StreamStatsManager = StreamStatsManager;
window.StreamNavigationManager = StreamNavigationManager;
