// --- ARCS MODULE ---

const ARC_HOOKS = [
    "30 jours pour devenir développeur frontend",
    "Créer une app utilisée par 100 personnes",
    "De zéro à premier client payant",
    "Lancer un SaaS en 30 jours",
    "Apprendre le code sans diplôme",
    "Construire un produit chaque jour pendant 14 jours",
    "Créer une startup sans lever de fonds",
    "Vivre de l’internet sans être connu",
    "Mon premier revenu en ligne",
    "Créer un produit open-source utile",
    "Passer de freelance à fondateur",
    "Apprendre l’IA sans maths",
    "Mon premier bug en production (et comment je l’ai réparé)",
    "De simple idée à produit réel",
    "Poster tous les jours pendant 30 jours",
    "De 0 vue à une communauté",
    "Créer du contenu sans montrer son visage",
    "De l’ombre à l’algorithme",
    "Apprendre à parler devant une caméra",
    "Construire une audience sans trends",
    "Faire du contenu utile, pas viral",
    "De créateur invisible à créateur régulier",
    "Trouver sa voix sur internet",
    "Créer sans pression de performance",
    "Vivre de ma musique",
    "Sortir un projet musical complet",
    "Créer une prod par jour",
    "Apprendre la MAO de zéro",
    "Publier sans avoir peur du regard",
    "Composer un EP en 30 jours",
    "De chambre à Spotify",
    "Reprendre confiance en ma créativité",
    "Créer sans validation extérieure",
    "Finir Hollow Knight en no-hit",
    "Terminer Dark Souls sans mourir",
    "De joueur casual à joueur discipliné",
    "Créer mon premier jeu vidéo",
    "Apprendre Unity de zéro",
    "De gamer à game dev",
    "Finir un jeu que j’ai abandonné",
    "Speedrun mon jeu préféré",
    "Créer un boss from scratch",
    "Reprendre le contrôle de ma vie",
    "30 jours sans procrastiner",
    "Me lever à 5h pendant 21 jours",
    "Construire une routine solide",
    "Apprendre à être constant",
    "Sortir du chaos",
    "Tenir une promesse que je me fais",
    "De bordel mental à clarté",
    "Redevenir fiable envers moi-même",
    "Perdre 10kg",
    "Reprendre le sport après des années",
    "Transformer mon corps sans salle",
    "30 jours sans sucre",
    "Courir 5km sans m’arrêter",
    "Construire une discipline physique",
    "Me sentir bien dans mon corps",
    "Passer de fatigué à énergique",
    "Documenter plutôt que réussir",
    "Construire en public, sans filtre",
    "Mon parcours, pas mon résultat",
    "Je ne suis pas encore arrivé",
    "Apprendre à échouer proprement",
    "Rendre visible l’effort",
    "Devenir quelqu’un, pas juste réussir",
    "Mon chaos en version documentée"
];

let hookInterval;

// --- INITIALIZATION ---


