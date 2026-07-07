/**
 * XERA PROFESSIONAL PAGES & CERTIFICATIONS
 * Gère la création de pages entreprises et la certification des talents
 * Version Onboarding Interactif XXL - Haute Visibilité
 */

class XERAProfessionalManager {
    constructor(supabase) {
        this.supabase = supabase;
        this.onboarding = null;
        this.myPageSlug = null;
        this.proPagesCache = new Map();

        // Initialiser l'état global
        window.userHasProPage = window.userHasProPage || false;
    }

    normalizeAccountValues(user) {
        return [
            user?.account_type,
            user?.user_metadata?.account_type,
            user?.account_subtype,
            user?.accountSubtype,
            user?.user_metadata?.account_subtype,
        ]
            .filter(
                (value) =>
                    value !== undefined && value !== null && value !== "",
            )
            .map((value) => String(value).trim().toLowerCase());
    }

    isNonPersonalAccount(user) {
        return this.normalizeAccountValues(user).some((value) =>
            [
                "team",
                "enterprise",
                "company",
                "community",
                "organization",
                "organisation",
                "org",
                "pro",
                "institution",
            ].includes(value),
        );
    }

    /**
     * Vérifie si l'utilisateur est éligible à avoir une page pro.
     * La création d'une page pro ne dépend plus d'un abonnement.
     */
    isEligibleForProPage(user) {
        return Boolean(user?.id);
    }

    notify(message, type = "info") {
        if (typeof window.showToast === "function") {
            window.showToast(message, type);
            return;
        }

        if (typeof window.showToastNotification === "function") {
            window.showToastNotification(message, type);
            return;
        }

        console.info(message);
    }

    getUpgradeUrl() {
        if (window.XeraRouter?.buildHtmlUrl) {
            return window.XeraRouter.buildHtmlUrl("subscriptionPlans");
        }

        return "subscription-plans.html";
    }

