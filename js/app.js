
/* ========================================
   COUCHE LOGIQUE - Utilitaires données
   ======================================== */

// Récupérer l'utilisateur
function getUser(userId) {
    return mockUsers.find(u => u.userId === userId);
}

/* ========================================
   SYSTÈME DE FOLLOWERS
   ======================================== */

// Vérifier si l'utilisateur suit quelqu'un
function isFollowing(fromUserId, toUserId) {
    const user = getUser(fromUserId);
    return user && user.following.includes(toUserId);
}

// Ajouter un follower
function followUser(fromUserId, toUserId) {
    const userFrom = getUser(fromUserId);
    const userTo = getUser(toUserId);
    
    if (!userFrom || !userTo) return;
    
    if (!userFrom.following.includes(toUserId)) {
        userFrom.following.push(toUserId);
    }
    
    if (!userTo.followers.includes(fromUserId)) {
        userTo.followers.push(fromUserId);
    }
}

// Retirer un follower
function unfollowUser(fromUserId, toUserId) {
    const userFrom = getUser(fromUserId);
    const userTo = getUser(toUserId);
    
    if (!userFrom || !userTo) return;
    
    userFrom.following = userFrom.following.filter(id => id !== toUserId);
    userTo.followers = userTo.followers.filter(id => id !== fromUserId);
}

// Compter les followers
function getFollowerCount(userId) {
    const user = getUser(userId);
    return user ? user.followers.length : 0;
}

// Compter les following
function getFollowingCount(userId) {
    const user = getUser(userId);
    return user ? user.following.length : 0;
}

/* ========================================
   SYSTÈME DE MODIFICATION DU PROFIL
   ======================================== */

// Initialiser les données éditables pour un utilisateur
function initUserEditData(userId) {
    const user = getUser(userId);
    if (!user) return;
    
    userEditData[userId] = {
        name: user.name,
        title: user.title,
        bio: user.bio || '',
        avatar: user.avatar,
        banner: user.banner,
        socialLinks: JSON.parse(JSON.stringify(user.socialLinks || {}))
    };
}

// Sauvegarder les modifications utilisateur
function saveUserChanges(userId) {
    const user = getUser(userId);
    const editData = userEditData[userId];
    
    if (!user || !editData) return false;
    
    // Validation: nom unique
    const nameExists = mockUsers.some(u => 
        u.userId !== userId && u.name.toLowerCase() === editData.name.toLowerCase()
    );
    
    if (nameExists) {
        alert('Ce nom d\'utilisateur est déjà pris.');
        return false;
    }
    
    // Appliquer les changements
    user.name = editData.name;
    user.title = editData.title;
    user.bio = editData.bio;
    user.avatar = editData.avatar;
    user.banner = editData.banner;
    user.socialLinks = editData.socialLinks;
    
    return true;
}

// Récupérer le contenu d'un utilisateur, trié par jour décroissant
function getUserContent(userId) {
    return mockContent
        .filter(c => c.userId === userId)
        .sort((a, b) => b.dayNumber - a.dayNumber);
}

// Récupérer le dernier contenu d'un utilisateur
function getLatestContent(userId) {
    const contents = getUserContent(userId);
    return contents.length > 0 ? contents[0] : null;
}

// Récupérer l'état dominant (succès / failure / pause)
function getDominantState(userId) {
    const contents = getUserContent(userId);
    if (contents.length === 0) return 'empty';
    
    const lastContent = contents[0];
    return lastContent.state;
}

// Récupérer la timeline complète pour le profil (tous les jours)
function getProfileTimeline(userId) {
    const contents = getUserContent(userId);
    const maxDay = contents.length > 0 ? contents[0].dayNumber : 0;
    
    const timeline = [];
    for (let day = maxDay; day >= 1; day--) {
        const dayContent = contents.find(c => c.dayNumber === day);
        timeline.push({
            dayNumber: day,
            content: dayContent || null,
            state: dayContent ? dayContent.state : 'empty'
        });
    }
    return timeline;
}

/* ========================================
   SYSTÈME DE BADGES
   ======================================== */

// SVG inline pour les badges
const badgeSVGs = {
    success: '<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>',
    failure: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 8l8 8M16 8l-8 8"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="3" height="16"/><rect x="15" y="4" width="3" height="16"/></svg>',
    empty: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>',
    
    consistency7: '<svg viewBox="0 0 24 24"><text x="12" y="16" text-anchor="middle" font-size="18" font-weight="bold">7</text></svg>',
    consistency30: '<svg viewBox="0 0 24 24"><path d="M12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2m0 2c-4.418 0-8 3.582-8 8s3.582 8 8 8 8-3.582 8-8-3.582-8-8-8z"/></svg>',
    consistency100: '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>',
    consistency365: '<svg viewBox="0 0 24 24"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z"/></svg>',
    
    solo: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M12 14c-4 0-6 2-6 2v4h12v-4s-2-2-6-2z"/></svg>',
    team: '<svg viewBox="0 0 24 24"><circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M8 11c-2 0-3 1-3 1v3h10v-3s-1-1-3-1z"/><path d="M16 11c-2 0-3 1-3 1v3h6v-3s-1-1-3-1z"/></svg>',
    enterprise: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="1"/><line x1="3" y1="8" x2="21" y2="8"/><line x1="9" y1="3" x2="9" y2="21"/></svg>',
    creative: '<svg viewBox="0 0 24 24"><circle cx="15.5" cy="9.5" r="1.5"/><path d="M3 17.25V21h4v-3.75L3 17.25z"/><path d="M15 8.75h.01M21 19V9c0-1.1-.9-2-2-2h-4l-4-5-4 5H5c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2z"/></svg>',
    tech: '<svg viewBox="0 0 24 24"><path d="M9 5H7.12A2.12 2.12 0 0 0 5 7.12v9.76A2.12 2.12 0 0 0 7.12 19h9.76A2.12 2.12 0 0 0 19 16.88V15m-6-9h6V5h-6v1z"/><path d="M9 9h6v6H9z"/></svg>',
    
    transparent: '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/></svg>'
};

