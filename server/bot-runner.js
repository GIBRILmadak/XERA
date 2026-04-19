#!/usr/bin/env node
// Worker simple pour exécuter les actions des bots (poster 1x/jour, encourager 3x/semaine)
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node server/bot-runner.js

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const crypto = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Configuration des quotas
// Par défaut, chaque bot suivra au moins 3 utilisateurs par jour
const FOLLOW_DAILY_LIMIT = Number(process.env.BOT_FOLLOW_DAILY_LIMIT) || 3;
const MAX_FOLLOWS_PER_BOT = Number(process.env.BOT_MAX_FOLLOWS_PER_BOT) || 50;
const MAX_ENCOURAGES_PER_RUN =
    Number(process.env.BOT_MAX_ENCOURAGES_PER_RUN) || 1000;
const MAX_POSTS_PER_RUN = Number(process.env.BOT_MAX_POSTS_PER_RUN) || 1000;

async function getActiveCount() {
    try {
        const { data } = await supabase
            .from("bot_control")
            .select("value")
            .eq("key", "bots.active_count")
            .maybeSingle();
        return (data?.value?.count && Number(data.value.count)) || 0;
    } catch (e) {
        console.warn("getActiveCount error", e?.message || e);
        return 0;
    }
}

async function fetchActiveBots(limit) {
    try {
        const q = supabase
            .from("bots")
            .select("*")
            .eq("active", true)
            .order("last_action_at", { ascending: true });
        if (limit && Number.isFinite(limit) && limit > 0) q.limit(limit);
        const { data, error } = await q;
        if (error) throw error;
        return data || [];
    } catch (e) {
        console.warn("fetchActiveBots error", e?.message || e);
        return [];
    }
}

function pickRandom(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
}