function renderArcCreationForm(arcToEdit = null) {
    const createContainer = document.querySelector('#create-modal .create-container');
    if (!createContainer) return;

    const isEdit = !!arcToEdit;
    const title = isEdit ? 'Modifier votre ARC' : 'Démarrez votre transformation';
    const btnText = isEdit ? 'Mettre à jour' : 'Lancer l\'ARC';
    
    // Default dates
    const today = new Date().toISOString().split('T')[0];
    let defaultStartDate = today;
    let defaultEndDate = "";

    if (isEdit) {
        if (arcToEdit.start_date) defaultStartDate = arcToEdit.start_date.split('T')[0];
        // Calculate end date based on duration
        if (arcToEdit.start_date && arcToEdit.duration_days) {
            const start = new Date(arcToEdit.start_date);
            const end = new Date(start);
            end.setDate(start.getDate() + arcToEdit.duration_days);
            defaultEndDate = end.toISOString().split('T')[0];
        }
    } else {
        // Default end date +30 days
        const end = new Date();
        end.setDate(end.getDate() + 30);
        defaultEndDate = end.toISOString().split('T')[0];
    }
    
    createContainer.innerHTML = `
        <div class="arc-creation-header">
            <h2>${title}</h2>
            <p>Qu'est-ce qu'un ARC ? Un conteneur d'objectifs reliant vos traces quotidiennes à votre résultat.</p>
        </div>

        <form id="create-arc-form" class="arc-form">
            ${isEdit ? `<input type="hidden" name="arc_id" value="${arcToEdit.id}">` : ''}
            
            <div class="form-group">
                <label for="arc-title">Titre de votre ARC *</label>
                <input type="text" id="arc-title" name="title" placeholder="Ex: 30 jours pour..." required class="form-input large-input" value="${isEdit ? escapeHtml(arcToEdit.title) : ''}">
            </div>

            <div class="form-group">
                <label for="arc-goal">Objectif final *</label>
                <textarea id="arc-goal" name="goal" placeholder="Ex: Site en ligne le 1er mars" rows="2" class="form-input" required>${isEdit ? escapeHtml(arcToEdit.goal || '') : ''}</textarea>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label for="arc-start-date">Date de début *</label>
                    <input type="date" id="arc-start-date" name="start_date" class="form-input" value="${defaultStartDate}" required>
                </div>
                <div class="form-group">
                    <label for="arc-end-date">Date de fin *</label>
                    <input type="date" id="arc-end-date" name="end_date" class="form-input" value="${defaultEndDate}" required>
                </div>
            </div>

            <div class="form-group">
                <label for="arc-description">Description (Optionnel)</label>
                <textarea id="arc-description" name="description" placeholder="Détails supplémentaires..." rows="3" class="form-input">${isEdit ? escapeHtml(arcToEdit.description || '') : ''}</textarea>
            </div>

            <div class="form-group">
                <label>Couverture de l'ARC (Image ou Vidéo)</label>
                <div id="arc-cover-upload-container">
                    <div class="upload-zone" id="arc-cover-dropzone" style="border: 2px dashed var(--border-color); padding: 2rem; border-radius: 12px; text-align: center; cursor: pointer; transition: all 0.3s ease; background: rgba(255,255,255,0.02);">
                        <div id="arc-cover-preview-container" style="${isEdit && arcToEdit.media_url ? 'display: block;' : 'display: none;'} margin-bottom: 1rem;">
                            ${isEdit && arcToEdit.media_url ? (arcToEdit.media_type === 'video' ? `<video src="${arcToEdit.media_url}" controls style="max-width: 100%; max-height: 200px; border-radius: 8px;"></video>` : `<img src="${arcToEdit.media_url}" style="max-width: 100%; max-height: 200px; border-radius: 8px;">`) : ''}
                        </div>
                        <div id="arc-cover-loader" style="display: none; margin-bottom: 1rem;">
                            <div class="loading-spinner" style="display:inline-block;"></div>
                            <p style="margin-top: 0.5rem; font-size: 0.8rem; color: var(--text-secondary);">Upload en cours...</p>
                        </div>
                        <div id="arc-cover-placeholder" style="${isEdit && arcToEdit.media_url ? 'display: none;' : ''}">
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--text-secondary); margin-bottom: 0.5rem;">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="17 8 12 3 7 8"></polyline>
                                <line x1="12" y1="3" x2="12" y2="15"></line>
                            </svg>
                            <p style="color: var(--text-secondary); font-size: 0.9rem;">Cliquez ou glissez une couverture</p>
                            <p style="color: var(--text-secondary); font-size: 0.75rem; opacity: 0.7;">JPG, PNG, GIF, MP4</p>
                        </div>
                    </div>
                    <input type="file" id="arc-cover-file" accept="image/*,video/*" style="display: none;">
                    <input type="hidden" name="media_url" id="arc-media-url" value="${isEdit && arcToEdit.media_url ? arcToEdit.media_url : ''}">
                    <input type="hidden" name="media_type" id="arc-media-type" value="${isEdit && arcToEdit.media_type ? arcToEdit.media_type : ''}">
                </div>
            </div>

            <div class="form-actions">
                <button type="submit" class="btn btn-primary btn-large">${btnText}</button>
                <button type="button" class="btn btn-ghost btn-large" onclick="closeCreateModal()">Annuler</button>
            </div>
        </form>
    `;
    
    // Attach event listener
    document.getElementById('create-arc-form').addEventListener('submit', handleCreateArc);

    // Initialize file upload
    if (typeof initializeFileInput === 'function') {
        const dropZone = document.getElementById('arc-cover-dropzone');
        const fileInput = document.getElementById('arc-cover-file');
        const previewContainer = document.getElementById('arc-cover-preview-container');
        const placeholder = document.getElementById('arc-cover-placeholder');
        const loader = document.getElementById('arc-cover-loader');
        
        if (dropZone && fileInput) {
            // Handle click
            dropZone.addEventListener('click', (e) => {
                if (e.target.tagName !== 'IMG' && e.target.tagName !== 'VIDEO') {
                    fileInput.click();
                }
            });

            // Loader handler
            fileInput.addEventListener('change', () => {
                 if (fileInput.files.length > 0) {
                     placeholder.style.display = 'none';
                     previewContainer.style.display = 'none';
                     loader.style.display = 'block';
                 }
            });

            initializeFileInput('arc-cover-file', {
                dropZone: dropZone,
                compress: true,
                onUpload: (result) => {
                    loader.style.display = 'none';
                    
                    if (result.success) {
                        document.getElementById('arc-media-url').value = result.url;
                        document.getElementById('arc-media-type').value = result.type;
                        
                        // Preview
                        previewContainer.style.display = 'block';
                        if (result.type === 'image') {
                            previewContainer.innerHTML = `<img src="${result.url}" style="max-width: 100%; max-height: 200px; border-radius: 8px;">`;
                        } else {
                            previewContainer.innerHTML = `<video src="${result.url}" controls style="max-width: 100%; max-height: 200px; border-radius: 8px;"></video>`;
                        }
                    } else {
                        placeholder.style.display = 'block';
                        alert('Erreur upload: ' + result.error);
                    }
                }
            });
        }
    }
}