// Calculer la constance (jours consécutifs)
function calculateConsistency(userId) {
    const contents = getUserContent(userId);
    if (!contents || contents.length === 0) return null;

    const sorted = [...contents].sort((a, b) => {
        const dateA =
            new Date(a.created_at || a.createdAt || 0).getTime() ||
            (a.dayNumber ?? 0);
        const dateB =
            new Date(b.created_at || b.createdAt || 0).getTime() ||
            (b.dayNumber ?? 0);
        return dateA - dateB;
    });

    const getDate = (item) => {
        const d = item.created_at || item.createdAt;
        const parsed = d ? new Date(d) : null;
        return parsed && !isNaN(parsed) ? parsed : null;
    };

    const MAX_GAP_MS = 36 * 60 * 60 * 1000; // tolérance 1,5 jour

    const isConsecutive = (current, previous) => {
        const dCur = getDate(current);
        const dPrev = getDate(previous);
        if (dCur && dPrev) {
            const delta = dCur.getTime() - dPrev.getTime();
            return delta > 0 && delta <= MAX_GAP_MS;
        }
        const dayCur = current.dayNumber ?? Number.NaN;
        const dayPrev = previous.dayNumber ?? Number.NaN;
        if (Number.isInteger(dayCur) && Number.isInteger(dayPrev)) {
            return dayCur - dayPrev === 1;
        }
        return false;
    };

    let streak = 1;
    for (let i = sorted.length - 1; i > 0; i--) {
        if (isConsecutive(sorted[i], sorted[i - 1])) {
            streak++;
        } else {
            break;
        }
    }

    const lastDate = getDate(sorted[sorted.length - 1]);
    const daysSinceLast = lastDate
        ? (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
        : Infinity;

    const isFresh = (limitDays) => daysSinceLast <= limitDays;

    if (streak >= 365 && isFresh(7)) return 'consistency365';
    if (streak >= 100 && isFresh(7)) return 'consistency100';
    if (streak >= 30 && isFresh(30)) return 'consistency30';
    if (streak >= 7 && isFresh(7)) return 'consistency7';
    return null;
}

// Déterminer le type de trajectoire
function determineTrajectoryType(userId) {
    const user = getUser(userId);
    const contents = getUserContent(userId);
    
    if (contents.length === 0) return null;

    const userTitle = (user.title || '').toLowerCase();
    const userName = (user.name || '').toLowerCase();
    const userProjectIds = [...new Set(contents.map(c => c.projectId))].join('');
    const textContent = (contents.map(c => (c.title + ' ' + c.description).toLowerCase()).join(' ') + ' ' + userTitle).toLowerCase();
    
    // Comptes officiels / équipes / entreprises
    if (
        userTitle.includes('official') ||
        userTitle.includes('officiel') ||
        userTitle.includes('team') ||
        userTitle.includes('équipe') ||
        userTitle.includes('owner') ||
        userName === 'rize' ||
        userName.includes('rize team')
    ) {
        return 'enterprise';
    }
    
    // Check pour type de trajectoire
    if (textContent.includes('unreal') || userTitle.includes('designer') || textContent.includes('motion')) return 'creative';
    if (textContent.includes('boss') || textContent.includes('game') || textContent.includes('indie')) return 'creative';
    if (textContent.includes('rize') && userTitle.includes('ceo')) return 'enterprise';
    if (textContent.includes('refonte') || textContent.includes('ui') || textContent.includes('mobile')) return 'tech';
    if (textContent.includes('architecture') || textContent.includes('api') || textContent.includes('database')) return 'tech';
    
    return 'solo';
}

// Évaluer la transparence (échecs documentés)
function evaluateTransparency(userId) {
    const contents = getUserContent(userId);
    if (contents.length === 0) return false;
    
    // Transparence = au moins 30% d'échecs documentés
    const failureCount = contents.filter(c => c.state === 'failure').length;
    const ratio = failureCount / contents.length;
    
    return ratio >= 0.3;
}

// Générer le badge SVG avec étiquette
function generateBadge(badgeType, label) {
    // For trajectory-type badges use existing SVG files from ./icons as icon-only badges
    const iconTypes = new Set(['team','enterprise','creative','tech','solo']);
    if (iconTypes.has(badgeType)) {
        const iconPath = `./icons/${badgeType}.svg`;
        return `
            <div class="badge" title="${label}">
                <img src="${iconPath}" alt="${label}" class="badge-icon" />
            </div>
        `;
    }

    const svg = badgeSVGs[badgeType];
    if (!svg) return '';

    let cssClass = 'badge';
    if (badgeType.startsWith('consistency')) cssClass += '';
    else if (badgeType === 'success') cssClass += ' badge-success badge-filled';
    else if (badgeType === 'failure') cssClass += ' badge-failure badge-filled';
    else if (badgeType === 'pause') cssClass += ' badge-pause badge-filled';
    else if (badgeType === 'empty') cssClass += '';
    else if (badgeType === 'transparent') cssClass += ' badge-success';
    else cssClass += '';

    return `
        <div class="${cssClass}" title="${label}">
            <div class="badge-icon">${svg}</div>
            <span>${label}</span>
        </div>
    `;
}

// Récupérer tous les badges pour un utilisateur
function getUserBadges(userId) {
    const badges = [];
    const user = getUser(userId);
    
    // Badge type de trajectoire
    const trajectoryType = determineTrajectoryType(userId);
    if (trajectoryType && trajectoryType !== 'solo') {
        const labels = {
            team: 'Collectif',
            enterprise: 'Entreprise',
            creative: 'Créatif',
            tech: 'Tech'
        };
        badges.push({ type: trajectoryType, label: labels[trajectoryType] });
    }

    // Badge constance
    const consistency = calculateConsistency(userId);
    const isPersonalAccount = !trajectoryType || trajectoryType === 'solo'; // badges de constance réservés aux comptes perso
    if (consistency && isPersonalAccount) {
        const labels = {
            consistency7: '7j consécutifs (hebdo)',
            consistency30: '30j consécutifs (1 mois)',
            consistency100: '100j consécutifs',
            consistency365: '365j consécutifs'
        };
        badges.push({ type: consistency, label: labels[consistency] });
    }

    // Badge transparence
    if (evaluateTransparency(userId)) {
        badges.push({ type: 'transparent', label: 'Transparent' });
    }

    return badges;
}

// Récupérer les badges pour un contenu spécifique
function getContentBadges(content) {
    const badges = [];
    
    const stateLabels = {
        success: 'Victoire',
        failure: 'Bloqué',
        pause: 'Pause',
        empty: 'Vide'
    };

    badges.push({ type: content.state, label: stateLabels[content.state] });
    
    return badges;
}

// Générer HTML pour afficher les badges
function renderBadges(badgesList) {
    if (badgesList.length === 0) return '';
    
    return `
        <div class="badge-container">
            ${badgesList.map(b => generateBadge(b.type, b.label)).join('')}
        </div>
    `;
}

// Générer les icônes sociales pour la page profil
function renderProfileSocialLinks(userId) {
    const user = getUser(userId);
    if (!user.socialLinks || Object.keys(user.socialLinks).length === 0) {
        return '';
    }

    const platformLabels = {
        email: 'Email',
        github: 'GitHub',
        instagram: 'Instagram',
        snapchat: 'Snapchat',
        youtube: 'YouTube',
        twitter: 'X',
        tiktok: 'TikTok',
        linkedin: 'LinkedIn',
        twitch: 'Twitch',
        spotify: 'Spotify',
        discord: 'Discord',
        reddit: 'Reddit',
        pinterest: 'Pinterest',
        facebook: 'Facebook',
        site: 'Site'
    };

    const socialHtml = Object.entries(user.socialLinks)
        .filter(([_, url]) => url) // Filtrer les liens vides
        .map(([platform, url]) => {
            const label = platformLabels[platform] || platform;
            if (platform === 'email') {
                const email = String(url).trim();
                const safeEmail = email.replace(/"/g, '&quot;');
                return `
                    <button type="button"
                        class="social-badge"
                        title="Afficher et copier l'email"
                        onclick="handleEmailBadgeClick('${safeEmail}', this)">
                        <img src="./icons/email.svg" alt="email" class="social-badge-icon" />
                        <span class="email-reveal" style="display:none; margin-left:6px; font-size:0.85rem;"></span>
                    </button>
                `;
            }
            return `
                <a href="${url}" target="_blank" rel="noopener noreferrer" 
                   class="social-badge" 
                   title="Visiter ${label}">
                    <img src="./icons/${platform}.svg" alt="${platform}" class="social-badge-icon" />
                    <span>${label}</span>
                </a>
            `;
        })
        .join('');

    return socialHtml ? `<div class="profile-social-badges">${socialHtml}</div>` : '';
}

function handleEmailBadgeClick(email, el) {
    const badge = el;
    if (!badge) return;
    const span = badge.querySelector('.email-reveal');
    if (!span) return;

    const isVisible = badge.dataset.emailVisible === '1';
    if (isVisible) {
        span.style.display = 'none';
        badge.dataset.emailVisible = '0';
        return;
    }

    if (span.textContent !== email) span.textContent = email;
    span.style.display = 'inline';
    badge.dataset.emailVisible = '1';

    const doToast = (msg) => {
        if (window.ToastManager && typeof window.ToastManager.success === 'function') {
            window.ToastManager.success('Email', msg);
        }
    };

    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(email).then(() => {
            doToast('Copié dans le presse-papiers');
        }).catch(() => {});
    } else {
        const textarea = document.createElement('textarea');
        textarea.value = email;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            doToast('Copié dans le presse-papiers');
        } catch (e) {
        }
        document.body.removeChild(textarea);
    }
}

