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
        root.textContent = "Connexion indisponible.";
        return;
    }
    const {
        data: { session },
    } = await client.auth.getSession();
    if (!session) {
        root.innerHTML =
            "<h2>Commissions</h2><p>Connectez-vous pour accéder à cet espace.</p>";
        return;
    }

    const { data: pages, error: pagesError } = await client
        .from("professional_pages")
        .select("id,name")
        .eq("owner_id", session.user.id);
    if (pagesError || !pages?.length) {
        root.innerHTML =
            "<h2>Commissions</h2><p>Cet espace est réservé aux propriétaires d’une Page Professionnelle.</p>";
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

    function renderPayoutForm(payoutSetting) {
        return `<section class="settings-section" style="margin:22px 0 0"><h3>Compte de retrait Mobile Money</h3><p>Choisissez votre réseau africain pris en charge par KPay et indiquez le numéro qui recevra vos commissions.</p><form id="partner-payout-form" style="display:grid;gap:12px;max-width:620px"><label>Réseau Mobile Money<select id="partner-payout-provider" class="form-input" required></select></label><label>Titulaire du compte<input id="partner-payout-account" class="form-input" maxlength="80" value="${esc(payoutSetting?.account_name || "")}" required></label><label>Numéro Mobile Money<input id="partner-payout-number" class="form-input" type="tel" maxlength="32" value="${esc(payoutSetting?.wallet_number || "")}" placeholder="+243810000000" required></label><button class="btn btn-primary" type="submit">Enregistrer le compte de retrait</button><small id="partner-payout-message"></small></form></section>`;
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
            root.innerHTML = `<h2>Activez votre partenariat</h2><p>Entrez le code partenaire fourni par XERA1 pour ouvrir votre espace Commissions.</p><input id="partner-code" class="form-input" maxlength="60" placeholder="CODE-PARTENAIRE"><button id="activate-partner" class="btn btn-primary" style="margin-top:12px">Activer le partenariat</button><p id="partner-message"></p>`;
            document.getElementById("activate-partner").onclick = activate;
            return;
        }
        const metrics = data.metrics;
        root.innerHTML = `<h2>Commissions · ${esc(data.partner)}</h2><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:12px;margin:18px 0">${[
            ["Total", metrics.total],
            ["Disponible", metrics.available],
            ["Versé", metrics.paid],
            ["Affiliés", metrics.affiliates],
            ["Dons", metrics.donations],
            ["Dons éligibles", metrics.donationGross],
        ]
            .map(
                ([label, value]) =>
                    `<div class="settings-section" style="margin:0"><small>${label}</small><strong style="display:block;font-size:1.35rem">${typeof value === "number" ? `$${value.toFixed(2)}` : value}</strong></div>`,
            )
            .join(
                "",
            )}</div><h3>Historique</h3><div style="overflow:auto"><table style="width:100%;border-collapse:collapse"><thead><tr><th>Date</th><th>Don</th><th>Commission</th><th>Statut</th></tr></thead><tbody>${data.commissions.length ? data.commissions.map((commission) => `<tr><td>${new Date(commission.created_at).toLocaleDateString("fr-FR")}</td><td>$${Number(commission.amount_gross).toFixed(2)}</td><td>$${Number(commission.commission_amount).toFixed(2)}</td><td>${esc(commission.status)}</td></tr>`).join("") : '<tr><td colspan="4">Aucune commission pour le moment.</td></tr>'}</tbody></table></div>${renderPayoutForm(data.payoutSetting)}`;
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
        root.textContent = error.message || "Espace indisponible.";
    }
})();
