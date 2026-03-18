/* ========================================
   MESSAGERIE DIRECTE (DM)
   ======================================== */

(function () {
    const DM_PAGE_ID = "messages";
    const DM_MESSAGES_LIMIT = 60;
    const DM_BODY_MAX = 4000;

    const state = {
        initializedForUserId: null,
        selectedConversationId: null,
        conversations: [],
        conversationsById: new Map(),
        messagesByConversation: new Map(),
        usersById: new Map(),
        seenMessageIds: new Set(),
        realtimeChannel: null,
        pollingTimer: null,
        refreshTimer: null,
        routeHandled: false,
        realtimeWarned: false,
    };

    function getCurrentUserId() {
        return window.currentUserId || window.currentUser?.id || null;
    }

    function isLoggedIn() {
        return !!getCurrentUserId();
    }

    function hasDmPage() {
        return !!document.getElementById(DM_PAGE_ID);
    }

    function getDmSection() {
        return document.getElementById(DM_PAGE_ID);
    }

    function getDmMount() {
        return document.querySelector("#messages .messages-mount");
    }

    function getOrCreateNavBadge() {
        const badge = document.getElementById("messages-nav-badge");
        return badge || null;
    }

    function getNavButton() {
        return document.getElementById("messages-nav-btn");
    }

    function setNavButtonVisible(visible) {
        const btn = getNavButton();
        if (!btn) return;
        btn.style.display = visible ? "flex" : "none";
    }

    function setNavBadgeCount(count) {
        const badge = getOrCreateNavBadge();
        if (!badge) return;
        const value = Number(count) || 0;
        if (value > 0) {
            badge.textContent = value > 99 ? "99+" : String(value);
            badge.style.display = "flex";
        } else {
            badge.style.display = "none";
            badge.textContent = "";
        }
    }

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function trimSnippet(value, maxLen = 80) {
        const text = String(value || "").replace(/\s+/g, " ").trim();
        if (!text) return "";
        if (text.length <= maxLen) return text;
        return `${text.slice(0, maxLen - 1)}…`;
    }

    function isMissingAccountSubtypeColumnError(error) {
        const message = String(error?.message || "").toLowerCase();
        const mentionsColumn =
            message.includes("account_subtype") &&
            (message.includes("column") || message.includes("colonne"));
        const mentionsMissing =
            message.includes("does not exist") ||
            message.includes("n'existe pas") ||
            message.includes("could not find") ||
            message.includes("schema cache");
        return mentionsColumn && mentionsMissing;
    }

    function normalizeDiscoveryRole(value) {
        const raw = String(value || "")
            .trim()
            .toLowerCase();
        if (raw === "recruiter" || raw === "recruteur") return "recruiter";
        if (raw === "investor" || raw === "investisseur") return "investor";
        return "fan";
    }

    function getRoleBadgeMeta(value) {
        const role = normalizeDiscoveryRole(value);
        if (role === "recruiter") {
            return {
                role,
                label: "Recruteur",
                icon: "icons/recruteur.svg",
            };
        }
        if (role === "investor") {
            return {
                role,
                label: "Investisseur",
                icon: "icons/investisseur.svg",
            };
        }
        return null;
    }

    function renderRoleBadge(profile) {
        const roleMeta = getRoleBadgeMeta(
            profile?.accountSubtype || profile?.account_subtype || "",
        );
        if (!roleMeta) return "";
        return `<img src="${roleMeta.icon}" alt="${roleMeta.label}" title="Type de compte: ${roleMeta.label}" class="dm-role-badge dm-role-badge--${roleMeta.role}" />`;
    }

    function renderNameWithBadges(profile) {
        const safeName = escapeHtml(profile?.name || "Conversation");
        const userId = profile?.id || null;
        let verificationHtml = `<span class="username-label">${safeName}</span>`;

        if (userId && typeof window.renderUsernameWithBadge === "function") {
            try {
                verificationHtml =
                    window.renderUsernameWithBadge(safeName, userId) || verificationHtml;
            } catch (error) {
                verificationHtml = `<span class="username-label">${safeName}</span>`;
            }
        }

        const roleBadgeHtml = renderRoleBadge(profile);
        if (!roleBadgeHtml) return verificationHtml;
        return `<span class="dm-user-inline">${verificationHtml}${roleBadgeHtml}</span>`;
    }

    function buildProfileHref(userId) {
        if (window.XeraRouter?.buildUrl) {
            return window.XeraRouter.buildUrl("profile", {
                query: userId ? { user: userId } : {},
            });
        }
        if (!userId) return "profile.html";
        return `profile.html?user=${encodeURIComponent(userId)}`;
    }

    function openUserProfile(userId) {
        if (!userId) return;
        if (
            typeof window.navigateToUserProfile === "function" &&
            document.getElementById("profile")
        ) {
            Promise.resolve(window.navigateToUserProfile(userId)).catch((error) => {
                console.error("Navigate profile from messages failed:", error);
                window.location.href = buildProfileHref(userId);
            });
            return;
        }
        window.location.href = buildProfileHref(userId);
    }

    function handleMessageUserLinkClick(event) {
        const link = event.target.closest("[data-message-user-link='1']");
        if (!link) return false;
        const userId = link.getAttribute("data-user-id");
        if (!userId) return false;
        event.preventDefault();
        event.stopPropagation();
        openUserProfile(userId);
        return true;
    }

    function extractOtherUserIdFromPairKey(pairKey, currentUserId) {
        const parts = String(pairKey || "")
            .split(":")
            .map((part) => part.trim())
            .filter(Boolean);
        if (parts.length < 2) return null;
        return parts.find((id) => id !== currentUserId) || null;
    }

    function formatThreadTime(timestamp) {
        if (!timestamp) return "";
        const date = new Date(timestamp);
        if (!Number.isFinite(date.getTime())) return "";

        const now = new Date();
        const isSameDay =
            date.getFullYear() === now.getFullYear() &&
            date.getMonth() === now.getMonth() &&
            date.getDate() === now.getDate();

        try {
            if (isSameDay) {
                return date.toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                });
            }
            return date.toLocaleDateString("fr-FR", {
                day: "2-digit",
                month: "2-digit",
            });
        } catch (error) {
            return "";
        }
    }

    function formatMessageTime(timestamp) {
        if (!timestamp) return "";
        const date = new Date(timestamp);
        if (!Number.isFinite(date.getTime())) return "";
        try {
            return date.toLocaleTimeString("fr-FR", {
                hour: "2-digit",
                minute: "2-digit",
            });
        } catch (error) {
            return "";
        }
    }

    function ensureMessagesShell() {
        const mount = getDmMount();
        if (!mount) return false;
        if (mount.querySelector("#messages-shell")) return true;

        mount.innerHTML = `
            <div class="messages-page" id="messages-shell">
                <aside class="threads-panel" id="threads-panel">
                    <div class="messages-head">
                        <h3>Messages</h3>
                        <button type="button" id="messages-refresh-btn" class="btn-ghost messages-refresh-btn">Actualiser</button>
                    </div>
                    <div class="threads-list" id="threads-list"></div>
                </aside>
                <section class="chat-panel" id="chat-panel">
                    <div class="chat-header" id="chat-header">
                        <button type="button" class="messages-back-btn" id="messages-back-btn" aria-label="Retour">←</button>
                        <div class="chat-header-meta">
                            <div id="chat-header-name">Sélectionnez une conversation</div>
                            <div id="chat-header-sub"></div>
                        </div>
                    </div>
                    <div class="chat-messages" id="chat-messages">
                        <div class="loading-state">Choisissez une conversation pour commencer.</div>
                    </div>
                    <form class="chat-input-row" id="chat-input-form">
                        <input
                            id="chat-input"
                            class="form-input"
                            type="text"
                            maxlength="${DM_BODY_MAX}"
                            autocomplete="off"
                            placeholder="Écrire un message..."
                        />
                        <button type="submit" class="btn-verify" id="chat-send-btn">Envoyer</button>
                    </form>
                </section>
            </div>
        `;

        const refreshBtn = document.getElementById("messages-refresh-btn");
        if (refreshBtn) {
            refreshBtn.addEventListener("click", () => {
                refreshConversations({ preserveSelection: true }).catch((error) => {
                    console.error("Messages refresh error:", error);
                });
            });
        }

        const backBtn = document.getElementById("messages-back-btn");
        if (backBtn) {
            backBtn.addEventListener("click", () => {
                const shell = document.getElementById("messages-shell");
                if (shell) shell.classList.remove("mobile-thread-open");
            });
        }

        const list = document.getElementById("threads-list");
        if (list) {
            list.addEventListener("click", (event) => {
                if (handleMessageUserLinkClick(event)) return;
                const item = event.target.closest(".thread-item");
                if (!item) return;
                const conversationId = item.getAttribute("data-conversation-id");
                if (!conversationId) return;
                selectConversation(conversationId, { markRead: true, focusInput: true }).catch((error) => {
                    console.error("Conversation select error:", error);
                });
            });
        }

        const form = document.getElementById("chat-input-form");
        if (form) {
            form.addEventListener("submit", async (event) => {
                event.preventDefault();
                await sendCurrentMessage();
            });
        }

        const header = document.getElementById("chat-header");
        if (header) {
            header.addEventListener("click", (event) => {
                handleMessageUserLinkClick(event);
            });
        }

        const chat = document.getElementById("chat-messages");
        if (chat) {
            chat.addEventListener("click", (event) => {
                handleMessageUserLinkClick(event);
            });
        }

        return true;
    }

    function showSchemaMissingState() {
        if (!ensureMessagesShell()) return;
        const list = document.getElementById("threads-list");
        const chat = document.getElementById("chat-messages");
        if (list) {
            list.innerHTML = `<div class="loading-state">Messagerie indisponible: exécutez <code>sql/discovery-phase2-messaging.sql</code>.</div>`;
        }
        if (chat) {
            chat.innerHTML = `<div class="loading-state">Le schéma DM n'est pas encore installé sur la base de données.</div>`;
        }
    }

    function isMissingSchemaError(error) {
        const message = String(error?.message || "").toLowerCase();
        return (
            (message.includes("does not exist") ||
                message.includes("n'existe pas") ||
                message.includes("could not find")) &&
            (message.includes("dm_") || message.includes("get_or_create_dm_conversation"))
        );
    }

    function rememberMessageId(messageId) {
        if (!messageId) return;
        state.seenMessageIds.add(messageId);
        if (state.seenMessageIds.size > 4000) {
            const iterator = state.seenMessageIds.values();
            for (let i = 0; i < 500; i++) {
                const next = iterator.next();
                if (next.done) break;
                state.seenMessageIds.delete(next.value);
            }
        }
    }

    async function fetchUsers(userIds) {
        const missing = Array.from(new Set((userIds || []).filter(Boolean))).filter(
            (id) => !state.usersById.has(id),
        );
        if (missing.length === 0) return;

        let { data, error } = await supabase
            .from("users")
            .select("id, name, avatar, account_subtype")
            .in("id", missing);

        if (error && isMissingAccountSubtypeColumnError(error)) {
            const retry = await supabase
                .from("users")
                .select("id, name, avatar")
                .in("id", missing);
            data = retry.data;
            error = retry.error;
        }

        if (error) throw error;

        (data || []).forEach((user) => {
            state.usersById.set(user.id, user);
        });
    }

    async function fetchUnreadCount(conversationId, lastReadAt) {
        if (!conversationId) return 0;
        const currentUserId = getCurrentUserId();
        if (!currentUserId) return 0;

        let query = supabase
            .from("dm_messages")
            .select("id", { count: "exact", head: true })
            .eq("conversation_id", conversationId)
            .neq("sender_id", currentUserId);

        if (lastReadAt) {
            query = query.gt("created_at", lastReadAt);
        }

        const { count, error } = await query;
        if (error) throw error;
        return count || 0;
    }

    function getConversationDisplayUser(conversation) {
        const fallback = {
            id: null,
            name: "Conversation",
            avatar: "https://placehold.co/80x80?text=%F0%9F%92%AC",
        };
        if (!conversation) return fallback;
        const user = state.usersById.get(conversation.otherUserId || "") || null;
        return {
            id: conversation.otherUserId || user?.id || null,
            name: user?.name || conversation.otherName || "Conversation",
            avatar:
                user?.avatar ||
                conversation.otherAvatar ||
                "https://placehold.co/80x80?text=%F0%9F%92%AC",
            accountSubtype:
                user?.account_subtype ||
                user?.accountSubtype ||
                conversation.otherAccountSubtype ||
                null,
        };
    }

    function getUnreadTotal() {
        return state.conversations.reduce((sum, item) => sum + (item.unreadCount || 0), 0);
    }

    function renderThreadsList() {
        if (!ensureMessagesShell()) return;
        const list = document.getElementById("threads-list");
        if (!list) return;

        if (!state.conversations.length) {
            list.innerHTML = `<div class="loading-state">Aucune conversation pour le moment.</div>`;
            return;
        }

        list.innerHTML = state.conversations
            .map((conversation) => {
                const profile = getConversationDisplayUser(conversation);
                const activeClass =
                    state.selectedConversationId === conversation.id ? " active" : "";
                const lastMessage = conversation.lastMessage || null;
                const snippet = trimSnippet(lastMessage?.body || "Commencez la discussion", 56);
                const timeLabel = formatThreadTime(
                    lastMessage?.created_at ||
                        conversation.lastMessageAt ||
                        conversation.updated_at ||
                        conversation.created_at,
                );
                const unread = Number(conversation.unreadCount) || 0;
                const profileNameHtml = renderNameWithBadges(profile);
                const profileNameNode = profile.id
                    ? `<span class="thread-user-link" data-message-user-link="1" data-user-id="${escapeHtml(profile.id)}">${profileNameHtml}</span>`
                    : `<span class="thread-user-label">${profileNameHtml}</span>`;

                return `
                    <button type="button" class="thread-item${activeClass}" data-conversation-id="${conversation.id}">
                        <img class="thread-avatar" src="${escapeHtml(profile.avatar)}" alt="${escapeHtml(profile.name)}" loading="lazy" />
                        <div class="thread-meta">
                            <div class="thread-name-row">
                                <span class="thread-name">${profileNameNode}</span>
                                <span class="thread-time">${escapeHtml(timeLabel)}</span>
                            </div>
                            <span class="thread-snippet">${escapeHtml(snippet)}</span>
                        </div>
                        ${
                            unread > 0
                                ? `<span class="thread-unread">${unread > 99 ? "99+" : unread}</span>`
                                : ""
                        }
                    </button>
                `;
            })
            .join("");
    }

    function renderChatHeader() {
        if (!ensureMessagesShell()) return;
        const nameEl = document.getElementById("chat-header-name");
        const subEl = document.getElementById("chat-header-sub");
        const conversation = state.conversationsById.get(state.selectedConversationId);

        if (!conversation) {
            if (nameEl) nameEl.textContent = "Sélectionnez une conversation";
            if (subEl) subEl.textContent = "";
            return;
        }

        const profile = getConversationDisplayUser(conversation);
        if (nameEl) {
            if (profile.id) {
                nameEl.innerHTML = `
                    <a href="${escapeHtml(buildProfileHref(profile.id))}" class="chat-user-link" data-message-user-link="1" data-user-id="${escapeHtml(profile.id)}">
                        ${renderNameWithBadges(profile)}
                    </a>
                `;
            } else {
                nameEl.textContent = profile.name;
            }
        }
        if (subEl) {
            subEl.textContent = conversation.unreadCount
                ? `${conversation.unreadCount} nouveau(x) message(s)`
                : "En ligne sur XERA";
        }
    }

    function renderChatMessages() {
        if (!ensureMessagesShell()) return;
        const chat = document.getElementById("chat-messages");
        const panel = document.getElementById("chat-panel");
        if (!chat || !panel) return;

        const conversationId = state.selectedConversationId;
        if (!conversationId) {
            panel.classList.add("empty");
            chat.innerHTML = `<div class="loading-state">Choisissez une conversation pour commencer.</div>`;
            return;
        }

        panel.classList.remove("empty");
        const messages = state.messagesByConversation.get(conversationId) || [];
        const currentUserId = getCurrentUserId();
        const conversation = state.conversationsById.get(conversationId) || null;
        const senderProfile = conversation ? getConversationDisplayUser(conversation) : null;

        if (!messages.length) {
            chat.innerHTML = `<div class="loading-state">Aucun message pour l'instant. Lancez la conversation.</div>`;
            return;
        }

        chat.innerHTML = messages
            .map((msg) => {
                const mine = msg.sender_id === currentUserId;
                const bubbleClass = mine ? "chat-bubble mine" : "chat-bubble";
                const messageTime = formatMessageTime(msg.created_at);
                const senderHtml =
                    !mine && senderProfile?.id
                        ? `
                            <div class="chat-sender-row">
                                <a href="${escapeHtml(buildProfileHref(senderProfile.id))}" class="chat-user-link" data-message-user-link="1" data-user-id="${escapeHtml(senderProfile.id)}">
                                    ${renderNameWithBadges(senderProfile)}
                                </a>
                            </div>
                        `
                        : "";
                return `
                    <div class="${bubbleClass}" data-message-id="${msg.id}">
                        ${senderHtml}
                        <div class="chat-body">${escapeHtml(msg.body || "")}</div>
                        <div class="chat-time">${escapeHtml(messageTime)}</div>
                    </div>
                `;
            })
            .join("");

        chat.scrollTop = chat.scrollHeight;
    }

    function updateUnreadUi() {
        setNavBadgeCount(getUnreadTotal());
        renderThreadsList();
        renderChatHeader();
    }

    function sortAndReindexConversations() {
        state.conversations.sort((a, b) => {
            const aDate = new Date(a.lastMessageAt || a.updated_at || a.created_at || 0).getTime();
            const bDate = new Date(b.lastMessageAt || b.updated_at || b.created_at || 0).getTime();
            return bDate - aDate;
        });

        state.conversationsById = new Map();
        state.conversations.forEach((conv) => {
            state.conversationsById.set(conv.id, conv);
        });
    }

    async function refreshConversations({ preserveSelection = true } = {}) {
        if (!isLoggedIn()) return;
        if (!ensureMessagesShell()) return;

        const currentUserId = getCurrentUserId();
        const list = document.getElementById("threads-list");
        if (list && state.conversations.length === 0) {
            list.innerHTML = `<div class="loading-state">Chargement...</div>`;
        }

        try {
            const { data: myMemberships, error: membershipsError } = await supabase
                .from("dm_participants")
                .select("conversation_id, last_read_at")
                .eq("user_id", currentUserId);

            if (membershipsError) throw membershipsError;

            const memberships = myMemberships || [];
            if (memberships.length === 0) {
                state.conversations = [];
                state.conversationsById = new Map();
                if (!preserveSelection) {
                    state.selectedConversationId = null;
                } else if (!state.conversationsById.has(state.selectedConversationId)) {
                    state.selectedConversationId = null;
                }
                updateUnreadUi();
                renderChatMessages();
                return;
            }

            const conversationIds = memberships.map((row) => row.conversation_id).filter(Boolean);
            const lastReadByConversation = new Map();
            memberships.forEach((row) => {
                if (row?.conversation_id) {
                    lastReadByConversation.set(row.conversation_id, row.last_read_at || null);
                }
            });

            const [conversationsResult, lastMessagesResult] = await Promise.all([
                supabase
                    .from("dm_conversations")
                    .select("id, created_at, updated_at, last_message_at, pair_key")
                    .in("id", conversationIds),
                supabase
                    .from("dm_messages")
                    .select("id, conversation_id, sender_id, body, created_at")
                    .in("conversation_id", conversationIds)
                    .order("created_at", { ascending: false })
                    .limit(Math.max(conversationIds.length * 8, 60)),
            ]);

            if (conversationsResult.error) throw conversationsResult.error;
            if (lastMessagesResult.error) throw lastMessagesResult.error;

            const conversationsRows = conversationsResult.data || [];
            const lastMessagesRows = lastMessagesResult.data || [];

            const otherUserIds = conversationsRows
                .map((conv) => extractOtherUserIdFromPairKey(conv.pair_key, currentUserId))
                .filter(Boolean);
            await fetchUsers(otherUserIds);

            const lastMessageByConversation = new Map();
            lastMessagesRows.forEach((row) => {
                rememberMessageId(row.id);
                if (!row?.conversation_id) return;
                if (!lastMessageByConversation.has(row.conversation_id)) {
                    lastMessageByConversation.set(row.conversation_id, row);
                }
            });

            const conversations = [];
            for (const conv of conversationsRows) {
                const otherUserId = extractOtherUserIdFromPairKey(conv.pair_key, currentUserId);
                const userProfile = otherUserId ? state.usersById.get(otherUserId) : null;
                const lastMessage = lastMessageByConversation.get(conv.id) || null;
                const lastReadAt = lastReadByConversation.get(conv.id) || null;

                let unreadCount = 0;
                try {
                    unreadCount = await fetchUnreadCount(conv.id, lastReadAt);
                } catch (error) {
                    unreadCount = 0;
                }

                conversations.push({
                    ...conv,
                    id: conv.id,
                    otherUserId: otherUserId || null,
                    otherName: userProfile?.name || "Conversation",
                    otherAccountSubtype:
                        userProfile?.account_subtype || userProfile?.accountSubtype || null,
                    otherAvatar:
                        userProfile?.avatar ||
                        "https://placehold.co/80x80?text=%F0%9F%92%AC",
                    lastReadAt,
                    lastMessage,
                    lastMessageAt:
                        lastMessage?.created_at ||
                        conv.last_message_at ||
                        conv.updated_at ||
                        conv.created_at,
                    unreadCount,
                });
            }

            state.conversations = conversations;
            sortAndReindexConversations();

            if (
                preserveSelection &&
                state.selectedConversationId &&
                state.conversationsById.has(state.selectedConversationId)
            ) {
                // keep current selection
            } else {
                state.selectedConversationId = state.conversations[0]?.id || null;
            }

            renderThreadsList();
            renderChatHeader();
            setNavBadgeCount(getUnreadTotal());

            if (state.selectedConversationId) {
                await loadConversationMessages(state.selectedConversationId, {
                    markRead: false,
                    forceReload: false,
                });
            } else {
                renderChatMessages();
            }
        } catch (error) {
            console.error("Erreur chargement conversations:", error);
            if (isMissingSchemaError(error)) {
                showSchemaMissingState();
                return;
            }
            const listEl = document.getElementById("threads-list");
            if (listEl) {
                listEl.innerHTML = `<div class="loading-state">Impossible de charger les conversations.</div>`;
            }
        }
    }

    async function loadConversationMessages(
        conversationId,
        { markRead = true, forceReload = false } = {},
    ) {
        if (!conversationId) {
            renderChatMessages();
            return;
        }

        if (!forceReload && state.messagesByConversation.has(conversationId)) {
            renderChatHeader();
            renderChatMessages();
            if (markRead) {
                await markConversationAsRead(conversationId);
            }
            return;
        }

        const chat = document.getElementById("chat-messages");
        if (chat) {
            chat.innerHTML = `<div class="loading-state">Chargement des messages...</div>`;
        }

        try {
            const { data, error } = await supabase
                .from("dm_messages")
                .select("id, conversation_id, sender_id, body, created_at")
                .eq("conversation_id", conversationId)
                .order("created_at", { ascending: false })
                .limit(DM_MESSAGES_LIMIT);

            if (error) throw error;

            const rows = (data || []).slice().reverse();
            rows.forEach((row) => rememberMessageId(row.id));
            state.messagesByConversation.set(conversationId, rows);

            renderChatHeader();
            renderChatMessages();

            if (markRead) {
                await markConversationAsRead(conversationId);
            }
        } catch (error) {
            console.error("Erreur chargement messages:", error);
            if (isMissingSchemaError(error)) {
                showSchemaMissingState();
                return;
            }
            if (chat) {
                chat.innerHTML = `<div class="loading-state">Impossible de charger les messages.</div>`;
            }
        }
    }

    async function markConversationAsRead(conversationId) {
        const currentUserId = getCurrentUserId();
        if (!currentUserId || !conversationId) return;

        const conversation = state.conversationsById.get(conversationId);
        if (!conversation) return;

        const nowIso = new Date().toISOString();
        conversation.lastReadAt = nowIso;
        conversation.unreadCount = 0;
        updateUnreadUi();

        try {
            const { error } = await supabase
                .from("dm_participants")
                .update({ last_read_at: nowIso })
                .eq("conversation_id", conversationId)
                .eq("user_id", currentUserId);
            if (error) throw error;
        } catch (error) {
            console.warn("Impossible de marquer comme lu:", error);
        }
    }

    function setMobileThreadOpen(open) {
        const shell = document.getElementById("messages-shell");
        if (!shell) return;
        shell.classList.toggle("mobile-thread-open", !!open);
    }

    async function selectConversation(
        conversationId,
        { markRead = true, focusInput = false, forceReload = false } = {},
    ) {
        if (!conversationId) return;
        state.selectedConversationId = conversationId;
        renderThreadsList();
        renderChatHeader();
        setMobileThreadOpen(true);

        await loadConversationMessages(conversationId, {
            markRead,
            forceReload,
        });

        if (focusInput) {
            const input = document.getElementById("chat-input");
            if (input) input.focus();
        }
    }

    async function getOrCreateConversation(otherUserId) {
        const currentUserId = getCurrentUserId();
        if (!currentUserId) throw new Error("Session utilisateur absente.");
        if (!otherUserId || otherUserId === currentUserId) {
            throw new Error("Conversation invalide.");
        }

        const { data, error } = await supabase.rpc("get_or_create_dm_conversation", {
            p_other_user_id: otherUserId,
        });
        if (error) throw error;
        if (!data) throw new Error("Impossible de créer la conversation.");
        return data;
    }

    async function sendCurrentMessage() {
        const currentUserId = getCurrentUserId();
        const conversationId = state.selectedConversationId;
        const input = document.getElementById("chat-input");
        const sendBtn = document.getElementById("chat-send-btn");

        if (!currentUserId || !conversationId || !input) return;

        const body = String(input.value || "").trim();
        if (!body) return;

        input.value = "";
        if (sendBtn) sendBtn.disabled = true;

        try {
            const { data, error } = await supabase
                .from("dm_messages")
                .insert({
                    conversation_id: conversationId,
                    sender_id: currentUserId,
                    body,
                })
                .select("id, conversation_id, sender_id, body, created_at")
                .single();

            if (error) throw error;
            if (data) {
                rememberMessageId(data.id);
                const existing = state.messagesByConversation.get(conversationId) || [];
                const alreadyExists = existing.some((msg) => msg.id === data.id);
                if (!alreadyExists) {
                    const next = [...existing, data];
                    state.messagesByConversation.set(conversationId, next);
                }

                const conversation = state.conversationsById.get(conversationId);
                if (conversation) {
                    conversation.lastMessage = data;
                    conversation.lastMessageAt = data.created_at;
                    conversation.unreadCount = 0;
                    conversation.lastReadAt = new Date().toISOString();
                    sortAndReindexConversations();
                }

                renderChatMessages();
                updateUnreadUi();
                const chat = document.getElementById("chat-messages");
                if (chat) chat.scrollTop = chat.scrollHeight;
            }
        } catch (error) {
            console.error("Erreur envoi message:", error);
            input.value = body;
            if (window.ToastManager?.error) {
                ToastManager.error(
                    "Message non envoyé",
                    error?.message || "Impossible d'envoyer le message.",
                );
            } else {
                alert(error?.message || "Impossible d'envoyer le message.");
            }
        } finally {
            if (sendBtn) sendBtn.disabled = false;
            input.focus();
        }
    }

    function scheduleConversationsRefresh() {
        if (state.refreshTimer) {
            clearTimeout(state.refreshTimer);
        }
        state.refreshTimer = setTimeout(() => {
            state.refreshTimer = null;
            refreshConversations({ preserveSelection: true }).catch((error) => {
                console.error("Refresh conversations failed:", error);
            });
        }, 220);
    }

    function startPollingFallback() {
        if (state.pollingTimer) {
            clearInterval(state.pollingTimer);
            state.pollingTimer = null;
        }

        state.pollingTimer = setInterval(() => {
            if (!isLoggedIn()) return;
            if (document.hidden) return;
            refreshConversations({ preserveSelection: true }).catch((error) => {
                console.error("DM polling refresh error:", error);
            });
        }, 6000);
    }

    async function resolveUser(userId) {
        if (!userId) return null;
        if (state.usersById.has(userId)) return state.usersById.get(userId);
        try {
            const { data, error } = await supabase
                .from("users")
                .select("id, name, avatar, account_subtype")
                .eq("id", userId)
                .maybeSingle();
            if (error && isMissingAccountSubtypeColumnError(error)) {
                const retry = await supabase
                    .from("users")
                    .select("id, name, avatar")
                    .eq("id", userId)
                    .maybeSingle();
                if (retry.error) throw retry.error;
                if (retry.data) {
                    state.usersById.set(retry.data.id, retry.data);
                    return retry.data;
                }
                return null;
            }
            if (error) throw error;
            if (data) {
                state.usersById.set(data.id, data);
                return data;
            }
            return null;
        } catch (error) {
            return null;
        }
    }

    function isMessagesPageActive() {
        const section = getDmSection();
        return !!(section && section.classList.contains("active"));
    }

    async function showIncomingSignal(messageRow) {
        if (!messageRow || messageRow.sender_id === getCurrentUserId()) return;

        const sender = await resolveUser(messageRow.sender_id);
        const senderName = sender?.name || "Nouveau message";
        const snippet = trimSnippet(messageRow.body || "", 110) || "Vous avez reçu un nouveau message.";

        if (window.ToastManager?.info) {
            ToastManager.info(`Message de ${senderName}`, snippet);
        }

        if (typeof window.playNotificationSound === "function") {
            window.playNotificationSound("message");
        }

        if (document.hidden || !isMessagesPageActive()) {
            if (typeof window.showDeviceNotification === "function") {
                window
                    .showDeviceNotification({
                        title: `Message de ${senderName}`,
                        body: snippet,
                        icon: "icons/logo.png",
                        tag: `dm-${messageRow.id}`,
                        link: `index.html?messages=1&dm=${encodeURIComponent(messageRow.sender_id)}`,
                        renotify: true,
                        silent: false,
                    })
                    .catch(() => {});
            } else if (
                typeof Notification !== "undefined" &&
                Notification.permission === "granted"
            ) {
                try {
                    const n = new Notification(`Message de ${senderName}`, {
                        body: snippet,
                        icon: "icons/logo.png",
                        tag: `dm-${messageRow.id}`,
                    });
                    n.onclick = () => {
                        window.focus();
                        openMessagesWithUser(messageRow.sender_id);
                        n.close();
                    };
                } catch (error) {
                    // ignore browser notification errors
                }
            }
        }
    }

    async function handleIncomingMessage(messageRow) {
        if (!messageRow || !messageRow.id) return;
        if (state.seenMessageIds.has(messageRow.id)) return;
        rememberMessageId(messageRow.id);

        const conversationId = messageRow.conversation_id;
        if (!conversationId) return;

        if (!state.conversationsById.has(conversationId)) {
            scheduleConversationsRefresh();
        }

        const conversation = state.conversationsById.get(conversationId);
        if (conversation) {
            conversation.lastMessage = messageRow;
            conversation.lastMessageAt = messageRow.created_at;

            if (messageRow.sender_id !== getCurrentUserId()) {
                const isActiveConversation =
                    state.selectedConversationId === conversationId && isMessagesPageActive();
                if (!isActiveConversation) {
                    conversation.unreadCount = (conversation.unreadCount || 0) + 1;
                }
            }
        }

        const existing = state.messagesByConversation.get(conversationId) || [];
        const alreadyExists = existing.some((msg) => msg.id === messageRow.id);
        if (!alreadyExists) {
            state.messagesByConversation.set(conversationId, [...existing, messageRow]);
        }

        sortAndReindexConversations();
        updateUnreadUi();

        const shouldAutoRead =
            state.selectedConversationId === conversationId &&
            isMessagesPageActive() &&
            !document.hidden;

        if (shouldAutoRead) {
            renderChatMessages();
            if (messageRow.sender_id !== getCurrentUserId()) {
                await markConversationAsRead(conversationId);
            }
        }

        await showIncomingSignal(messageRow);
    }

    function subscribeRealtime() {
        const currentUserId = getCurrentUserId();
        if (!currentUserId || !window.supabase) return;

        if (state.realtimeChannel) {
            supabase.removeChannel(state.realtimeChannel);
            state.realtimeChannel = null;
        }

        state.realtimeChannel = supabase
            .channel(`dm-realtime-${currentUserId}-${Date.now()}`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "dm_messages",
                },
                (payload) => {
                    handleIncomingMessage(payload.new).catch((error) => {
                        console.error("Incoming DM handling error:", error);
                    });
                },
            )
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "dm_participants",
                    filter: `user_id=eq.${currentUserId}`,
                },
                () => {
                    scheduleConversationsRefresh();
                },
            )
            .subscribe((status) => {
                if (status === "SUBSCRIBED") {
                    refreshConversations({ preserveSelection: true }).catch((error) => {
                        console.error("DM initial realtime refresh error:", error);
                    });
                    return;
                }

                if (status === "CHANNEL_ERROR" && !state.realtimeWarned) {
                    state.realtimeWarned = true;
                    console.warn(
                        "DM realtime indisponible. Fallback polling actif (vérifiez la publication realtime des tables DM).",
                    );
                }
            });

        startPollingFallback();
    }

    function cleanupRealtime() {
        if (state.realtimeChannel) {
            supabase.removeChannel(state.realtimeChannel);
            state.realtimeChannel = null;
        }
        if (state.pollingTimer) {
            clearInterval(state.pollingTimer);
            state.pollingTimer = null;
        }
        if (state.refreshTimer) {
            clearTimeout(state.refreshTimer);
            state.refreshTimer = null;
        }
    }

    function parseRouteIntent() {
        try {
            const params = new URLSearchParams(window.location.search);
            const dm = params.get("dm") || "";
            const wantsMessages =
                params.get("messages") === "1" ||
                params.get("page") === "messages" ||
                Boolean(dm);
            return {
                wantsMessages,
                dmUserId: dm,
            };
        } catch (error) {
            return { wantsMessages: false, dmUserId: "" };
        }
    }

    function clearRouteIntentParams() {
        try {
            const url = new URL(window.location.href);
            let changed = false;
            ["messages", "page", "dm"].forEach((key) => {
                if (url.searchParams.has(key)) {
                    url.searchParams.delete(key);
                    changed = true;
                }
            });
            if (changed) {
                window.history.replaceState({}, "", url.toString());
            }
        } catch (error) {
            // no-op
        }
    }

    function openMessagesPageOnly() {
        if (!isLoggedIn()) {
            window.location.href = "login.html";
            return;
        }

        if (!hasDmPage()) {
            const url = new URL("index.html", window.location.href);
            url.searchParams.set("messages", "1");
            window.location.href = url.toString();
            return;
        }

        if (typeof window.navigateTo === "function") {
            window.navigateTo(DM_PAGE_ID);
        } else {
            document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
            const target = getDmSection();
            if (target) target.classList.add("active");
            if (typeof window.syncFloatingCreateVisibility === "function") {
                window.syncFloatingCreateVisibility(DM_PAGE_ID);
            } else {
                const floatingCreate = document.getElementById("floating-create-container");
                if (floatingCreate) floatingCreate.style.display = "none";
            }
        }

        ensureMessagesShell();
        renderThreadsList();
        renderChatHeader();
        renderChatMessages();
    }

    async function openMessagesWithUser(targetUserId) {
        if (!targetUserId) return;
        if (!isLoggedIn()) {
            window.location.href = "login.html";
            return;
        }

        if (!hasDmPage()) {
            const url = new URL("index.html", window.location.href);
            url.searchParams.set("messages", "1");
            url.searchParams.set("dm", targetUserId);
            window.location.href = url.toString();
            return;
        }

        openMessagesPageOnly();

        try {
            const conversationId = await getOrCreateConversation(targetUserId);
            await refreshConversations({ preserveSelection: true });
            await selectConversation(conversationId, {
                markRead: true,
                focusInput: true,
                forceReload: true,
            });
            clearRouteIntentParams();
        } catch (error) {
            console.error("Open conversation error:", error);
            if (isMissingSchemaError(error)) {
                showSchemaMissingState();
                return;
            }
            if (window.ToastManager?.error) {
                ToastManager.error(
                    "Messagerie indisponible",
                    error?.message || "Impossible d'ouvrir la conversation.",
                );
            } else {
                alert(error?.message || "Impossible d'ouvrir la conversation.");
            }
        }
    }

    async function openMessagesPage() {
        if (!isLoggedIn()) {
            window.location.href = "login.html";
            return;
        }

        openMessagesPageOnly();

        if (!state.conversations.length) {
            await refreshConversations({ preserveSelection: true });
        }

        if (state.selectedConversationId) {
            await selectConversation(state.selectedConversationId, {
                markRead: true,
                focusInput: false,
            });
        }
    }

    async function maybeHandleRouteIntent() {
        if (state.routeHandled) return;
        const intent = parseRouteIntent();
        if (!intent.wantsMessages) return;
        if (!isLoggedIn()) return;

        state.routeHandled = true;
        if (intent.dmUserId) {
            await openMessagesWithUser(intent.dmUserId);
        } else {
            await openMessagesPage();
            clearRouteIntentParams();
        }
    }

    async function initializeMessaging() {
        const currentUserId = getCurrentUserId();
        if (!currentUserId || !window.supabase) {
            cleanupMessaging();
            return;
        }

        setNavButtonVisible(true);

        if (state.initializedForUserId !== currentUserId) {
            cleanupRealtime();
            state.initializedForUserId = currentUserId;
            state.selectedConversationId = null;
            state.conversations = [];
            state.conversationsById = new Map();
            state.messagesByConversation = new Map();
            state.seenMessageIds = new Set();
            state.routeHandled = false;
            state.realtimeWarned = false;

            if (hasDmPage()) {
                ensureMessagesShell();
            }

            try {
                await refreshConversations({ preserveSelection: true });
            } catch (error) {
                console.error("Messaging init refresh error:", error);
            }

            subscribeRealtime();
        }

        await maybeHandleRouteIntent();
    }

    function cleanupMessaging() {
        cleanupRealtime();
        state.initializedForUserId = null;
        state.selectedConversationId = null;
        state.conversations = [];
        state.conversationsById = new Map();
        state.messagesByConversation = new Map();
        state.usersById = new Map();
        state.seenMessageIds = new Set();
        state.routeHandled = false;
        setNavBadgeCount(0);
        setNavButtonVisible(false);
    }

    window.initializeMessaging = initializeMessaging;
    window.cleanupMessaging = cleanupMessaging;
    window.openMessagesPage = openMessagesPage;
    window.openMessagesWithUser = openMessagesWithUser;

    document.addEventListener("visibilitychange", () => {
        if (document.hidden) return;
        if (!isLoggedIn()) return;
        refreshConversations({ preserveSelection: true }).catch((error) => {
            console.error("DM visibility refresh error:", error);
        });
    });
})();