async function postAsBot(bot) {
    try {
        // Générer un post distinctif par bot par jour
        const dayKey = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        const uniq = crypto
            .createHash("sha1")
            .update(`${bot.user_id}:${dayKey}`)
            .digest("hex")
            .slice(0, 6);

        const mediaUrl = `https://picsum.photos/seed/${encodeURIComponent(
            bot.user_id + "-" + dayKey + "-" + uniq,
        )}/1200/800`;

        const meta =
            bot.meta && typeof bot.meta === "object"
                ? bot.meta
                : bot.meta
                  ? JSON.parse(bot.meta)
                  : {};
        const topic =
            meta.topic ||
            (Array.isArray(meta.topics) && meta.topics[0]) ||
            "general";

        let title;
        let description;
        if (
            topic &&
            [
                "robotics",
                "ai",
                "diy",
                "coding",
                "entrepreneurship",
                "mechanics",
            ].includes(topic)
        ) {
            const tplMap = {
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
            };
            const tpl = tplMap[topic] || tplMap.coding;
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
            description = `Partage quotidien — ${pickRandom(["Un pas de plus", "Petite victoire", "Persévérance", "Suivi de progrès"])} (${uniq})`;
        }

        // Compute next day_number for this user's content (incremental per-user)
        let nextDayNumber = 1;
        try {
            const { data: lastRow, error: lastErr } = await supabase
                .from("content")
                .select("day_number")
                .eq("user_id", bot.user_id)
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

        const payload = {
            user_id: bot.user_id,
            day_number: nextDayNumber,
            type: "image",
            state: "success",
            title,
            description,
            media_url: mediaUrl,
            created_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
            .from("content")
            .insert(payload)
            .select()
            .single();
        if (error) throw error;
        await supabase
            .from("bots")
            .update({
                last_posted_at: new Date().toISOString(),
                last_action_at: new Date().toISOString(),
            })
            .eq("user_id", bot.user_id);
        console.log(
            `Bot ${bot.user_id} posted content ${data?.id || "(no-id)"}`,
        );
        return data;
    } catch (e) {
        console.warn(`postAsBot error for ${bot.user_id}:`, e?.message || e);
        return null;
    }
}

async function encourageAsBot(bot) {
    try {
        // Fetch recent content candidates
        const { data: candidates, error } = await supabase
            .from("content")
            .select("id, user_id, created_at")
            .neq("user_id", bot.user_id)
            .order("created_at", { ascending: false })
            .limit(500);
        if (error) throw error;
        if (!candidates || candidates.length === 0) return null;

        // Prioritize content from real users (is_bot = false)
        const userIds = Array.from(
            new Set(candidates.map((c) => c.user_id).filter(Boolean)),
        );
        let usersMap = {};
        if (userIds.length > 0) {
            const { data: users } = await supabase
                .from("users")
                .select("id, is_bot")
                .in("id", userIds);
            if (users && users.length) {
                users.forEach((u) => {
                    usersMap[u.id] = !!u.is_bot;
                });
            }
        }

        const prioritized = candidates.filter((c) => !usersMap[c.user_id]);
        const pickFrom = prioritized.length > 0 ? prioritized : candidates;
        const target = pickRandom(pickFrom);
        if (!target) return null;

        // Utiliser la RPC server-side existante toggle_courage
        const { data: rpcData, error: rpcErr } = await supabase.rpc(
            "toggle_courage",
            { row_id: target.id, user_id_param: bot.user_id },
        );
        if (rpcErr) throw rpcErr;
        await supabase
            .from("bots")
            .update({
                last_encouraged_at: new Date().toISOString(),
                last_action_at: new Date().toISOString(),
            })
            .eq("user_id", bot.user_id);
        console.log(`Bot ${bot.user_id} encouraged content ${target.id}`);
        return rpcData;
    } catch (e) {
        console.warn(
            `encourageAsBot error for ${bot.user_id}:`,
            e?.message || e,
        );
        return null;
    }
}

async function getFollowingIds(botUserId) {
    try {
        const { data, error } = await supabase
            .from("followers")
            .select("following_id")
            .eq("follower_id", botUserId);
        if (error) throw error;
        return (data || []).map((r) => r.following_id).filter(Boolean);
    } catch (e) {
        console.warn("getFollowingIds error", e?.message || e);
        return [];
    }
}

async function followAsBot(bot, maxToFollow = 1) {
    try {
        const now = new Date();
        const todayStr = now.toISOString().slice(0, 10);
        const meta =
            bot.meta && typeof bot.meta === "object"
                ? bot.meta
                : bot.meta
                  ? JSON.parse(bot.meta)
                  : {};
        if (meta.last_followed_date === todayStr) return 0;

        const followingIds = new Set(await getFollowingIds(bot.user_id));
        const { data: candidates, error } = await supabase
            .from("users")
            .select("id, name, is_bot, followers_count")
            .neq("id", bot.user_id)
            .order("followers_count", { ascending: false })
            .limit(400);
        if (error) throw error;
        if (!candidates || candidates.length === 0) return 0;

        // Prioritize real users first, then bots
        candidates.sort((a, b) => {
            const aBot = a && a.is_bot ? 1 : 0;
            const bBot = b && b.is_bot ? 1 : 0;
            if (aBot !== bBot) return aBot - bBot; // real users first
            return (b.followers_count || 0) - (a.followers_count || 0);
        });

        let followed = 0;
        for (const cand of candidates) {
            if (followed >= maxToFollow) break;
            if (!cand || !cand.id) continue;
            if (followingIds.has(cand.id)) continue;
            try {
                const { error: insErr } = await supabase
                    .from("followers")
                    .insert({
                        follower_id: bot.user_id,
                        following_id: cand.id,
                    });
                if (insErr) {
                    // ignore duplicates or constraint errors
                    console.warn(
                        "follow insert err",
                        insErr?.message || insErr,
                    );
                    continue;
                }
                followingIds.add(cand.id);
                followed += 1;
                // small delay between follow actions
                await sleep(150 + Math.random() * 500);
            } catch (e) {
                console.warn("followAsBot insert error", e?.message || e);
            }
        }

        // Update meta
        meta.follow_total = (Number(meta.follow_total) || 0) + followed;
        meta.last_followed_date = todayStr;
        await supabase
            .from("bots")
            .update({ meta: meta, last_action_at: new Date().toISOString() })
            .eq("user_id", bot.user_id);
        if (followed > 0)
            console.log(`Bot ${bot.user_id} followed ${followed} user(s)`);
        return followed;
    } catch (e) {
        console.warn(`followAsBot error for ${bot.user_id}:`, e?.message || e);
        return 0;
    }
}

function isSameDayUTC(a, b) {
    if (!a || !b) return false;
    const da = new Date(a);
    const db = new Date(b);
    return (
        da.getUTCFullYear() === db.getUTCFullYear() &&
        da.getUTCMonth() === db.getUTCMonth() &&
        da.getUTCDate() === db.getUTCDate()
    );
}

async function loopOnce() {
    try {
        const activeCount = await getActiveCount();
        const bots = await fetchActiveBots(activeCount || undefined);
        if (!bots || bots.length === 0) return;

        const now = new Date();
        const currentHour = now.getUTCHours();
        const todayStart = new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
        );
        const dayOfWeek = now.getUTCDay();

        // Poster: bots qui ont schedule_hour === currentHour et qui n'ont pas posté aujourd'hui
        const toPost = bots.filter(
            (b) =>
                Number(b.schedule_hour) === currentHour &&
                (!b.last_posted_at || new Date(b.last_posted_at) < todayStart),
        );
        for (const bot of toPost) {
            await postAsBot(bot);
            await sleep(500 + Math.random() * 800);
        }

        // Encourager: bots dont encourage aujourd'hui et dont encourage_days contient le jour courant
        const toEncourage = bots.filter((b) => {
            try {
                const days = Array.isArray(b.encourage_days)
                    ? b.encourage_days.map(Number)
                    : [];
                const shouldToday = days.includes(dayOfWeek);
                const notDoneToday =
                    !b.last_encouraged_at ||
                    !isSameDayUTC(b.last_encouraged_at, now);
                return shouldToday && notDoneToday;
            } catch (e) {
                return false;
            }
        });

        for (const bot of toEncourage) {
            await encourageAsBot(bot);
            await sleep(400 + Math.random() * 800);
        }

        // Followers: bots follow a small number of real users once per day (quota)
        const toFollow = bots.filter((b) => {
            try {
                const meta =
                    b.meta && typeof b.meta === "object"
                        ? b.meta
                        : b.meta
                          ? JSON.parse(b.meta)
                          : {};
                const lastFollow = meta && meta.last_followed_date;
                const todayStr = now.toISOString().slice(0, 10);
                const followTotal = Number(meta.follow_total) || 0;
                if (followTotal >= MAX_FOLLOWS_PER_BOT) return false;
                return lastFollow !== todayStr;
            } catch (e) {
                return true;
            }
        });

        for (const bot of toFollow) {
            await followAsBot(bot, FOLLOW_DAILY_LIMIT);
            await sleep(300 + Math.random() * 900);
        }
    } catch (e) {
        console.error("loopOnce error:", e?.message || e);
    }
}

async function main() {
    console.log("Bot runner started");
    while (true) {
        await loopOnce();
        // Attendre 60s
        await sleep(60 * 1000);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
