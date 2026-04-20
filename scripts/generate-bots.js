#!/usr/bin/env node
// Script de génération de comptes bots (utiliser en staging)
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/generate-bots.js 100

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const isDryRun = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

if (!SUPABASE_URL || !SUPABASE_KEY) {
    if (!isDryRun) {
        console.error(
            "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars",
        );
        process.exit(1);
    } else {
        console.warn("Missing SUPABASE env vars but running in DRY_RUN mode.");
    }
}

let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: false },
        global: { headers: { "X-Client-Info": "xera-bot-generator" } },
    });
}

const { getName, combos } = require("./names");
const TECH_TOPICS = [
    "robotics",
    "ai",
    "diy",
    "coding",
    "entrepreneurship",
    "mechanics",
];
const SEED_POSTS_PER_BOT = Number(process.env.SEED_POSTS_PER_BOT || 0);

function randomDaysOfWeek(count = 3) {
    const s = new Set();
    while (s.size < count) s.add(Math.floor(Math.random() * 7));
    return Array.from(s).sort();
}

// Helper to retry network calls with exponential backoff for transient errors
async function withRetries(fn, opts = {}) {
    const retries = typeof opts.retries === "number" ? opts.retries : 3;
    const baseDelay = typeof opts.baseDelay === "number" ? opts.baseDelay : 500;
    for (let attempt = 1; ; attempt++) {
        try {
            return await fn();
        } catch (err) {
            const code = err?.cause?.code || err?.code || "";
            const msg = String(err?.message || err || "");
            const isRetryable =
                code === "UND_ERR_CONNECT_TIMEOUT" ||
                msg.includes("fetch failed") ||
                msg.includes("Connect Timeout");
            if (!isRetryable || attempt >= retries) throw err;
            const wait = baseDelay * Math.pow(2, attempt - 1);
            console.warn(
                `Transient error (attempt ${attempt}) - retrying in ${wait}ms: ${msg}`,
            );
            await new Promise((r) => setTimeout(r, wait));
        }
    }
}

function pickRandom(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
}