    buildPageSlug(name) {
        return String(name || "")
            .trim()
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9-]/g, "")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "");
    }

    escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    normalizeTokens(value) {
        return String(value || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .split(/[^a-z0-9]+/i)
            .map((token) => token.trim())
            .filter((token) => token.length >= 2);
    }

    buildNeedsTokens(page) {
        const needs = Array.isArray(page?.hiring_needs)
            ? page.hiring_needs
            : [];
        return Array.from(
            new Set(
                needs
                    .flatMap((need) => this.normalizeTokens(need))
                    .filter(Boolean),
            ),
        );
    }

    async getRecommendedProfilesForPage(page, employees = []) {
        const needTokens = this.buildNeedsTokens(page);
        if (needTokens.length === 0) return [];

        const employeeIds = new Set(
            (employees || [])
                .map((employee) => employee.user_id)
                .filter(Boolean),
        );

        // --- MOMENTUM ENGINE : DEEP ANALYSIS ---
        // On récupère les profils avec Arcs (intentions), Contenus (vélocité) et Certifications (confiance)
        const { data, error } = await this.supabase
            .from("users")
            .select(
                `
                id, name, avatar, title, bio, account_subtype, badge, plan, updated_at,
                content ( id, created_at, tags, title ),
                arcs ( id, title, opportunity_intents, description ),
                professional_certifications ( id, status )
            `,
            )
            .neq("id", page.owner_id)
            .order("updated_at", { ascending: false })
            .limit(100);

        if (error) {
            console.warn("Momentum Engine error:", error);
            return [];
        }

        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        return (data || [])
            .filter((user) => user?.id && !employeeIds.has(user.id))
            .map((user) => {
                // 1. CALCUL MOMENTUM (VÉLOCITÉ) : 1 post/jour = 100%
                const recentPosts = (user.content || []).filter(
                    (c) => new Date(c.created_at) >= sevenDaysAgo,
                );
                const velocity = recentPosts.length / 7;
                const momentumPercent = Math.round(velocity * 100);

                // 2. ANALYSE DU MATCHING PROFOND (TAGS ARCS + TRACES)
                const userContentTokens = new Set([
                    ...this.normalizeTokens(
                        user.name + " " + user.title + " " + user.bio,
                    ),
                    ...(user.arcs || []).flatMap((arc) =>
                        this.normalizeTokens(
                            arc.title +
                                " " +
                                (arc.tags?.join(" ") || "") +
                                " " +
                                arc.description,
                        ),
                    ),
                    ...(user.content || []).flatMap((c) =>
                        this.normalizeTokens(
                            c.title + " " + (c.tags?.join(" ") || ""),
                        ),
                    ),
                ]);

                const matchedTokens = needTokens.filter((token) =>
                    userContentTokens.has(token),
                );
                const matchRatio =
                    matchedTokens.length / Math.max(1, needTokens.length);

                // Matching d'Intention (Golden Match)
                // Analyse de l'audience cible (Collaborateurs, Investisseurs, Partenaires)
                const userIntents = (user.arcs || []).flatMap(
                    (arc) => arc.opportunity_intents || [],
                );
                const pageBio = (page.bio || "").toLowerCase();
                const isInvestorPage =
                    pageBio.includes("invest") ||
                    page.industry?.toLowerCase().includes("finance");
                const isRecruiterPage =
                    pageBio.includes("recrut") ||
                    page.industry?.toLowerCase().includes("rh");

                let goldenMatch = 0;
                if (
                    isInvestorPage &&
                    userIntents.includes("cherche_investissement")
                )
                    goldenMatch = 25;
                if (isRecruiterPage && userIntents.includes("open_to_recruit"))
                    goldenMatch = 25;

                // 3. BOOST VÉRIFICATION INSTITUTIONNELLE
                const isInstitutionVerified = (
                    user.professional_certifications || []
                ).some((cert) => cert.status === "active");
                const verificationBoost = isInstitutionVerified ? 30 : 0;

                // 4. BOOST ABONNEMENT PAYANT (Priorité SaaS)
                const isPaidUser = ["standard", "medium", "pro"].includes(
                    String(user.plan || "").toLowerCase(),
                );
                const subscriptionBoost = isPaidUser ? 20 : 0;

                // --- SCORE FINAL ÉQUILIBRÉ ---
                // Momentum (40%) + Match (30%) + Institution (15%) + Sub (15%) + GoldenMatch
                const baseScore =
                    momentumPercent * 0.4 +
                    matchRatio * 100 * 0.3 +
                    verificationBoost +
                    subscriptionBoost +
                    goldenMatch;
                const finalScore = Math.min(100, Math.round(baseScore));

                return {
                    ...user,
                    matchScore: finalScore,
                    momentum: momentumPercent,
                    matchedTokens,
                    isVerified: isInstitutionVerified,
                    isPro: isPaidUser,
                };
            })
            .sort((a, b) => b.matchScore - a.matchScore)
            .slice(0, 8);
    }

    scoreUserAgainstPage(user, page) {
        const needTokens = this.buildNeedsTokens(page);
        if (!user || needTokens.length === 0) {
            return {
                score: 0,
                matchedTokens: [],
                missingTokens: needTokens,
            };
        }

        const profileTokens = new Set(
            this.normalizeTokens(
                [
                    user.name,
                    user.title,
                    user.bio,
                    user.account_subtype,
                    user.account_type,
                    user.badge,
                ].join(" "),
            ),
        );
        const matchedTokens = needTokens.filter((token) =>
            profileTokens.has(token),
        );
        const missingTokens = needTokens.filter(
            (token) => !profileTokens.has(token),
        );
        const completeness = (user.title ? 8 : 0) + (user.bio ? 8 : 0);
        const score = Math.min(
            100,
            Math.round(
                (matchedTokens.length / needTokens.length) * 84 + completeness,
            ),
        );

        return { score, matchedTokens, missingTokens };
    }

    renderOfficialComparison(page, recommendedProfiles) {
        if (!window.currentUser) return "";

        const mine = this.scoreUserAgainstPage(window.currentUser, page);
        const topScore = recommendedProfiles?.[0]?.matchScore || 0;
        const averageScore =
            recommendedProfiles && recommendedProfiles.length > 0
                ? Math.round(
                      recommendedProfiles.reduce(
                          (total, profile) =>
                              total + Number(profile.matchScore || 0),
                          0,
                      ) / recommendedProfiles.length,
                  )
                : 0;
        const rivalScore = Math.max(topScore, averageScore);
        const mineWidth = Math.max(mine.score, 4);
        const rivalWidth = Math.max(rivalScore, 4);
        const matchedHtml = mine.matchedTokens.length
            ? mine.matchedTokens
                  .slice(0, 4)
                  .map((token) => `<span>${this.escapeHtml(token)}</span>`)
                  .join("")
            : "<span>aucun match direct</span>";
        const missingHtml = mine.missingTokens.length
            ? mine.missingTokens
                  .slice(0, 4)
                  .map((token) => `<span>${this.escapeHtml(token)}</span>`)
                  .join("")
            : "<span>profil aligné</span>";

        return `
            <section class="pro-versus-panel">
                <div class="pro-versus-head">
                    <h3>Moi vs eux</h3>
                    <p>Votre position face aux meilleurs profils qui matchent cette page officielle.</p>
                </div>
                <div class="pro-versus-bars">
                    <div class="pro-versus-row">
                        <div class="pro-versus-label">
                            <strong>Moi</strong>
                            <span>${mine.score}%</span>
                        </div>
                        <div class="pro-versus-track"><i style="width:${mineWidth}%"></i></div>
                    </div>
                    <div class="pro-versus-row">
                        <div class="pro-versus-label">
                            <strong>Eux</strong>
                            <span>${rivalScore}%</span>
                        </div>
                        <div class="pro-versus-track pro-versus-track--rivals"><i style="width:${rivalWidth}%"></i></div>
                    </div>
                </div>
                <div class="pro-versus-details">
                    <div>
                        <small>Vos signaux</small>
                        <div class="pro-versus-tags">${matchedHtml}</div>
                    </div>
                    <div>
                        <small>À renforcer</small>
                        <div class="pro-versus-tags is-muted">${missingHtml}</div>
                    </div>
                </div>
            </section>
        `;
    }

    renderRecommendedProfiles(profiles, page) {
        const needs = Array.isArray(page?.hiring_needs)
            ? page.hiring_needs.filter(Boolean)
            : [];

        if (!profiles || profiles.length === 0) {
            return `
                <section class="pro-match-panel">
                    <div class="pro-match-panel-head">
                        <h3>Meilleurs profils du moment</h3>
                        <p>${needs.length ? "Aucun profil ne matche encore clairement ces besoins." : "Ajoutez des besoins à la page pour activer les recommandations."}</p>
                    </div>
                </section>
            `;
        }

        return `
            <section class="pro-match-panel">
                <div class="pro-match-panel-head">
                    <h3>Meilleurs profils du moment</h3>
                    <p>Classés selon les besoins actuels de cette page.</p>
                </div>
                <div class="pro-match-list">
                    ${profiles
                        .map((profile) => {
                            const name = this.escapeHtml(
                                profile.name || "Profil XERA",
                            );
                            const title = this.escapeHtml(
                                profile.title ||
                                    profile.account_subtype ||
                                    "Trajectoire active",
                            );
                            const avatar = this.escapeHtml(
                                profile.avatar || "https://placehold.co/80",
                            );
                            const tokens = profile.matchedTokens
                                .slice(0, 3)
                                .map(
                                    (token) =>
                                        `<span>${this.escapeHtml(token)}</span>`,
                                )
                                .join("");

                            return `
                                <button class="pro-match-card" onclick="navigateToUserProfile('${profile.id}')">
                                    <img src="${avatar}" alt="Avatar ${name}">
                                    <span class="pro-match-card-body">
                                        <strong>${name}</strong>
                                        <small>${title}</small>
                                        <span class="pro-match-tags">${tokens || "<span>profil complet</span>"}</span>
                                    </span>
                                    <span class="pro-match-score">${profile.matchScore}%</span>
                                </button>
                            `;
                        })
                        .join("")}
                </div>
                <div style="margin-top: 15px; border-top: 1px solid var(--border-color); padding-top: 15px;">
                    <button class="btn btn-primary" onclick="window.professionalManager.openTopTalentExplorer()" style="width: 100%; justify-content: center; font-size: 0.85rem;">
                        <i class="fas fa-search-dollar" style="margin-right: 8px;"></i>
                        Tous les meilleurs profils
                    </button>
                </div>
            </section>
        `;
    }

    async isPageNameAvailable(name) {
        const pageName = String(name || "").trim();
        const slug = this.buildPageSlug(pageName);
        if (!pageName || !slug) return false;

        const [nameResult, slugResult] = await Promise.all([
            this.supabase
                .from("professional_pages")
                .select("id")
                .ilike("name", pageName)
                .limit(1),
            this.supabase
                .from("professional_pages")
                .select("id")
                .eq("slug", slug)
                .limit(1),
        ]);

        if (nameResult.error) throw nameResult.error;
        if (slugResult.error) throw slugResult.error;

        return (
            (nameResult.data || []).length === 0 &&
            (slugResult.data || []).length === 0
        );
    }

    startCreatePage() {
        if (!window.currentUser) {
            this.notify("Connectez-vous pour créer une Page Pro.", "info");
            window.location.href = "login.html?redirect=profile.html";
            return;
        }

        // Empêcher la création de doublons
        if (document.querySelector(".tutorial-overlay-premium")) {
            return;
        }

        this.onboarding = new XERAProfessionalOnboarding(this);
        this.onboarding.start();
    }
    /**
     * Initialise la navigation pour afficher le bouton Page Pro si nécessaire
     */
    async initNavigation(retryCount = 0) {
        // Attendre que l'utilisateur soit chargé
        if (!window.currentUser || !window.currentUser.id) {
            if (retryCount < 20) {
                setTimeout(() => this.initNavigation(retryCount + 1), 250);
            }
            return;
        }

        // Hook sur navigateTo pour nettoyer les paramètres d'URL pro
        if (!window._proNavigationHooked) {
            const originalNavigateTo = window.navigateTo;
            window.navigateTo = (pageId, options) => {
                if (
                    pageId !== "pro-page" &&
                    pageId !== "talent-explorer" &&
                    pageId !== "pro-settings"
                ) {
                    this.syncUrl({ pro: null, explorer: null });
                }
                if (typeof originalNavigateTo === "function") {
                    originalNavigateTo(pageId, options);
                }
            };
            window._proNavigationHooked = true;
        }

        try {
            // Vérifier les pages possédées par l'utilisateur
            const { data: pages, error } = await this.supabase
                .from("professional_pages")
                .select("slug")
                .eq("owner_id", window.currentUser.id);

            if (error) throw error;

            const hasPage = pages && pages.length > 0;
            window.userHasProPage = hasPage;

            const navBtn = document.getElementById("nav-pro-page");
            const talentFilterBtn = document.getElementById("filter-talents");

            if (navBtn) {
                if (hasPage) {
                    this.myPageSlug = pages[0].slug;
                    navBtn.style.display = "flex";
                    navBtn.title = "Accéder à ma Page Pro";
                } else {
                    this.myPageSlug = null;
                    navBtn.style.display = "none";
                }
            }

            // Afficher l'onglet Talents si c'est un profil Pro/Institution
            if (talentFilterBtn) {
                const isPro =
                    hasPage ||
                    (window.currentUser &&
                        ["recruiter", "investor"].includes(
                            window.currentUser.account_subtype,
                        ));
                talentFilterBtn.style.display = isPro ? "inline-flex" : "none";
            }

            // Rafraîchir l'affichage du profil si on est dessus
            const profileBtn = document.querySelector(
                ".settings-badge[title='Page Pro']",
            );
            if (profileBtn) {
                // NE PAS AFFICHER SI C'EST DEJA PRO
                const isAlreadyPro = hasPage || this.isNonPersonalAccount(window.currentUser);
                profileBtn.style.display = isAlreadyPro ? "none" : "flex";
                // AJOUT : Attacher l'événement pour démarrer la création
                profileBtn.onclick = () => this.startCreatePage();
            }

            console.log("Pro Page Navigation Initialized. Has Page:", hasPage);

            // Gérer l'état initial depuis l'URL (permet de rester sur la page au refresh)
            await this.handleInitialState();
            
            // Si on a une page pro, empêcher le onboarding intempestif
            if (hasPage) {
                firstPostOnboardingHandled = true; 
            }
        } catch (e) {
            console.error("InitNavigation Pro Page failed:", e);
        }
    }

    /**
     * Met à jour l'URL sans recharger la page
     */
    syncUrl(params) {
        try {
            const url = new URL(window.location.href);
            let changed = false;
            Object.entries(params).forEach(([key, value]) => {
                if (value === null) {
                    if (url.searchParams.has(key)) {
                        url.searchParams.delete(key);
                        changed = true;
                    }
                } else {
                    if (url.searchParams.get(key) !== String(value)) {
                        url.searchParams.set(key, String(value));
                        changed = true;
                    }
                }
            });
            if (changed) {
                window.history.replaceState({}, "", url.toString());
            }
        } catch (e) {
            console.warn("SyncUrl failed:", e);
        }
    }

    /**
     * Détecte si on doit charger une page pro ou l'explorateur depuis l'URL
     */
    async handleInitialState() {
        const params = new URLSearchParams(window.location.search);
        const proSlug = params.get("pro");
        const explorer = params.get("explorer");

        if (proSlug) {
            await this.renderProPage(proSlug);
            return true;
        }

        if (explorer === "1") {
            await this.renderTalentExplorer();
            return true;
        }

        return false;
    }

    /**
     * Ouvre la page pro existante, ou lance la création si aucune page n'existe.
     */
    async navigateToMyPage() {
        // 1. Si on a déjà le slug, on y va direct (Instantané)
        if (this.myPageSlug) {
            await this.renderProPage(this.myPageSlug);
            return;
        }

        // 2. Si on sait déjà qu'il n'y a pas de page, on lance la création (Instantané)
        if (window.userHasProPage === false) {
            this.startCreatePage();
            return;
        }

        // 3. Fallback : vérification si on ne sait pas encore
        try {
            const pages = await this.getMyPages();
            if (pages && pages.length > 0) {
                this.myPageSlug = pages[0].slug;
                window.userHasProPage = true;
                await this.renderProPage(this.myPageSlug);
                return;
            }
        } catch (error) {
            console.error("Erreur vérification Page Pro:", error);
        }

        this.startCreatePage();
    }

    /**
     * Crée une nouvelle page professionnelle
     */
    async createPage(data) {
        const { data: { user }, error: authError } = await this.supabase.auth.getUser();
        if (authError || !user) throw new Error("Utilisateur non connecté");

        // Utiliser l'ID de l'utilisateur authentifié
        const ownerId = user.id;

        const pageName = String(data.name || "").trim();
        const slug = this.buildPageSlug(pageName);
        if (!pageName || !slug) throw new Error("Nom de page invalide");

        const isAvailable = await this.isPageNameAvailable(pageName);
        if (!isAvailable) {
            throw new Error("Ce nom de Page Pro est déjà utilisé.");
        }

        const payload = {
            owner_id: ownerId, // ID fiable issu de l'auth
            name: pageName,
            slug: data.slug || slug,
            bio: data.bio || "",
            description: data.description || "",
            industry: data.industry,
            hiring_needs: data.hiringNeeds || [],
            talent_interests: data.talentInterests || [],
            avatar_url: data.avatarUrl,
            banner_url: data.bannerUrl,
            website_url: data.websiteUrl || "",
        };

        console.log("Tentative de création de page avec owner_id:", ownerId);
        console.log("Payload complet:", payload);

        const { data: page, error } = await this.supabase
            .from("professional_pages")
            .insert(payload)
            .select()
            .single();

        if (error) {
            console.error("Supabase creation error:", error);
            if (error.code === "23505") {
                throw new Error("Ce nom de Page Pro est déjà utilisé.");
            }
            if (error.code === "23503") {
                throw new Error("Erreur de compte : le profil utilisateur n'est pas correctement synchronisé avec la base de données.");
            }
            throw new Error(error.message || "Erreur lors de la création de la page.");
        }
        return page;
    }

    /**
     * Met à jour les informations d'une page pro
     */
    async updatePage(pageId, updates) {
        const { data, error } = await this.supabase
            .from("professional_pages")
            .update({
                name: updates.name,
                industry: updates.industry,
                bio: updates.bio,
                description: updates.description,
                avatar_url: updates.avatarUrl,
                banner_url: updates.bannerUrl,
                website_url: updates.websiteUrl,
                hiring_needs: updates.hiringNeeds,
                updated_at: new Date().toISOString(),
            })
            .eq("id", pageId)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Certifie un utilisateur
     */
    async certifyUser(pageId, userId, type, details = {}) {
        const finalTitle =
            details.title || (type === "student" ? "Étudiant" : "Membre");

        const payload = {
            page_id: pageId,
            user_id: userId,
            type: type,
            title: finalTitle,
            department: details.department || null,
            status: "active",
            start_date:
                details.startDate || new Date().toISOString().split("T")[0],
            metadata: details.metadata || {},
        };

        const { data: cert, error } = await this.supabase
            .from("professional_certifications")
            .upsert(payload, { onConflict: "page_id, user_id, type" })
            .select()
            .single();

        if (error) throw error;
        return cert;
    }

    /**
     * Révoque une certification (changement de statut)
     */
    async revokeCertification(certId) {
        const { data, error } = await this.supabase
            .from("professional_certifications")
            .update({
                status: "revoked",
                updated_at: new Date().toISOString(),
            })
            .eq("id", certId)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Supprime définitivement une certification
     */
    async deleteCertification(certId) {
        const { error } = await this.supabase
            .from("professional_certifications")
            .delete()
            .eq("id", certId);

        if (error) throw error;
        return true;
    }

    /**
     * Récupère les pages gérées par l'utilisateur actuel
     */
    async getMyPages() {
        if (!window.currentUser) return [];

        const { data, error } = await this.supabase
            .from("professional_pages")
            .select("*")
            .eq("owner_id", window.currentUser.id);

        if (error) throw error;
        return data || [];
    }

    /**
     * Récupère les infos d'une page (avec cache)
     */
    async getPageInfo(pageId) {
        if (this.proPagesCache.has(pageId)) {
            return this.proPagesCache.get(pageId);
        }

        const { data, error } = await this.supabase
            .from("professional_pages")
            .select("*")
            .eq("id", pageId)
            .single();

        if (error) return null;
        this.proPagesCache.set(pageId, data);
        return data;
    }

    /**
     * Récupère les certifications d'un utilisateur
     */
    async getUserCertifications(userId) {
        const { data, error } = await this.supabase
            .from("professional_certifications")
            .select(
                `
                *,
                page:professional_pages (
                    id,
                    name,
                    slug,
                    avatar_url
                )
            `,
            )
            .eq("user_id", userId)
            .eq("status", "active");

        if (error) throw error;
        return data || [];
    }

    /**
     * Récupère toutes les certifications d'une page
     */
    async getPageCertifications(pageId) {
        const { data, error } = await this.supabase
            .from("professional_certifications")
            .select(
                `
                *,
                user:users (
                    id,
                    name,
                    avatar,
                    account_subtype
                )
            `,
            )
            .eq("page_id", pageId);

        if (error) throw error;
        return data || [];
    }

    /**
     * Ouvre l'interface de gestion d'équipe
     */
    async openTeamManagement(pageId) {
        // Création du modal s'il n'existe pas
        let modal = document.getElementById("team-management-modal");
        if (!modal) {
            modal = document.createElement("div");
            modal.id = "team-management-modal";
            modal.className = "modal-overlay-xxl";
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div class="onboarding-xxl" style="width: 700px; max-width: 95vw; padding: 40px; position: relative; background: #fff; border: 3px solid #000; box-shadow: 10px 10px 0px #000;">
                <button class="close-onboarding" onclick="this.closest('.modal-overlay-xxl').remove()" style="position: absolute; top: 20px; right: 20px; background: none; border: none; font-size: 2rem; cursor: pointer;">×</button>

                <h2 style="margin-bottom: 5px; font-size: 2rem;">Gestion de l'Équipe Certifiée</h2>
                <p style="color: var(--text-secondary); margin-bottom: 30px;">Ajoutez des membres officiels ou révoquez des accès.</p>

                <div class="team-management-tabs" style="display: flex; gap: 20px; border-bottom: 2px solid #eee; margin-bottom: 25px;">
                    <button class="tab-btn active" data-tab="members" style="padding: 10px 0; background: none; border: none; border-bottom: 3px solid #000; font-weight: 700; cursor: pointer;">Membres actuels</button>
                    <button class="tab-btn" data-tab="add" style="padding: 10px 0; background: none; border: none; border-bottom: 3px solid transparent; font-weight: 700; cursor: pointer;">+ Ajouter un membre</button>
                </div>

                <div id="team-tab-content">
                    <div class="loading-spinner"></div>
                </div>
            </div>
        `;

        modal.style.display = "flex";
        modal.style.position = "fixed";
        modal.style.inset = "0";
        modal.style.backgroundColor = "rgba(0,0,0,0.8)";
        modal.style.zIndex = "11000";
        modal.style.justifyContent = "center";
        modal.style.alignItems = "center";

        await this.loadTeamTab(pageId, "members");
        this.attachTeamTabs(pageId);
    }

    /**
     * Gère le basculement entre les onglets
     */
    attachTeamTabs(pageId) {
        const modal = document.getElementById("team-management-modal");
        const tabs = modal.querySelectorAll(".tab-btn");
        tabs.forEach((tab) => {
            tab.onclick = async () => {
                tabs.forEach((t) => {
                    t.classList.remove("active");
                    t.style.borderBottomColor = "transparent";
                });
                tab.classList.add("active");
                tab.style.borderBottomColor = "#000";
                await this.loadTeamTab(pageId, tab.dataset.tab);
            };
        });
    }

    /**
     * Charge le contenu d'un onglet
     */
    async loadTeamTab(pageId, tabName) {
        const container = document.getElementById("team-tab-content");
        container.innerHTML = `<div style="text-align:center; padding: 40px;"><div class="loading-spinner"></div></div>`;

        if (tabName === "members") {
            const certs = await this.getPageCertifications(pageId);
            if (certs.length === 0) {
                container.innerHTML = `<p style="text-align: center; padding: 40px; color: var(--text-secondary);">Aucun membre certifié pour le moment.</p>`;
                return;
            }

            container.innerHTML = `
                <div class="team-list" style="max-height: 400px; overflow-y: auto;">
                    ${certs
                        .map(
                            (cert) => `
                        <div class="team-member-item" style="display: flex; align-items: center; gap: 15px; padding: 15px; border: 2px solid #eee; border-radius: 12px; margin-bottom: 10px;">
                            <img src="${cert.user?.avatar || "https://placehold.co/50"}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover;">
                            <div style="flex: 1;">
                                <div style="font-weight: 700;">${cert.user?.name}</div>
                                <div style="font-size: 0.85rem; color: var(--text-secondary);">${cert.title} • ${cert.type}</div>
                            </div>
                            <div style="display: flex; gap: 10px;">
                                <button class="btn btn-secondary btn-sm" onclick="window.professionalManager.handleDeleteCert('${cert.id}', '${pageId}')" style="padding: 5px 12px; font-size: 0.8rem; background: #fee2e2; color: #dc2626; border-color: #fecaca;">Supprimer</button>
                            </div>
                        </div>
                    `,
                        )
                        .join("")}
                </div>
            `;
        } else if (tabName === "add") {
            container.innerHTML = `
                <div class="add-member-form">
                    <div class="form-group" style="margin-bottom: 20px;">
                        <label style="display: block; font-weight: 700; margin-bottom: 10px;">Rechercher un utilisateur (Nom)</label>
                        <div style="position: relative;">
                            <input type="text" id="user-search-input" class="form-input" placeholder="Commencez à taper un nom..." autocomplete="off" style="width: 100%;">
                            <div id="user-search-results" style="display: none; position: absolute; top: 100%; left: 0; right: 0; z-index: 100; background: #fff; border: 2px solid #000; max-height: 200px; overflow-y: auto;"></div>
                        </div>
                    </div>

                    <div id="selected-user-preview" style="display: none; padding: 20px; border: 2px dashed #000; border-radius: 12px; margin-bottom: 20px; align-items: center; gap: 15px;">
                        <!-- JS Dynamic -->
                    </div>

                    <div id="certification-details" style="display: none;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
                            <div class="form-group">
                                <label style="display: block; font-weight: 700; margin-bottom: 5px;">Type</label>
                                <select id="cert-type" class="form-input" style="width: 100%;">
                                    <option value="employee">Employé</option>
                                    <option value="student">Étudiant</option>
                                    <option value="partner">Partenaire</option>
                                    <option value="alumni">Ancien</option>
                                    <option value="contractor">Prestataire</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label style="display: block; font-weight: 700; margin-bottom: 5px;">Titre / Poste</label>
                                <input type="text" id="cert-title" class="form-input" placeholder="Ex: Lead Developer" style="width: 100%;">
                            </div>
                        </div>
                        <button id="submit-cert-btn" class="btn btn-primary" style="width: 100%; justify-content: center; height: 50px; font-size: 1.1rem;">Certifier cet utilisateur</button>
                    </div>
                </div>
            `;

            this.attachUserSearch(pageId);
        }
    }

    /**
     * Recherche d'utilisateur
     */
    attachUserSearch(pageId) {
        const input = document.getElementById("user-search-input");
        const results = document.getElementById("user-search-results");
        const preview = document.getElementById("selected-user-preview");
        const details = document.getElementById("certification-details");
        let selectedUserId = null;

        input.oninput = async (e) => {
            const val = e.target.value.trim();
            if (val.length < 2) {
                results.style.display = "none";
                return;
            }

            // Recherche via Supabase (table users)
            const { data, error } = await this.supabase
                .from("users")
                .select("id, name, avatar")
                .ilike("name", `%${val}%`)
                .limit(5);

            if (!error && data.length > 0) {
                results.innerHTML = data
                    .map(
                        (u) => `
                    <div class="user-option" data-id="${u.id}" data-name="${u.name}" data-avatar="${u.avatar || ""}" style="padding: 10px; cursor: pointer; border-bottom: 1px solid #eee; display: flex; align-items: center; gap: 10px;">
                        <img src="${u.avatar || "https://placehold.co/30"}" style="width: 30px; height: 30px; border-radius: 50%;">
                        <span>${u.name}</span>
                    </div>
                `,
                    )
                    .join("");
                results.style.display = "block";
            } else {
                results.style.display = "none";
            }
        };

        results.onclick = (e) => {
            const option = e.target.closest(".user-option");
            if (option) {
                selectedUserId = option.dataset.id;
                const name = option.dataset.name;
                const avatar =
                    option.dataset.avatar || "https://placehold.co/50";

                preview.innerHTML = `
                    <img src="${avatar}" style="width: 50px; height: 50px; border-radius: 50%;">
                    <div style="flex: 1;">
                        <div style="font-weight: 700;">${name}</div>
                        <div style="font-size: 0.8rem; color: var(--text-secondary);">Utilisateur sélectionné</div>
                    </div>
                    <button class="btn btn-secondary btn-sm" id="cancel-user-selection">Changer</button>
                `;
                preview.style.display = "flex";
                input.value = "";
                results.style.display = "none";
                input.parentElement.parentElement.style.display = "none";
                details.style.display = "block";

                document.getElementById("cancel-user-selection").onclick =
                    () => {
                        selectedUserId = null;
                        preview.style.display = "none";
                        input.parentElement.parentElement.style.display =
                            "block";
                        details.style.display = "none";
                    };
            }
        };

        document.getElementById("submit-cert-btn").onclick = async () => {
            if (!selectedUserId) return;
            const type = document.getElementById("cert-type").value;
            const title = document.getElementById("cert-title").value;

            try {
                await this.certifyUser(pageId, selectedUserId, type, { title });
                window.showToast?.("Utilisateur certifié avec succès !");
                await this.loadTeamTab(pageId, "members");
                const tabs = document.querySelectorAll(".tab-btn");
                tabs[0].classList.add("active");
                tabs[0].style.borderBottomColor = "#000";
                tabs[1].classList.remove("active");
                tabs[1].style.borderBottomColor = "transparent";
            } catch (err) {
                alert("Erreur: " + err.message);
            }
        };
    }

    async handleDeleteCert(certId, pageId) {
        if (!confirm("Révoquer cette certification ?")) return;
        try {
            await this.deleteCertification(certId);
            window.showToast?.("Certification révoquée.");
            await this.loadTeamTab(pageId, "members");
        } catch (err) {
            alert("Erreur: " + err.message);
        }
    }

    /**
     * Ouvre les réglages de la page (React Component)
     */
    openPageSettings(pageId) {
        if (typeof window.mountProSettings !== "function") {
            alert("Le module de réglages n'est pas encore chargé.");
            return;
        }

        // Créer l'overlay pour React
        let overlay = document.getElementById("pro-settings-overlay");
        if (!overlay) {
            overlay = document.createElement("div");
            overlay.id = "pro-settings-overlay";
            overlay.className =
                "fixed inset-0 bg-black/90 z-[12000] flex items-center justify-center p-4 backdrop-blur-sm";
            document.body.appendChild(overlay);
        } else {
            overlay.style.display = "flex";
        }

        // Monter le composant React
        window.mountProSettings(overlay, pageId, () => {
            overlay.style.display = "none";
        });
    }

    /**
     * Ouvre le menu de création d'un ARC d'organisation
     */
    async openCreateOrgArc(pageId) {
        // On réutilise la logique de création d'ARC de arcs.js mais avec un context page_id
        if (window.openCreateModal) {
            window._pendingPageIdForArc = pageId;
            window.openCreateModal();
        }
    }

    /**
     * Valide officiellement une Trace d'un employé
     */
    async validateTrace(contentId, pageId) {
        const { data, error } = await this.supabase
            .from("content")
            .update({
                is_validated_pro: true,
                validated_by_page_id: pageId,
            })
            .eq("id", contentId)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Retire la validation officielle
     */
    async invalidateTrace(contentId) {
        const { data, error } = await this.supabase
            .from("content")
            .update({
                is_validated_pro: false,
                validated_by_page_id: null,
            })
            .eq("id", contentId)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Charge les publications de la page pro
     */
    async loadCompanyUpdates(pageId) {
        const container = document.getElementById("company-updates-container");
        if (!container) return;

        try {
            const { data: updates, error } = await this.supabase
                .from("content")
                .select("*")
                .eq("page_id", pageId)
                .order("created_at", { ascending: false });

            if (error) throw error;

            if (updates.length === 0) {
                container.innerHTML = `<p style="color: var(--text-secondary); font-style: italic; text-align: center; padding: 20px; border: 2px dashed #eee; border-radius: 12px;">Aucune actualité publiée par l'entreprise.</p>`;
                return;
            }

            container.innerHTML = updates
                .map((update) => {
                    // On utilise la fonction de rendu globale si disponible, sinon fallback
                    if (typeof window.renderProfileUpdateCard === "function") {
                        return window.renderProfileUpdateCard(update, {
                            profileUserId: update.user_id,
                            currentUserId: window.currentUserId,
                        });
                    }

                    // Fallback (ancien style amélioré)
                    return `
                    <div class="timeline-card pro-feed-card" style="margin-bottom: 20px; padding: 25px;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;">
                            <h4 style="margin: 0; font-size: 1.2rem; font-family: var(--font-heading);">
                                ${update.metadata?.sub_type === "event" ? '<span style="background: #6366f1; color: #fff; font-size: 0.7rem; padding: 2px 8px; border-radius: 4px; vertical-align: middle; margin-right: 8px;">ÉVÉNEMENT</span>' : ""}
                                ${update.title}
                            </h4>
                            <span style="font-size: 0.8rem; color: var(--text-secondary);">${new Date(update.created_at).toLocaleDateString()}</span>
                        </div>

                        ${
                            update.metadata?.sub_type === "event"
                                ? `
                            <div style="background: var(--bg-primary); padding: 12px; border-radius: 8px; margin-bottom: 15px; border-left: 4px solid #6366f1; display: flex; flex-wrap: wrap; gap: 15px; font-size: 0.85rem;">
                                <span><i class="fas fa-calendar-alt" style="margin-right: 5px;"></i> ${update.metadata.event_date || "Date à venir"}</span>
                                <span><i class="fas fa-clock" style="margin-right: 5px;"></i> ${update.metadata.event_time || ""}</span>
                                <span><i class="fas fa-map-marker-alt" style="margin-right: 5px;"></i> ${update.metadata.location || "Lieu non défini"}</span>
                            </div>
                        `
                                : ""
                        }

                        <p style="white-space: pre-wrap; color: var(--text-secondary); line-height: 1.6; margin-bottom: 15px;">${update.description}</p>
                        ${
                            update.media_url
                                ? `
                            <div style="border-radius: 12px; overflow: hidden; margin-bottom: 15px; border: 1px solid var(--border-color);">
                                ${update.type === "video" ? `<video src="${update.media_url}" controls style="width: 100%;"></video>` : `<img src="${update.media_url}" style="width: 100%; object-fit: cover;">`}
                            </div>
                        `
                                : ""
                        }
                    </div>
                `;
                })
                .join("");
        } catch (err) {
            console.error(err);
            container.innerHTML = `<p style="color: #ef4444;">Erreur lors du chargement des actualités.</p>`;
        }
    }

    /**
     * Ouvre le menu de publication pour l'entreprise
     */
    async openCompanyPostMenu(pageId) {
        // On réutilise openCreateMenu mais en passant le pageId
        if (window.openCreateMenu) {
            // On a besoin que openCreateMenu supporte pageId.
            // On va devoir modifier js/app-supabase.js pour ça.

            // On injecte pageId dans le futur appel
            window._pendingPageId = pageId;
            window.openCreateMenu(window.currentUserId);
        } else {
            alert("Menu de création non disponible.");
        }
    }

    /**
     * Génère le HTML du badge "Seal of Approval"
     */
    renderSealOfApproval(content) {
        if (!content.isValidatedPro || !content.validatedByPageId) return "";

        const page = this.proPagesCache.get(content.validatedByPageId);
        const pageName = page ? page.name : "Organisation";
        const pageAvatar = page?.avatar_url || "icons/enterprise.svg";

        return `
            <div class="seal-of-approval" title="Validé officiellement par ${pageName}" style="display: flex; align-items: center; gap: 6px; background: #000; color: #fff; padding: 4px 10px; border-radius: 20px; font-size: 0.7rem; font-weight: 800; border: 2px solid #fff; box-shadow: 0 4px 10px rgba(0,0,0,0.2); width: fit-content; margin-top: 5px;">
                <img src="${pageAvatar}" style="width: 14px; height: 14px; border-radius: 3px; object-fit: cover;">
                <span>VALIDÉ PAR ${pageName.toUpperCase()}</span>
                <span style="color: #00ff88;">✔</span>
            </div>
        `;
    }
    /**
     * Ouvre le menu de création LinkedIn-style pour les entreprises
     */
    async openProfessionalCreateMenu(pageId, initialType = "news") {
        const page = await this.getPageInfo(pageId);
        if (!page) return;

        let modal = document.getElementById("pro-create-modal");
        if (!modal) {
            modal = document.createElement("div");
            modal.id = "pro-create-modal";
            modal.className = "modal-overlay-xxl";
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div class="onboarding-xxl pro-create-modal-content" style="width: 600px; max-width: 95vw; padding: 0; background: var(--bg-secondary); border: 1px solid var(--border-color); overflow: hidden; display: flex; flex-direction: column;">
                <div class="modal-header" style="padding: 20px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
                    <h2 style="margin: 0; font-size: 1.25rem;">Créer une publication officielle</h2>
                    <button onclick="this.closest('.modal-overlay-xxl').remove()" style="background: none; border: none; font-size: 1.5rem; color: var(--text-secondary); cursor: pointer;">×</button>
                </div>

                <div class="pro-create-tabs" style="display: flex; background: var(--bg-primary);">
                    <button class="pro-tab-btn ${initialType === "news" ? "active" : ""}" data-type="news">
                        <i class="fas fa-newspaper"></i> Actualité
                    </button>
                    <button class="pro-tab-btn ${initialType === "event" ? "active" : ""}" data-type="event">
                        <i class="fas fa-calendar-alt"></i> Événement
                    </button>
                </div>

                <div id="pro-create-form-container" style="padding: 25px; flex: 1; overflow-y: auto;">
                    <!-- Formulaire dynamique -->
                </div>

                <div class="modal-footer" style="padding: 20px; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; gap: 15px; background: var(--bg-primary);">
                    <button class="btn btn-secondary" onclick="this.closest('.modal-overlay-xxl').remove()">Annuler</button>
                    <button id="pro-submit-btn" class="btn btn-primary">Publier maintenant</button>
                </div>
            </div>
        `;

        modal.style.display = "flex";
        modal.style.position = "fixed";
        modal.style.inset = "0";
        modal.style.backgroundColor = "rgba(0,0,0,0.85)";
        modal.style.backdropFilter = "blur(4px)";
        modal.style.zIndex = "11000";
        modal.style.justifyContent = "center";
        modal.style.alignItems = "center";

        const self = this;
        const renderForm = (type) => {
            const container = document.getElementById(
                "pro-create-form-container",
            );
            if (type === "news") {
                container.innerHTML = `
                    <div class="form-group" style="margin-bottom: 20px;">
                        <label>Titre de l'actualité</label>
                        <input type="text" id="pro-news-title" class="form-input" placeholder="Ex: XERA lève 10M€ pour le Momentum Engine" style="font-size: 1.1rem; font-weight: 700;">
                    </div>
                    <div class="form-group" style="margin-bottom: 20px;">
                        <label>Contenu</label>
                        <textarea id="pro-news-content" class="form-input" rows="8" placeholder="Écrivez votre annonce officielle ici..."></textarea>
                    </div>
                    <div class="form-group">
                        <label>Image de couverture (Optionnelle)</label>
                        <div id="pro-news-media-preview" style="margin-bottom: 10px; display: none;"></div>
                        <label class="btn btn-secondary" style="display: inline-flex; cursor: pointer;">
                            <i class="fas fa-image" style="margin-right: 8px;"></i> Ajouter un média
                            <input type="file" id="pro-news-file" accept="image/*" style="display: none;">
                        </label>
                        <input type="hidden" id="pro-news-media-url">
                    </div>
                `;

                // Correction : Activation de l'autocomplétion sur le textarea
                setTimeout(() => {
                    const textarea =
                        document.getElementById("pro-news-content");
                    if (window.attachMentionAutocomplete)
                        window.attachMentionAutocomplete(textarea);
                }, 50);

                const fileInput = document.getElementById("pro-news-file");
                fileInput.onchange = async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const res = await window.uploadFile(file, "pro-pages/news");
                    if (res.success) {
                        document.getElementById("pro-news-media-url").value =
                            res.url;
                        const preview = document.getElementById(
                            "pro-news-media-preview",
                        );
                        preview.innerHTML = `<img src="${res.url}" style="width: 100%; border-radius: 8px; max-height: 200px; object-fit: cover;">`;
                        preview.style.display = "block";
                    }
                };
            } else {
                container.innerHTML = `
                    <div class="form-group" style="margin-bottom: 20px;">
                        <label>Nom de l'événement</label>
                        <input type="text" id="pro-event-title" class="form-input" placeholder="Ex: Web Summit 2026 - Meetup XERA">
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
                        <div class="form-group">
                            <label>Date</label>
                            <input type="date" id="pro-event-date" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Heure</label>
                            <input type="time" id="pro-event-time" class="form-input">
                        </div>
                    </div>
                    <div class="form-group" style="margin-bottom: 20px;">
                        <label>Lieu / Lien (Online)</label>
                        <input type="text" id="pro-event-location" class="form-input" placeholder="Ex: Paris, Station F ou Lien Zoom">
                    </div>
                    <div class="form-group">
                        <label>Description de l'événement</label>
                        <textarea id="pro-event-desc" class="form-input" rows="5" placeholder="Détails, agenda, intervenants..."></textarea>
                    </div>
                `;

                // Correction : Activation de l'autocomplétion sur le textarea
                setTimeout(() => {
                    const textarea = document.getElementById("pro-event-desc");
                    if (window.attachMentionAutocomplete)
                        window.attachMentionAutocomplete(textarea);
                }, 50);
            }
        };

        renderForm(initialType);

        const tabs = modal.querySelectorAll(".pro-tab-btn");
        tabs.forEach((tab) => {
            tab.onclick = () => {
                tabs.forEach((t) => t.classList.remove("active"));
                tab.classList.add("active");
                renderForm(tab.dataset.type);
            };
        });

        document.getElementById("pro-submit-btn").onclick = async () => {
            const activeType = modal.querySelector(".pro-tab-btn.active")
                .dataset.type;
            const btn = document.getElementById("pro-submit-btn");
            btn.disabled = true;
            btn.innerText = "Publication...";

            try {
                let payload = {
                    page_id: pageId,
                    user_id: window.currentUserId,
                    type: "text", // Par défaut, sera écrasé si média présent
                    state: "success", // Ajout du state pour éviter la contrainte NOT NULL
                    day_number: 0, // Correction : ajout du day_number pour éviter l'erreur NOT NULL
                    created_at: new Date().toISOString(),
                    metadata: {},
                };

                if (activeType === "news") {
                    payload.title =
                        document.getElementById("pro-news-title").value;
                    payload.description =
                        document.getElementById("pro-news-content").value;
                    payload.media_url =
                        document.getElementById("pro-news-media-url").value;
                    payload.type = payload.media_url ? "image" : "text";
                    payload.metadata.sub_type = "news";
                } else {
                    payload.title =
                        document.getElementById("pro-event-title").value;
                    payload.description =
                        document.getElementById("pro-event-desc").value;
                    payload.type = "text";
                    payload.metadata = {
                        sub_type: "event",
                        event_date:
                            document.getElementById("pro-event-date").value,
                        event_time:
                            document.getElementById("pro-event-time").value,
                        location:
                            document.getElementById("pro-event-location").value,
                    };
                }

                if (!payload.title || !payload.description) {
                    throw new Error(
                        "Veuillez remplir les champs obligatoires.",
                    );
                }

                const { data: createdContent, error } = await this.supabase
                    .from("content")
                    .insert(payload)
                    .select()
                    .single();

                if (error) throw error;

                // Notification des mentions @
                if (window.notifyMentions && createdContent) {
                    window
                        .notifyMentions(
                            payload.description,
                            createdContent.id,
                            window.currentUserId,
                            page.name || "Une Page Officielle",
                        )
                        .catch((e) =>
                            console.warn(
                                "Mention notification failed (pro):",
                                e,
                            ),
                        );
                }

                window.showToast?.("Publication réussie !");
                modal.remove();
                this.renderProPage(page.slug);
            } catch (err) {
                alert(err.message);
                btn.disabled = false;
                btn.innerText = "Publier maintenant";
            }
        };
    }

    /**
     * Rendu complet d'une Page Professionnelle
     */
    async renderProPage(slug) {
        let proContainer = document.querySelector(".pro-page-container");
        if (!proContainer) {
            // Fallback sur le container de profil si pro-page-container n'existe pas
            proContainer = document.querySelector(".profile-container");
        }
        if (!proContainer) return;

        // Persister dans l'URL
        this.syncUrl({ pro: slug, explorer: null });

        if (window.navigateTo) {
            // Désactivé temporairement pour debugging
            console.log("Navigation vers pro-page sautée");
            // const targetPage = document.getElementById("pro-page");
            // if (targetPage) {
            //     window.navigateTo("pro-page");
            // }
        }

        proContainer.innerHTML = `<div style="text-align:center; padding: 100px;"><div class="loading-spinner"></div></div>`;

        try {
            const { data: page, error } = await this.supabase
                .from("professional_pages")
                .select("*")
                .eq("slug", slug)
                .single();

            if (error || !page) throw new Error("Page introuvable");

            const employees = await this.getPageCertifications(page.id);

            // Récupérer les ARCs de l'organisation
            const { data: orgArcs } = await this.supabase
                .from("arcs")
                .select("*")
                .eq("page_id", page.id)
                .order("created_at", { ascending: false });

            const avatar = page.avatar_url || "icons/enterprise.svg";
            const banner = page.banner_url || "";
            const isOwner =
                window.currentUser && page.owner_id === window.currentUser.id;
            const recommendedProfiles =
                await this.getRecommendedProfilesForPage(page, employees);
            const recommendedProfilesHtml = this.renderRecommendedProfiles(
                recommendedProfiles,
                page,
            );
            const officialComparisonHtml = this.renderOfficialComparison(
                page,
                recommendedProfiles,
            );

            proContainer.innerHTML = `
                <div class="profile-hero profile-hero--glam">
                    <div class="profile-banner-frame">
                        ${banner ? `<img src="${banner}" class="profile-banner">` : `<div class="profile-banner profile-banner--empty"></div>`}
                    </div>
                    <div class="profile-hero-grid">
                        <div class="profile-identity-panel">
                            <div class="profile-avatar-wrapper">
                                <img src="${avatar}" class="profile-avatar-img" style="border-radius: 12px; border: 3px solid white;">
                            </div>
                            <div class="profile-name-block">
                                <span class="profile-section-kicker">${page.industry}</span>
                                <h2>${typeof window.wrapUsernameLabel === "function" ? window.wrapUsernameLabel(page.name) : page.name}</h2>
                                <p class="profile-bio">${page.bio || "Page Professionnelle certifiée"}</p>

                                <div class="pro-page-stats" style="display: flex; gap: 20px; margin-top: 15px;">
                                    <div><strong>${employees.length}</strong> <span style="color: var(--text-secondary)">Membres certifiés</span></div>
                                </div>
                            </div>
                        </div>

                        <div class="profile-signal-panel">
                             <span class="profile-section-kicker">Centres d'intérêts</span>
                             <div class="hiring-needs-list" style="margin-top: 10px; display: flex; flex-wrap: wrap; gap: 8px;">
                                ${page.hiring_needs?.map((need) => `<span class="badge" style="background: rgba(var(--primary-rgb), 0.1); color: var(--primary-color); border: 1px solid var(--primary-color);">${need}</span>`).join("") || "Aucun centre d'intérêt"}
                             </div>
                             ${page.website_url ? `<a href="${page.website_url}" target="_blank" class="btn btn-primary" style="margin-top: 15px; width: 100%; text-decoration: none; justify-content: center;">Visiter le site officiel</a>` : ""}
                             ${
                                 isOwner
                                     ? `
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px;">
                                    <button class="btn btn-secondary" onclick="window.professionalManager.openTeamManagement('${page.id}')" style="justify-content: center; padding: 10px;">Gérer l'équipe</button>
                                    <button class="btn btn-secondary" onclick="window.professionalManager.openPageSettings('${page.id}')" style="justify-content: center; padding: 10px;">Réglages Page</button>
                                </div>
                             `
                                     : ""
                             }
                        </div>
                    </div>
                </div>

                <div class="pro-page-content" style="margin-top: 30px; display: grid; grid-template-columns: 1fr 320px; gap: 30px;">
                    <div class="pro-page-main">
                        ${
                            isOwner
                                ? `
                            <div class="pro-creation-bar">
                                <div class="pro-creation-trigger">
                                    <img src="${avatar}" alt="Logo">
                                    <button onclick="window.professionalManager.openProfessionalCreateMenu('${page.id}', 'news')">Commencer une actualité officielle...</button>
                                </div>
                                <div class="pro-creation-actions">
                                    <div class="pro-action-item news" onclick="window.professionalManager.openProfessionalCreateMenu('${page.id}', 'news')">
                                        <i class="fas fa-newspaper"></i>
                                        <span>Actualité</span>
                                    </div>
                                    <div class="pro-action-item event" onclick="window.professionalManager.openProfessionalCreateMenu('${page.id}', 'event')">
                                        <i class="fas fa-calendar-alt"></i>
                                        <span>Événement</span>
                                    </div>
                                    <div class="pro-action-item project" onclick="window.professionalManager.openCreateOrgArc('${page.id}')">
                                        <i class="fas fa-project-diagram"></i>
                                        <span>Projet</span>
                                    </div>
                                </div>
                            </div>
                        `
                                : ""
                        }
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                            <h3 class="section-title" style="margin-bottom: 0;">Projets d'Organisation (ARCs)</h3>
                            ${isOwner ? `<button class="btn btn-secondary" onclick="window.professionalManager.openCreateOrgArc('${page.id}')" style="border-radius: 99px; padding: 8px 20px;">+ Nouveau Projet</button>` : ""}
                        </div>

                        <div class="org-arcs-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; margin-bottom: 40px;">
                            ${
                                orgArcs && orgArcs.length > 0
                                    ? orgArcs
                                          .map(
                                              (arc) => `
                                <div class="timeline-card arc-card-pro" onclick="selectArc('${arc.id}', '${page.owner_id}')" style="cursor: pointer; padding: 20px; position: relative; border-left: 5px solid #000;">
                                    <div style="font-size: 0.7rem; text-transform: uppercase; font-weight: 800; color: var(--text-secondary); margin-bottom: 5px;">ARC OFFICIEL</div>
                                    <h4 style="margin: 0 0 10px 0; font-size: 1.2rem;">${arc.title}</h4>
                                    <p style="font-size: 0.9rem; color: var(--text-secondary); line-height: 1.4; margin-bottom: 15px;">${arc.description || "Aucune description."}</p>
                                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem;">
                                        <span class="badge" style="background: #000; color: #fff;">${arc.status === "in_progress" ? "En cours" : "Terminé"}</span>
                                        <span style="font-weight: 600;">Voir la trajectoire →</span>
                                    </div>
                                </div>
                            `,
                                          )
                                          .join("")
                                    : "<p style=\"color: var(--text-secondary); font-style: italic; grid-column: 1/-1; text-align: center; padding: 30px; border: 2px dashed #eee; border-radius: 15px;\">L'organisation n'a pas encore de projet public.</p>"
                            }
                        </div>

                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                            <h3 class="section-title" style="margin-bottom: 0;">Actualités de l'entreprise</h3>
                            ${isOwner ? `<button class="btn btn-primary" onclick="window.professionalManager.openCompanyPostMenu('${page.id}')" style="border-radius: 99px; padding: 8px 20px;">+ Publier une update</button>` : ""}
                        </div>

                        <div id="company-updates-container" style="margin-bottom: 40px;">
                            <div class="loading-spinner"></div>
                        </div>

                        <h3 class="section-title">À propos</h3>
                        <div class="timeline-card" style="margin-bottom: 30px; padding: 20px;">
                            <p style="white-space: pre-wrap; line-height: 1.6; color: var(--text-secondary);">${page.description || "Bienvenue sur notre page professionnelle."}</p>
                        </div>

                        <h3 class="section-title">Équipe Certifiée</h3>
                        <div class="employees-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 15px;">
                            ${
                                employees.length > 0
                                    ? employees
                                          .map(
                                              (emp) => `
                                <div class="timeline-card" style="text-align: center; cursor: pointer; padding: 20px;" onclick="navigateToUserProfile('${emp.user_id}')">
                                    <img src="${emp.user?.avatar || "https://placehold.co/100"}" style="width: 80px; height: 80px; border-radius: 50%; margin-bottom: 12px; object-fit: cover; border: 2px solid var(--border-color);">
                                    <div style="font-weight: 700; margin-bottom: 4px;">${emp.user?.name}</div>
                                    <div style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 600;">${emp.title}</div>
                                    ${emp.department ? `<div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px; opacity: 0.8;">${emp.department}</div>` : ""}
                                </div>
                            `,
                                          )
                                          .join("")
                                    : '<p style="color: var(--text-secondary); font-style: italic;">Aucun membre certifié pour le moment.</p>'
                            }
                        </div>
                    </div>

                        <div class="pro-page-sidebar">
                            ${recommendedProfilesHtml}
                            ${officialComparisonHtml}
                            <h3 class="section-title">Informations</h3>
                            <div class="timeline-card" style="padding: 20px; display: grid; gap: 15px;">
                            <div>
                                <small style="color: var(--text-secondary); text-transform: uppercase; font-weight: 700; font-size: 0.7rem; letter-spacing: 0.5px;">Domaines d'activité</small>
                                <div style="margin-top: 4px; font-weight: 600;">${page.industry}</div>
                            </div>
                            <div>
                                <small style="color: var(--text-secondary); text-transform: uppercase; font-weight: 700; font-size: 0.7rem; letter-spacing: 0.5px;">Créée le</small>
                                <div style="margin-top: 4px; opacity: 0.8;">${new Date(page.created_at).toLocaleDateString()}</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            await this.loadCompanyUpdates(page.id);
        } catch (err) {
            proContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">⚠️</div>
                    <h3>${err.message}</h3>
                    <button class="btn btn-secondary" onclick="navigateTo('discover')" style="margin-top: 20px;">Retour au Discover</button>
                </div>
            `;
        }
    }

    /**
     * Ouvre l'explorateur de talents premium (Standalone Page)
     */
    async openTopTalentExplorer() {
        await this.renderTalentExplorer();
    }

    /**
     * Rendu de la page Talent Explorer (Page à part entière)
     */
    async renderTalentExplorer(query = "") {
        const container = document.querySelector(".pro-page-container");
        if (!container) return;

        // Persister dans l'URL
        this.syncUrl({ explorer: "1", pro: null });

        if (window.navigateTo) window.navigateTo("pro-page");
        container.innerHTML = `<div style="text-align:center; padding: 100px;"><div class="loading-spinner"></div></div>`;

        const user = window.currentUser;
        const isPremium =
            user &&
            (this.isEligibleForProPage(user) ||
                ((user.plan === "pro" ||
                    user.plan === "medium" ||
                    user.plan === "elite") &&
                    user.plan_status === "active"));
        const expiryDate = user?.plan_ends_at
            ? new Date(user.plan_ends_at).toLocaleDateString("fr-FR")
            : "Illimitée";

        container.innerHTML = `
            <div class="talent-explorer-page" style="padding: 20px; max-width: 1200px; margin: 0 auto; animation: fadeIn 0.4s ease-out;">
                <div class="talent-explorer-header" style="margin-bottom: 40px; background: var(--bg-secondary); padding: 40px; border-radius: 32px; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm); position: relative; overflow: hidden;">
                    <div style="position: absolute; top: 0; right: 0; width: 300px; height: 300px; background: radial-gradient(circle, rgba(99, 102, 241, 0.08) 0%, transparent 70%); z-index: 0;"></div>

                    <div style="position: relative; z-index: 1; display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 35px;">
                        <div>
                            <h1 style="font-size: 2.8rem; margin: 0; font-family: var(--font-heading); color: var(--text-primary); letter-spacing: -1px;">XERA Talent Explorer</h1>
                            <p style="color: var(--text-secondary); margin-top: 10px; font-size: 1.15rem; max-width: 600px;">Analysez le Momentum des élites et identifiez les meilleurs profils certifiés pour vos projets.</p>
                        </div>
                        <div style="text-align: right;">
                            <span class="badge ${isPremium ? "badge-premium" : "badge-free"}" style="padding: 10px 20px; border-radius: 99px; font-weight: 800; letter-spacing: 1px; font-size: 0.75rem; background: ${isPremium ? "var(--primary-color)" : "var(--bg-primary)"}; color: ${isPremium ? "#fff" : "var(--text-secondary)"}; border: 1px solid ${isPremium ? "transparent" : "var(--border-color)"};">
                                ${isPremium ? "ACCÈS PREMIUM ACTIF" : "ACCÈS LIMITÉ"}
                            </span>
                            ${isPremium ? `<div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 10px; font-weight: 600;">Abonnement jusqu'au : ${expiryDate}</div>` : ""}
                        </div>
                    </div>

                    <div class="talent-search-box" style="position: relative; z-index: 1; display: flex; gap: 15px; background: var(--bg-primary); padding: 10px; border-radius: 20px; border: 2px solid var(--border-color); box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); transition: all 0.3s ease;">
                        <i class="fas fa-search" style="padding: 15px; color: var(--primary-color); font-size: 1.2rem;"></i>
                        <input type="text" id="talent-search-main" placeholder="Rechercher par nom, compétence (React, IA), domaine ou titre..." style="flex: 1; background: transparent; border: none; color: var(--text-primary); font-size: 1.2rem; outline: none; font-weight: 500;" value="${query}">
                        <button class="btn btn-primary" onclick="window.professionalManager.handleTalentSearch()" style="border-radius: 14px; padding: 0 40px; font-weight: 700; font-size: 1rem;">Rechercher</button>
                    </div>

                    <div class="talent-explorer-tabs" style="position: relative; z-index: 1; display: flex; gap: 40px; margin-top: 30px; border-bottom: 1px solid var(--border-color);">
                        <button class="talent-tab active" onclick="window.professionalManager.switchTalentTab('grid', event)">
                            <i class="fas fa-users" style="margin-right: 8px;"></i> Répertoire des Talents
                        </button>
                        <button class="talent-tab" onclick="window.professionalManager.switchTalentTab('analytics', event)" ${!isPremium ? 'disabled title="Réservé aux membres Premium"' : ""}>
                            <i class="fas fa-chart-line" style="margin-right: 8px;"></i> Analytics Mensuels
                        </button>
                    </div>
                </div>

                <div id="talent-explorer-content">
                    <div id="talent-grid" class="talent-grid-standalone" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 30px;">
                        <!-- Les profils seront injectés ici -->
                    </div>
                </div>
            </div>
        `;

        // Injecter styles pour les tabs si pas déjà présents
        if (!document.getElementById("talent-explorer-styles")) {
            const style = document.createElement("style");
            style.id = "talent-explorer-styles";
            style.textContent = `
                .talent-tab {
                    background: none; border: none; padding: 15px 5px; font-weight: 700; color: var(--text-secondary); cursor: pointer; position: relative; font-size: 1.05rem; transition: all 0.2s;
                }
                .talent-tab:hover:not(:disabled) { color: var(--text-primary); }
                .talent-tab.active { color: var(--primary-color); }
                .talent-tab.active::after { content: ''; position: absolute; bottom: -1px; left: 0; right: 0; height: 3px; background: var(--primary-color); border-radius: 3px 3px 0 0; }
                .talent-tab:disabled { opacity: 0.4; cursor: not-allowed; }
                .talent-card-premium { border: 1px solid var(--border-color); border-radius: 24px; background: var(--bg-secondary); transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
                .talent-card-premium:hover { transform: translateY(-10px); border-color: var(--primary-color) !important; box-shadow: 0 20px 40px -10px rgba(99, 102, 241, 0.2); }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
            `;
            document.head.appendChild(style);
        }

        if (isPremium) {
            await this.loadTalentExplorerData(query);
        } else {
            this.renderTalentPaywall();
        }

        // Focus et event Enter
        setTimeout(() => {
            const input = document.getElementById("talent-search-main");
            if (input) {
                input.onkeypress = (e) => {
                    if (e.key === "Enter") this.handleTalentSearch();
                };
                input.focus();
            }
        }, 100);
    }

    /**
     * Gère la recherche dans le Talent Explorer
     */
    handleTalentSearch() {
        const input = document.getElementById("talent-search-main");
        const query = input ? input.value.trim() : "";
        this.loadTalentExplorerData(query);
    }

    /**
     * Bascule entre l'explorateur et les analytics
     */
    async switchTalentTab(tab, event) {
        const container = document.getElementById("talent-explorer-content");
        if (!container) return;

        const tabs = document.querySelectorAll(".talent-tab");
        tabs.forEach((t) => t.classList.remove("active"));
        if (event) event.target.closest(".talent-tab").classList.add("active");

        if (tab === "grid") {
            container.innerHTML = `<div id="talent-grid" class="talent-grid-standalone" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 30px;"></div>`;
            this.loadTalentExplorerData(
                document.getElementById("talent-search-main")?.value || "",
            );
        } else if (tab === "analytics") {
            this.renderAnalyticsDashboard();
        }
    }

    /**
     * Rendu du dashboard d'analytics pour les membres premium
     */
    renderAnalyticsDashboard() {
        const container = document.getElementById("talent-explorer-content");
        if (!container) return;

        container.innerHTML = `
            <div class="analytics-dashboard" style="animation: fadeIn 0.4s ease-out;">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 25px; margin-bottom: 35px;">
                    <div class="analytics-card" style="background: var(--bg-secondary); padding: 35px; border-radius: 28px; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm); position: relative;">
                        <h4 style="margin: 0; color: var(--text-secondary); text-transform: uppercase; font-size: 0.8rem; letter-spacing: 1.5px; font-weight: 800;">Reach Global Momentum</h4>
                        <div style="font-size: 3.2rem; font-weight: 900; color: var(--primary-color); margin: 20px 0; font-family: var(--font-heading);">1,284,092</div>
                        <div style="display: flex; align-items: center; gap: 8px; color: #22c55e; font-weight: 700; font-size: 1rem;">
                            <i class="fas fa-arrow-up"></i> +12.4% <span style="font-weight: 400; opacity: 0.7;">depuis le mois dernier</span>
                        </div>
                    </div>

                    <div class="analytics-card" style="background: var(--bg-secondary); padding: 35px; border-radius: 28px; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm);">
                        <h4 style="margin: 0; color: var(--text-secondary); text-transform: uppercase; font-size: 0.8rem; letter-spacing: 1.5px; font-weight: 800;">Nouveaux Talents Certifiés</h4>
                        <div style="font-size: 3.2rem; font-weight: 900; color: var(--text-primary); margin: 20px 0; font-family: var(--font-heading);">4,820</div>
                        <div style="display: flex; align-items: center; gap: 8px; color: #22c55e; font-weight: 700; font-size: 1rem;">
                            <i class="fas fa-arrow-up"></i> +8.1% <span style="font-weight: 400; opacity: 0.7;">tendances positives</span>
                        </div>
                    </div>

                    <div class="analytics-card" style="background: var(--bg-secondary); padding: 35px; border-radius: 28px; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm);">
                        <h4 style="margin: 0; color: var(--text-secondary); text-transform: uppercase; font-size: 0.8rem; letter-spacing: 1.5px; font-weight: 800;">Engagement Moyen / Profil</h4>
                        <div style="font-size: 3.2rem; font-weight: 900; color: var(--text-primary); margin: 20px 0; font-family: var(--font-heading);">6.4%</div>
                        <div style="display: flex; align-items: center; gap: 8px; color: #ef4444; font-weight: 700; font-size: 1rem;">
                            <i class="fas fa-arrow-down"></i> -0.2% <span style="font-weight: 400; opacity: 0.7;">stabilité de l'audience</span>
                        </div>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1.8fr 1.2fr; gap: 30px;">
                    <div style="background: var(--bg-secondary); padding: 35px; border-radius: 32px; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm);">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px;">
                            <h3 style="margin: 0; font-size: 1.4rem;">Tendances des Compétences (30j)</h3>
                            <div style="display: flex; gap: 10px;">
                                <span style="width: 12px; height: 12px; border-radius: 3px; background: var(--primary-color);"></span>
                                <span style="font-size: 0.75rem; color: var(--text-secondary);">Activité croissante</span>
                            </div>
                        </div>
                        <div style="height: 320px; display: flex; align-items: flex-end; gap: 20px; padding-bottom: 30px; border-bottom: 2px dashed var(--border-color);">
                            ${[65, 85, 45, 95, 75, 55, 80]
                                .map(
                                    (h, i) => `
                                <div style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 15px; position: relative;" title="${["React", "AI", "Web3", "Design", "BTP", "Fintech", "HR"][i]}: ${h}% match">
                                    <div style="width: 100%; height: ${h * 2.5}px; background: ${i === 3 ? "var(--primary-color)" : "rgba(99, 102, 241, 0.2)"}; border-radius: 12px 12px 4px 4px; transition: all 1s cubic-bezier(0.175, 0.885, 0.32, 1.275); position: relative;">
                                        <span style="position: absolute; top: -25px; width: 100%; text-align: center; font-size: 0.8rem; font-weight: 800; color: ${i === 3 ? "var(--primary-color)" : "var(--text-secondary)"};">${h}%</span>
                                    </div>
                                    <span style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 700; transform: rotate(-45deg); white-space: nowrap; margin-top: 15px;">${["React", "AI", "Web3", "Design", "BTP", "Fintech", "HR"][i]}</span>
                                </div>
                            `,
                                )
                                .join("")}
                        </div>
                    </div>

                    <div style="background: var(--bg-secondary); padding: 35px; border-radius: 32px; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm);">
                        <h3 style="margin-top: 0; margin-bottom: 30px; font-size: 1.4rem;">Top Localisations Elite</h3>
                        <div style="display: grid; gap: 25px;">
                            ${[
                                {
                                    city: "Paris / Station F",
                                    val: 34,
                                    color: "var(--primary-color)",
                                },
                                {
                                    city: "Silicon Valley",
                                    val: 28,
                                    color: "#6366f1",
                                },
                                {
                                    city: "London Hub",
                                    val: 18,
                                    color: "#818cf8",
                                },
                                {
                                    city: "Berlin / Europe",
                                    val: 12,
                                    color: "#a5b4fc",
                                },
                                {
                                    city: "Global Remote",
                                    val: 8,
                                    color: "#c7d2fe",
                                },
                            ]
                                .map(
                                    (loc) => `
                                <div>
                                    <div style="display: flex; justify-content: space-between; font-size: 0.95rem; margin-bottom: 8px;">
                                        <span style="font-weight: 700;">${loc.city}</span>
                                        <span style="color: var(--text-primary); font-weight: 800;">${loc.val}%</span>
                                    </div>
                                    <div style="width: 100%; height: 8px; background: var(--bg-primary); border-radius: 10px; overflow: hidden;">
                                        <div style="width: ${loc.val}%; height: 100%; background: ${loc.color}; border-radius: 10px; transition: width 1.5s ease-in-out;"></div>
                                    </div>
                                </div>
                            `,
                                )
                                .join("")}
                        </div>
                        <div style="margin-top: 40px; padding: 20px; background: var(--bg-primary); border-radius: 16px; border: 1px solid var(--border-color);">
                            <p style="margin: 0; font-size: 0.85rem; color: var(--text-secondary); line-height: 1.5;">
                                <i class="fas fa-info-circle" style="margin-right: 8px; color: var(--primary-color);"></i>
                                Ces données reflètent les trajectoires de croissance (ARCs) validées officiellement sur le réseau XERA au cours des 30 derniers jours.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Rendu du Paywall pour l'accès premium
     */
    renderTalentPaywall() {
        const grid = document.getElementById("talent-grid");
        if (!grid) return;

        grid.innerHTML = `
            <div style="grid-column: 1/-1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 80px 40px; text-align: center; background: linear-gradient(180deg, transparent, rgba(99, 102, 241, 0.05)); border-radius: 40px; border: 1px solid var(--border-color); margin-top: 20px; position: relative; overflow: hidden;">
                <div style="position: absolute; inset: 0; background: url('icons/grid-pattern.svg'); opacity: 0.05; z-index: 0;"></div>

                <div style="position: relative; z-index: 1;">
                    <div style="width: 100px; height: 100px; background: rgba(99, 102, 241, 0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 2.5rem; margin: 0 auto 30px; border: 1px solid rgba(99, 102, 241, 0.2); box-shadow: 0 10px 20px rgba(99,102,241,0.1);">🔒</div>
                    <h2 style="font-size: 2.5rem; margin-bottom: 20px; font-family: var(--font-heading); color: var(--text-primary);">Débloquez l'Explorateur de Talents Elite</h2>
                    <p style="max-width: 650px; color: var(--text-secondary); margin: 0 auto 45px; line-height: 1.7; font-size: 1.2rem;">
                        Accédez à la base de données certifiée de XERA, filtrez les profils par Momentum, et visualisez les analytics exclusifs pour vos recrutements et partenariats stratégiques.
                    </p>

                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 25px; width: 100%; max-width: 800px; margin: 0 auto 50px;">
                        <div style="background: var(--bg-secondary); padding: 40px 30px; border-radius: 32px; border: 1px solid var(--border-color); cursor: pointer; transition: transform 0.2s;" onclick="window.location.href='subscription-plans.html'">
                            <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 15px; text-transform: uppercase; font-weight: 800; letter-spacing: 1px;">Abonnement Mensuel</div>
                            <div style="font-size: 2.5rem; font-weight: 900; color: var(--text-primary);">40 USD<span style="font-size: 1rem; opacity: 0.5; font-weight: 400;">/mois</span></div>
                            <p style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 15px;">Accès complet, sans engagement.</p>
                        </div>
                        <div style="background: var(--bg-secondary); padding: 40px 30px; border-radius: 32px; border: 2px solid var(--primary-color); cursor: pointer; position: relative; transition: transform 0.2s; box-shadow: 0 15px 30px -10px rgba(99, 102, 241, 0.3);" onclick="window.location.href='subscription-plans.html'">
                            <span style="position: absolute; top: -15px; right: 30px; background: #22c55e; color: #fff; padding: 6px 18px; border-radius: 99px; font-size: 0.75rem; font-weight: 900; box-shadow: 0 5px 15px rgba(34, 197, 94, 0.4);">OFFRE ANNUELLE -20%</span>
                            <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 15px; text-transform: uppercase; font-weight: 800; letter-spacing: 1px;">Abonnement Annuel</div>
                            <div style="font-size: 2.5rem; font-weight: 900; color: var(--primary-color);">384 USD<span style="font-size: 1rem; opacity: 0.5; font-weight: 400; color: var(--text-secondary);">/an</span></div>
                            <p style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 15px;">La puissance XERA au meilleur prix.</p>
                        </div>
                    </div>

                    <button class="btn btn-primary" onclick="window.location.href='subscription-plans.html'" style="padding: 22px 80px; font-size: 1.3rem; font-weight: 900; border-radius: 20px; box-shadow: 0 15px 35px rgba(99, 102, 241, 0.5); text-transform: uppercase; letter-spacing: 1px;">
                        DEVENIR MEMBRE PREMIUM
                    </button>
                </div>
            </div>

            <!-- Mock Grid floutée -->
            <div style="grid-column: 1/-1; margin-top: 70px; filter: blur(12px); opacity: 0.15; pointer-events: none; display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 30px;">
                ${this.renderMockTalentGrid(true)}
            </div>
        `;
    }

    /**
     * Charge les vrais talents pour les utilisateurs premium
     * Trié par MOMENTUM (Progression) via la vue momentum_discovery_feed
     */
    async loadTalentExplorerData(query = "") {
        const grid = document.getElementById("talent-grid");
        if (!grid) return;

        grid.innerHTML =
            '<div style="grid-column: 1/-1; text-align: center; padding: 100px; min-height: 400px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px;"><div class="loading-spinner"></div><p style="color: var(--text-secondary); font-weight: 600;">Le Momentum Engine analyse les trajectoires en temps réel...</p></div>';

        try {
            // Utilisation de la vue momentum_discovery_feed du Momentum Engine
            let supabaseQuery = this.supabase
                .from("momentum_discovery_feed")
                .select(
                    "id, name, avatar, title, bio, account_subtype, badge, momentum_score",
                );

            if (query) {
                supabaseQuery = supabaseQuery.or(
                    `name.ilike.%${query}%,title.ilike.%${query}%,bio.ilike.%${query}%,account_subtype.ilike.%${query}%`,
                );
            }

            // Tri par le score de momentum calculé en temps réel
            supabaseQuery = supabaseQuery
                .order("momentum_score", { ascending: false })
                .limit(48);

            const { data: users, error } = await supabaseQuery;

            if (error) throw error;

            if (users.length === 0) {
                grid.innerHTML = `
                    <div style="grid-column: 1/-1; text-align: center; padding: 100px; background: var(--bg-secondary); border-radius: 32px; border: 2px dashed var(--border-color);">
                        <div style="font-size: 3rem; margin-bottom: 20px;">🔍</div>
                        <h3>Aucun talent ne correspond à "${this.escapeHtml(query)}"</h3>
                        <p style="color: var(--text-secondary);">Essayez d'utiliser des termes plus génériques comme "React", "Design" ou "AI".</p>
                        <button class="btn btn-secondary" style="margin-top: 20px;" onclick="document.getElementById('talent-search-main').value=''; window.professionalManager.handleTalentSearch()">Effacer la recherche</button>
                    </div>
                `;
                return;
            }

            grid.innerHTML = users
                .map((user) => {
                    const name = this.escapeHtml(user.name || "Talent Anonyme");
                    const title = this.escapeHtml(
                        user.title || user.account_subtype || "Membre Certifié",
                    );
                    const avatar = this.escapeHtml(
                        user.avatar || "https://placehold.co/120",
                    );
                    const score = user.momentum_score || 0;

                    return `
                    <div class="talent-card-premium" style="padding: 35px 25px; display: flex; flex-direction: column; align-items: center; text-align: center; cursor: pointer;" onclick="navigateToUserProfile('${user.id}')">
                        <div style="position: relative; margin-bottom: 20px;">
                            <div style="width: 110px; height: 110px; border-radius: 50%; padding: 5px; background: linear-gradient(135deg, var(--primary-color), #818cf8); margin-bottom: 5px;">
                                <img src="${avatar}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; border: 4px solid var(--bg-secondary);">
                            </div>
                            ${
                                user.badge
                                    ? `
                                <div style="position: absolute; bottom: 8px; right: 8px; background: #000; color: #fff; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; border: 3px solid var(--bg-secondary); box-shadow: 0 4px 10px rgba(0,0,0,0.3);" title="Profil Certifié Official">
                                    <i class="fas fa-check"></i>
                                </div>
                            `
                                    : ""
                            }
                        </div>
                        <h4 style="margin: 0 0 8px 0; font-size: 1.25rem; font-weight: 800; color: var(--text-primary);">${name}</h4>
                        <div style="font-size: 0.9rem; color: var(--primary-color); font-weight: 700; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 0.5px;">${title}</div>
                        <p style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.6; margin-bottom: 20px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; height: 3.8rem; font-style: italic;">
                            "${user.bio || "Ce talent développe actuellement son Momentum sur XERA via des trajectoires certifiées."}"
                        </p>
                        <div style="width: 100%; height: 1px; background: linear-gradient(to right, transparent, var(--border-color), transparent); margin-bottom: 20px;"></div>
                        <div style="display: flex; flex-direction: column; gap: 5px; width: 100%;">
                            <div style="font-size: 0.8rem; color: var(--text-secondary);">Score de Progression</div>
                            <div style="font-weight: 800; font-size: 1.2rem; color: var(--primary-color);">${score} <span style="font-weight: 400; font-size: 0.75rem; color: var(--text-secondary);">pts Momentum</span></div>
                        </div>
                    </div>
                `;
                })
                .join("");
        } catch (err) {
            console.error(err);
            grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 100px; color: #ef4444; background: rgba(239, 68, 68, 0.05); border-radius: 20px;">Erreur lors du chargement des profils via le Momentum Engine.</div>`;
        }
    }

    /**
     * Rendu des placeholders floutés pour l'état non-premium
     */
    renderMockTalentGrid(returnHtml = false) {
        const html = Array(12)
            .fill(0)
            .map(
                () => `
            <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 24px; padding: 35px 25px; display: flex; flex-direction: column; align-items: center; text-align: center;">
                <div style="width: 100px; height: 100px; background: rgba(255,255,255,0.05); border-radius: 50%; margin-bottom: 20px;"></div>
                <div style="height: 1.5rem; width: 70%; background: rgba(255,255,255,0.05); border-radius: 6px; margin-bottom: 10px;"></div>
                <div style="height: 1rem; width: 40%; background: rgba(255,255,255,0.03); border-radius: 6px; margin-bottom: 20px;"></div>
                <div style="height: 4rem; width: 100%; background: rgba(255,255,255,0.02); border-radius: 12px;"></div>
            </div>
        `,
            )
            .join("");

        if (returnHtml) return html;

        const grid = document.getElementById("talent-grid");
        if (grid) grid.innerHTML = html;
    }

    /**
     * Gère la mise à jour depuis le formulaire des réglages
     */
    async handleUpdatePageFromSettings(pageId, form) {
        const btn = form.querySelector('button[type="submit"]');
        const originalText = btn.innerText;
        btn.innerText = "Enregistrement...";
        btn.disabled = true;

        try {
            const formData = new FormData(form);
            const updates = {
                name: formData.get("name"),
                websiteUrl: formData.get("website_url"),
                hiringNeeds: formData
                    .get("hiring_needs")
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                bio: formData.get("bio"),
                description: formData.get("description"),
                industry: formData.get("industry"),
            };

            await this.updatePage(pageId, updates);
            window.showToast?.("Page mise à jour avec succès !");

            if (window.openSettings) window.openSettings(window.currentUserId);
        } catch (err) {
            console.error(err);
            alert("Erreur lors de la mise à jour: " + err.message);
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    }
}

/**
 * Classe Onboarding Interactif pour Page Pro
 */
class XERAProfessionalOnboarding {
    constructor(manager) {
        this.manager = manager;
        this.currentStep = 0;
        this.data = {
            name: "",
            industries: [],
            description: "",
            avatarUrl: "",
            bannerUrl: "",
            hiringNeeds: [],
            websiteUrl: "",
        };
        this.overlay = null;
        this.tooltip = null;
        this.industriesList = [
            "Agriculture, Pêche et Environnement",
            "Artisanat et Métiers d'Art",
            "Automobile, Aéronautique, Spatial et Naval",
            "Administration Publique, Secteur Public et Diplomatie",
            "Armée, Défense et Sécurité Nationale",
            "Banque, Finance et Assurance",
            "Chimie, Pharmacie et Biotechnologies",
            "Commerce, Vente et Marketing",
            "Communication, Médias et Audiovisuel",
            "Conseil, Audit et Stratégie (Consulting)",
            "Construction, BTP et Architecture",
            "Culture, Spectacle et Loisirs",
            "Droit, Justice et Sécurité Civil",
            "Éducation, Formation et Recherche",
            "Énergie, Eau et Services Publics (Utilities)",
            "Hôtellerie, Restauration et Tourisme",
            "Humanitaire, ONG et Économie Sociale",
            "Immobilier (Real Estate)",
            "Industrie, Production et Ingénierie",
            "Informatique, Tech et Télécoms",
            "Logistique, Transport et Supply Chain",
            "Luxe et Mode",
            "Ressources Humaines (RH) et Recrutement",
            "Santé, Social et Services à la personne",
            "Sciences, Recherche et Développement",
            "Sport et Bien-être",
        ];
    }

    start() {
        this.currentStep = 0;
        this.createUI();
        this.showStep();
    }

    createUI() {
        if (this.overlay) return;
        this.overlay = document.createElement("div");
        this.overlay.className = "tutorial-overlay-premium";
        this.overlay.style.zIndex = "10000";
        document.body.appendChild(this.overlay);

        this.tooltip = document.createElement("div");
        this.tooltip.className =
            "tutorial-tooltip-premium tutorial-v2 onboarding-xxl";
        this.tooltip.style.zIndex = "10001";
        this.tooltip.style.top = "50%";
        this.tooltip.style.left = "50%";
        this.tooltip.style.transform = "translate(-50%, -50%)";
        this.tooltip.style.position = "fixed";
        document.body.appendChild(this.tooltip);
    }

    showStep() {
        const steps = [
            {
                title: "Nom de votre Page",
                desc: "Choisissez un nom qui représente votre marque ou organisation. C'est l'identité de votre entité.",
                content: `<div class="onboarding-step-content"><input type="text" id="onboarding-name" class="form-input" placeholder="Ex: XERA Corp" value="${this.data.name}"></div>`,
            },
            {
                title: "Secteurs d'activité (Max 4)",
                desc: "Précisez vos domaines. Choisissez jusqu'à 4 secteurs. Cela permet au Momentum Engine de cibler vos intérêts.",
                content: `
                    <div class="onboarding-step-content">
                        <div class="industry-search-container" style="position: relative;">
                            <input type="text" id="onboarding-industry-search" class="form-input" placeholder="Rechercher un secteur..." autocomplete="off">
                            <div id="onboarding-industry-results" style="display: none; position: absolute; top: 100%; left: 0; right: 0; z-index: 100; max-height: 200px; overflow-y: auto;">
                                ${this.industriesList.map((ind) => `<div class="industry-option" style="padding: 10px; cursor: pointer;">${ind}</div>`).join("")}
                            </div>
                        </div>
                        <div id="selected-industries-list" class="selected-industries-chips">
                            ${this.data.industries
                                .map(
                                    (ind, idx) => `
                                <div class="industry-chip">
                                    ${ind}
                                    <span class="remove-industry" data-index="${idx}">×</span>
                                </div>
                            `,
                                )
                                .join("")}
                        </div>
                    </div>
                `,
            },
            {
                title: "Mission & Description",
                desc: "Racontez votre histoire. Une description solide (min 20 car.) donne de la crédibilité à votre organisation.",
                content: `<div class="onboarding-step-content"><textarea id="onboarding-desc" class="form-input" placeholder="Détaillez vos missions, valeurs et projets..." style="min-height: 140px;">${this.data.description}</textarea></div>`,
            },
            {
                title: "Logo Officiel",
                desc: "Téléchargez votre logo. C'est l'icône qui s'affichera partout sur XERA pour identifier votre boîte.",
                content: `
                    <div class="onboarding-step-content" style="text-align: center; padding: 20px;">
                        <label for="onboarding-avatar-file" class="custom-file-upload" style="display: block; margin-bottom: 10px; border: 3px dashed #000; padding: 30px; border-radius: 12px; background: #f9f9f9; color: #000; cursor: pointer;">
                            ${this.data.avatarUrl ? `<img src="${this.data.avatarUrl}" style="width: 100px; height: 100px; border-radius: 12px; object-fit: cover;">` : "Uploader votre LOGO (Requis)"}
                        </label>
                        <input type="file" id="onboarding-avatar-file" accept="image/*" style="display:none">
                        <div id="avatar-upload-status" style="font-size: 0.9rem; color: #000; font-weight: 700; margin-top: 10px;"></div>
                    </div>
                `,
            },
            {
                title: "Bannière (Optionnelle)",
                desc: "Habillez votre profil avec une image de couverture. Vous pouvez passer cette étape.",
                content: `
                    <div class="onboarding-step-content" style="text-align: center; padding: 20px;">
                        <label for="onboarding-banner-file" class="custom-file-upload" style="display: block; margin-bottom: 10px; border: 3px dashed #000; padding: 30px; border-radius: 12px; background: #f9f9f9; color: #000; cursor: pointer;">
                             ${this.data.bannerUrl ? `<img src="${this.data.bannerUrl}" style="width: 100%; height: 80px; border-radius: 8px; object-fit: cover;">` : "Uploader une BANNIÈRE (Optionnelle)"}
                        </label>
                        <input type="file" id="onboarding-banner-file" accept="image/*" style="display:none">
                        <div id="banner-upload-status" style="font-size: 0.9rem; color: #000; font-weight: 700; margin-top: 10px;"></div>
                    </div>
                `,
            },
            {
                title: "Centres d'intérêts",
                desc: "Dites-nous ce qui vous intéresse (compétences, techno, domaines). Le Momentum Engine personnalisera votre feed.",
                content: `<div class="onboarding-step-content"><input type="text" id="onboarding-interests" class="form-input" placeholder="Ex: React, Intelligence Artificielle, BTP..." value="${this.data.hiringNeeds.join(", ")}"></div>`,
            },
            {
                title: "Lien Officiel",
                desc: "Ajoutez le site web ou un lien social principal. C'est essentiel pour rediriger votre audience.",
                content: `<div class="onboarding-step-content"><input type="url" id="onboarding-website" class="form-input" placeholder="https://votreorganisation.com" value="${this.data.websiteUrl || ""}"></div>`,
            },
        ];

        const step = steps[this.currentStep];
        const isLast = this.currentStep === steps.length - 1;

        this.tooltip.innerHTML = `
            <div class="tutorial-premium-content">
                <div class="tutorial-premium-header">
                    <div class="tutorial-premium-step-counter">${this.currentStep + 1}<span>/</span>${steps.length}</div>
                    <button class="btn-tutorial-skip-premium" id="onboarding-cancel">Annuler</button>
                </div>
                <h3 style="margin: 0.5rem 0 1rem; font-size: 1.5rem;">${step.title}</h3>
                <div class="tutorial-text-body" style="margin-bottom: 20px; font-size: 1rem; line-height: 1.4;">${step.desc}</div>
                <div class="onboarding-step-container" style="margin-bottom: 30px;">
                    ${step.content}
                </div>
                <div class="tutorial-premium-actions" style="display: flex; gap: 15px; justify-content: flex-end;">
                    ${this.currentStep > 0 ? `<button class="btn-tutorial-skip-premium" id="onboarding-prev" style="margin-right: auto;">Retour</button>` : ""}
                    <button class="btn-tutorial-next-premium" id="onboarding-next">${isLast ? "Activer le Protocole ✨" : "Continuer"}</button>
                </div>
            </div>
        `;

        this.attachEvents();
    }

    attachEvents() {
        document.getElementById("onboarding-cancel").onclick = () =>
            this.destroy();
        const prevBtn = document.getElementById("onboarding-prev");
        if (prevBtn)
            prevBtn.onclick = () => {
                this.saveCurrentStepData();
                this.currentStep--;
                this.showStep();
            };

        const nextBtn = document.getElementById("onboarding-next");
        nextBtn.onclick = async () => {
            try {
                const ok = await this.validateCurrentStep();
                if (!ok) return;
                this.saveCurrentStepData();
                if (this.currentStep < 6) {
                    this.currentStep++;
                    this.showStep();
                } else {
                    await this.finish();
                }
            } catch (err) {
                console.error("Onboarding next error:", err);
                try {
                    alert(
                        `Erreur lors de l'étape d'onboarding: ${err?.message || err}`,
                    );
                } catch (e) {
                    // ignore alert errors
                }
            }
        };

        if (this.currentStep === 1) {
            const searchInput = document.getElementById(
                "onboarding-industry-search",
            );
            const resultsDiv = document.getElementById(
                "onboarding-industry-results",
            );
            const chipsContainer = document.getElementById(
                "selected-industries-list",
            );

            searchInput.onfocus = () => {
                resultsDiv.style.display = "block";
            };
            searchInput.oninput = (e) => {
                const val = e.target.value.toLowerCase();
                const options = resultsDiv.querySelectorAll(".industry-option");
                options.forEach((opt) => {
                    const text = opt.innerText.toLowerCase();
                    opt.style.display = text.includes(val) ? "block" : "none";
                });
            };

            resultsDiv.onclick = (e) => {
                if (e.target.classList.contains("industry-option")) {
                    const selected = e.target.innerText;
                    if (this.data.industries.length >= 4) {
                        alert("Maximum 4 secteurs autorisés.");
                        return;
                    }
                    if (!this.data.industries.includes(selected)) {
                        this.data.industries.push(selected);
                        this.renderIndustryChips();
                    }
                    searchInput.value = "";
                    resultsDiv.style.display = "none";
                }
            };

            chipsContainer.onclick = (e) => {
                if (e.target.classList.contains("remove-industry")) {
                    const idx = parseInt(e.target.dataset.index);
                    this.data.industries.splice(idx, 1);
                    this.renderIndustryChips();
                }
            };
        }

        if (this.currentStep === 3) {
            const fileInput = document.getElementById("onboarding-avatar-file");
            fileInput.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const status = document.getElementById("avatar-upload-status");
                status.innerHTML = `<div class="loading-spinner" style="width:20px;height:20px;"></div> Uploading...`;
                const res = await window.uploadFile(file, "pro-pages/avatars");
                if (res.success) {
                    this.data.avatarUrl = res.url;
                    this.showStep();
                } else {
                    alert("Upload failed: " + res.error);
                    status.innerText = "";
                }
            };
        }

        if (this.currentStep === 4) {
            const fileInput = document.getElementById("onboarding-banner-file");
            fileInput.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const status = document.getElementById("banner-upload-status");
                status.innerHTML = `<div class="loading-spinner" style="width:20px;height:20px;"></div> Uploading...`;
                const res = await window.uploadFile(file, "pro-pages/banners");
                if (res.success) {
                    this.data.bannerUrl = res.url;
                    this.showStep();
                } else {
                    alert("Upload failed: " + res.error);
                    status.innerText = "";
                }
            };
        }
    }

    async validateCurrentStep() {
        switch (this.currentStep) {
            case 0:
                const pageName = document
                    .getElementById("onboarding-name")
                    .value.trim();
                if (!pageName) {
                    alert("Nom obligatoire.");
                    return false;
                }
                try {
                    const isAvailable =
                        await this.manager.isPageNameAvailable(pageName);
                    if (!isAvailable) {
                        alert(
                            "Ce nom de Page Pro est déjà utilisé. Choisissez un autre nom.",
                        );
                        return false;
                    }
                } catch (error) {
                    console.error(
                        "Vérification du nom de Page Pro impossible:",
                        error,
                    );
                    alert(
                        "Impossible de vérifier l'unicité du nom pour le moment.",
                    );
                    return false;
                }
                return true;
            case 1:
                if (this.data.industries.length === 0) {
                    alert("Choisissez au moins 1 secteur.");
                    return false;
                }
                return true;
            case 2:
                if (
                    document.getElementById("onboarding-desc").value.trim()
                        .length < 20
                ) {
                    alert("Description trop courte (min 20 car.).");
                    return false;
                }
                return true;
            case 3:
                if (!this.data.avatarUrl) {
                    alert("Logo requis.");
                    return false;
                }
                return true;
            case 5:
                if (
                    !document
                        .getElementById("onboarding-interests")
                        .value.trim()
                ) {
                    alert("Centres d'intérêts requis.");
                    return false;
                }
                return true;
            case 6:
                if (
                    !document.getElementById("onboarding-website").value.trim()
                ) {
                    alert("Lien officiel requis.");
                    return false;
                }
                return true;
        }
        return true;
    }

    renderIndustryChips() {
        const container = document.getElementById("selected-industries-list");
        if (!container) return;
        container.innerHTML = this.data.industries
            .map(
                (ind, idx) => `
            <div class="industry-chip">
                ${ind}
                <span class="remove-industry" data-index="${idx}">×</span>
            </div>
        `,
            )
            .join("");
    }

    saveCurrentStepData() {
        switch (this.currentStep) {
            case 0:
                this.data.name = document
                    .getElementById("onboarding-name")
                    .value.trim();
                break;
            case 2:
                this.data.description =
                    document.getElementById("onboarding-desc").value;
                break;
            case 5:
                const interests = document.getElementById(
                    "onboarding-interests",
                ).value;
                this.data.hiringNeeds = interests
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean);
                break;
            case 6:
                this.data.websiteUrl =
                    document.getElementById("onboarding-website").value;
                break;
        }
    }

    async finish() {
        const nextBtn = document.getElementById("onboarding-next");
        nextBtn.innerText = "Initialisation...";
        nextBtn.disabled = true;

        try {
            const finalData = {
                ...this.data,
                industry: this.data.industries.join(", "),
            };
            const newPage = await this.manager.createPage(finalData);
            window.showToast?.("Page Pro déployée avec succès !");
            this.manager.myPageSlug = newPage.slug;
            this.destroy();
            await this.manager.initNavigation();
            this.manager.renderProPage(newPage.slug);
        } catch (err) {
            console.error(err);
            alert("Erreur: " + err.message);
            nextBtn.innerText = "Lancer ma page ✨";
            nextBtn.disabled = false;
        }
    }

    destroy() {
        if (this.overlay) this.overlay.remove();
        if (this.tooltip) this.tooltip.remove();
        this.overlay = null;
        this.tooltip = null;
    }
}

// Export pour usage global avec initialisation automatique
if (typeof window !== "undefined") {
    const initManager = () => {
        const client =
            window.supabaseClient ||
            window.supabase ||
            (typeof supabase !== "undefined" ? supabase : null);
        if (client) {
            window.professionalManager = new XERAProfessionalManager(client);
            window.professionalManager.initNavigation().catch(console.warn);
            console.log("XERA Professional Manager initialized.");
        } else {
            setTimeout(initManager, 100);
        }
    };
    initManager();
}
