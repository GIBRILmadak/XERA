/**
 * XERA RECOMMENDATION ENGINE - Proof of Building
 *
 * Algorithme de recommandation sophistiqué (niveau TikTok/YouTube/Instagram)
 * Objectif: Retenir les utilisateurs avec le meilleur contenu
 *
 * Signaux collectés:
 * - Engagement (views, interactions)
 * - Qualité créateur (followers, badge, monetization)
 * - Fraîcheur du contenu
 * - Affinité utilisateur
 * - Diversité du feed
 */

/**
 * Calcule un score composite pour chaque créateur
 * Score = (engagement_score * 0.4) + (creator_quality * 0.35) + (freshness_score * 0.25)
 */
function calculateEngagementScore(userStats) {
    if (!userStats) return 0;

    const {
        viewCount = 0,
        videoCount = 1,
        supportCount = 0,
        monthlyViewsAvg = 0,
    } = userStats;

    // Évite division par zéro
    const avgViewsPerVideo = videoCount > 0 ? viewCount / videoCount : 0;

    // Score d'engagement normalisé (0-100)
    // Views per video weighted + monthly trend
    const engagementScore =
        Math.min(avgViewsPerVideo / 100, 1) * 60 +
        Math.min(monthlyViewsAvg / 1000, 1) * 40;

    // Bonus pour support/tipping (signal fort d'engagement)
    const supportBonus = Math.min(supportCount * 5, 20);

    return Math.min(engagementScore + supportBonus, 100);
}

/**
 * Évalue la qualité et crédibilité du créateur
 */
function calculateCreatorQuality(user) {
    if (!user) return 0;

    const {
        followers_count = 0,
        badge = null,
        is_monetized = false,
        plan = "free",
        monthly_revenue = 0,
    } = user;

    let qualityScore = 0;

    // Followers (0-40 points)
    const followerScore = Math.min((followers_count / 1000) * 40, 40);
    qualityScore += followerScore;

    // Badge = signal de vérification/crédibilité (0-20 points)
    if (badge === "verified_gold") {
        qualityScore += 20;
    } else if (badge === "verified") {
        qualityScore += 15;
    } else if (badge === "staff") {
        qualityScore += 25;
    }

    // Monetization status (0-20 points)
    if (is_monetized) {
        qualityScore += 15;
    }

    // Plan tier (0-10 points)
    if (plan === "pro") {
        qualityScore += 10;
    } else if (plan === "medium") {
        qualityScore += 5;
    }

    // Revenue consistency (0-5 points)
    if (monthly_revenue > 0) {
        qualityScore += Math.min((monthly_revenue / 1000) * 5, 5);
    }

    return Math.min(qualityScore, 100);
}

/**
 * Calcule la fraîcheur du contenu
 * Récent = meilleur (algoritmo TikTok-style)
 */
function calculateFreshnessScore(user) {
    if (!user || !user.updated_at) return 0;

    const now = new Date();
    const lastUpdated = new Date(user.updated_at);
    const hoursSinceUpdate = (now - lastUpdated) / (1000 * 60 * 60);

    // Decay exponentiel: très récent = 100, ancien = décroissant
    const freshnessScore = Math.max(0, 100 * Math.exp(-hoursSinceUpdate / 48));

    return freshnessScore;
}

/**
 * Bonus de momentum: créateurs consistes et actifs
 * Calcule basé sur frequency, intensity et consistency
 */
function calculateMomentumBonus(user) {
    if (!user || !user.momentum_score) return 0;

    const { momentum_score = 0, active_days = 0, consistency_ratio = 0 } = user;

    // Normalise momentum_score (peut être très élevé)
    const normalizedMomentum = Math.min((momentum_score / 1000) * 15, 15);

    // Bonus de consistency
    const consistencyBonus = consistency_ratio * 10;

    // Bonus de streak
    const streakBonus = Math.min(active_days / 7, 5);

    return normalizedMomentum + consistencyBonus + streakBonus;
}