function initArcs() {
    // Ne rien pré-rendre ici.
    // Le formulaire est injecté uniquement quand l'utilisateur ouvre la modale.
}

// --- HOOKS ANIMATION ---

function startHookAnimation() {
    const scroller = document.getElementById('hook-scroller');
    if (!scroller) return;

    // Clear existing
    scroller.innerHTML = '';
    
    let currentIndex = 0;
    
    // Shuffle hooks slightly or just pick random start
    const shuffledHooks = [...ARC_HOOKS].sort(() => 0.5 - Math.random());

    function showNextHook() {
        const text = shuffledHooks[currentIndex];
        const el = document.createElement('div');
        el.className = 'hook-item';
        el.textContent = `"${text}"`;
        scroller.appendChild(el);

        // Trigger enter animation
        requestAnimationFrame(() => {
            el.classList.add('active');
        });

        // Schedule exit
        setTimeout(() => {
            el.classList.remove('active');
            el.classList.add('exit');
            setTimeout(() => el.remove(), 500); // Remove after transition
        }, 3000);

        currentIndex = (currentIndex + 1) % shuffledHooks.length;
    }

    showNextHook();
    hookInterval = setInterval(showNextHook, 3500);
}

function stopHookAnimation() {
    if (hookInterval) {
        clearInterval(hookInterval);
        hookInterval = null;
    }
}

// --- MODAL CONTROL ---

function openCreateModal() {
    // Ensure form is rendered (reset to create mode)
    renderArcCreationForm();
    
    const modal = document.getElementById('create-modal');
    if (modal) {
        modal.classList.add('active');
        startHookAnimation();
    }
}

// Exposer la fonction globalement pour les onclick
window.openCreateModal = openCreateModal;

function openEditArcModal(arc) {
    if (!arc || !arc.id) {
        alert("Impossible d'ouvrir la modification de cet ARC.");
        return;
    }
    renderArcCreationForm(arc);
    const modal = document.getElementById('create-modal');
    if (modal) {
        modal.classList.add('active');
        // No hooks animation for edit
    }
}

function openArcEditFromDetails() {
    const arcToEdit = window.currentArc;
    if (!arcToEdit || !arcToEdit.id) {
        alert("Impossible de charger cet ARC pour modification.");
        return;
    }

    if (typeof window.closeImmersive === "function") {
        window.closeImmersive();
    } else {
        const overlay = document.getElementById("immersive-overlay");
        if (overlay) overlay.style.display = "none";
        document.body.style.overflow = "auto";
    }

    setTimeout(() => {
        openEditArcModal(arcToEdit);
    }, 80);
}

function closeCreateModal() {
    const modal = document.getElementById('create-modal');
    if (modal) {
        modal.classList.remove('active');
        stopHookAnimation();
    }
}

// Close modal when clicking outside
document.getElementById('create-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'create-modal') {
        closeCreateModal();
    }
});


// --- SUPABASE ACTIONS ---

async function getArcAuthUser() {
    if (window.currentUser && window.currentUser.id) return window.currentUser;
    try {
        const { data, error } = await supabase?.auth?.getUser?.();
        if (!error && data?.user) {
            window.currentUser = data.user;
            window.currentUserId = data.user.id;
            return data.user;
        }
    } catch (e) {
        // ignore
    }
    return null;
}

