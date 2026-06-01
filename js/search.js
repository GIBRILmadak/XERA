/* ========================================
   SYSTÈME DE RECHERCHE
   ======================================== */

let searchResults = [];
let searchTimeout = null;
let searchSkeleton = null;

// Initialiser la recherche
function initializeSearch() {
    const searchInput = document.getElementById('search-input');
    const searchResultsContainer = document.getElementById('search-results');
    
    if (!searchInput || !searchResultsContainer) return;

    ensureSearchSkeleton();
    applyMobilePlaceholder(searchInput);
    
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        
        // Debounce pour éviter trop de requêtes
        clearTimeout(searchTimeout);
        
        if (query.length < 2) {
            searchResultsContainer.style.display = 'none';
            hideSearchSkeleton();
            return;
        }
        
        searchResultsContainer.style.display = 'none';
        showSearchSkeleton();
        searchTimeout = setTimeout(() => {
            performSearch(query);
        }, 300);
    });
    
    // Fermer les résultats en cliquant ailleurs
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            searchResultsContainer.style.display = 'none';
            hideSearchSkeleton();
        }
    });
}

// Effectuer la recherche
async function performSearch(query) {
    const searchResultsContainer = document.getElementById('search-results');
    const searchTerm = normalizeSearchQuery(query);

    if (!searchResultsContainer || searchTerm.length < 2) {
        hideSearchSkeleton();
        return;
    }
    
    try {
        // Rechercher dans les utilisateurs
        const { data: users, error: usersError } = await supabase
            .from('users')
            .select('*')
            .or(`name.ilike.%${searchTerm}%,title.ilike.%${searchTerm}%,bio.ilike.%${searchTerm}%`)
            .limit(10);
        
        if (usersError) throw usersError;
        
        // Rechercher dans le contenu
        const { data: content, error: contentError } = await supabase
            .from('content')
            .select('*, users(name, avatar)')
            .or(`title.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`)
            .limit(10);
        
        if (contentError) throw contentError;
        
        if (typeof window.recordSearchPreference === 'function') {
            window.recordSearchPreference(query);
        }
        
        // Afficher les résultats
        displaySearchResults(users || [], content || [], query);
        hideSearchSkeleton();
        
    } catch (error) {
        console.error('Erreur recherche:', error);
        searchResultsContainer.innerHTML = `
            <div class="search-error">
                <p>Erreur lors de la recherche</p>
            </div>
        `;
        searchResultsContainer.style.display = 'block';
        hideSearchSkeleton();
    }
}

// Afficher les résultats de recherche
function displaySearchResults(users, content, query) {
    const searchResultsContainer = document.getElementById('search-results');
    
    if (users.length === 0 && content.length === 0) {
        searchResultsContainer.innerHTML = `
            <div class="search-empty">
                <p>Aucun résultat pour "${escapeHtml(query)}"</p>
            </div>
        `;
        searchResultsContainer.style.display = 'block';
        return;
    }
    
    let html = '';
    
    // Section Utilisateurs
    if (users.length > 0) {
        html += '<div class="search-section">';
        html += '<h4 class="search-section-title">Utilisateurs</h4>';
        users.forEach(user => {
            const avatar = user.avatar || 'https://placehold.co/80';
            const name = user.name || 'Utilisateur';
            const title = user.title || '';
            html += `
                <div class="search-result-item" onclick="navigateToUserProfile('${user.id}'); document.getElementById('search-results').style.display='none';">
                    <img src="${escapeHtml(avatar)}" class="search-result-avatar" alt="${escapeHtml(name)}">
                    <div class="search-result-info">
                        <div class="search-result-name">${typeof window.renderUsernameWithBadge === 'function' ? window.renderUsernameWithBadge(highlightMatch(name, query), user.id) : highlightMatch(name, query)}</div>
                        <div class="search-result-meta">${escapeHtml(title)}</div>
                    </div>
                </div>
            `;
        });
        html += '</div>';
    }
    
    // Section Contenu
    if (content.length > 0) {
        html += '<div class="search-section">';
        html += '<h4 class="search-section-title">Publications</h4>';
        content.forEach(item => {
            const author = item.users || {};
            const authorName = author.name || 'Utilisateur';
            const authorAvatar = author.avatar || 'https://placehold.co/80';
            const title = item.title || 'Publication';
            html += `
                <div class="search-result-item" onclick="navigateToUserProfile('${item.user_id}'); document.getElementById('search-results').style.display='none';">
                    <img src="${escapeHtml(authorAvatar)}" class="search-result-avatar" alt="${escapeHtml(authorName)}">
                    <div class="search-result-info">
                        <div class="search-result-name">${highlightMatch(title, query)}</div>
                        <div class="search-result-meta">Par ${typeof window.renderUsernameWithBadge === 'function' ? window.renderUsernameWithBadge(escapeHtml(authorName), item.user_id) : escapeHtml(authorName)} • Jour ${escapeHtml(item.day_number || '')}</div>
                    </div>
                </div>
            `;
        });
        html += '</div>';
    }
    
    searchResultsContainer.innerHTML = html;
    searchResultsContainer.style.display = 'block';
}

function ensureSearchSkeleton() {
    if (searchSkeleton) return;
    const searchContainer = document.querySelector('.search-container');
    if (!searchContainer) return;
    const panel = document.createElement('div');
    panel.id = 'search-skeleton-modal';
    panel.className = 'search-skeleton-modal';
    panel.setAttribute('aria-hidden', 'true');
    panel.innerHTML = `
        <div class="search-skeleton-panel">
            ${buildSkeletonRows(5)}
        </div>
    `;
    searchContainer.appendChild(panel);
    searchSkeleton = panel;
}

function buildSkeletonRows(count) {
    const rows = [];
    for (let i = 0; i < count; i++) {
        rows.push(`
            <div class="search-skeleton-row">
                <div class="skeleton-avatar skeleton-shimmer"></div>
                <div class="search-skeleton-copy">
                    <div class="skeleton-line wide skeleton-shimmer"></div>
                    <div class="skeleton-line mid skeleton-shimmer"></div>
                </div>
            </div>
        `);
    }
    return rows.join('');
}

function showSearchSkeleton() {
    if (searchSkeleton) searchSkeleton.style.display = 'block';
}

function hideSearchSkeleton() {
    if (searchSkeleton) searchSkeleton.style.display = 'none';
}

function applyMobilePlaceholder(inputEl) {
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
        inputEl.placeholder = 'Rechercher';
    }
}

// Mettre en évidence les correspondances
function highlightMatch(text, query) {
    if (!text) return '';
    const escapedText = escapeHtml(text);
    const escapedQuery = escapeRegExp(query.trim());
    if (!escapedQuery) return escapedText;
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    return escapedText.replace(regex, '<mark>$1</mark>');
}

function normalizeSearchQuery(query) {
    return String(query || '')
        .trim()
        .replace(/[%,()]/g, ' ')
        .replace(/\s+/g, ' ');
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    })[char]);
}