async function createPostForUser(userId, index = 0, topic = "general") {
    const dayKey = new Date().toISOString().slice(0, 10);
    const uniq = crypto
        .createHash("sha1")
        .update(`${userId}:${dayKey}:${index}`)
        .digest("hex")
        .slice(0, 6);

    const mediaUrl = `https://picsum.photos/seed/${encodeURIComponent(
        userId + "-" + dayKey + "-" + uniq,
    )}/1200/800`;

    // Topic-specific templates
    let title;
    let description;
    if (topic && TECH_TOPICS.includes(topic)) {
        const tpl = {
            robotics: {
                prefixes: [
                    "Prototype",
                    "Module",
                    "Capteur",
                    "Contrôleur",
                    "Bras robotique",
                    "Moteur",
                ],
                actions: [
                    "en test",
                    "v1.0",
                    "au labo",
                    "en montage",
                    "intégration Arduino",
                    "optimisé",
                ],
            },
            ai: {
                prefixes: [
                    "Modèle",
                    "Expérience",
                    "Réseau",
                    "Pipeline",
                    "Fine-tune",
                    "Prototype",
                ],
                actions: [
                    "pour vision",
                    "NLP",
                    "en entraînement",
                    "avec PyTorch",
                    "optimisé",
                    "en production",
                ],
            },
            diy: {
                prefixes: [
                    "Tuto",
                    "Astuce",
                    "Montage",
                    "Projet DIY",
                    "Guide",
                    "Hack",
                ],
                actions: [
                    "étape par étape",
                    "facile",
                    "avec pièces récupérées",
                    "low-cost",
                    "rapide",
                ],
            },
            coding: {
                prefixes: [
                    "Snippet",
                    "Pattern",
                    "Refactor",
                    "Truc",
                    "Astuce dev",
                    "Bricolage code",
                ],
                actions: [
                    "JS/Node",
                    "Python",
                    "best-practices",
                    "optimisation",
                    "débogage",
                ],
            },
            entrepreneurship: {
                prefixes: [
                    "Business",
                    "MVP",
                    "Pitch",
                    "Growth",
                    "Leçon",
                    "Astuce",
                ],
                actions: [
                    "lean",
                    "croissance",
                    "marketing",
                    "monétisation",
                    "expérience client",
                ],
            },
            mechanics: {
                prefixes: [
                    "Réglage",
                    "Mécanique",
                    "Diagnostic",
                    "Atelier",
                    "Maintenance",
                    "Assemblage",
                ],
                actions: [
                    "pignon",
                    "roulement",
                    "couple",
                    "soudure",
                    "usinage",
                ],
            },
        }[topic];

        title = `${pickRandom(tpl.prefixes)} ${pickRandom(tpl.actions)} • ${uniq}`;
        description = `Partage technique (${topic}) — ${pickRandom(["Petit retour d'expérience", "Astuce pratique", "Étapes clés", "Code & schéma"])} (${uniq})`;
    } else {
        const adjectives = [
            "Petit",
            "Grand",
            "Nouveau",
            "Simple",
            "Rapide",
            "Beau",
        ];
        const nouns = [
            "progrès",
            "instant",
            "moment",
            "capture",
            "éclair",
            "point",
        ];
        const verbs = [
            "du jour",
            "du matin",
            "du soir",
            "du week-end",
            "d'aujourd'hui",
        ];
        title = `${pickRandom(adjectives)} ${pickRandom(nouns)} ${pickRandom(verbs)} • ${uniq}`;
        description = `Post initial — ${pickRandom(["Un pas de plus", "Petite victoire", "Persévérance", "Suivi de progrès"])} (${uniq})`;
    }

    // Compute next day_number for this user's content (incremental per-user)
    let nextDayNumber = 1;
    if (supabase) {
        try {
            const { data: lastRow, error: lastErr } = await supabase
                .from("content")
                .select("day_number")
                .eq("user_id", userId)
                .order("day_number", { ascending: false })
                .limit(1)
                .maybeSingle();
            if (
                !lastErr &&
                lastRow &&
                Number.isFinite(Number(lastRow.day_number))
            ) {
                nextDayNumber = Number(lastRow.day_number) + 1;
            }
        } catch (e) {
            // ignore and fallback to 1
        }
    }

    const payload = {
        user_id: userId,
        day_number: nextDayNumber,
        type: "image",
        state: "success",
        title,
        description,
        media_url: mediaUrl,
        created_at: new Date().toISOString(),
    };

    if (!isDryRun) {
        const { data, error } = await withRetries(
            () => supabase.from("content").insert(payload).select().single(),
            { retries: 2, baseDelay: 500 },
        );
        if (error) {
            console.warn("createPostForUser error:", error?.message || error);
            return null;
        }
        return data;
    } else {
        console.log(`[dry-run] would create post for ${userId}: ${title}`);
        return { id: `dry-${userId}-${uniq}` };
    }
}