async function handleCreateArc(e) {
    e.preventDefault();

    if (typeof ensureOnlineOrNotify === "function") {
        const okOnline = await ensureOnlineOrNotify();
        if (!okOnline) return;
    }
    if (typeof ensureFreshSupabaseSession === "function") {
        const sessionCheck = await ensureFreshSupabaseSession();
        if (!sessionCheck.ok) {
            console.warn("Session refresh failed", sessionCheck.error);
        }
    }

    const authUser = await getArcAuthUser();
    if (!authUser) {
        alert("Vous devez être connecté pour créer un ARC.");
        return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = '<span class="loading-spinner"></span> Traitement...';

    const formData = new FormData(e.target);
    const arcId = formData.get('arc_id'); // If editing
    
    // Calculate duration from dates
    const startDateVal = formData.get('start_date');
    const endDateVal = formData.get('end_date');
    let durationDays = 30; // Default

    if (startDateVal && endDateVal) {
        const start = new Date(startDateVal);
        const end = new Date(endDateVal);
        const diffTime = end - start;
        durationDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (durationDays < 1) durationDays = 1;
    }

    const arcData = {
        title: formData.get('title'),
        goal: formData.get('goal'),
        description: formData.get('description'),
        duration_days: durationDays,
        start_date: startDateVal || new Date().toISOString(),
        media_url: formData.get('media_url') || null,
        media_type: formData.get('media_type') || null
    };
    
    // Only set user_id and status on creation
    if (!arcId) {
        arcData.user_id = authUser.id;
        arcData.status = 'in_progress';
    }

    try {
        let error;
        let createdArc = null;
        
        if (arcId) {
            // Update
            const { error: updateError } = await supabase
                .from('arcs')
                .update(arcData)
                .eq('id', arcId);
            error = updateError;
        } else {
            // Create
            const { data: insertedArc, error: insertError } = await supabase
                .from('arcs')
                .insert([arcData])
                .select('id')
                .single();
            createdArc = insertedArc || null;
            error = insertError;
        }

        if (error) throw error;

        const pendingPayload = window.pendingCreatePostAfterArc;
        const pendingIsFresh =
            pendingPayload &&
            (!pendingPayload.createdAt ||
                Date.now() - pendingPayload.createdAt < 15 * 60 * 1000);
        const pendingCreatePost =
            !arcId &&
            createdArc &&
            createdArc.id &&
            pendingPayload &&
            pendingPayload.userId === authUser.id &&
            pendingIsFresh;

        if (pendingCreatePost && typeof window.openCreateMenu === 'function') {
            if (typeof window.clearPendingCreatePostAfterArc === 'function') {
                window.clearPendingCreatePostAfterArc();
            } else {
                window.pendingCreatePostAfterArc = null;
            }
            closeCreateModal();
            e.target.reset();
            setTimeout(() => {
                window.openCreateMenu(authUser.id, createdArc.id);
            }, 120);
            return;
        }

        if (!arcId && createdArc && createdArc.id && typeof notifyFollowersOfArcStart === "function") {
            notifyFollowersOfArcStart({
                id: createdArc.id,
                user_id: authUser.id,
                title: arcData.title,
            }).catch((e) => console.warn("notifyFollowersOfArcStart error", e));
        }

        alert(arcId ? "ARC mis à jour avec succès !" : "ARC créé avec succès !");
        closeCreateModal();
        e.target.reset();
        
        // Refresh profile if on profile page
        if (document.getElementById('profile').classList.contains('active')) {
            loadUserArcs(authUser.id);
        }
        
        // If we were viewing details of this arc, reload them
        if (arcId && document.getElementById('immersive-overlay').style.display === 'block') {
            openArcDetails(arcId);
        }

    } catch (error) {
        console.error('Error saving ARC:', error);
        const msg = error?.message || String(error || "");
        const code = error?.code ? ` (${error.code})` : "";
        alert(`Erreur lors de l'enregistrement de l'ARC${code}: ${msg}`);
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}


async function loadUserArcs(userId) {
    const container = document.querySelector('.profile-container');
    if (!container) return;

    // Check if arcs section already exists
    let arcsSection = document.getElementById('user-arcs-section');
    if (!arcsSection) {
        arcsSection = document.createElement('div');
        arcsSection.id = 'user-arcs-section';
        arcsSection.className = 'arcs-section';
        // Insert after profile hero (banner/avatar) but before timeline
        const timeline = document.querySelector('.timeline');
        if (timeline) {
            container.insertBefore(arcsSection, timeline);
        } else {
            container.appendChild(arcsSection);
        }
    }

    try {
        const { data: ownedArcs, error } = await supabase
            .from('arcs')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        let collaboratorArcs = [];
        try {
            if (typeof window.fetchCollaboratorArcs === 'function') {
                collaboratorArcs = await window.fetchCollaboratorArcs(userId);
            } else {
                const { data: collabRows } = await supabase
                    .from('arc_collaborations')
                    .select('arc_id')
                    .eq('collaborator_id', userId)
                    .eq('status', 'accepted');
                const collabArcIds = Array.from(new Set((collabRows || []).map(r => r.arc_id).filter(Boolean)));
                if (collabArcIds.length > 0) {
                    const { data: collabArcsData } = await supabase
                        .from('arcs')
                        .select('*')
                        .in('id', collabArcIds)
                        .order('created_at', { ascending: false });
                    collaboratorArcs = collabArcsData || [];
                }
            }
        } catch (collabError) {
            console.error('Error loading collaborative ARCs:', collabError);
        }

        const arcMap = new Map();
        (ownedArcs || []).forEach(arc => arcMap.set(arc.id, { ...arc, _collabRole: 'owner' }));
        (collaboratorArcs || []).forEach(arc => {
            if (!arcMap.has(arc.id)) {
                arcMap.set(arc.id, { ...arc, _collabRole: 'collaborator' });
            }
        });
        const arcs = Array.from(arcMap.values());

        let viewerStatusMap = new Map();
        try {
            const viewerId = window.currentUser?.id;
            if (viewerId && arcs.length > 0) {
                if (typeof window.fetchArcCollabStatusMap === 'function') {
                    viewerStatusMap = await window.fetchArcCollabStatusMap(arcs.map(a => a.id), viewerId);
                } else {
                    const { data: statusRows } = await supabase
                        .from('arc_collaborations')
                        .select('arc_id, status')
                        .eq('collaborator_id', viewerId)
                        .in('arc_id', arcs.map(a => a.id));
                    (statusRows || []).forEach(row => {
                        if (row?.arc_id) viewerStatusMap.set(row.arc_id, row.status);
                    });
                }
            }
        } catch (statusError) {
            console.error('Error loading ARC collaboration status:', statusError);
        }

        let progressMap = new Map();
        try {
            const arcIds = arcs.map(a => a.id).filter(Boolean);
            if (arcIds.length > 0) {
                const { data: contentRows, error: contentError } = await supabase
                    .from('content')
                    .select('arc_id, day_number, is_deleted')
                    .in('arc_id', arcIds);
                if (contentError) throw contentError;
                const isSuper = typeof window.isSuperAdmin === 'function' ? window.isSuperAdmin() : false;
                const daysByArc = new Map();
                (contentRows || []).forEach(row => {
                    if (!row?.arc_id) return;
                    if (!isSuper && row.is_deleted) return;
                    const key = row.arc_id;
                    if (!daysByArc.has(key)) daysByArc.set(key, new Set());
                    if (row.day_number !== null && row.day_number !== undefined) {
                        daysByArc.get(key).add(row.day_number);
                    }
                });
                daysByArc.forEach((set, arcId) => {
                    progressMap.set(arcId, set.size);
                });
            }
        } catch (progressError) {
            console.error('Error computing ARC progress:', progressError);
        }

        if (arcs && arcs.length > 0) {
            arcsSection.innerHTML = `
                <h3 class="section-title">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                    </svg>
                    ARCs en cours
                </h3>
                <div class="arcs-grid">
                    ${arcs.map(arc => {
                        const progressDays = progressMap.get(arc.id) || 0;
                        return createArcCard({ ...arc, _progressDays: progressDays }, { viewerStatus: viewerStatusMap.get(arc.id), completedDays: progressDays });
                    }).join('')}
                </div>
            `;
        } else {
            arcsSection.innerHTML = ''; // Hide if no arcs
        }

    } catch (error) {
        console.error('Error loading ARCs:', error);
    }
}

function createArcCard(arc, options = {}) {
    const progress = calculateArcProgress(arc, { completedDays: options.completedDays });
    const statusLabels = {
        'in_progress': 'En cours',
        'completed': 'Terminé',
        'abandoned': 'Abandonné'
    };
    
    // Custom style for cover
    let styleAttr = '';
    let overlayClass = '';
    
    if (arc.media_url && arc.media_type === 'image') {
        styleAttr = `style="background-image: url('${arc.media_url}'); background-size: cover; background-position: center;"`;
        overlayClass = 'arc-card-has-cover';
    }

    const viewerId = window.currentUser?.id;
    const viewerStatus = options.viewerStatus;
    const canCollaborate = viewerId && viewerId !== arc.user_id;
    const collabBadgeHtml = arc._collabRole === 'collaborator'
        ? `<div style="margin-top:0.4rem; font-size:0.75rem; color: var(--text-secondary);">Collaboration</div>`
        : '';
    const ownerLabelHtml = arc._collabRole === 'collaborator' && arc.users?.name
        ? `<div style="margin-top:0.25rem; font-size:0.75rem; color: var(--text-secondary);">Par ${escapeHtml(arc.users.name)}</div>`
        : '';
    let collabActionHtml = '';
    if (canCollaborate) {
        if (viewerStatus === 'pending') {
            collabActionHtml = `<div style="margin-top:0.75rem; font-size:0.75rem; color: var(--text-secondary);">Demande envoyée</div>`;
        } else if (viewerStatus === 'accepted') {
            collabActionHtml = `
                <button onclick="event.stopPropagation(); window.leaveArcCollaboration ? window.leaveArcCollaboration('${arc.id}') : alert('Action indisponible');" class="btn btn-ghost" style="margin-top:0.75rem; width:100%; color: var(--failure); border-color: var(--failure);">
                    Quitter la collaboration
                </button>
            `;
        } else {
            collabActionHtml = `
                <button onclick="event.stopPropagation(); window.requestArcCollaboration ? window.requestArcCollaboration('${arc.id}', '${arc.user_id}') : alert('Action indisponible');" class="btn btn-ghost btn-collaborate" style="margin-top:0.75rem; width:100%;">
                    Collaborer
                </button>
            `;
        }
    }

    return `
        <div class="arc-card ${overlayClass}" onclick="openArcDetails('${arc.id}')" ${styleAttr}>
            <div class="arc-card-overlay"></div>
            <div class="arc-content-wrapper" style="position:relative; z-index:2;">
                <div class="arc-status-badge arc-status-${arc.status}">
                    ${statusLabels[arc.status] || arc.status}
                </div>
                <h4 class="arc-title" style="text-shadow: 0 2px 4px rgba(0,0,0,0.5);">${escapeHtml(arc.title)}</h4>
                <p class="arc-goal" style="text-shadow: 0 1px 2px rgba(0,0,0,0.5);">${escapeHtml(arc.goal || '')}</p>
                ${collabBadgeHtml}
                ${ownerLabelHtml}
                
                <div class="arc-progress-container">
                    <div class="arc-progress-bar" style="background:rgba(255,255,255,0.2);">
                        <div class="arc-progress-fill" style="width: ${progress}%"></div>
                    </div>
                    <div class="arc-meta" style="text-shadow: 0 1px 2px rgba(0,0,0,0.5);">
                        <span>J${calculateDaysSince(arc.start_date)} / ${arc.duration_days || '?'}</span>
                        <span>${progress}%</span>
                    </div>
                </div>
                ${collabActionHtml}
            </div>
        </div>
    `;
}

function calculateDaysSince(startDate) {
    if (!startDate) return 0;
    const start = new Date(startDate);
    const now = new Date();
    if (now < start) return 0;
    const diffTime = Math.abs(now - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    return diffDays;
}

function calculateArcProgress(arc, options = {}) {
    if (!arc || !arc.duration_days) return 0;
    const completedDays = typeof options.completedDays === 'number'
        ? options.completedDays
        : (typeof arc._progressDays === 'number' ? arc._progressDays : 0);
    const safeCompleted = Math.max(0, completedDays);
    const progress = Math.min(100, Math.round((safeCompleted / arc.duration_days) * 100));
    return progress;
}

function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&')
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/"/g, '"')
        .replace(/'/g, '&#039;');
}


// --- ARC DETAILS & INTERACTION ---

async function openArcDetails(arcId) {
    // Show loading state or overlay immediately
    const overlay = document.getElementById('immersive-overlay');
    overlay.style.display = 'block';
    overlay.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100vh;">Chargement...</div>';
    document.body.style.overflow = 'hidden';

    try {
        // 1. Fetch Arc Details
        const { data: arc, error: arcError } = await supabase
            .from('arcs')
            .select('*, users(name, avatar)')
            .eq('id', arcId)
            .single();

        if (arcError) throw arcError;

        // 2. Fetch Arc Stats (Followers)
        const { count: followersCount } = await supabase
            .from('arc_followers')
            .select('*', { count: 'exact', head: true })
            .eq('arc_id', arcId);

        // 3. Check if current user is following
        let isFollowing = false;
        if (currentUser) {
            const { data: followData } = await supabase
                .from('arc_followers')
                .select('*')
                .eq('arc_id', arcId)
                .eq('user_id', currentUser.id)
                .single();
            isFollowing = !!followData;
        }

        // 4. Fetch Associated Content
        const { data: content, error: contentError } = await supabase
            .from('content')
            .select('*')
            .eq('arc_id', arcId)
            .order('created_at', { ascending: false });

        if (contentError) throw contentError;

        const progressDaysSet = new Set(
            (content || []).map(c => c.day_number).filter(v => v !== null && v !== undefined)
        );
        arc._progressDays = progressDaysSet.size;

        // 5. Render
        renderArcDetails(arc, followersCount, isFollowing, content);

    } catch (error) {
        console.error("Error opening arc details:", error);
        overlay.innerHTML = '<div style="padding:2rem;text-align:center;">Erreur lors du chargement de l\'ARC. <br><button onclick="closeImmersive()">Fermer</button></div>';
    }
}

function renderArcDetails(arc, followersCount, isFollowing, content) {
    window.currentArc = arc;
    const overlay = document.getElementById('immersive-overlay');
    const isOwner = currentUser && currentUser.id === arc.user_id;
    const progress = calculateArcProgress(arc);
    const daysSince = calculateDaysSince(arc.start_date);

    const coverHtml = arc.media_url 
        ? (arc.media_type === 'video' 
            ? `<div class="arc-cover" style="width:100%; max-height:300px; overflow:hidden; border-radius:12px; margin-bottom:1.5rem;"><video src="${arc.media_url}" controls style="width:100%; height:100%; object-fit:cover;"></video></div>`
            : `<div class="arc-cover" style="width:100%; height:250px; background-image:url('${arc.media_url}'); background-size:cover; background-position:center; border-radius:12px; margin-bottom:1.5rem;"></div>`)
        : '';

    let actionButtons = '';
    if (isOwner) {
        if (arc.status === 'in_progress') {
            actionButtons = `
                <button class="btn btn-primary" onclick="window.openCreateMenu('${currentUser.id}', '${arc.id}'); closeImmersive();" style="width:100%; margin-bottom:1rem;">Poster une mise à jour</button>
                <div style="display:flex; gap:0.5rem; justify-content:center; flex-wrap:wrap;">
                    <button class="btn btn-ghost" onclick="updateArcStatus('${arc.id}', 'completed')">Terminer</button>
                    <button class="btn btn-ghost" onclick="window.openArcEditFromDetails ? window.openArcEditFromDetails() : (window.openEditArcModal && window.openEditArcModal(window.currentArc))">Modifier</button>
                    <button class="btn btn-ghost" style="color:var(--failure)" onclick="updateArcStatus('${arc.id}', 'abandoned')">Abandonner</button>
                </div>
            `;
        }
        // Always allow deletion
        actionButtons += `
            <button class="btn btn-ghost" style="color:var(--failure); border-color:var(--failure); margin-top:1rem;" onclick="deleteArc('${arc.id}')">Supprimer l'ARC</button>
        `;
    } else if (currentUser) {
        actionButtons = `
            <button class="btn ${isFollowing ? 'btn-ghost' : 'btn-primary'}" onclick="toggleFollowArc('${arc.id}')">
                ${isFollowing ? 'Ne plus suivre' : 'Suivre cet ARC'}
            </button>
        `;
    }

    const contentHtml = content && content.length > 0 
        ? `<div class="arc-content-grid">${content.map(c => createContentCardSimple(c, isOwner)).join('')}</div>`
        : `<p style="text-align:center; opacity:0.6; margin-top:2rem;">Aucune trace pour le moment.</p>`;

    overlay.innerHTML = `
        <div class="arc-details-container" style="max-width: 800px; margin: 0 auto; padding: 2rem; padding-bottom: 100px;">
            <button class="close-immersive" onclick="closeImmersive()" style="position:fixed; top:2rem; right:2rem; z-index:100; background:rgba(0,0,0,0.5); border:none; color:white; width:40px; height:40px; border-radius:50%; font-size:1.2rem; cursor:pointer;">✕</button>
            
            <div class="arc-details-hero">
                ${coverHtml}
                <div class="arc-status-badge arc-status-${arc.status}" style="display:inline-block; margin-bottom:1rem; position:static;">
                    ${arc.status === 'in_progress' ? 'En cours' : arc.status === 'completed' ? 'Terminé' : 'Abandonné'}
                </div>
                <h1 class="arc-details-title">${escapeHtml(arc.title)}</h1>
                <p style="font-size:1.2rem; color:var(--text-secondary); max-width:600px; margin:0 auto 2rem;">${escapeHtml(arc.goal)}</p>
                
                <div class="arc-details-stats">
                    <div class="stat-item">
                        <span class="stat-value">${daysSince}/${arc.duration_days || '?'}</span>
                        <span class="stat-label">Jours</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-value">${progress}%</span>
                        <span class="stat-label">Progression</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-value" id="arc-follower-count">${followersCount || 0}</span>
                        <span class="stat-label">Followers</span>
                    </div>
                </div>

                <div style="margin-top: 2rem; display:flex; flex-direction:column; align-items:center;">
                    ${actionButtons}
                </div>
            </div>

            <div class="arc-description" style="margin-bottom: 3rem; background: var(--surface-color); padding: 1.5rem; border-radius: 12px; border: 1px solid var(--border-color);">
                <h3 style="margin-bottom:0.5rem; font-size:1rem; text-transform:uppercase; letter-spacing:1px; color:var(--text-secondary);">À propos</h3>
                <p style="line-height:1.6;">${escapeHtml(arc.description || "Pas de description.")}</p>
                <div style="margin-top:1rem; font-size:0.9rem; opacity:0.7; border-top:1px solid var(--border-color); padding-top:1rem;">
                    Lancé le ${new Date(arc.start_date).toLocaleDateString()} par <strong>${escapeHtml(arc.users?.name || 'Inconnu')}</strong>
                </div>
            </div>

            <h3 style="border-bottom: 1px solid var(--border-color); padding-bottom: 1rem; margin-bottom: 2rem;">Trajectoire</h3>
            ${contentHtml}
        </div>
    `;
}

function createContentCardSimple(content, isOwner) {
    // Simplified version of content card for the list
    const date = new Date(content.created_at).toLocaleDateString();
    
    let stateClass = '';
    if (content.state === 'success') stateClass = 'item-success';
    else if (content.state === 'failure') stateClass = 'item-failure';
    else if (content.state === 'pause') stateClass = 'item-pause';
    
    let actions = '';
    if (isOwner) {
        actions = `
            <div class="timeline-actions" style="margin-top: 1rem; display: flex; gap: 0.5rem; justify-content: flex-end; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 0.5rem;">
                <button class="btn btn-ghost" style="padding: 0.2rem 0.6rem; font-size: 0.8rem;" onclick="event.stopPropagation(); window.editContent('${content.id}')">Modifier</button>
                <button class="btn btn-ghost" style="padding: 0.2rem 0.6rem; font-size: 0.8rem; color: var(--failure);" onclick="event.stopPropagation(); window.deleteContent('${content.id}')">Supprimer</button>
            </div>
        `;
    }

    return `
        <div class="timeline-item ${stateClass}" style="margin-bottom: 1.5rem;">
            <div class="timeline-date">${date} - Jour ${content.day_number}</div>
            <div class="timeline-card">
                <h4>${escapeHtml(content.title)}</h4>
                <p>${escapeHtml(content.description)}</p>
                ${content.media_url ? `<div style="margin-top:1rem;"><a href="${content.media_url}" target="_blank" style="color:var(--accent-color); text-decoration:underline;">Voir le média</a></div>` : ''}
                ${actions}
            </div>
        </div>
    `;
}

async function toggleFollowArc(arcId) {
    if (!currentUser) {
        alert("Connectez-vous pour suivre un ARC.");
        return;
    }

    try {
        // Check current status
        const { data: existing } = await supabase
            .from('arc_followers')
            .select('id')
            .eq('arc_id', arcId)
            .eq('user_id', currentUser.id)
            .single();

        if (existing) {
            // Unfollow
            await supabase.from('arc_followers').delete().eq('id', existing.id);
        } else {
            // Follow
            await supabase.from('arc_followers').insert([{
                arc_id: arcId,
                user_id: currentUser.id
            }]);
        }
        
        // Refresh view (lazy way: reload details)
        openArcDetails(arcId);

    } catch (error) {
        console.error("Error toggling follow:", error);
    }
}

async function updateArcStatus(arcId, newStatus) {
    if (!confirm(`Êtes-vous sûr de vouloir marquer cet ARC comme ${newStatus} ?`)) return;

    try {
        const { error } = await supabase
            .from('arcs')
            .update({ status: newStatus })
            .eq('id', arcId);

        if (error) throw error;
        
        // Refresh view
        openArcDetails(arcId);
        
        // Also refresh profile list if open
        if (document.getElementById('profile').classList.contains('active')) {
            loadUserArcs(currentUser.id);
        }

    } catch (error) {
        console.error("Error updating status:", error);
        alert("Erreur lors de la mise à jour.");
    }
}

async function deleteArc(arcId) {
    if (!confirm("Attention : Cette action est irréversible. Voulez-vous vraiment supprimer cet ARC et tout son historique ?")) return;
    
    try {
        const { error } = await supabase
            .from('arcs')
            .delete()
            .eq('id', arcId);

        if (error) throw error;

        alert("ARC supprimé.");
        closeImmersive();
        
        // Refresh profile if open
        if (document.getElementById('profile').classList.contains('active')) {
            loadUserArcs(currentUser.id);
        }
    } catch (error) {
        console.error("Error deleting ARC:", error);
        alert("Erreur lors de la suppression.");
    }
}

// Ensure closeImmersive is available globally or reuse the one in app-supabase.js
if (!window.closeImmersive) {
    window.closeImmersive = function() {
        document.getElementById('immersive-overlay').style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

// --- EXPORT ---
// Make functions available globally
window.initArcs = initArcs;
window.openCreateModal = openCreateModal;
window.openEditArcModal = openEditArcModal;
window.openArcEditFromDetails = openArcEditFromDetails;
window.closeCreateModal = closeCreateModal;
window.loadUserArcs = loadUserArcs;
window.openArcDetails = openArcDetails;
window.toggleFollowArc = toggleFollowArc;
window.updateArcStatus = updateArcStatus;
window.deleteArc = deleteArc;

// Auto-init when DOM loaded
document.addEventListener('DOMContentLoaded', initArcs);
