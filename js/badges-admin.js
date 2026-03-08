export function initBadgeAdminPage({
    supabase,
    addVerifiedUserId,
    removeVerifiedUserId,
    setupAdminUserSearch,
    fetchVerifiedBadges,
    fetchVerificationRequests,
    getVerifiedBadgeSets,
}) {
    const container = document.getElementById("badge-admin");
    if (!container) return;

    let pendingRequestsCache = [];

    const renderList = async () => {
        const list = document.getElementById("badge-admin-list");
        if (!list) return;
        const sets = getVerifiedBadgeSets ? getVerifiedBadgeSets() : null;
        const creators = sets ? Array.from(sets.creators || []) : [];
        const staff = sets ? Array.from(sets.staff || []) : [];
        const ids = [...creators, ...staff];
        const profilesResult = window.fetchUsersByIds
            ? await window.fetchUsersByIds(ids)
            : { success: false, data: [] };
        const profileMap = new Map(
            (profilesResult.data || []).map((u) => [u.id, u]),
        );
        const item = (id, typeLabel, typeKey) => {
            const p = profileMap.get(id) || {};
            const name = p.name || id;
            const avatar = p.avatar || "https://placehold.co/40?text=👤";
            return `
            <div class="verification-request-item" style="justify-content:space-between; gap:0.75rem;">
                <div style="display:flex; align-items:center; gap:0.6rem; min-width:0;">
                    <img src="${avatar}" alt="${name}" style="width:32px; height:32px; border-radius:50%; object-fit:cover;">
                    <div style="display:flex; flex-direction:column; min-width:0;">
                        <span class="verification-request-name" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${name}</span>
                        <span class="verification-request-id" style="color:var(--text-secondary); font-size:0.8rem;">${id}</span>
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:0.5rem;">
                    <span class="verification-request-type">${typeLabel}</span>
                    <button class="btn-cancel badge-remove-btn" data-user-id="${id}" data-type="${typeKey}" title="Retirer le badge">Retirer</button>
                </div>
            </div>
        `;
        };
        list.innerHTML = `
            <div style="margin-bottom:0.5rem; font-weight:700;">Créateurs (${creators.length})</div>
            ${creators.map((id) => item(id, "Créateur", "creator")).join("") || '<div class="verification-empty">Aucun</div>'}
            <div style="margin:1rem 0 0.5rem; font-weight:700;">Staff (${staff.length})</div>
            ${staff.map((id) => item(id, "Staff", "staff")).join("") || '<div class="verification-empty">Aucun</div>'}
        `;

        // Bind remove buttons
        list.querySelectorAll(".badge-remove-btn").forEach((btn) => {
            btn.addEventListener("click", async () => {
                const uid = btn.dataset.userId;
                const type = btn.dataset.type || "creator";
                try {
                    btn.disabled = true;
                    btn.classList.add("is-pending");
                    await removeVerifiedUserId(type, uid);
                    await fetchVerifiedBadges();
                    await renderList();
                } catch (error) {
                    console.error("Erreur retrait badge:", error);
                    ToastManager?.error(
                        "Erreur",
                        error?.message || "Impossible de retirer le badge.",
                    );
                } finally {
                    btn.disabled = false;
                    btn.classList.remove("is-pending");
                }
            });
        });
    };

    const renderRequests = () => {
        const box = document.getElementById("badge-admin-requests");
        if (!box) return;
        if (!pendingRequestsCache.length) {
            box.innerHTML =
                '<div class="verification-empty">Aucune demande en attente.</div>';
            return;
        }
        box.innerHTML = pendingRequestsCache
            .map((req) => {
                const label = req.type === "staff" ? "Équipe/Entreprise" : "Créateur";
                const name = req.users?.name || "Utilisateur";
                const avatar =
                    req.users?.avatar || "https://placehold.co/40?text=👤";
                return `
                <div class="verification-request-item">
                    <input type="checkbox" class="badge-request-check" data-user-id="${req.user_id}" data-type="${req.type}">
                    <img src="${avatar}" alt="${name}">
                    <span class="verification-request-name">${name}</span>
                    <span class="verification-request-type">${label}</span>
                    <span class="verification-request-id">${req.user_id}</span>
                </div>
            `;
            })
            .join("");
    };

    const refreshRequests = async () => {
        const data = (await fetchVerificationRequests()) || [];
        pendingRequestsCache = data.filter((d) => d.status === "pending");
        renderRequests();
    };

    container.innerHTML = `
        <div class="settings-section">
            <div class="settings-header" style="border:none; margin-bottom:1rem; padding-bottom:0;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap: 1rem; flex-wrap: wrap;">
                    <div style="display:flex; align-items:center; gap: 0.75rem;">
                        <h2>Gestion des badges</h2>
                        <span class="admin-badge">Admin vérification</span>
                    </div>
                    <a class="btn-secondary" href="admin.html" style="text-decoration:none;">Retour admin</a>
                </div>
                <p>Attribuer ou retirer des badges créateur / staff et traiter les demandes.</p>
            </div>

            <div class="verification-admin-block">
                <h4>Rechercher un utilisateur</h4>
                <div class="verification-input-row" style="flex-wrap:wrap; gap:0.75rem;">
                    <input type="text" id="badge-admin-search" class="form-input" placeholder="ID ou nom d'utilisateur">
                    <select id="badge-admin-type" class="form-input">
                        <option value="creator">Créateur</option>
                        <option value="staff">Équipe / Entreprise</option>
                    </select>
                    <button type="button" class="btn-verify" id="badge-admin-apply">Attribuer</button>
                    <button type="button" class="btn-cancel" id="badge-admin-remove">Retirer</button>
                </div>
                <div id="badge-admin-suggestions" class="verify-suggestions" style="display:flex; flex-direction:column; gap:0.35rem; margin-top:0.5rem;"></div>
            </div>

            <div class="verification-admin-block" style="margin-top: 1.5rem;">
                <h4>Badges actuels</h4>
                <div id="badge-admin-list" class="verification-requests"></div>
            </div>

            <div class="verification-admin-block" style="margin-top: 1.5rem;">
                <h4>Demandes de vérification</h4>
                <div id="badge-admin-requests" class="verification-requests"></div>
                <div class="verification-actions" style="margin-top:0.75rem; display:flex; gap:0.5rem; flex-wrap:wrap;">
                    <button type="button" class="btn-verify" id="badge-approve">Valider sélection</button>
                    <button type="button" class="btn-cancel" id="badge-reject">Refuser sélection</button>
                </div>
            </div>
        </div>
    `;

    setupAdminUserSearch(
        "badge-admin-search",
        "badge-admin-suggestions",
        (user) => {
            const input = document.getElementById("badge-admin-search");
            if (input) input.value = user.id;
        },
        { showAvatar: true },
    );

    const applyBtn = document.getElementById("badge-admin-apply");
    const removeBtn = document.getElementById("badge-admin-remove");
    const defaultApplyLabel = applyBtn?.textContent || "Attribuer";
    const defaultRemoveLabel = removeBtn?.textContent || "Retirer";

    const handleApply = async (isRemove) => {
        const setPending = (state) => {
            [applyBtn, removeBtn].forEach((b) => {
                if (!b) return;
                b.disabled = state;
                b.classList.toggle("is-pending", state);
            });
            if (applyBtn) {
                applyBtn.textContent = state && !isRemove
                    ? "En cours d'attribution..."
                    : defaultApplyLabel;
            }
            if (removeBtn) {
                removeBtn.textContent = state && isRemove
                    ? "Retrait en cours..."
                    : defaultRemoveLabel;
            }
        };
        const target = document.getElementById("badge-admin-search")?.value || "";
        const type =
            document.getElementById("badge-admin-type")?.value || "creator";
        if (!target) {
            ToastManager?.error("Champ vide", "Saisir un ID ou un nom.");
            return;
        }
        try {
            setPending(true);
            if (isRemove) {
                await removeVerifiedUserId(type, target);
            } else {
                await addVerifiedUserId(type, target);
            }
            await fetchVerifiedBadges();
            renderList();
        } catch (error) {
            console.error("Erreur action badge:", error);
            ToastManager?.error(
                "Erreur",
                error?.message || "Action impossible pour le moment.",
            );
        } finally {
            setPending(false);
        }
    };

    document
        .getElementById("badge-admin-apply")
        ?.addEventListener("click", () => handleApply(false));
    document
        .getElementById("badge-admin-remove")
        ?.addEventListener("click", () => handleApply(true));

    const handleBulkAction = async (action) => {
        const checks = Array.from(
            document.querySelectorAll(".badge-request-check:checked"),
        );
        if (!checks.length) return;
        try {
            if (action === "approve") {
                await Promise.all(
                    checks.map((c) =>
                        addVerifiedUserId(c.dataset.type, c.dataset.userId),
                    ),
                );
            }

            await Promise.all(
                checks.map((c) =>
                    supabase
                        .from("verification_requests")
                        .update({
                            status:
                                action === "approve" ? "approved" : "rejected",
                        })
                        .eq("user_id", c.dataset.userId)
                        .eq("type", c.dataset.type)
                        .eq("status", "pending"),
                ),
            );

            await fetchVerifiedBadges();
            await refreshRequests();
            renderList();
            ToastManager?.success(
                "Mise à jour",
                action === "approve"
                    ? "Demandes approuvées."
                    : "Demandes refusées.",
            );
        } catch (error) {
            console.error("Erreur demandes vérification:", error);
            ToastManager?.error(
                "Erreur",
                error?.message || "Impossible de mettre à jour les demandes.",
            );
        }
    };

    document
        .getElementById("badge-approve")
        ?.addEventListener("click", () => handleBulkAction("approve"));
    document
        .getElementById("badge-reject")
        ?.addEventListener("click", () => handleBulkAction("reject"));

    renderList();
    refreshRequests();
}