/**
 * Calcule le score de diversité
 * Évite trop de créateurs similaires dans le feed
 */
function calculateDiversityPenalty(user, previouslyShownUsers = []) {
    let penalty = 0;

    // Pénalité si créateur déjà dans les résultats
    const duplicateCount = previouslyShownUsers.filter(
        (u) => u.id === user.id,
    ).length;
    if (duplicateCount > 0) {
        penalty += 50; // Grosse pénalité pour duplication
    }

    // Pénalité pour types similaires (account_type, plan tier, etc.)
    const similarCount = previouslyShownUsers.filter((u) => {
        const typeSimilar = u.account_type === user.account_type;
        const planSimilar = u.plan === user.plan;
        return typeSimilar && planSimilar;
    }).length;

    penalty += Math.min(similarCount * 3, 15);

    return penalty;
}

/**
 * Score de rétention utilisateur
 * Priorise les créateurs qui retiennent les viewers
 */
function calculateRetentionScore(userStats) {
    if (!userStats) return 0;

    const {
        return_visitor_rate = 0,
        avg_watch_time = 0,
        repeat_viewer_count = 0,
        total_viewers = 1,
    } = userStats;

    // Taux de visiteurs récurrents
    const retentionScore =
        return_visitor_rate * 40 +
        Math.min((avg_watch_time / 300) * 30, 30) + // 5 min = max
        Math.min((repeat_viewer_count / total_viewers) * 30, 30);

    return Math.min(retentionScore, 100);
}

/**
 * Score de viralité potentielle
 * Basé sur growth rate et engagement velocity
 */
function calculateVirialityScore(userStats) {
    if (!userStats) return 0;

    const {
        weekly_view_growth = 0,
        engagement_velocity = 0, // new views/interactions per hour
        share_count = 0,
    } = userStats;

    // Growth rate (semaine sur semaine)
    const growthScore = Math.min(weekly_view_growth * 20, 40);

    // Velocity of engagement
    const velocityScore = Math.min(engagement_velocity * 10, 30);

    // Share count (signal fort)
    const shareBonus = Math.min(share_count * 2, 30);

    return Math.min(growthScore + velocityScore + shareBonus, 100);
}

/**
 * Score de gravité sociale.
 * Priorise les créateurs dont les preuves déclenchent des actions utiles:
 * validations, témoins, collaborations, partages qui mènent à du follow/signup
 * et nouveaux ARCs inspirés.
 */
function calculateSocialGravityScore(userStats) {
    if (!userStats) return 0;

    const {
        witness_count = 0,
        validation_count = 0,
        collaboration_request_count = 0,
        inspired_arc_count = 0,
        proof_share_count = 0,
        proof_follow_count = 0,
        proof_signup_count = 0,
    } = userStats;

    const witnessScore = Math.min(witness_count * 6, 24);
    const validationScore = Math.min(validation_count * 8, 28);
    const collaborationScore = Math.min(collaboration_request_count * 7, 21);
    const inspiredScore = Math.min(inspired_arc_count * 10, 20);
    const conversionScore = Math.min(
        proof_share_count * 1.5 + proof_follow_count * 5 + proof_signup_count * 8,
        30,
    );

    return Math.min(
        witnessScore +
            validationScore +
            collaborationScore +
            inspiredScore +
            conversionScore,
        100,
    );
}

/**
 * SCORE FINAL COMPOSITE
 * Combine tous les signaux avec poids optimisés
 */
