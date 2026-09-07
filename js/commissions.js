(async function () {
    const root = document.getElementById("commissions-root");
    const client = window.supabaseClient || window.supabase;
    const esc = (value) =>
        String(value ?? "").replace(
            /[&<>"']/g,
            (character) =>
                ({
                    "&": "&amp;",
                    "<": "&lt;",
                    ">": "&gt;",
                    '"': "&quot;",
                    "'": "&#39;",
                })[character],
        );

    if (!client) {
        root.innerHTML =
            '<div class="commissions-state commissions-state--error"><span class="commissions-eyebrow">Partner Console</span><h2>Connexion indisponible.</h2></div>';
        return;
    }
    const {
        data: { session },
    } = await client.auth.getSession();
    if (!session) {
        root.innerHTML =
            '<div class="commissions-state"><span class="commissions-eyebrow">Partner Console</span><h2>Commissions</h2><p>Connectez-vous pour accéder à cet espace.</p></div>';
        return;
    }

    const { data: pages, error: pagesError } = await client
        .from("professional_pages")
        .select("id,name")
        .eq("owner_id", session.user.id);
    if (pagesError || !pages?.length) {
        root.innerHTML =
            '<div class="commissions-state"><span class="commissions-eyebrow">Partner Console</span><h2>Commissions</h2><p>Cet espace est réservé aux propriétaires d’une Page Professionnelle.</p></div>';
        return;
    }

    const page = pages[0];
    const api = (() => {
        const configured = window.API_BASE_URL || window.resolveApiBase?.();
        if (configured) return configured.replace(/\/$/, "");
        const local = ["localhost", "127.0.0.1", "0.0.0.0"].includes(
            location.hostname,
        );
        return local ? `http://${location.hostname}:5050` : location.origin;
    })();
    const headers = { Authorization: `Bearer ${session.access_token}` };

    async function apiJson(url, options = {}) {
        const response = await fetch(url, options);
        const body = await response.text();
        let data = {};
        try {
            data = body ? JSON.parse(body) : {};
        } catch {
            throw Error("Réponse API partenaire invalide.");
        }
        if (!response.ok) throw Error(data.error || "Requête impossible.");
        return data;
    }
    function commissionStatusClass(status) {
        const normalized = String(status || "").toLowerCase();
        if (normalized.includes("paid") || normalized.includes("vers")) {
            return "is-paid";
        }
        if (normalized.includes("pending") || normalized.includes("attente")) {
            return "is-pending";
        }
        return "";
    }
    function renderPayoutForm(payoutSetting) {
        return `<section class="commissions-panel commissions-payout"><div class="commissions-section-heading"><div><span class="commissions-eyebrow">Payout settings</span><h3>Compte de retrait Mobile Money</h3></div><span class="commissions-panel-icon">↗</span></div><p>Choisissez votre réseau africain pris en charge par KPay et indiquez le numéro qui recevra vos commissions.</p><form id="partner-payout-form" class="commissions-payout-form"><label>Réseau Mobile Money<select id="partner-payout-provider" class="form-input" required></select></label><label>Titulaire du compte<input id="partner-payout-account" class="form-input" maxlength="80" value="${esc(payoutSetting?.account_name || "")}" required></label><label>Numéro Mobile Money<input id="partner-payout-number" class="form-input" type="tel" maxlength="32" value="${esc(payoutSetting?.wallet_number || "")}" placeholder="+243810000000" required></label><button class="btn btn-primary" type="submit">Enregistrer le compte de retrait</button><small id="partner-payout-message"></small></form></section>`;
    }

    async function savePayoutSetting(event) {
        event.preventDefault();
        const message = document.getElementById("partner-payout-message");
        const button = event.currentTarget.querySelector("button");
        button.disabled = true;
        message.textContent = "Enregistrement…";
        try {
            await apiJson(`${api}/api/partners/payout-settings`, {
                method: "POST",
                headers: { ...headers, "Content-Type": "application/json" },
                body: JSON.stringify({
                    professional_page_id: page.id,
                    provider: document.getElementById("partner-payout-provider")
                        .value,
                    account_name: document.getElementById(
                        "partner-payout-account",
                    ).value,
                    wallet_number: document.getElementById(
                        "partner-payout-number",
                    ).value,
                }),
            });
            message.textContent = "Compte de retrait enregistré.";
        } catch (error) {
            message.textContent = error.message || "Enregistrement impossible.";
        } finally {
            button.disabled = false;
        }
    }

    async function activate() {
        const message = document.getElementById("partner-message");
        message.textContent = "Activation…";
        try {
            await apiJson(`${api}/api/partners/activate`, {
                method: "POST",
                headers: { ...headers, "Content-Type": "application/json" },
                body: JSON.stringify({
                    professional_page_id: page.id,
                    code: document.getElementById("partner-code").value,
                }),
            });
            await load();
        } catch (error) {
            message.textContent = error.message || "Activation impossible.";
        }
    }

    async function load() {
        const data = await apiJson(
            `${api}/api/partners/dashboard?page_id=${encodeURIComponent(page.id)}`,
            { headers },
        );
        if (!data.active) {
            root.innerHTML = `<div class="commissions-activation"><section class="commissions-context"><span class="commissions-eyebrow">Partner program</span><h1>Activez votre espace commissions.</h1><p>Entrez le code partenaire fourni par XERA1 pour suivre les dons attribués à votre Page Professionnelle et gérer vos versements.</p><ol class="commissions-steps"><li><span>01</span><div><strong>Entrez votre code</strong><small>Le code fourni par XERA1 confirme votre partenariat.</small></div></li><li><span>02</span><div><strong>Suivez vos commissions</strong><small>Accédez à vos métriques et à votre historique.</small></div></li><li><span>03</span><div><strong>Configurez vos versements</strong><small>Recevez vos fonds via Mobile Money.</small></div></li></ol></section><section class="commissions-panel commissions-code-panel"><span class="commissions-panel-kicker">Activation requise</span><h2>Ouvrir votre espace</h2><p>Entrez le code partenaire associé à votre Page Professionnelle.</p><label class="commissions-code-label" for="partner-code">Code partenaire</label><input id="partner-code" class="form-input" maxlength="60" placeholder="CODE-PARTENAIRE"><button id="activate-partner" class="btn btn-primary">Activer le partenariat <span aria-hidden="true">→</span></button><p id="partner-message" class="commissions-feedback" role="status"></p></section></div>`;
            document.getElementById("activate-partner").onclick = activate;
            return;
        }
        const metrics = data.metrics;
        root.innerHTML = `<div class="commissions-dashboard-heading"><div><span class="commissions-eyebrow">Partner dashboard</span><h1>Commissions <span>· ${esc(data.partner)}</span></h1><p>Vue d’ensemble de la performance de votre partenariat.</p></div><span class="commissions-live-status"><span></span> Partenariat actif</span></div><section class="commissions-balance"><div><span class="commissions-eyebrow">Disponible maintenant</span><strong>$${Number(metrics.available).toFixed(2)}</strong><small>Fonds disponibles pour versement</small></div><span class="commissions-balance-mark">$</span></section><div class="commissions-metrics">${[
            ["Total", metrics.total],
            ["Disponible", metrics.available],
            ["Versé", metrics.paid],
            ["Affiliés", metrics.affiliates],
            ["Dons", metrics.donations],
            ["Dons éligibles", metrics.donationGross],
        ]
            .map(([label, value]) => {
                const isCount = ["Affiliés", "Dons"].includes(label);
                const displayValue = isCount
                    ? Number(value || 0).toLocaleString("fr-FR")
                    : `$${Number(value || 0).toFixed(2)}`;
                return `<div class="commissions-metric"><small>${label}</small><strong>${displayValue}</strong></div>`;
            })
            .join(
                "",
            )}</div><section class="commissions-panel commissions-history"><div class="commissions-section-heading"><div><span class="commissions-eyebrow">Activity</span><h2>Historique des commissions</h2></div><span class="commissions-history-count">${data.commissions.length} entrée${data.commissions.length > 1 ? "s" : ""}</span></div><div class="commissions-table-wrap"><table><thead><tr><th>Date</th><th>Don</th><th>Commission</th><th>Statut</th></tr></thead><tbody>${data.commissions.length ? data.commissions.map((commission) => `<tr><td>${new Date(commission.created_at).toLocaleDateString("fr-FR")}</td><td>$${Number(commission.amount_gross).toFixed(2)}</td><td>$${Number(commission.commission_amount).toFixed(2)}</td><td><span class="commissions-status-tag">${esc(commission.status)}</span></td></tr>`).join("") : '<tr><td colspan="4">Aucune commission pour le moment.</td></tr>'}</tbody></table></div></section>${renderPayoutForm(data.payoutSetting)}`;
        document.querySelectorAll(".commissions-status-tag").forEach((tag) => {
            const statusClass = commissionStatusClass(tag.textContent);
            if (statusClass) tag.classList.add(statusClass);
        });
        window.populateKPayMobileMoneySelect?.("#partner-payout-provider");
        const provider = document.getElementById("partner-payout-provider");
        if (provider && data.payoutSetting?.provider)
            provider.value = data.payoutSetting.provider;
        document
            .getElementById("partner-payout-form")
            ?.addEventListener("submit", savePayoutSetting);
    }

    try {
        await load();
    } catch (error) {
        root.innerHTML = `<div class="commissions-state commissions-state--error"><span class="commissions-eyebrow">Partner Console</span><h2>${esc(error.message || "Espace indisponible.")}</h2></div>`;
    }
})();
