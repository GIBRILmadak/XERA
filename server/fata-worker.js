const { createClient } = require("@supabase/supabase-js");
const { sendActionCompletion } = require("./fata-api-client");
const {
    resolveChallengeConfig,
    buildIdempotencyKey,
    isTestChallenge,
} = require("./fata-contract");

const RETRY_INTERVALS = [
    1 * 60 * 1000,
    5 * 60 * 1000,
    30 * 60 * 1000,
    2 * 60 * 60 * 1000,
    6 * 60 * 60 * 1000,
];

async function markAlertIfFailure(event, errorMessage) {
    const hoursSinceCreated =
        (Date.now() - new Date(event.created_at || Date.now()).getTime()) /
        (60 * 60 * 1000);

    if (hoursSinceCreated >= 24) {
        try {
            await supabase.from("fata_alerts").upsert(
                {
                    event_id: event.id,
                    type: "fata_action_retry_failure",
                    severity: "high",
                    message: errorMessage || "Fata action retry failed for 24h",
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "event_id" },
            );
        } catch (alertError) {
            console.warn(
                "[Fata Worker] alert queue failed:",
                alertError.message,
            );
        }
    }
}

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function processActivityLog() {
    console.log("[Fata Worker] Scanning activity log...");

    // 1. Get unprocessed log entries
    const { data: logs, error: logError } = await supabase
        .from("fata_activity_log")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(100);

    if (logError) {
        console.error("[Fata Worker] Log fetch error:", logError);
        return;
    }

    if (!logs || logs.length === 0) return;

    for (const log of logs) {
        try {
            await handleLogEntry(log);
            // Delete log after processing
            await supabase.from("fata_activity_log").delete().eq("id", log.id);
        } catch (err) {
            console.error(`[Fata Worker] Error processing log ${log.id}:`, err);
        }
    }
}

async function handleLogEntry(log) {
    const { user_id, entity_type, entity_id } = log;

    const { data: linkage } = await supabase
        .from("fata_linkages")
        .select("*")
        .eq("user_id", user_id)
        .maybeSingle();

    if (!linkage) return;

    const metadataChallengeId =
        linkage.metadata?.last_challenge_id || linkage.metadata?.challenge_id;
    if (!metadataChallengeId) return;

    try {
        resolveChallengeConfig(metadataChallengeId);
    } catch (error) {
        console.warn(
            "[Fata Worker] Ignoring invalid challenge in linkage:",
            error.message,
        );
        return;
    }

    const { data: config } = await supabase
        .from("fata_challenges_config")
        .select("*")
        .eq("id", metadataChallengeId)
        .maybeSingle();

    if (!config || !config.is_active || config.is_test) return;

    if (entity_type === "arcs") {
        await evaluateAction1(user_id, entity_id, linkage, config);
    } else if (entity_type === "content") {
        await evaluateAction2(user_id, entity_id, linkage, config);
    } else if (entity_type === "arc_milestone_validations") {
        await evaluateAction3(user_id, entity_id, linkage, config);
    }
}

/**
 * Action 1: ARC Conforme
 * Belonging to learner, published, title/desc not empty, >= 3 milestones
 */
async function evaluateAction1(user_id, arc_id, linkage, config) {
    const { data: arc } = await supabase
        .from("arcs")
        .select("*")
        .eq("id", arc_id)
        .maybeSingle();

    if (!arc || !arc.user_id || arc.user_id !== user_id) return;
    if (!arc.title || !arc.title.trim()) return;
    if (!arc.description || !arc.description.trim()) return;

    const { count } = await supabase
        .from("arc_milestone_validations")
        .select("content_id", { count: "exact", head: true })
        .eq("arc_id", arc_id);

    if (count >= 3) {
        await queueEvent(
            user_id,
            linkage.fata_sub,
            config.id,
            config.req_arc,
            new Date(arc.created_at || Date.now()),
            `arc-${arc_id}`,
        );
    }
}

/**
 * Action 2: PREUVE / TRACE Conforme
 * Belonging to learner, published after link, linked to ARC/Milestone, has media, desc not empty
 */
async function evaluateAction2(user_id, content_id, linkage, config) {
    const { data: content } = await supabase
        .from("content")
        .select("*")
        .eq("id", content_id)
        .maybeSingle();

    if (!content || content.user_id !== user_id) return;
    if (!content.arc_id) return;
    if (!content.media_url || !String(content.media_url).trim()) return;
    if (!content.description || !String(content.description).trim()) return;

    const { data: profile } = await supabase
        .from("profiles")
        .select("created_at")
        .eq("user_id", user_id)
        .maybeSingle();

    if (
        !profile ||
        new Date(content.created_at) <
            new Date(profile.created_at || linkage.created_at)
    )
        return;
    if (new Date(content.created_at) < new Date(linkage.created_at)) return;

    await queueEvent(
        user_id,
        linkage.fata_sub,
        config.id,
        config.req_preuve,
        new Date(content.created_at || Date.now()),
        `preuve-${content_id}`,
    );
}

/**
 * Action 3: JALON Conforme
 * Same ARC, validated, description of result, admissible proof (media)
 */