/* ========================================
   INTERFACE RÉGLAGES - RENDU
   ======================================== */

// Générer l'interface de réglages 
function renderSettingsModal(userId) {
    const user = getUser(userId);
    if (!user) return '';
    
    const editData = userEditData[userId];
    if (!editData) initUserEditData(userId);
    
    const data = userEditData[userId];
    const socialData = [
        { platform: 'email', label: 'Email', icon: './icons/email.svg' },
        { platform: 'github', label: 'GitHub', icon: './icons/github.svg' },
        { platform: 'instagram', label: 'Instagram', icon: './icons/instagram.svg' },
        { platform: 'snapchat', label: 'Snapchat', icon: './icons/snapchat.svg' },
        { platform: 'twitter', label: 'X (Twitter)', icon: './icons/twitter.svg' },
        { platform: 'youtube', label: 'YouTube', icon: './icons/youtube.svg' },
        { platform: 'twitch', label: 'Twitch', icon: './icons/twitch.svg' },
        { platform: 'spotify', label: 'Spotify', icon: './icons/spotify.svg' },
        { platform: 'tiktok', label: 'TikTok', icon: './icons/tiktok.svg' },
        { platform: 'discord', label: 'Discord', icon: './icons/discord.svg' },
        { platform: 'reddit', label: 'Reddit', icon: './icons/reddit.svg' },
        { platform: 'pinterest', label: 'Pinterest', icon: './icons/pinterest.svg' },
        { platform: 'linkedin', label: 'LinkedIn', icon: './icons/linkedin.svg' },
        { platform: 'facebook', label: 'Facebook', icon: './icons/facebook.svg' },
        { platform: 'site', label: 'Site personnel', icon: './icons/link.svg' }
    ];

    let socialLinksHtml = socialData.map(social => {
        const value = data.socialLinks[social.platform] || '';
        const isEmail = social.platform === 'email';
        return `
            <div class="social-link-item">
                <img src="${social.icon}" alt="${social.label}" style="opacity: 0.7;">
                <input 
                    type="${isEmail ? 'email' : 'url'}" 
                    class="form-input"
                    placeholder="${isEmail ? 'email@exemple.com' : (social.platform === 'site' ? 'https://example.com' : `${social.label.toLowerCase()}.com/username`)}"
                    value="${value}"
                    onchange="userEditData['${userId}'].socialLinks['${social.platform}'] = this.value"
                >
            </div>
        `;
    }).join('');

    const themeButtonText = isLightMode() ? '🌙 Passer en mode sombre' : '☀️ Passer en mode clair';

    return `
        <div class="settings-header">
            <h2>Paramètres</h2>
            <p>Ajustez les détails de votre trajectoire publique.</p>
        </div>

        <form id="settingsForm-${userId}" onsubmit="return handleSettingsSave('${userId}')" novalidate>
            <!-- SECTION IDENTITÉ -->
            <div class="settings-section">
                <h3>Identité Visuelle</h3>
                
                <div class="form-group">
                    <label>Avatar</label>
                    <div class="upload-zone">
                        <img id="avatarPreview-${userId}" src="${data.avatar}" class="preview-avatar-circle" alt="Avatar" onclick="document.getElementById('avatarUpload-${userId}').click()">
                        <div>
                            <label for="avatarUpload-${userId}" class="custom-file-upload">
                                Parcourir les fichiers
                            </label>
                            <input 
                                id="avatarUpload-${userId}" 
                                type="file" 
                                accept="image/*" 
                                onchange="(function(input) { 
                                    const reader = new FileReader();
                                    reader.onload = function(e) {
                                        userEditData['${userId}'].avatar = e.target.result;
                                        handleImagePreview(input, 'avatarPreview-${userId}');
                                    };
                                    if(input.files[0]) reader.readAsDataURL(input.files[0]);
                                })(this)"
                            />
                            <div class="form-hint">Format carré recommandé. Max 2MB.</div>
                        </div>
                    </div>
                </div>

                <div class="form-group">
                    <label>Bannière de profil</label>
                    <img id="bannerPreview-${userId}" src="${data.banner}" class="preview-banner-rect" alt="Bannière" onclick="document.getElementById('bannerUpload-${userId}').click()">
                    <label for="bannerUpload-${userId}" class="custom-file-upload">
                        Importer une image
                    </label>
                    <input 
                        id="bannerUpload-${userId}" 
                        type="file" 
                        accept="image/*" 
                        onchange="(function(input) { 
                            const reader = new FileReader();
                            reader.onload = function(e) {
                                userEditData['${userId}'].banner = e.target.result;
                                handleImagePreview(input, 'bannerPreview-${userId}');
                            };
                            if(input.files[0]) reader.readAsDataURL(input.files[0]);
                        })(this)"
                    />
                </div>

                <div class="form-group">
                    <label>Nom public</label>
                    <input 
                        type="text" 
                        class="form-input"
                        value="${data.name}"
                        placeholder="Ex: Jean Dupont"
                        onchange="userEditData['${userId}'].name = this.value"
                        maxlength="50"
                        required
                    >
                </div>

                <div class="form-group">
                    <label>Bio courte</label>
                    <textarea 
                        class="form-input"
                        rows="2"
                        maxlength="120"
                        placeholder="Une phrase qui définit votre travail..."
                        onchange="userEditData['${userId}'].bio = this.value"
                    >${data.bio}</textarea>
                    <div class="form-hint">Restez concis. Max 120 caractères.</div>
                </div>
            </div>

            <!-- SECTION LIENS -->
            <details class="settings-section settings-collapsible" open>
                <summary>Réseaux & Liens</summary>
                <div class="settings-collapsible-body">
                    <p>Connectez vos autres espaces pour offrir plus de contexte à votre progression.</p>
                    
                    ${socialLinksHtml}

                    <div class="consent-label">
                        Les modifications sont instantanées dès la validation.
                    </div>
                </div>
            </details>

            <!-- SECTION THÈME -->
            <div class="settings-section">
                <h3>Apparence</h3>
                <div class="form-group">
                    <label>Mode sombre/clair</label>
                    <button 
                        type="button" 
                        class="btn-theme-toggle"
                        id="theme-toggle-btn"
                        onclick="toggleTheme(); document.getElementById('theme-toggle-btn').textContent = isLightMode() ? '🌙 Passer en mode sombre' : '☀️ Passer en mode clair'"
                    >
                        ${themeButtonText}
                    </button>
                    <div class="form-hint">Choisissez votre thème préféré pour une meilleure lisibilité.</div>
                </div>
            </div>

            <!-- SECTION LANGUE -->
            <div class="settings-section">
                <h3>Langue</h3>
                <div class="form-group">
                    <label for="lang-select">Choisissez votre langue</label>
                    <select id="lang-select" class="lang-select">
                        <option value="en">English (US)</option>
                        <option value="fr">Français</option>
                    </select>
                    <div class="form-hint">La langue est aussi détectée automatiquement selon votre localisation.</div>
                </div>
            </div>

            <!-- ACTIONS -->
            <div class="actions-bar">
                <button type="submit" class="btn-save">Mettre à jour</button>
                <button type="button" class="btn-cancel" onclick="closeSettings()">Ignorer</button>
            </div>
        </form>
    `;
}

