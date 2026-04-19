// Small admin helper to control bots from admin UI (uses supabase auth session)
// Helper: try relative fetch first, then fallback to local backend (useful when
// front is served by a static dev server at a different origin).
async function apiFetch(path, options = {}) {
    const rel = path.startsWith("/") ? path : `/${path}`;
    const fallbackBase =
        (window.API_BASE_URL || "").replace(/\/+$/, "") ||
        (window.location.hostname === "127.0.0.1" ||
        window.location.hostname === "localhost"
            ? `http://localhost:5050`
            : "");

    try {
        const res = await fetch(rel, options);
        if (res && res.ok) return res;
        // If 404 or other non-ok, try fallback if configured
        if (fallbackBase) {
            try {
                const url = `${fallbackBase}${rel}`;
                const res2 = await fetch(url, options);
                return res2;
            } catch (e) {
                // ignore and fallthrough to return original response
            }
        }
        return res;
    } catch (err) {
        // network error — try fallback
        if (fallbackBase) {
            const url = `${fallbackBase}${rel}`;
            return fetch(url, options);
        }
        throw err;
    }
}

async function fetchBotStatus() {
    try {
        const {
            data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        const res = await apiFetch("/api/admin/bots/status", {
            headers: {
                Authorization: token ? `Bearer ${token}` : "",
                "Content-Type": "application/json",
            },
        });
        if (!res.ok) {
            const body = await res.text().catch(() => "");
            const msg = body || `HTTP ${res.status}`;
            const err = new Error(msg);
            err.status = res.status;
            throw err;
        }
        return await res.json();
    } catch (e) {
        console.error("fetchBotStatus error", e);
        throw e;
    }
}

async function setActiveBotCount(count) {
    try {
        const {
            data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        const res = await apiFetch("/api/admin/bots/set-active-count", {
            method: "POST",
            headers: {
                Authorization: token ? `Bearer ${token}` : "",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ count }),
        });
        if (!res.ok) {
            const body = await res.text().catch(() => "");
            const msg = body || `HTTP ${res.status}`;
            const err = new Error(msg);
            err.status = res.status;
            throw err;
        }
        return await res.json();
    } catch (e) {
        console.error("setActiveBotCount error", e);
        throw e;
    }
}

async function toggleBotActive(userId, active) {
    try {
        const {
            data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        const res = await apiFetch("/api/admin/bots/toggle-active", {
            method: "POST",
            headers: {
                Authorization: token ? `Bearer ${token}` : "",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ user_id: userId, active: !!active }),
        });
        if (!res.ok) {
            const body = await res.text().catch(() => "");
            const msg = body || `HTTP ${res.status}`;
            const err = new Error(msg);
            err.status = res.status;
            throw err;
        }
        return await res.json();
    } catch (e) {
        console.error("toggleBotActive error", e);
        throw e;
    }
}

function formatDays(days) {
    if (!Array.isArray(days)) return "";
    const names = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
    return days.map((d) => names[d] || String(d)).join(", ");
}

async function renderSuperAdminPage() {
    const container = document.getElementById("admin-dashboard");
    if (!container) return;
    container.innerHTML = `
        <div class="settings-section">
            <h2>Bots Manager</h2>
            <div id="bots-stats" style="display:flex;gap:1rem;align-items:center;flex-wrap:wrap;">
                <div>Total bots: <strong id="bots-total">—</strong></div>
                <div>Active: <strong id="bots-active-count">—</strong></div>
                <div>
                    <label>Set active count: <input id="bots-active-input" type="number" min="0" max="400" style="width:6rem;margin-left:.5rem"></label>
                    <button id="bots-active-set-btn">Apply</button>
                    <button id="bots-refresh-btn">Refresh</button>
                    <button id="bots-run-now-btn" style="margin-left:.5rem">Run now</button>
                    <span id="bots-run-result" style="margin-left:0.75rem;color:var(--text-secondary)"></span>
                </div>
            </div>
            <div style="margin-top:1rem;">
                <table id="bots-sample-table" style="width:100%;border-collapse:collapse;">
                    <thead>
                        <tr>
                            <th style="text-align:left">Avatar</th>
                            <th style="text-align:left">Name</th>
                            <th>Hour</th>
                            <th>Encourage</th>
                            <th>Active</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody id="bots-sample-body"></tbody>
                </table>
            </div>
        </div>
    `;

    const input = document.getElementById("bots-active-input");
    const setBtn = document.getElementById("bots-active-set-btn");
    const refreshBtn = document.getElementById("bots-refresh-btn");

    async function refresh() {
        try {
            const status = await fetchBotStatus();
            document.getElementById("bots-total").textContent =
                status.totalBots || 0;
            document.getElementById("bots-active-count").textContent =
                status.activeCount || 0;
            input.value = status.activeCount || 0;
            const body = document.getElementById("bots-sample-body");
            body.innerHTML = "";
            (status.sample || []).forEach((b) => {
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td style="padding:6px"><img src="${b.avatar_url || "https://placehold.co/48"}" width="40" height="40" style="border-radius:50%"/></td>
                    <td style="padding:6px">${escapeHtml(b.display_name || b.user_id || "—")}</td>
                    <td style="text-align:center">${b.schedule_hour ?? "—"}</td>
                    <td style="text-align:center">${formatDays(b.encourage_days)}</td>
                    <td style="text-align:center">${b.active ? "Yes" : "No"}</td>
                    <td style="text-align:center"><button data-user-id="${b.user_id}" class="bot-toggle-btn">${b.active ? "Disable" : "Enable"}</button></td>
                `;
                body.appendChild(tr);
            });

            // Attach handlers
            Array.from(document.querySelectorAll(".bot-toggle-btn")).forEach(
                (btn) => {
                    btn.addEventListener("click", async (e) => {
                        const userId =
                            e.currentTarget.getAttribute("data-user-id");
                        const currentlyActive =
                            e.currentTarget.textContent.trim() === "Disable";
                        e.currentTarget.disabled = true;
                        try {
                            await toggleBotActive(userId, !currentlyActive);
                        } catch (err) {
                            alert("Erreur toggling bot");
                        } finally {
                            e.currentTarget.disabled = false;
                            await refresh();
                        }
                    });
                },
            );
        } catch (e) {
            console.error("refresh bots status error", e);
            const msg = e && e.message ? String(e.message) : "Erreur inconnue";
            alert(`Impossible de récupérer le statut des bots: ${msg}`);
        }
    }

    setBtn.addEventListener("click", async () => {
        const v = Number(input.value || 0);
        setBtn.disabled = true;
        try {
            await setActiveBotCount(v);
            await refresh();
        } catch (e) {
            alert("Erreur mise à jour");
        } finally {
            setBtn.disabled = false;
        }
    });

    refreshBtn.addEventListener("click", refresh);

    const runNowBtn = document.getElementById("bots-run-now-btn");
    const runResultSpan = document.getElementById("bots-run-result");
    runNowBtn.addEventListener("click", async () => {
        runNowBtn.disabled = true;
        const originalText = runNowBtn.textContent;
        runNowBtn.textContent = "Running…";
        runResultSpan.textContent = "";
        try {
            const {
                data: { session },
            } = await supabase.auth.getSession();
            const token = session?.access_token;
            const res = await apiFetch("/api/admin/bots/run-now", {
                method: "POST",
                headers: {
                    Authorization: token ? `Bearer ${token}` : "",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({}),
            });
            if (!res.ok) {
                const body = await res.text().catch(() => "");
                throw new Error(body || `HTTP ${res.status}`);
            }
            const json = await res.json();
            runResultSpan.textContent = `Processed ${json.processed || 0} bots — posts ${json.posts || 0}, encourages ${json.encourages || 0}, follows ${json.follows || 0}`;
            // refresh stats after run
            await refresh();
        } catch (err) {
            console.error("run-now error", err);
            runResultSpan.textContent = `Erreur: ${err && err.message ? err.message : "unknown"}`;
        } finally {
            runNowBtn.disabled = false;
            runNowBtn.textContent = originalText;
        }
    });

    // Initial load
    await refresh();
    // Auto refresh every 60s
    setInterval(refresh, 60 * 1000);
}

window.AdminBots = {
    fetchBotStatus,
    setActiveBotCount,
    toggleBotActive,
    renderSuperAdminPage,
};