async function evaluateAction3(user_id, validation_id, linkage, config) {
    const { data: val } = await supabase
        .from("arc_milestone_validations")
        .select("*, content(*)")
        .eq("id", validation_id)
        .maybeSingle();

    if (!val || !val.content) return;
    const content = val.content;

    if (!content.arc_id || !content.media_url || !content.description) return;
    if (!val.result_description || !String(val.result_description).trim())
        return;
    if (val.user_id && val.user_id !== user_id) return;

    await queueEvent(
        user_id,
        linkage.fata_sub,
        config.id,
        config.req_jalon,
        new Date(val.created_at || Date.now()),
        `jalon-${validation_id}`,
    );
}

async function queueEvent(
    user_id,
    fata_sub,
    challenge_id,
    requirement_id,
    occurred_at,
    idempotency_seed,
) {
    const safeChallengeId = String(challenge_id || "").trim();
    const safeRequirement = String(requirement_id || "").trim();
    const safeOccurredAt =
        occurred_at instanceof Date
            ? occurred_at.toISOString()
            : new Date(occurred_at).toISOString();

    try {
        resolveChallengeConfig(safeChallengeId);
    } catch (error) {
        console.warn(
            "[Fata Worker] refusing queue for invalid challenge:",
            error.message,
        );
        return;
    }

    const idempotency_key = idempotency_seed
        ? buildIdempotencyKey(
              user_id,
              safeChallengeId,
              safeRequirement,
              safeOccurredAt,
          )
        : buildIdempotencyKey(
              user_id,
              safeChallengeId,
              safeRequirement,
              safeOccurredAt,
          );

    const { error } = await supabase
        .from("fata_pending_events")
        .insert({
            user_id,
            fata_sub,
            challenge_id: safeChallengeId,
            requirement_id: safeRequirement,
            occurred_at: safeOccurredAt,
            idempotency_key,
            status: "pending",
            retry_count: 0,
            next_retry_at: null,
        })
        .onConflict("idempotency_key")
        .doNothing();

    if (error) console.error("[Fata Worker] Event queue error:", error);
}

/**
 * Process pending events and send to Fata
 */
async function processPendingEvents() {
    console.log("[Fata Worker] Processing pending events...");

    const now = new Date().toISOString();
    const { data: events, error } = await supabase
        .from("fata_pending_events")
        .select("*, fata_challenges_config(close_at)")
        .in("status", ["pending", "retry"])
        .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
        .limit(50);

    if (error) {
        console.error("[Fata Worker] Event fetch error:", error);
        return;
    }

    for (const event of events || []) {
        if (
            event.fata_challenges_config?.close_at &&
            new Date() > new Date(event.fata_challenges_config.close_at)
        ) {
            await supabase
                .from("fata_pending_events")
                .update({
                    status: "failed",
                    last_error: "Challenge closed",
                    updated_at: new Date().toISOString(),
                })
                .eq("id", event.id);
            continue;
        }

        try {
            const res = await sendActionCompletion(
                {
                    subject: event.fata_sub,
                    challengeId: event.challenge_id,
                    requirementId: event.requirement_id,
                    occurredAt: event.occurred_at,
                },
                event.idempotency_key,
            );

            if (res.ok || res.status === 409) {
                await supabase
                    .from("fata_pending_events")
                    .update({
                        status: "delivered",
                        updated_at: new Date().toISOString(),
                        next_retry_at: null,
                        last_error: null,
                    })
                    .eq("id", event.id);
                continue;
            }

            const responseText = await res.text();

            if (res.status >= 500 || res.status === 429 || res.status === 401) {
                await scheduleRetry(
                    event,
                    responseText || `HTTP ${res.status}`,
                );
            } else if (
                res.status === 400 ||
                res.status === 404 ||
                res.status === 403 ||
                res.status === 422
            ) {
                await supabase
                    .from("fata_pending_events")
                    .update({
                        status: "failed",
                        last_error: `HTTP ${res.status}: ${responseText}`,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", event.id);
            } else {
                await supabase
                    .from("fata_pending_events")
                    .update({
                        status: "failed",
                        last_error: `HTTP ${res.status}: ${responseText}`,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", event.id);
            }
        } catch (err) {
            await scheduleRetry(event, err?.message || String(err));
        }
    }
}

async function scheduleRetry(event, errorMsg) {
    const retryCount = (event.retry_count || 0) + 1;
    const interval =
        RETRY_INTERVALS[Math.min(retryCount - 1, RETRY_INTERVALS.length - 1)];
    const nextRetry = new Date(Date.now() + interval).toISOString();

    await supabase
        .from("fata_pending_events")
        .update({
            status: "retry",
            retry_count: retryCount,
            next_retry_at: nextRetry,
            last_error: errorMsg,
            updated_at: new Date().toISOString(),
        })
        .eq("id", event.id);

    await markAlertIfFailure(event, errorMsg);
}

module.exports = {
    processActivityLog,
    processPendingEvents,
    scheduleRetry,
    isTestChallenge,
    resolveChallengeConfig,
};
