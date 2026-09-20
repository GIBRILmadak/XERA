const { createClient } = require("@supabase/supabase-js");
const { sendActionCompletion } = require("./fata-api-client");

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const RETRY_INTERVALS = [
    1 * 60 * 1000,   // 1 min
    5 * 60 * 1000,   // 5 min
    30 * 60 * 1000,  // 30 min
    2 * 60 * 60 * 1000, // 2 h
    6 * 60 * 60 * 1000  // 6 h
];

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

    // Get Fata linkage
    const { data: linkage } = await supabase
        .from("fata_linkages")
        .select("*")
        .eq("user_id", user_id)
        .maybeSingle();

    if (!linkage) return;

    const challengeId = linkage.metadata?.last_challenge_id;
    if (!challengeId) return;

    // Get Challenge Config
    const { data: config } = await supabase
        .from("fata_challenges_config")
        .select("*")
        .eq("id", challengeId)
        .maybeSingle();

    if (!config || !config.is_active) return;

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

    if (!arc || !arc.title || !arc.description) return;

    // Count validated content for this arc
    const { count } = await supabase
        .from("arc_milestone_validations")
        .select("content_id", { count: "exact", head: true })
        .eq("arc_id", arc_id);

    if (count >= 3) {
        await queueEvent(user_id, linkage.fata_sub, config.id, config.req_arc, new Date(arc.created_at), `arc-${arc_id}`);
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

    if (!content || !content.arc_id || !content.media_url || !content.description) return;

    // Check if published after link
    if (new Date(content.created_at) < new Date(linkage.created_at)) return;

    await queueEvent(user_id, linkage.fata_sub, config.id, config.req_preuve, new Date(content.created_at), `preuve-${content_id}`);
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

    await queueEvent(user_id, linkage.fata_sub, config.id, config.req_jalon, new Date(val.created_at), `jalon-${validation_id}`);
}

async function queueEvent(user_id, fata_sub, challenge_id, requirement_id, occurred_at, idempotency_key) {
    const { error } = await supabase
        .from("fata_pending_events")
        .insert({
            user_id,
            fata_sub,
            challenge_id,
            requirement_id,
            occurred_at: occurred_at.toISOString(),
            idempotency_key,
            status: "pending"
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

    for (const event of events) {
        // Check if challenge is closed
        if (event.fata_challenges_config?.close_at && new Date() > new Date(event.fata_challenges_config.close_at)) {
            await supabase.from("fata_pending_events").update({ status: "failed", last_error: "Challenge closed" }).eq("id", event.id);
            continue;
        }

        try {
            const res = await sendActionCompletion({
                subject: event.fata_sub,
                challengeId: event.challenge_id,
                requirementId: event.requirement_id,
                occurredAt: event.occurred_at
            }, event.idempotency_key);

            if (res.ok || res.status === 409) {
                await supabase.from("fata_pending_events").update({ status: "delivered", updated_at: new Date().toISOString() }).eq("id", event.id);
            } else if (res.status >= 500 || res.status === 429 || res.status === 401) {
                await scheduleRetry(event, await res.text());
            } else {
                await supabase.from("fata_pending_events").update({ status: "failed", last_error: `HTTP ${res.status}: ${await res.text()}` }).eq("id", event.id);
            }
        } catch (err) {
            await scheduleRetry(event, err.message);
        }
    }
}

async function scheduleRetry(event, errorMsg) {
    const retryCount = (event.retry_count || 0) + 1;
    const interval = RETRY_INTERVALS[Math.min(retryCount - 1, RETRY_INTERVALS.length - 1)];
    const nextRetry = new Date(Date.now() + interval).toISOString();

    await supabase.from("fata_pending_events").update({
        status: "retry",
        retry_count: retryCount,
        next_retry_at: nextRetry,
        last_error: errorMsg,
        updated_at: new Date().toISOString()
    }).eq("id", event.id);
}

module.exports = {
    processActivityLog,
    processPendingEvents
};
