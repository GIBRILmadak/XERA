/* ========================================
   MESSAGERIE DIRECTE (DM)
   ======================================== */

(function () {
    const DM_PAGE_ID = "messages";
    const DM_MESSAGES_LIMIT = 60;
    const DM_BODY_MAX = 4000;
    const DM_MESSAGE_SELECT =
        "id, conversation_id, sender_id, body, media_url, media_type, media_name, media_size_bytes, created_at";
    const DM_MESSAGE_LEGACY_SELECT =
        "id, conversation_id, sender_id, body, created_at";
    const DM_ATTACHMENT_ACCEPT = "image/*,video/*";

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
        pendingAttachment: null,
        sendingMessage: false,
        activeRelationship: null,
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

    function formatBytes(bytes) {
        const value = Number(bytes);
        if (!Number.isFinite(value) || value <= 0) return "";
        if (typeof window.formatFileSize === "function") {
            try {
                return window.formatFileSize(value);
            } catch (error) {
                // ignore formatter issues and fallback
            }
        }
        const units = ["o", "Ko", "Mo", "Go"];
        let unitIndex = 0;
        let size = value;
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex += 1;
        }
        const rounded = size >= 10 || unitIndex === 0 ? Math.round(size) : size.toFixed(1);
        return `${rounded} ${units[unitIndex]}`;
    }

    function isMissingColumnMessage(message, columnNames) {
        const normalized = String(message || "").toLowerCase();
        const mentionsMissing =
            normalized.includes("does not exist") ||
            normalized.includes("n'existe pas") ||
            normalized.includes("could not find") ||
            normalized.includes("schema cache");
        if (!mentionsMissing) return false;
        return columnNames.some((column) =>
            normalized.includes(String(column || "").toLowerCase()),
        );
    }

    function isMissingDmMediaSchemaError(error) {
        const message = String(error?.message || "");
        return isMissingColumnMessage(message, [
            "media_url",
            "media_type",
            "media_name",
            "media_size_bytes",
        ]);
    }

    function isLegacyDmMediaConstraintError(error) {
        const message = String(error?.message || "").toLowerCase();
        return (
            message.includes("dm_messages_body_not_empty") ||
            message.includes("dm_messages_content_required") ||
            (message.includes("null value") && message.includes("body")) ||
            (message.includes("violates") && message.includes("body"))
        );
    }

    function normalizeMessageRow(row) {
        if (!row || typeof row !== "object") return row;
        return {
            ...row,
            body: row.body || "",
            media_url: row.media_url || null,
            media_type: row.media_type || null,
            media_name: row.media_name || null,
            media_size_bytes: row.media_size_bytes || null,
        };
    }

    async function runMessageSelect(queryFactory) {
        let response = await queryFactory(DM_MESSAGE_SELECT);
        if (response?.error && isMissingDmMediaSchemaError(response.error)) {
            response = await queryFactory(DM_MESSAGE_LEGACY_SELECT);
        }

        if (response?.error) {
            return { data: null, error: response.error };
        }

        if (Array.isArray(response?.data)) {
            return {
                data: response.data.map((row) => normalizeMessageRow(row)),
                error: null,
            };
        }

        return {
            data: response?.data ? normalizeMessageRow(response.data) : response?.data,
            error: null,
        };
    }

    function getMessageAttachmentLabel(message) {
        const mediaType = String(message?.media_type || "").toLowerCase();
        if (mediaType === "video") return "Video";
        if (mediaType === "image") return "Photo";
        if (message?.media_url) return "Fichier";
        return "";
    }

    function buildMessageSnippet(message, maxLen = 80) {
        const text = trimSnippet(message?.body || "", maxLen);
        if (text) return text;
        const attachmentLabel = getMessageAttachmentLabel(message);
        return attachmentLabel ? `${attachmentLabel} jointe` : "";
    }

    function createNeutralRelationshipState(otherUserId = null) {
        return {
            otherUserId: otherUserId || null,
            blockedByMe: false,
            blockedMe: false,
            canMessage: Boolean(otherUserId),
            loading: false,
        };
    }

    function normalizeRelationshipState(value, otherUserId = null) {
        const blockedByMe =
            value?.blockedByMe === true || value?.blocked_by_me === true;
        const blockedMe = value?.blockedMe === true || value?.blocked_me === true;
        const canMessage =
            value?.canMessage === false || value?.can_message === false
                ? false
                : !blockedByMe && !blockedMe;
        return {
            otherUserId: otherUserId || value?.otherUserId || null,
            blockedByMe,
            blockedMe,
            canMessage,
            loading: value?.loading === true,
        };
    }

    function getSelectedConversation() {
        return state.conversationsById.get(state.selectedConversationId) || null;
    }

    function getSelectedRelationshipState() {
        const conversation = getSelectedConversation();
        const otherUserId = conversation?.otherUserId || null;
        if (!otherUserId) return createNeutralRelationshipState(null);
        if (state.activeRelationship?.otherUserId === otherUserId) {
            return state.activeRelationship;
        }
        return createNeutralRelationshipState(otherUserId);
    }

    function getDmBlockedMessage(relationship = getSelectedRelationshipState()) {
        if (relationship?.blockedByMe) {
            return "Vous avez bloqué cet utilisateur. Débloquez-le depuis Réglages pour reprendre la discussion.";
        }
        if (relationship?.blockedMe) {
            return "Cet utilisateur vous a bloqué. Vous ne pouvez plus lui envoyer de messages.";
        }
        return "Messagerie indisponible pour cette conversation.";
    }

    function getFriendlyDmErrorMessage(error, fallbackMessage) {
        const rawMessage = String(error?.message || "").trim();
        const normalized = rawMessage.toUpperCase();
        if (normalized.includes("DM_BLOCKED")) {
            return "Cette conversation est bloquée. Débloquez l'utilisateur depuis Réglages pour reprendre la discussion.";
        }
        if (normalized.includes("SELF_CONVERSATION_NOT_ALLOWED")) {
            return "Vous ne pouvez pas ouvrir une conversation avec vous-même.";
        }
        if (normalized.includes("OTHER_USER_REQUIRED")) {
            return "Utilisateur introuvable.";
        }
        if (normalized.includes("NOT_AUTHENTICATED")) {
            return "Votre session a expiré. Reconnectez-vous puis réessayez.";
        }
        return rawMessage || fallbackMessage || "Impossible de poursuivre l'action.";
    }

    async function fetchRelationshipStatusForUser(otherUserId) {
        if (!otherUserId) return createNeutralRelationshipState(null);

        if (typeof window.fetchDmRelationshipStatus === "function") {
            const response = await window.fetchDmRelationshipStatus(otherUserId);
            return normalizeRelationshipState(response, otherUserId);
        }

        const { data, error } = await supabase.rpc("get_dm_relationship_status", {
            p_other_user_id: otherUserId,
        });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        return normalizeRelationshipState(row, otherUserId);
    }

    async function refreshActiveRelationshipState(conversationId = state.selectedConversationId) {
        const conversation = conversationId
            ? state.conversationsById.get(conversationId) || null
            : null;
        const otherUserId = conversation?.otherUserId || null;

        state.activeRelationship = createNeutralRelationshipState(otherUserId);
        if (!otherUserId) {
            renderChatHeader();
            syncComposerState();
            return state.activeRelationship;
        }

        state.activeRelationship.loading = true;
        renderChatHeader();
        syncComposerState();

        try {
            const relationship = await fetchRelationshipStatusForUser(otherUserId);
            if (
                state.selectedConversationId === conversationId &&
                relationship.otherUserId === otherUserId
            ) {
                state.activeRelationship = relationship;
                renderChatHeader();
                syncComposerState();
            }
            return relationship;
        } catch (error) {
            console.warn("DM relationship status error:", error);
            if (state.selectedConversationId === conversationId) {
                state.activeRelationship = createNeutralRelationshipState(otherUserId);
                renderChatHeader();
                syncComposerState();
            }
            return createNeutralRelationshipState(otherUserId);
        }
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
                        <div class="chat-header-actions" id="chat-header-actions">
                            <button type="button" class="chat-header-action" id="chat-delete-btn" hidden>
                                Supprimer
                            </button>
                            <button type="button" class="chat-header-action chat-header-action-danger" id="chat-block-btn" hidden>
                                Bloquer
                            </button>
                        </div>
                    </div>
                    <div class="chat-messages" id="chat-messages">
                        <div class="loading-state">Choisissez une conversation pour commencer.</div>
                    </div>
                    <form class="chat-input-row" id="chat-input-form">
                        <input
                            id="chat-media-input"
                            type="file"
                            accept="${DM_ATTACHMENT_ACCEPT}"
                            hidden
                        />
                        <div class="chat-composer" id="chat-composer">
                            <div class="chat-attachment-preview" id="chat-attachment-preview" hidden></div>
                            <div class="chat-compose-controls">
                                <button type="button" class="chat-attach-btn" id="chat-attach-btn" aria-label="Joindre une image ou une vidéo" title="Joindre une image ou une vidéo">
                                    +
                                </button>
                                <textarea
                                    id="chat-input"
                                    class="form-input chat-input-textarea"
                                    maxlength="${DM_BODY_MAX}"
                                    autocomplete="off"
                                    placeholder="Écrire un message..."
                                    rows="1"
                                ></textarea>
                                <button type="submit" class="btn-verify" id="chat-send-btn">Envoyer</button>
                            </div>
                            <div class="chat-compose-hint" id="chat-compose-hint">
                                Entrée pour envoyer • Maj+Entrée pour une nouvelle ligne
                            </div>
                        </div>
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

        const input = document.getElementById("chat-input");
        if (input) {
            input.addEventListener("input", () => {
                autoResizeChatInput();
                syncComposerState();
            });
            input.addEventListener("keydown", (event) => {
                if (event.key !== "Enter" || event.shiftKey) return;
                event.preventDefault();
                void sendCurrentMessage();
            });
        }

        const attachBtn = document.getElementById("chat-attach-btn");
        const mediaInput = document.getElementById("chat-media-input");
        if (attachBtn && mediaInput) {
            attachBtn.addEventListener("click", () => {
                if (attachBtn.disabled) return;
                mediaInput.click();
            });
            mediaInput.addEventListener("change", async () => {
                await handleAttachmentInput(mediaInput.files);
                mediaInput.value = "";
            });
        }

        const header = document.getElementById("chat-header");
        if (header) {
            header.addEventListener("click", (event) => {
                handleMessageUserLinkClick(event);
            });
        }

        const deleteBtn = document.getElementById("chat-delete-btn");
        if (deleteBtn) {
            deleteBtn.addEventListener("click", () => {
                void handleDeleteConversationAction();
            });
        }

        const blockBtn = document.getElementById("chat-block-btn");
        if (blockBtn) {
            blockBtn.addEventListener("click", () => {
                void handleBlockUserAction();
            });
        }

        const chat = document.getElementById("chat-messages");
        if (chat) {
            chat.addEventListener("click", (event) => {
                handleMessageUserLinkClick(event);
            });
        }

        renderAttachmentPreview();
        autoResizeChatInput();
        syncComposerState();

        return true;
    }

    function getChatInput() {
        return document.getElementById("chat-input");
    }

    function getChatMediaInput() {
        return document.getElementById("chat-media-input");
    }

    function getPendingAttachment() {
        return state.pendingAttachment || null;
    }

    function clearPendingAttachment({ revokePreview = true } = {}) {
        const pending = getPendingAttachment();
        if (revokePreview && pending?.previewUrl) {
            try {
                URL.revokeObjectURL(pending.previewUrl);
            } catch (error) {
                // ignore URL cleanup issues
            }
        }
        state.pendingAttachment = null;
        renderAttachmentPreview();
        syncComposerState();
    }

    function setPendingAttachment(file) {
        clearPendingAttachment();
        if (!file) return;

        const isVideo =
            typeof window.isLikelyVideoFile === "function"
                ? window.isLikelyVideoFile(file)
                : String(file.type || "").toLowerCase().startsWith("video/");

        state.pendingAttachment = {
            file,
            kind: isVideo ? "video" : "image",
            name: file.name || (isVideo ? "video" : "image"),
            size: Number(file.size || 0) || 0,
            previewUrl: URL.createObjectURL(file),
            uploading: false,
            progress: 0,
        };
        renderAttachmentPreview();
        syncComposerState();
    }

    function renderAttachmentPreview() {
        if (!ensureMessagesShell()) return;
        const container = document.getElementById("chat-attachment-preview");
        if (!container) return;

        const pending = getPendingAttachment();
        if (!pending?.file || !pending.previewUrl) {
            container.hidden = true;
            container.innerHTML = "";
            return;
        }

        const title = escapeHtml(pending.name || "");
        const metaParts = [
            pending.kind === "video" ? "Video" : "Image",
            formatBytes(pending.size),
        ].filter(Boolean);
        const progressLabel =
            pending.uploading && Number.isFinite(Number(pending.progress))
                ? `${Math.max(0, Math.min(100, Math.round(Number(pending.progress))))}%`
                : "";
        const previewHtml =
            pending.kind === "video"
                ? `<video class="chat-attachment-thumb" src="${escapeHtml(pending.previewUrl)}" muted playsinline controls preload="metadata"></video>`
                : `<img class="chat-attachment-thumb" src="${escapeHtml(pending.previewUrl)}" alt="${title || "Aperçu média"}" loading="lazy" />`;

        container.hidden = false;
        container.innerHTML = `
            <div class="chat-attachment-card${pending.uploading ? " is-uploading" : ""}">
                <div class="chat-attachment-visual">
                    ${previewHtml}
                </div>
                <div class="chat-attachment-meta">
                    <div class="chat-attachment-title">${title || "Pièce jointe"}</div>
                    <div class="chat-attachment-subtitle">
                        ${escapeHtml(metaParts.join(" • ") || "Pièce jointe")}
                    </div>
                    ${
                        pending.uploading
                            ? `
                        <div class="chat-upload-progress">
                            <div class="chat-upload-progress-bar">
                                <div class="chat-upload-progress-fill" style="width:${Math.max(0, Math.min(100, Number(pending.progress) || 0))}%"></div>
                            </div>
                            <span class="chat-upload-progress-label">${escapeHtml(progressLabel || "Upload...")}</span>
                        </div>
                    `
                            : ""
                    }
                </div>
                <button
                    type="button"
                    class="chat-attachment-remove"
                    id="chat-attachment-remove"
                    aria-label="Retirer la pièce jointe"
                    ${pending.uploading ? "disabled" : ""}
                >
                    ×
                </button>
            </div>
        `;

        const removeBtn = document.getElementById("chat-attachment-remove");
        if (removeBtn) {
            removeBtn.addEventListener("click", () => {
                clearPendingAttachment();
                const mediaInput = getChatMediaInput();
                if (mediaInput) mediaInput.value = "";
            });
        }
    }

    function autoResizeChatInput() {
        const input = getChatInput();
        if (!input) return;
        input.style.height = "auto";
        const nextHeight = Math.min(input.scrollHeight, 160);
        input.style.height = `${Math.max(44, nextHeight)}px`;
    }

    function syncComposerState() {
        const input = getChatInput();
        const sendBtn = document.getElementById("chat-send-btn");
        const attachBtn = document.getElementById("chat-attach-btn");
        const hint = document.getElementById("chat-compose-hint");
        const pending = getPendingAttachment();
        const relationship = getSelectedRelationshipState();
        const isBlocked = relationship.blockedByMe || relationship.blockedMe;
        const canCompose = Boolean(state.selectedConversationId) && !isBlocked;
        const hasText = Boolean(String(input?.value || "").trim());
        const hasAttachment = Boolean(pending?.file);
        const isBusy = Boolean(state.sendingMessage || pending?.uploading);
        const canSend = canCompose && !isBusy && (hasText || hasAttachment);

        if (input) input.disabled = !canCompose || isBusy;
        if (sendBtn) sendBtn.disabled = !canSend;
        if (attachBtn) attachBtn.disabled = !canCompose || isBusy;
        if (hint) {
            if (!canCompose) {
                if (!state.selectedConversationId) {
                    hint.textContent = "Sélectionnez une conversation pour commencer.";
                } else {
                    hint.textContent = getDmBlockedMessage(relationship);
                }
            } else if (pending?.uploading) {
                hint.textContent = "Upload du média en cours...";
            } else if (hasAttachment && !hasText) {
                hint.textContent = "Vous pouvez envoyer le média seul ou ajouter un texte.";
            } else {
                hint.textContent =
                    "Entrée pour envoyer • Maj+Entrée pour une nouvelle ligne";
            }
        }
    }

    async function handleAttachmentInput(fileList) {
        const file = Array.isArray(fileList) ? fileList[0] : fileList?.[0];
        if (!file) return;

        let validation = null;
        if (typeof window.validateFile === "function") {
            validation = window.validateFile(file);
        }
        if (validation && validation.valid === false) {
            const message = Array.isArray(validation.errors)
                ? validation.errors[0]
                : "Fichier non supporté.";
            if (window.ToastManager?.error) {
                window.ToastManager.error("Pièce jointe refusée", message);
            }
            return;
        }

        setPendingAttachment(file);
    }

    function renderMessageMedia(message) {
        if (!message?.media_url) return "";
        const mediaUrl = escapeHtml(message.media_url);
        const mediaName = escapeHtml(message.media_name || getMessageAttachmentLabel(message) || "Média");
        if (String(message.media_type || "").toLowerCase() === "video") {
            return `
                <div class="chat-media-wrap">
                    <video class="chat-media chat-media-video" src="${mediaUrl}" controls preload="metadata" playsinline></video>
                </div>
            `;
        }
        return `
            <a class="chat-media-link" href="${mediaUrl}" target="_blank" rel="noreferrer">
                <img class="chat-media chat-media-image" src="${mediaUrl}" alt="${mediaName}" loading="lazy" />
            </a>
        `;
    }

    function renderMessageBody(message) {
        const body = String(message?.body || "").trim();
        const mediaHtml = renderMessageMedia(message);
        const bodyHtml = body ? `<div class="chat-body">${escapeHtml(body)}</div>` : "";
        const attachmentLabel = !body && message?.media_url
            ? `<div class="chat-media-label">${escapeHtml(getMessageAttachmentLabel(message) || "Pièce jointe")}</div>`
            : "";
        return `${bodyHtml}${mediaHtml}${attachmentLabel}`;
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
                const snippet =
                    buildMessageSnippet(lastMessage, 56) || "Commencez la discussion";
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

    function renderChatHeaderActions() {
        const deleteBtn = document.getElementById("chat-delete-btn");
        const blockBtn = document.getElementById("chat-block-btn");
        const conversation = getSelectedConversation();
        const profile = conversation ? getConversationDisplayUser(conversation) : null;
        const relationship = getSelectedRelationshipState();

        if (deleteBtn) {
            if (!conversation) {
                deleteBtn.hidden = true;
                deleteBtn.disabled = true;
            } else {
                deleteBtn.hidden = false;
                deleteBtn.disabled = false;
                deleteBtn.title = "Masquer cette discussion de votre liste";
            }
        }

        if (blockBtn) {
            if (!conversation || !profile?.id) {
                blockBtn.hidden = true;
                blockBtn.disabled = true;
                blockBtn.textContent = "Bloquer";
            } else {
                blockBtn.hidden = false;
                blockBtn.disabled = relationship.loading || relationship.blockedByMe;
                blockBtn.textContent = relationship.blockedByMe ? "Bloqué" : "Bloquer";
                blockBtn.title = relationship.blockedByMe
                    ? "Débloquez cet utilisateur depuis Réglages"
                    : `Bloquer ${profile.name}`;
            }
        }
    }

    function renderChatHeader() {
        if (!ensureMessagesShell()) return;
        const nameEl = document.getElementById("chat-header-name");
        const subEl = document.getElementById("chat-header-sub");
        const conversation = state.conversationsById.get(state.selectedConversationId);

        if (!conversation) {
            if (nameEl) nameEl.textContent = "Sélectionnez une conversation";
            if (subEl) subEl.textContent = "";
            renderChatHeaderActions();
            syncComposerState();
            return;
        }

        const profile = getConversationDisplayUser(conversation);
        const relationship = getSelectedRelationshipState();
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
            if (relationship.loading) {
                subEl.textContent = "Vérification de la conversation...";
            } else if (relationship.blockedByMe || relationship.blockedMe) {
                subEl.textContent = getDmBlockedMessage(relationship);
            } else {
                subEl.textContent = conversation.unreadCount
                    ? `${conversation.unreadCount} nouveau(x) message(s)`
                    : "En ligne sur XERA";
            }
        }
        renderChatHeaderActions();
        syncComposerState();
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
            syncComposerState();
            return;
        }

        panel.classList.remove("empty");
        const messages = state.messagesByConversation.get(conversationId) || [];
        const currentUserId = getCurrentUserId();
        const conversation = state.conversationsById.get(conversationId) || null;
        const senderProfile = conversation ? getConversationDisplayUser(conversation) : null;

        if (!messages.length) {
            chat.innerHTML = `<div class="loading-state">Aucun message pour l'instant. Lancez la conversation.</div>`;
            syncComposerState();
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
                        ${renderMessageBody(msg)}
                        <div class="chat-time">${escapeHtml(messageTime)}</div>
                    </div>
                `;
            })
            .join("");

        chat.scrollTop = chat.scrollHeight;
        syncComposerState();
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
                .select("conversation_id, last_read_at, hidden_at")
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
            const hiddenAtByConversation = new Map();
            memberships.forEach((row) => {
                if (row?.conversation_id) {
                    lastReadByConversation.set(row.conversation_id, row.last_read_at || null);
                    hiddenAtByConversation.set(row.conversation_id, row.hidden_at || null);
                }
            });

            const [conversationsResult, lastMessagesResult] = await Promise.all([
                supabase
                    .from("dm_conversations")
                    .select("id, created_at, updated_at, last_message_at, pair_key")
                    .in("id", conversationIds),
                runMessageSelect((selectColumns) =>
                    supabase
                        .from("dm_messages")
                        .select(selectColumns)
                        .in("conversation_id", conversationIds)
                        .order("created_at", { ascending: false })
                        .limit(Math.max(conversationIds.length * 8, 60)),
                ),
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
                const hiddenAt = hiddenAtByConversation.get(conv.id) || null;
                const lastActivityAt =
                    lastMessage?.created_at ||
                    conv.last_message_at ||
                    conv.updated_at ||
                    conv.created_at;

                if (hiddenAt && lastActivityAt) {
                    const hiddenTime = new Date(hiddenAt).getTime();
                    const lastActivityTime = new Date(lastActivityAt).getTime();
                    if (
                        Number.isFinite(hiddenTime) &&
                        Number.isFinite(lastActivityTime) &&
                        lastActivityTime <= hiddenTime
                    ) {
                        continue;
                    }
                }

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
                    hiddenAt,
                    lastMessage,
                    lastMessageAt: lastActivityAt,
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
            void refreshActiveRelationshipState(state.selectedConversationId);

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
            const { data, error } = await runMessageSelect((selectColumns) =>
                supabase
                    .from("dm_messages")
                    .select(selectColumns)
                    .eq("conversation_id", conversationId)
                    .order("created_at", { ascending: false })
                    .limit(DM_MESSAGES_LIMIT),
            );

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
        void refreshActiveRelationshipState(conversationId);

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

    async function removeConversationLocally(conversationId) {
        if (!conversationId) return;
        const wasSelected = state.selectedConversationId === conversationId;

        state.messagesByConversation.delete(conversationId);
        state.conversations = state.conversations.filter((item) => item.id !== conversationId);
        sortAndReindexConversations();

        if (wasSelected) {
            state.selectedConversationId = state.conversations[0]?.id || null;
            state.activeRelationship = null;
        }

        updateUnreadUi();

        if (state.selectedConversationId) {
            await selectConversation(state.selectedConversationId, {
                markRead: false,
                focusInput: false,
                forceReload: false,
            });
        } else {
            setMobileThreadOpen(false);
            renderChatHeader();
            renderChatMessages();
        }
    }

    async function handleDeleteConversationAction() {
        const conversation = getSelectedConversation();
        if (!conversation) return;

        const profile = getConversationDisplayUser(conversation);
        const confirmed = window.confirm(
            `Masquer la discussion avec ${profile.name || "cet utilisateur"} ? Elle reviendra dans votre liste seulement s'il y a un nouveau message.`,
        );
        if (!confirmed) return;

        try {
            if (typeof window.hideDmConversation === "function") {
                await window.hideDmConversation(conversation.id);
            } else {
                const { error } = await supabase.rpc("hide_dm_conversation", {
                    p_conversation_id: conversation.id,
                });
                if (error) throw error;
            }

            await removeConversationLocally(conversation.id);
            if (window.ToastManager?.success) {
                ToastManager.success(
                    "Discussion supprimée",
                    "La discussion a été retirée de votre liste.",
                );
            }
        } catch (error) {
            console.error("Hide conversation error:", error);
            if (window.ToastManager?.error) {
                ToastManager.error(
                    "Suppression impossible",
                    getFriendlyDmErrorMessage(
                        error,
                        "Impossible de supprimer cette discussion.",
                    ),
                );
            }
        }
    }

    async function handleBlockUserAction() {
        const conversation = getSelectedConversation();
        if (!conversation?.otherUserId) return;

        const relationship = await refreshActiveRelationshipState(conversation.id);
        if (relationship.blockedByMe) {
            if (window.ToastManager?.info) {
                ToastManager.info(
                    "Utilisateur déjà bloqué",
                    "Débloquez-le depuis Réglages si vous souhaitez reprendre la discussion.",
                );
            }
            return;
        }

        const profile = getConversationDisplayUser(conversation);
        const confirmed = window.confirm(
            `Bloquer ${profile.name || "cet utilisateur"} ? Vous ne pourrez plus échanger de messages tant qu'il restera bloqué.`,
        );
        if (!confirmed) return;

        try {
            if (typeof window.blockDmUser === "function") {
                await window.blockDmUser(conversation.otherUserId);
            } else {
                const { error } = await supabase.rpc("block_dm_user", {
                    p_other_user_id: conversation.otherUserId,
                });
                if (error) throw error;
            }

            await removeConversationLocally(conversation.id);
            if (window.ToastManager?.success) {
                ToastManager.success(
                    "Utilisateur bloqué",
                    "Il a été ajouté à votre liste de blocage.",
                );
            }
        } catch (error) {
            console.error("Block user error:", error);
            if (window.ToastManager?.error) {
                ToastManager.error(
                    "Blocage impossible",
                    getFriendlyDmErrorMessage(
                        error,
                        "Impossible de bloquer cet utilisateur.",
                    ),
                );
            }
        }
    }

    async function sendCurrentMessage() {
        const currentUserId = getCurrentUserId();
        const conversationId = state.selectedConversationId;
        const input = getChatInput();
        const sendBtn = document.getElementById("chat-send-btn");
        const attachBtn = document.getElementById("chat-attach-btn");
        const pending = getPendingAttachment();

        if (!currentUserId || !conversationId || !input) return;

        const conversation = getSelectedConversation();
        if (!conversation?.otherUserId) return;

        const relationship = await refreshActiveRelationshipState(conversationId);
        if (!relationship.canMessage) {
            if (window.ToastManager?.error) {
                ToastManager.error("Message non envoyé", getDmBlockedMessage(relationship));
            }
            return;
        }

        const originalValue = String(input.value || "");
        const body = originalValue.trim();
        if (!body && !pending?.file) return;

        state.sendingMessage = true;
        if (sendBtn) sendBtn.disabled = true;
        if (attachBtn) attachBtn.disabled = true;
        syncComposerState();

        let uploadedMedia = null;

        try {
            if (pending?.file) {
                if (typeof window.uploadFile !== "function" && typeof uploadFile !== "function") {
                    throw new Error("Upload de média indisponible.");
                }

                pending.uploading = true;
                pending.progress = 0;
                renderAttachmentPreview();
                syncComposerState();

                const uploader =
                    typeof window.uploadFile === "function" ? window.uploadFile : uploadFile;
                uploadedMedia = await uploader(pending.file, "dm", (percent) => {
                    const currentPending = getPendingAttachment();
                    if (!currentPending) return;
                    currentPending.progress = Number(percent) || 0;
                    currentPending.uploading = true;
                    renderAttachmentPreview();
                });

                if (!uploadedMedia?.success || !uploadedMedia?.url) {
                    throw new Error(
                        uploadedMedia?.error || "Impossible d'uploader le média.",
                    );
                }
            }

            input.value = "";
            autoResizeChatInput();

            const insertPayload = {
                conversation_id: conversationId,
                sender_id: currentUserId,
                body: body || null,
            };
            if (uploadedMedia?.url) {
                insertPayload.media_url = uploadedMedia.url;
                insertPayload.media_type = uploadedMedia.type || pending?.kind || null;
                insertPayload.media_name = pending?.name || pending?.file?.name || null;
                insertPayload.media_size_bytes = pending?.size || pending?.file?.size || null;
            }

            const { data, error } = await runMessageSelect((selectColumns) =>
                supabase
                    .from("dm_messages")
                    .insert(insertPayload)
                    .select(selectColumns)
                    .single(),
            );

            if (
                error &&
                uploadedMedia?.url &&
                (isMissingDmMediaSchemaError(error) ||
                    isLegacyDmMediaConstraintError(error))
            ) {
                throw new Error(
                    "Messagerie média non configurée. Exécutez sql/discovery-phase2-messaging.sql puis réessayez.",
                );
            }
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
            clearPendingAttachment();
        } catch (error) {
            if (uploadedMedia?.path && typeof deleteFile === "function") {
                deleteFile(uploadedMedia.path).catch(() => {});
            }

            console.error("Erreur envoi message:", error);
            input.value = originalValue;
            autoResizeChatInput();
            const currentPending = getPendingAttachment();
            if (currentPending) {
                currentPending.uploading = false;
                currentPending.progress = 0;
                renderAttachmentPreview();
            }
            if (window.ToastManager?.error) {
                ToastManager.error(
                    "Message non envoyé",
                    getFriendlyDmErrorMessage(
                        error,
                        "Impossible d'envoyer le message.",
                    ),
                );
            } else {
                alert(
                    getFriendlyDmErrorMessage(
                        error,
                        "Impossible d'envoyer le message.",
                    ),
                );
            }
        } finally {
            const currentPending = getPendingAttachment();
            if (currentPending) {
                currentPending.uploading = false;
                if (!Number.isFinite(Number(currentPending.progress))) {
                    currentPending.progress = 0;
                }
                renderAttachmentPreview();
            }
            state.sendingMessage = false;
            if (sendBtn) sendBtn.disabled = false;
            if (attachBtn) attachBtn.disabled = false;
            syncComposerState();
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
        const snippet =
            buildMessageSnippet(messageRow, 110) ||
            "Vous avez reçu un nouveau message.";

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
        const normalizedMessage = normalizeMessageRow(messageRow);
        if (!normalizedMessage || !normalizedMessage.id) return;
        if (state.seenMessageIds.has(normalizedMessage.id)) return;
        rememberMessageId(normalizedMessage.id);

        const conversationId = normalizedMessage.conversation_id;
        if (!conversationId) return;

        if (!state.conversationsById.has(conversationId)) {
            scheduleConversationsRefresh();
        }

        const conversation = state.conversationsById.get(conversationId);
        if (conversation) {
            conversation.lastMessage = normalizedMessage;
            conversation.lastMessageAt = normalizedMessage.created_at;

            if (normalizedMessage.sender_id !== getCurrentUserId()) {
                const isActiveConversation =
                    state.selectedConversationId === conversationId && isMessagesPageActive();
                if (!isActiveConversation) {
                    conversation.unreadCount = (conversation.unreadCount || 0) + 1;
                }
            }
        }

        const existing = state.messagesByConversation.get(conversationId) || [];
        const alreadyExists = existing.some((msg) => msg.id === normalizedMessage.id);
        if (!alreadyExists) {
            state.messagesByConversation.set(conversationId, [...existing, normalizedMessage]);
        }

        sortAndReindexConversations();
        updateUnreadUi();

        const shouldAutoRead =
            state.selectedConversationId === conversationId &&
            isMessagesPageActive() &&
            !document.hidden;

        if (shouldAutoRead) {
            renderChatMessages();
            if (normalizedMessage.sender_id !== getCurrentUserId()) {
                await markConversationAsRead(conversationId);
            }
        }

        await showIncomingSignal(normalizedMessage);
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
                    getFriendlyDmErrorMessage(
                        error,
                        "Impossible d'ouvrir la conversation.",
                    ),
                );
            } else {
                alert(
                    getFriendlyDmErrorMessage(
                        error,
                        "Impossible d'ouvrir la conversation.",
                    ),
                );
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
            clearPendingAttachment();
            state.initializedForUserId = currentUserId;
            state.selectedConversationId = null;
            state.conversations = [];
            state.conversationsById = new Map();
            state.messagesByConversation = new Map();
            state.seenMessageIds = new Set();
            state.routeHandled = false;
            state.realtimeWarned = false;
            state.sendingMessage = false;
            state.activeRelationship = null;

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
        clearPendingAttachment();
        state.initializedForUserId = null;
        state.selectedConversationId = null;
        state.conversations = [];
        state.conversationsById = new Map();
        state.messagesByConversation = new Map();
        state.usersById = new Map();
        state.seenMessageIds = new Set();
        state.routeHandled = false;
        state.sendingMessage = false;
        state.activeRelationship = null;
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