async function createBot(i) {
    // Pick a random name index for bots, ensure uniqueness against existing bots/users
    const maxNameAttempts = 12;
    let name = null;
    for (let attempt = 0; attempt < maxNameAttempts; attempt++) {
        const randIdx = Math.floor(Math.random() * (Number(combos) || 1000)) + 1;
        const candidate = getName(randIdx);
        // In dry-run mode we accept the first candidate
        if (dryRun) {
            name = candidate;
            break;
        }

        // Check existing bots/users for the same display name (case-insensitive)
        try {
            const { data: existingBots } = await supabase
                .from("bots")
                .select("user_id")
                .ilike("display_name", candidate)
                .limit(1);
            if (existingBots && existingBots.length > 0) continue;

            const { data: existingUsers } = await supabase
                .from("users")
                .select("id")
                .ilike("name", candidate)
                .limit(1);
            if (existingUsers && existingUsers.length > 0) continue;

            name = candidate;
            break;
        } catch (e) {
            // On errors, fallback to candidate
            name = candidate;
            break;
        }
    }

    if (!name) {
        // If all attempts failed, append index to force uniqueness
        name = `${getName(1)}-${Date.now()}-${i}`;
    }
    const avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`;
    const scheduleHour = i % 24;
    const encourageDays = randomDaysOfWeek(3);

    const dryRun = isDryRun;
    // assign topic for this bot (40% technical, otherwise general)
    const topic = Math.random() < 0.4 ? pickRandom(TECH_TOPICS) : "general";
    const emailDomain = process.env.BOT_EMAIL_DOMAIN || "example.com";
    const email = `bot+${Date.now()}-${i}@${emailDomain}`;
    const password = crypto.randomBytes(12).toString("hex");

    try {
        let authUserId = null;

        if (dryRun) {
            console.log(
                `[dry-run] would create auth user ${email} with password ${password}`,
            );
            authUserId = `dry-run-${i}`;
        } else {
            if (!supabase) throw new Error("Supabase client not configured");

            // First, try to find an existing auth user by email via admin.listUsers (with retries)
            let page = 1;
            const perPage = 100;
            while (!authUserId) {
                const { data: listData, error: listErr } = await withRetries(
                    () => supabase.auth.admin.listUsers({ page, perPage }),
                    { retries: 3, baseDelay: 500 },
                );
                if (listErr) throw listErr;
                const users = listData?.users || [];
                const u = users.find(
                    (uu) =>
                        String(uu.email || "").toLowerCase() ===
                        email.toLowerCase(),
                );
                if (u) {
                    authUserId = u.id;
                    break;
                }
                if (users.length < perPage) break;
                page++;
            }

            // If not found, create a new auth user (with retries)
            if (!authUserId) {
                const { data: authData, error: authErr } = await withRetries(
                    () =>
                        supabase.auth.admin.createUser({
                            email,
                            password,
                            email_confirm: true,
                            user_metadata: { name, avatar },
                        }),
                    { retries: 3, baseDelay: 500 },
                );
                if (authErr) throw authErr;
                authUserId = authData?.user?.id || authData?.id || null;
            }

            // Upsert public.users row for the auth user (do NOT assume an 'email' column exists)
            const upsertPayload = {
                id: authUserId,
                name,
                avatar,
                is_bot: true,
                updated_at: new Date().toISOString(),
            };
            const { error: upErr } = await withRetries(
                () => supabase.from("users").upsert(upsertPayload),
                { retries: 2, baseDelay: 500 },
            );
            if (upErr) throw upErr;

            // Insert into bots table (with retry on network errors)
            const { error: botErr } = await withRetries(
                () =>
                    supabase.from("bots").insert({
                        user_id: authUserId,
                        display_name: name,
                        avatar_url: avatar,
                        active: false,
                        schedule_hour: scheduleHour,
                        encourage_days: encourageDays,
                        meta: { seeded: true, topic },
                    }),
                { retries: 2, baseDelay: 500 },
            );
            if (botErr) throw botErr;

            // Optional: seed initial posts for this bot
            const seedCount = Number(SEED_POSTS_PER_BOT || 0);
            for (let p = 0; p < seedCount; p++) {
                await createPostForUser(authUserId, p, topic);
                await new Promise((r) => setTimeout(r, 120));
            }
        }

        console.log(
            `Created bot ${i}: ${authUserId} (${name}) hour=${scheduleHour} days=${encourageDays}`,
        );
        return authUserId;
    } catch (e) {
        console.error(`Failed to create bot ${i}:`, e?.message || e);
        return null;
    }
}

async function main() {
    const target = Math.max(0, Number(process.argv[2] || 50));
    console.log(`Generating ${target} bots ...`);
    for (let i = 1; i <= target; i++) {
        await createBot(i);
        // small delay
        await new Promise((r) => setTimeout(r, 250));
    }
    console.log("Done");
    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