function calculateCompositeScore(user, userStats = {}, options = {}) {
    const {
        previouslyShownUsers = [],
        boostPriority = false,
        boostMonetized = false,
        personalizationFactors = {},
    } = options;

    let score = 0;

    // Engagement score (40%)
    const engagementScore = calculateEngagementScore(userStats);
    score += engagementScore * 0.4;

    // Qualité créateur (30%)
    const creatorQuality = calculateCreatorQuality(user);
    score += creatorQuality * 0.3;

    // Fraîcheur (15%)
    const freshnessScore = calculateFreshnessScore(user);
    score += freshnessScore * 0.15;

    // Rétention utilisateur (10%)
    const retentionScore = calculateRetentionScore(userStats);
    score += retentionScore * 0.1;

    // Viralité potentielle (5%)
    const virialityScore = calculateVirialityScore(userStats);
    score += virialityScore * 0.05;

    // Gravité sociale (+12 points max)
    const socialGravityScore = calculateSocialGravityScore(userStats);
    score += socialGravityScore * 0.12;

    // Momentum bonus (+5 points)
    const momentumBonus = calculateMomentumBonus(user);
    score += momentumBonus;

    // Pénalité diversité (-10 points max)
    const diversityPenalty = calculateDiversityPenalty(
        user,
        previouslyShownUsers,
    );
    score -= diversityPenalty;

    // Boost pour utilisateurs premium avec priority_recommendations
    if (boostPriority && user.priority_recommendations) {
        score *= 1.5;
    }

    // Boost pour créateurs monétisés (visibility maximization)
    if (boostMonetized && user.is_monetized && user.plan !== "free") {
        score *= 1.2;
    }

    // Facteurs de personnalisation (basés sur historique utilisateur)
    if (personalizationFactors && personalizationFactors.affinity) {
        score *= 1 + personalizationFactors.affinity * 0.1;
    }

    return Math.min(Math.max(score, 0), 100);
}

/**
 * Classe les utilisateurs selon le score composite
 * Mélange déterministe pour éviter la monotonie
 */
function rankUsersIntelligently(users, userStatsMap = {}, options = {}) {
    const {
        limit = 100,
        randomizationFactor = 0.05, // 5% de randomisation pour diversité
        userId = null, // Pour personnalisation
    } = options;

    // Calcule les scores
    const usersWithScores = users.map((user, index) => {
        const userStats = userStatsMap[user.id] || {};

        const score = calculateCompositeScore(user, userStats, {
            boostPriority: options.boostPriority !== false,
            boostMonetized: options.boostMonetized !== false,
            personalizationFactors: options.personalizationFactors || {},
        });

        return {
            ...user,
            __score: score,
            __index: index,
        };
    });

    // Sort par score (desc)
    usersWithScores.sort((a, b) => b.__score - a.__score);

    // Applique la diversité et la randomisation
    const ranked = [];
    const used = new Set();

    for (let i = 0; i < usersWithScores.length && ranked.length < limit; i++) {
        const user = usersWithScores[i];

        // Calcul de diversité avec les déjà sélectionnés
        const diversityPenalty = calculateDiversityPenalty(user, ranked);
        const adjustedScore = user.__score - diversityPenalty;

        // Randomisation contrôlée (pour éviter déterminisme rigide)
        const randomFactor =
            (Math.random() - 0.5) * randomizationFactor * user.__score;
        const finalScore = adjustedScore + randomFactor;

        user.__adjustedScore = adjustedScore;
        user.__finalScore = finalScore;

        ranked.push(user);
        used.add(user.id);
    }

    // Re-sort après ajustement
    ranked.sort((a, b) => b.__finalScore - a.__finalScore);

    // Retourne sans les props internes
    return ranked.slice(0, limit).map((user) => {
        const { __score, __index, __adjustedScore, __finalScore, ...clean } =
            user;
        return clean;
    });
}

/**
 * Récupère les stats d'engagement pour les utilisateurs
 * (sera mis à jour avec données réelles des tables)
 */