// Gérer l'aperçu d'image
function handleImagePreview(input, previewId) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = document.getElementById(previewId);
            if (preview) {
                preview.src = e.target.result;
            }
        };
        reader.readAsDataURL(input.files[0]);
    }
}

// Mettre à jour le compteur de caractères
function updateCharCount(textarea) {
    const display = document.getElementById('char-count-display');
    if (display) {
        display.textContent = textarea.value.length;
    }
}

// Gérer la sauvegarde des réglages
function handleSettingsSave(userId) {
    if (saveUserChanges(userId)) {
        // Refresh du profil
        navigateToUserProfile(userId);
        closeSettings();
    }
    return false;
}

function ensureSettingsModal() {
    if (document.getElementById('settings-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'settings-modal';
    modal.innerHTML = '<div class="settings-container"></div>';
    document.body.appendChild(modal);
}

// Ouvrir la modale de réglages
function openSettings(userId) {
    initUserEditData(userId);
    ensureSettingsModal();
    const modal = document.getElementById('settings-modal');
    const container = modal.querySelector('.settings-container');
    container.innerHTML = renderSettingsModal(userId);
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    if (window.refreshLanguageControl) {
        window.refreshLanguageControl();
    }
}

// Fermer la modale de réglages
function closeSettings() {
    const modal = document.getElementById('settings-modal');
    modal.classList.remove('active');
    document.body.style.overflow = 'auto';
}

/* ========================================
   COUCHE RENDERING - Construction DOM
   ======================================== */

// Construire une carte utilisateur (Discover)
function renderUserCard(userId) {
    const user = getUser(userId);
    const latestContent = getLatestContent(userId);
    const dominantState = getDominantState(userId);
    
    if (!latestContent) return '';
    
    const stateColor = dominantState === 'success' ? '#10b981' 
                     : dominantState === 'failure' ? '#ef4444'
                     : '#6366f1';

    const userBadges = getUserBadges(userId);
    const badgesHtml = renderBadges(userBadges);

    // media preview: video or image when available
    let mediaHtml = '';
    if (latestContent && latestContent.mediaUrl) {
        if (latestContent.type === 'video') {
            mediaHtml = `
                <div class="card-media-wrap">
                    <video id="video-${userId}" class="card-media" src="${latestContent.mediaUrl}" muted playsinline autoplay preload="metadata" tabindex="-1" data-user-id="${userId}" disablePictureInPicture></video>
                </div>
            `;
        } else if (latestContent.type === 'image') {
            mediaHtml = `
                <div class="card-media-wrap">
                    <img class="card-media" src="${latestContent.mediaUrl}" alt="${latestContent.title || 'Preview'}">
                </div>
            `;
        }
    }

    return `
        <div class="user-card" data-user="${userId}" onclick="openImmersive('${userId}')">
            ${mediaHtml}
            <div class="card-top">
                <img src="${user.avatar}" class="card-avatar" onclick="event.stopPropagation(); navigateToUserProfile('${userId}')">
                <div class="card-meta">
                    <h3 onclick="event.stopPropagation(); navigateToUserProfile('${userId}')">${user.name}</h3>
                    <span>${user.title}</span>
                </div>
            </div>
            <div class="card-status" style="border-color: ${stateColor}20; color: ${stateColor};">
                <span class="status-day">J-${latestContent ? latestContent.dayNumber : 0}</span>
                ${latestContent ? latestContent.title : ''}
            </div>
            ${badgesHtml}
        </div>
    `;

}

// Construire les posts immersifs
function renderImmersiveContent(userId) {
    const contents = getUserContent(userId);
    
    return contents.map(content => {
        const stateLabel = content.state === 'success' ? '#Victoire'
                         : content.state === 'failure' ? '#Bloqué'
                         : '#Pause';
        
        const contentBadges = getContentBadges(content);
        const badgesHtml = renderBadges(contentBadges);
        
        let mediaHtml = '';
        if (content.mediaUrl) {
            if (content.type === 'video') {
                mediaHtml = `
                    <div class="immersive-video-wrap">
                        <video class="immersive-video" src="${content.mediaUrl}" muted autoplay loop playsinline preload="metadata"></video>
                    </div>
                `;
            } else {
                mediaHtml = `<img class="immersive-media" src="${content.mediaUrl}" alt="${content.title || 'Media'}">`;
            }
        } else {
            mediaHtml = `
                <div class="immersive-placeholder">
                    Jour ${content.dayNumber}
                </div>
            `;
        }

        return `
            <div class="immersive-post">
                <div class="post-content-wrap">
                    ${mediaHtml}
                    <div class="post-info">
                        <span class="step-indicator">Jour ${content.dayNumber}</span>
                        <span class="state-tag">${stateLabel}</span>
                        <h2>${content.title}</h2>
                        <p>${content.description}</p>
                        <div class="badges-immersive">
                            ${badgesHtml}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Construire la documentation d'un projet (optionnelle)
function renderProjectDoc(project) {
    const doc = project.doc || {};
    const values = Object.values(doc).filter(v => v && String(v).trim().length > 0);
    if (values.length === 0) return '';

    const tag = (label, value) => value ? `<span class="project-tag"><strong>${label}:</strong> ${value}</span>` : '';
    const section = (label, value) => value ? `
        <div class="project-doc-section">
            <h5>${label}</h5>
            <p>${value}</p>
        </div>
    ` : '';

    const links = [
        doc.demoUrl ? `<a class="project-link" href="${doc.demoUrl}" target="_blank" rel="noopener">Démo</a>` : '',
        doc.repoUrl ? `<a class="project-link" href="${doc.repoUrl}" target="_blank" rel="noopener">Repo</a>` : ''
    ].filter(Boolean).join('');

    return `
        <details class="project-doc">
            <summary>Documentation</summary>
            <div class="project-doc-body">
                <div class="project-tags">
                    ${tag('Rôle', doc.role)}
                    ${tag('Durée', doc.duration)}
                    ${tag('Stack', doc.stack)}
                    ${tag('Statut', doc.status)}
                </div>
                ${links ? `<div class="project-links">${links}</div>` : ''}
                ${section('Problème / Opportunité', doc.problem)}
                ${section('Solution', doc.solution)}
                ${section('Choix techniques', doc.decisions)}
                ${section('Résultats / Preuves', doc.results)}
                ${section('Apprentissages', doc.learnings)}
                ${section('Prochaine étape', doc.nextSteps)}
            </div>
        </details>
    `;
}

// Construire la timeline du profil
function renderProfileTimeline(userId, viewerId = 'user-1') {
    const user = getUser(userId);
    const viewer = getUser(viewerId);
    const timeline = getProfileTimeline(userId);
    const userBadges = getUserBadges(userId);
    const userBadgesHtml = renderBadges(userBadges);
    
    // Déterminer si c'est le profil de l'utilisateur courant
    const isOwnProfile = userId === viewerId;
    const isFollowingThisUser = !isOwnProfile && isFollowing(viewerId, userId);
    
            // Bouton Réglages (visible seulement pour le propriétaire) - rendu comme un badge
            const settingsButtonHtml = isOwnProfile ? `
                <button class="badge settings-badge" onclick="openSettings('${userId}')" title="Réglages">
                    <div class="badge-icon"><img src="./icons/reglages.svg" alt="Réglages" style="width:100%;height:100%;"></div>
                    <span>Réglages</span>
                </button>
            ` : '';
    
    // Bouton Follow (visible seulement pour les autres profils)
    const followButtonHtml = !isOwnProfile ? `
        <button 
            class="btn-follow ${isFollowingThisUser ? 'unfollow' : ''}"
            onclick="toggleFollow('${viewerId}', '${userId}')"
            id="follow-btn-${userId}"
            style="background: transparent; border: none; padding: 0; width: auto;"
        >
            <img src="${isFollowingThisUser ? 'icons/subscribed.svg' : 'icons/subscribe.svg'}" class="btn-icon" style="width: 24px; height: 24px;">
        </button>
    ` : '';
    
    // Stats de followers
    const followerCount = getFollowerCount(userId);
    const followingCount = getFollowingCount(userId);
    
    // Générer les items de timeline
    const timelineItems = timeline.map(item => {
        if (item.state === 'empty') {
            // Générer SVG pour vide
            const emptyBadgeSvg = `
                <div class="timeline-dot-badge">
                    ${badgeSVGs.empty}
                </div>
            `;
            
            return `
                <div class="timeline-item item-empty">
                    ${emptyBadgeSvg}
                    <div class="timeline-date">Jour ${item.dayNumber}</div>
                    <div class="timeline-card" style="opacity: 0.5;">
                        <span class="empty-indicator">Aucune trace aujourd'hui.</span>
                    </div>
                </div>
            `;
        }

        const content = item.content;
        const itemClass = `item-${content.state}`;
        const dateFormatted = new Intl.DateTimeFormat('fr-FR', { 
            month: 'long', 
            day: 'numeric' 
        }).format(content.createdAt);

        // Générer SVG du badge selon l'état
        let stateBadgeSvg = '';
        if (content.state === 'success') {
            stateBadgeSvg = badgeSVGs.success;
        } else if (content.state === 'failure') {
            stateBadgeSvg = badgeSVGs.failure;
        } else if (content.state === 'pause') {
            stateBadgeSvg = badgeSVGs.pause;
        }

        return `
            <div class="timeline-item ${itemClass}">
                <div class="timeline-dot-badge filled">
                    ${stateBadgeSvg}
                </div>
                <div class="timeline-date">${dateFormatted} - Jour ${content.dayNumber}</div>
                <div class="timeline-card">
                    <h4>${content.title}</h4>
                    <p>${content.description}</p>
                </div>
            </div>
        `;
    }).join('');
    
    // Afficher seulement le dernier item et un bouton pour expand/collapse
    const latestTimelineItem = timelineItems; // Tous les items par défaut cachés
    const timelineCollapsedHtml = timeline.length > 0 ? `
        <div class="timeline-latest">
            <div class="timeline-item-latest">
                ${(() => {
                    const lastItem = timeline[timeline.length - 1];
                    if (lastItem.state === 'empty') {
                        return `
                            <div class="timeline-dot-badge">
                                ${badgeSVGs.empty}
                            </div>
                            <div class="timeline-date">Jour ${lastItem.dayNumber}</div>
                            <div class="timeline-card" style="opacity: 0.5;">
                                <span class="empty-indicator">Aucune trace aujourd'hui.</span>
                            </div>
                        `;
                    } else {
                        const content = lastItem.content;
                        let stateBadgeSvg = '';
                        if (content.state === 'success') {
                            stateBadgeSvg = badgeSVGs.success;
                        } else if (content.state === 'failure') {
                            stateBadgeSvg = badgeSVGs.failure;
                        } else if (content.state === 'pause') {
                            stateBadgeSvg = badgeSVGs.pause;
                        }
                        const dateFormatted = new Intl.DateTimeFormat('fr-FR', { 
                            month: 'long', 
                            day: 'numeric' 
                        }).format(content.createdAt);
                        
                        return `
                            <div class="timeline-dot-badge filled">
                                ${stateBadgeSvg}
                            </div>
                            <div class="timeline-date">${dateFormatted} - Jour ${content.dayNumber}</div>
                            <div class="timeline-card">
                                <h4>${content.title}</h4>
                                <p>${content.description}</p>
                            </div>
                        `;
                    }
                })()}
            </div>
            <button class="btn-toggle-timeline" onclick="toggleTimelineExpand(this)">
                <span class="toggle-text">Afficher l'historique complet</span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            </button>
            <div class="timeline-full hidden" id="timeline-full-${userId}">
                ${timelineItems}
            </div>
        </div>
    ` : '';
    
    const timelinesHtml = timelineCollapsedHtml;

    const bannerHtml = user.banner ? `<img src="${user.banner}" class="profile-banner" alt="Bannière de ${user.name}">` : '';

    const projects = user.projects || [];
    const projectsHtml = projects.length ? `
        <div class="projects-grid">
            ${projects.map(p => `
                <div class="project-card">
                    <img src="${p.cover || user.banner || user.avatar}" class="project-cover" alt="Cover">
                    <div class="project-meta">
                        <h4>${p.name}</h4>
                        <p>${p.desc || ''}</p>
                        ${renderProjectDoc(p)}
                    </div>
                </div>
            `).join('')}
        </div>
    ` : '';

    const profileHtml = `
        ${bannerHtml}
        <div class="profile-hero">
            <div class="profile-avatar-wrapper">
                <img src="${user.avatar}" class="profile-avatar-img" alt="Avatar de ${user.name}">
            </div>
            <h2>${isOwnProfile ? 'Ma Trajectoire' : user.name}</h2>
            <p style="color: var(--text-secondary);">En train de bâtir <strong>${user.title}</strong></p>
            ${userBadgesHtml}
            ${renderProfileSocialLinks(userId)}
            
            ${!isOwnProfile ? `
                        <div class="follow-section">
                            <div class="follower-stat">
                                <div class="follower-stat-count">${followerCount}</div>
                                <div class="follower-stat-label">Abonnés</div>
                            </div>
                            <div class="follower-stat">
                                <div class="follower-stat-count">${followingCount}</div>
                                <div class="follower-stat-label">Abonnements</div>
                            </div>
                        </div>
                        ${followButtonHtml}
                    ` : `
                        <div class="follow-section">
                            <div class="follower-stat">
                                <div class="follower-stat-count">${followerCount}</div>
                                <div class="follower-stat-label">Abonnés</div>
                            </div>
                            <div class="follower-stat">
                                <div class="follower-stat-count">${followingCount}</div>
                                <div class="follower-stat-label">Abonnements</div>
                            </div>
                        </div>
                        <div style="margin-top:6px; display:flex; gap:8px; align-items:center;"> 
                            <button class="btn-add" onclick="openCreateMenu('${userId}')" title="Ajouter">
                                <img src="./icons/plus.svg" alt="Ajouter" style="width:18px;height:18px">
                            </button>
                            ${settingsButtonHtml}
                        </div>
                    `}
        </div>
        ${projectsHtml}
        <div class="timeline">
            ${timelinesHtml}
        </div>
    `;
    
            // Ne pas injecter en fixe (le badge est rendu dans le profil)
            const settingsButtonContainer = document.getElementById('settings-button-container');
            if (settingsButtonContainer) {
                settingsButtonContainer.innerHTML = '';
            }

    return profileHtml;
}

/* ========================================
   CREATE MENU / MODALES POUR AJOUTER
   ======================================== */

function openCreateMenu(userId) {
    const modal = document.getElementById('create-modal') || createCreateModal();
    modal.dataset.userId = userId;
    modal.classList.add('active');
}

function createCreateModal() {
    const modal = document.createElement('div');
    modal.id = 'create-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-panel">
            <h3>Créer</h3>
            <div class="create-options">
                <button data-action="lp">Démarrer un LP (live)</button>
                <button data-action="project">Nouveau projet</button>
                <button data-action="post">Nouveau post</button>
            </div>
            <button class="close">Fermer</button>
        </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('.close').addEventListener('click', () => modal.classList.remove('active'));
    modal.querySelectorAll('.create-options button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = e.currentTarget.dataset.action;
            modal.classList.remove('active');
            if (action === 'project') showCreateProjectForm(modal.dataset.userId);
            if (action === 'post') showCreatePostForm(modal.dataset.userId);
            if (action === 'lp') window.location.href = 'create-stream.html';
        });
    });
    return modal;
}

function showCreateProjectForm(userId) {
    const form = document.createElement('div');
    form.className = 'modal-overlay active';
    form.innerHTML = `
        <div class="modal-panel form-panel">
            <h3>Nouveau projet</h3>
            <label>Nom<input id="proj-name" /></label>
            <label>Description<textarea id="proj-desc"></textarea></label>
            <label>Rôle<input id="proj-role" placeholder="Ex: Lead dev, Designer..." /></label>
            <label>Durée<input id="proj-duration" placeholder="Ex: 3 mois" /></label>
            <label>Stack<input id="proj-stack" placeholder="Ex: Unity, C#, Blender" /></label>
            <label>Statut
                <select id="proj-status">
                    <option value="">Non défini</option>
                    <option value="Idée">Idée</option>
                    <option value="Prototype">Prototype</option>
                    <option value="Beta">Beta</option>
                    <option value="Live">Live</option>
                    <option value="En pause">En pause</option>
                </select>
            </label>
            <label>Lien démo<input id="proj-demo" placeholder="https://..." /></label>
            <label>Lien repo<input id="proj-repo" placeholder="https://..." /></label>
            <label>Problème / Opportunité<textarea id="proj-problem"></textarea></label>
            <label>Solution<textarea id="proj-solution"></textarea></label>
            <label>Choix techniques<textarea id="proj-decisions"></textarea></label>
            <label>Résultats / Preuves<textarea id="proj-results"></textarea></label>
            <label>Apprentissages<textarea id="proj-learnings"></textarea></label>
            <label>Prochaine étape<textarea id="proj-next"></textarea></label>
            <label>Cover URL<input id="proj-cover" placeholder="https://..." /></label>
            <div style="margin-top:8px"><button id="proj-create">Créer</button> <button id="proj-cancel">Annuler</button></div>
        </div>
    `;
    document.body.appendChild(form);
    // upgraded: support file upload + url fallback
    // replace cover field with file + url inputs
    const panel = form.querySelector('.modal-panel');
    const coverLabel = panel.querySelector('label input#proj-cover')?.closest('label');
    if (coverLabel) coverLabel.innerHTML = 'Cover (fichier)<input id="proj-cover-file" type="file" accept="image/*" />';
    const urlLabel = document.createElement('label');
    urlLabel.innerHTML = 'Ou URL de cover<input id="proj-cover-url" class="form-input" placeholder="https://... (optionnel)" />';
    panel.insertBefore(urlLabel, panel.querySelector('div'));

    const coverFileInput = form.querySelector('#proj-cover-file');
    const coverUrlInput = form.querySelector('#proj-cover-url');
    form._coverData = null;
    coverFileInput.addEventListener('change', function() {
        const f = this.files && this.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = function(ev) { form._coverData = ev.target.result; };
        reader.readAsDataURL(f);
    });

    form.querySelector('#proj-cancel').addEventListener('click', () => form.remove());
    form.querySelector('#proj-create').addEventListener('click', () => {
        const name = form.querySelector('#proj-name').value.trim();
        const desc = form.querySelector('#proj-desc').value.trim();
        const role = form.querySelector('#proj-role').value.trim();
        const duration = form.querySelector('#proj-duration').value.trim();
        const stack = form.querySelector('#proj-stack').value.trim();
        const status = form.querySelector('#proj-status').value;
        const demoUrl = form.querySelector('#proj-demo').value.trim();
        const repoUrl = form.querySelector('#proj-repo').value.trim();
        const problem = form.querySelector('#proj-problem').value.trim();
        const solution = form.querySelector('#proj-solution').value.trim();
        const decisions = form.querySelector('#proj-decisions').value.trim();
        const results = form.querySelector('#proj-results').value.trim();
        const learnings = form.querySelector('#proj-learnings').value.trim();
        const nextSteps = form.querySelector('#proj-next').value.trim();
        const cover = form._coverData || (coverUrlInput.value && coverUrlInput.value.trim()) || null;
        if (!name) return alert('Donnez un nom au projet');
        const user = getUser(userId);
        user.projects = user.projects || [];
        const project = { 
            id: 'p_' + Date.now(), 
            name, 
            desc, 
            cover: cover, 
            contents: [],
            doc: {
                role,
                duration,
                stack,
                status,
                demoUrl,
                repoUrl,
                problem,
                solution,
                decisions,
                results,
                learnings,
                nextSteps
            }
        };
        user.projects.unshift(project);
        form.remove();
        if (currentUserId === userId) document.querySelector('.profile-container').innerHTML = renderProfileTimeline(userId, currentViewerId);
    });
}

function showCreatePostForm(userId) {
    const form = document.createElement('div');
    form.className = 'modal-overlay active';
    form.innerHTML = `
        <div class="modal-panel form-panel">
            <h3>Nouveau post</h3>
            <label>Type<select id="post-type"><option value="text">Texte</option><option value="image">Image</option><option value="video">Vidéo</option><option value="gif">GIF</option></select></label>
            <label>Contenu<textarea id="post-body"></textarea></label>
            <label>Fichier média (optionnel)<input id="post-media-file" type="file" accept="image/*,video/*" /></label>
            <label>Ou URL média<input id="post-media-url" class="form-input" placeholder="https://... (optionnel)" /></label>
            <div style="margin-top:8px"><button id="post-create">Publier</button> <button id="post-cancel">Annuler</button></div>
        </div>
    `;
    document.body.appendChild(form);
    const mediaFileInput = form.querySelector('#post-media-file');
    const mediaUrlInput = form.querySelector('#post-media-url');
    form._mediaData = null;
    mediaFileInput.addEventListener('change', function() {
        const f = this.files && this.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = function(ev) { form._mediaData = ev.target.result; };
        reader.readAsDataURL(f);
    });

    form.querySelector('#post-cancel').addEventListener('click', () => form.remove());
    form.querySelector('#post-create').addEventListener('click', () => {
        const type = form.querySelector('#post-type').value;
        const body = form.querySelector('#post-body').value.trim();
        const media = form._mediaData || (mediaUrlInput.value && mediaUrlInput.value.trim()) || null;
        const user = getUser(userId);
        user.posts = user.posts || [];
        const post = { id: 'post_' + Date.now(), type, body: body || null, media: media || null, createdAt: new Date().toISOString() };
        user.posts.unshift(post);
        form.remove();
        if (currentUserId === userId) document.querySelector('.profile-container').innerHTML = renderProfileTimeline(userId, currentViewerId);
    });
}

/* ========================================
   TOGGLE TIMELINE - Afficher/Masquer l'historique
   ======================================== */

function toggleTimelineExpand(button) {
    const timelineLatest = button.closest('.timeline-latest');
    const timelineFull = timelineLatest.querySelector('.timeline-full');
    const toggleText = button.querySelector('.toggle-text');
    const isExpanded = !timelineFull.classList.contains('hidden');
    
    if (isExpanded) {
        timelineFull.classList.add('hidden');
        toggleText.textContent = 'Afficher l\'historique complet';
        button.classList.remove('expanded');
    } else {
        timelineFull.classList.remove('hidden');
        toggleText.textContent = 'Masquer l\'historique';
        button.classList.add('expanded');
    }
}

// Setup video interactions: hover-play on desktop, autoplay muted on mobile
function setupDiscoverVideoInteractions() {
    const isMobile = window.matchMedia('(max-width: 700px)').matches;
    const cards = document.querySelectorAll('.user-card');

    cards.forEach(card => {
        const video = card.querySelector('video.card-media');
        if (!video) return;

        // Ensure muted & playsinline for autoplay on mobile
        video.muted = true;
        video.playsInline = true;

        if (isMobile) {
            // try to autoplay muted videos on mobile
            video.play().catch(() => {});
        } else {
            // desktop: play on hover, pause on leave
            card.addEventListener('mouseenter', () => {
                video.play().catch(() => {});
            });
            card.addEventListener('mouseleave', () => {
                try { video.pause(); video.currentTime = 0; } catch(e) {}
            });
            video.addEventListener('mouseover', () => video.play().catch(() => {}));
            video.addEventListener('mouseout', () => { try { video.pause(); video.currentTime = 0; } catch(e) {} });
        }
    });
}

/* ========================================
   SYSTÈME DE THÈME (CLAIR/SOMBRE)
   ======================================== */

// Initialiser le thème depuis le localStorage
function initTheme() {
    const savedTheme = localStorage.getItem('rize-theme');
    if (savedTheme === 'light') {
        document.documentElement.classList.add('light-mode');
    }
}

// Toggle thème
function toggleTheme() {
    const htmlElement = document.documentElement;
    htmlElement.classList.toggle('light-mode');
    
    // Sauvegarder la préférence
    if (htmlElement.classList.contains('light-mode')) {
        localStorage.setItem('rize-theme', 'light');
    } else {
        localStorage.setItem('rize-theme', 'dark');
    }
}

// Obtenir l'état du thème
function isLightMode() {
    return document.documentElement.classList.contains('light-mode');
}

/* ========================================
   COUCHE NAVIGATION
   ======================================== */

let currentUserId = 'user-1'; // User par défaut pour le profil
let currentViewerId = 'user-1'; // Utilisateur qui regarde le profil

function navigateTo(pageId) {
    const pages = document.querySelectorAll('.page');
    pages.forEach(p => p.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
    window.scrollTo(0, 0);
    // ajouter/supprimer une classe sur le body pour cibler le style spécifique
    document.body.classList.toggle('profile-open', pageId === 'profile');
}

function navigateToUserProfile(userId) {
    currentUserId = userId;
    const profileContainer = document.querySelector('.profile-container');
    profileContainer.innerHTML = renderProfileTimeline(userId, currentViewerId);
    navigateTo('profile');
}

function toggleFollow(viewerId, targetUserId) {
    if (isFollowing(viewerId, targetUserId)) {
        unfollowUser(viewerId, targetUserId);
    } else {
        followUser(viewerId, targetUserId);
    }
    
    // Refresh du bouton
    const btn = document.getElementById(`follow-btn-${targetUserId}`);
    if (btn) {
        const isNowFollowing = isFollowing(viewerId, targetUserId);
        btn.classList.toggle('unfollow', isNowFollowing);
        btn.innerHTML = `<img src="${isNowFollowing ? 'icons/subscribed.svg' : 'icons/subscribe.svg'}" class="btn-icon" style="width: 24px; height: 24px;">`;
    }
    
    // Mettre à jour les compteurs
    const userCard = document.querySelector(`.profile-hero`);
    if (userCard) {
        const followerCount = getFollowerCount(targetUserId);
        const followerStats = userCard.querySelectorAll('.follower-stat-count');
        if (followerStats[0]) {
            followerStats[0].textContent = followerCount;
        }
    }
}

function openImmersive(userId) {
    currentUserId = userId;
    const overlay = document.getElementById('immersive-overlay');
    overlay.innerHTML = `
        <div class="close-immersive" onclick="closeImmersive()">✕</div>
        ${renderImmersiveContent(userId)}
    `;
    overlay.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function closeImmersive() {
    document.getElementById('immersive-overlay').style.display = 'none';
    document.body.style.overflow = 'auto';
}

/* ========================================
   INITIALISATION
   ======================================== */

document.addEventListener('DOMContentLoaded', function() {
    // Initialiser le thème
    initTheme();

    // Remplir la grille Discover
    const grid = document.querySelector('.discover-grid');
    grid.innerHTML = mockUsers
        .map(user => renderUserCard(user.userId))
        .join('');

    // Setup video interactions for discover cards (hover play on desktop, autoplay muted on mobile)
    setupDiscoverVideoInteractions();

    // Remplir la section profil
    const profileContainer = document.querySelector('.profile-container');
    profileContainer.innerHTML = renderProfileTimeline('user-1');
});