async function fetchUserEngagementStats(supabase, userIds = []) {
    if (!userIds || userIds.length === 0) {
        return {};
    }

    try {
        // Agrège video_views par créateur
        const { data: videoStats, error: videoError } = await supabase
            .from("video_views")
            .select("user_id, view_count, video_duration")
            .in("user_id", userIds)
            .eq("eligible", true);

        if (videoError) {
            console.warn("Error fetching video stats:", videoError);
            return {};
        }

        // Agrège transactions (support, revenue)
        const { data: transactions, error: txError } = await supabase
            .from("transactions")
            .select("user_id, type, amount_gross")
            .in("user_id", userIds);

        if (txError) {
            console.warn("Error fetching transactions:", txError);
        }

        let proofCards = [];
        let socialEvents = [];

        try {
            const { data, error } = await supabase
                .from("proof_cards")
                .select(
                    "created_by, share_count, follow_count, signup_count",
                )
                .in("created_by", userIds);
            if (error) throw error;
            proofCards = data || [];
        } catch (error) {
            console.warn("Error fetching proof card stats:", error?.message || error);
        }

        try {
            const since = new Date(
                Date.now() - 30 * 24 * 60 * 60 * 1000,
            ).toISOString();
            const { data, error } = await supabase
                .from("social_growth_events")
                .select("target_user_id, event_type")
                .in("target_user_id", userIds)
                .gte("created_at", since);
            if (error) throw error;
            socialEvents = data || [];
        } catch (error) {
            console.warn(
                "Error fetching social growth stats:",
                error?.message || error,
            );
        }

        // Build stats map
        const stats = {};

        userIds.forEach((userId) => {
            const userVideos =
                videoStats?.filter((v) => v.user_id === userId) || [];
            const userTransactions =
                transactions?.filter((t) => t.user_id === userId) || [];

            const viewCount = userVideos.reduce(
                (sum, v) => sum + (v.view_count || 0),
                0,
            );
            const videoCount = userVideos.length;
            const supportCount = userTransactions.filter(
                (t) => t.type === "support",
            ).length;
            const monthlyRevenue = userTransactions.reduce(
                (sum, t) => sum + (t.amount_gross || 0),
                0,
            );
            const userProofCards = proofCards.filter(
                (card) => card.created_by === userId,
            );
            const userSocialEvents = socialEvents.filter(
                (event) => event.target_user_id === userId,
            );
            const countEvent = (type) =>
                userSocialEvents.filter((event) => event.event_type === type)
                    .length;
            const proofShareCount = userProofCards.reduce(
                (sum, card) => sum + Number(card.share_count || 0),
                0,
            ) + countEvent("proof_card_shared");
            const proofFollowCount = userProofCards.reduce(
                (sum, card) => sum + Number(card.follow_count || 0),
                0,
            ) + countEvent("proof_card_followed");
            const proofSignupCount = userProofCards.reduce(
                (sum, card) => sum + Number(card.signup_count || 0),
                0,
            );

            stats[userId] = {
                viewCount,
                videoCount,
                supportCount,
                monthlyViewsAvg: videoCount > 0 ? viewCount / videoCount : 0,
                monthly_revenue: monthlyRevenue,
                return_visitor_rate: 0.5, // Placeholder - sera amélioré
                avg_watch_time: 120, // Placeholder
                repeat_viewer_count: 0, // Placeholder
                total_viewers: videoCount || 1,
                weekly_view_growth: 0.1, // Placeholder
                engagement_velocity: 0, // Placeholder
                share_count: proofShareCount,
                proof_share_count: proofShareCount,
                proof_follow_count: proofFollowCount,
                proof_signup_count: proofSignupCount,
                witness_count: countEvent("witness_requested"),
                validation_count: countEvent("milestone_validated"),
                collaboration_request_count: countEvent("co_builder_requested"),
                inspired_arc_count:
                    countEvent("arc_inspiration_started") +
                    countEvent("arc_inspired_created"),
            };
        });

        return stats;
    } catch (error) {
        console.error("Error in fetchUserEngagementStats:", error);
        return {};
    }
}

/**
 * Export des fonctions publiques
 */
module.exports = {
    calculateCompositeScore,
    rankUsersIntelligently,
    fetchUserEngagementStats,
    // Exports pour tests/debug
    calculateEngagementScore,
    calculateCreatorQuality,
    calculateFreshnessScore,
    calculateMomentumBonus,
    calculateRetentionScore,
    calculateVirialityScore,
    calculateSocialGravityScore,
};
