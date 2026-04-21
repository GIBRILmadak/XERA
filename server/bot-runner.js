#!/usr/bin/env node
// Worker simple pour exécuter les actions des bots (poster 1x/jour, encourager 3x/semaine)
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node server/bot-runner.js

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const crypto = require("crypto");
const { buildBotPostDraft } = require("./bot-post-generator");

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
const BOT_DAILY_VIEWS_TARGET = Number(process.env.BOT_DAILY_VIEWS_TARGET) || 30;

// Hashtags par topic (cohérents avec le contenu du post)
const TOPIC_HASHTAGS = {
    robotics: [
        "#robotique", "#robot", "#arduino", "#maker", "#electronique",
        "#iot", "#automates", "#mecanique", "#cnc", "#impression3d",
        "#raspberrypi", "#servomoteur", "#capteur"
    ],
    ai: [
        "#ai", "#ia", "#machinelearning", "#deeplearning", "#pytorch",
        "#tensorflow", "#neuralnetwork", "#datascience", "#chatgpt",
        "#llm", "#nlp", "#computerVision"
    ],
    diy: [
        "#diy", "#bricolage", "#faitmain", "#tuto", "#astuce",
        "#recup", "#upcycling", "#makers", "#homemade"
    ],
    coding: [
        "#coding", "#dev", "#programmation", "#javascript", "#python",
        "#nodejs", "#webdev", "#opensource", "#code", "#developer",
        "#react", "#typescript", "#api"
    ],
    entrepreneurship: [
        "#entrepreneur", "#startup", "#business", "#growth", "#mvp",
        "#lean", "#marketing", "#sideproject", "#saas", "#bootstrapping"
    ],
    mechanics: [
        "#mecanique", "#mecanicien", "#atelier", "#soudure", "#usinage",
        "#maintenance", "#diagnostic", "#technique", "#automobile"
    ],
    music: [
        "#music", "#musique", "#guitar", "#piano", "#producer", "#dj",
        "#spotify", "#concert", "#spotifywrapped", "#beats", "#studio",
        "#songwriting", "#livemusic", "#musicianlife"
    ],
    gaming: [
        "#gaming", "#videogames", "#twitch", "#esports", "#streamer",
        "#ps5", "#xbox", "#nintendo", "#pcgaming", "#retrogaming",
        "#gamer", "#gamingcommunity", "#levelup"
    ],
    cooking: [
        "#cooking", "#cuisine", "#foodie", "#recipe", "#cheflife",
        "#homemade", "#foodporn", "#baking", "#healthyfood", "#mealprep",
        "#delicious", "#foodblogger", "#yummy"
    ],
    fitness: [
        "#fitness", "#gym", "#workout", "#health", "#sport", "#training",
        "#motivation", "#fitfam", "#bodybuilding", "#crossfit", "#yoga",
        "#wellness", "#fitlife", "#personaltrainer"
    ],
    photography: [
        "#photography", "#photo", "#photographer", "#camera", "#portrait",
        "#landscape", "#streetphotography", "#nikon", "#canon", "#sony",
        "#photoshop", "#editing", "#visualart"
    ],
    travel: [
        "#travel", "#voyage", "#adventure", "#explore", "#wanderlust",
        "#travelgram", "#vacation", "#roadtrip", "#backpacking", "#nature",
        "#travelphotography", "#instatravel", "#travelblogger"
    ],
    art: [
        "#art", "#artist", "#artwork", "#drawing", "#painting", "#sketch",
        "#digitalart", "#illustration", "#creative", "#design", "#artistsoninstagram",
        "#artoftheday", "#instaart", "#artgallery"
    ],
    science: [
        "#science", "#scientist", "#research", "#physics", "#chemistry",
        "#biology", "#space", "#astronomy", "#laboratory", "#discovery",
        "#stem", "#innovation", "#scientific"
    ],
    writing: [
        "#writing", "#writer", "#author", "#poetry", "#blogging", "#storytelling",
        "#creativewriting", "#novel", "#script", "#books", "#wordsmith",
        "#writetips", "#authorlife", "#published"
    ],
    gardening: [
        "#gardening", "#garden", "#plants", "#flowers", "#vegetables",
        "#greenthumb", "#organic", "#plantbased", "#horticulture", "#growyourown",
        "#homegarden", "#permaculture", "#botanical"
    ],
    general: [
        "#progres", "#quotidien", "#perseverance", "#motivation",
        "#handmade", "#learning", "#croissance", "#quotidien",
        "#passion", "#creation"
    ]
};

function generateHashtags(topic, count = 3) {
    const available = TOPIC_HASHTAGS[topic] || TOPIC_HASHTAGS.general;
    if (!available || available.length === 0) return "";

    // Seed aléatoire basé sur le topic et l'heure pour varier les hashtags
    const seed = topic + Date.now();
    const shuffled = [...available].sort((a, b) => {
        const hashA = parseInt(crypto.createHash("sha1").update(a + seed).digest("hex").slice(0, 8), 16);
        const hashB = parseInt(crypto.createHash("sha1").update(b + seed).digest("hex").slice(0, 8), 16);
        return hashA - hashB;
    });

    const selected = shuffled.slice(0, count);

    // Ajouter 1 hashtag aléatoire d'un autre topic (diversity)
    if (Math.random() > 0.3) {
        const otherTopics = Object.keys(TOPIC_HASHTAGS).filter(t => t !== topic);
        const randomTopic = otherTopics[Math.floor(Math.random() * otherTopics.length)];
        const extraTag = TOPIC_HASHTAGS[randomTopic][
            Math.floor(Math.random() * TOPIC_HASHTAGS[randomTopic].length)
        ];
        if (extraTag && !selected.includes(extraTag)) {
            selected.push(extraTag);
        }
    }

    return selected.join(" ");
}

// Version retournant un tableau pour insertion en base
function generateHashtagsArray(topic, count = 3) {
    const available = TOPIC_HASHTAGS[topic] || TOPIC_HASHTAGS.general;
    if (!available || available.length === 0) return [];

    const seed = topic + "array" + Date.now();
    const shuffled = [...available].sort((a, b) => {
        const hashA = parseInt(crypto.createHash("sha1").update(a + seed).digest("hex").slice(0, 8), 16);
        const hashB = parseInt(crypto.createHash("sha1").update(b + seed).digest("hex").slice(0, 8), 16);
        return hashA - hashB;
    });

    const selected = shuffled.slice(0, count);

    if (Math.random() > 0.3) {
        const otherTopics = Object.keys(TOPIC_HASHTAGS).filter(t => t !== topic);
        const randomTopic = otherTopics[Math.floor(Math.random() * otherTopics.length)];
        const extraTag = TOPIC_HASHTAGS[randomTopic][
            Math.floor(Math.random() * TOPIC_HASHTAGS[randomTopic].length)
        ];
        if (extraTag && !selected.includes(extraTag)) {
            selected.push(extraTag);
        }
    }

    return selected;
}

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

function getDeterministicRandom(seed, max) {
    const hash = crypto.createHash("sha1").update(seed).digest("hex");
    return parseInt(hash.slice(0, 8), 16) % max;
}

function getTargetMinutes(baseHour, seed, jitterRange = 30) {
    const jitter = getDeterministicRandom(seed, jitterRange * 2 + 1) - jitterRange;
    return baseHour * 60 + jitter;
}

function parseBotMeta(metaValue) {
    try {
        if (!metaValue) return {};
        if (typeof metaValue === "object" && !Array.isArray(metaValue)) {
            return { ...metaValue };
        }
        return JSON.parse(metaValue);
    } catch (_error) {
        return {};
    }
}

async function fetchCurrentBotMeta(userId, fallbackMeta = null) {
    try {
        const { data, error } = await supabase
            .from("bots")
            .select("meta")
            .eq("user_id", userId)
            .maybeSingle();
        if (error) throw error;
        return parseBotMeta(data?.meta);
    } catch (_error) {
        return parseBotMeta(fallbackMeta);
    }
}

async function persistMergedBotMeta(userId, metaUpdater, extraPayload = {}) {
    const currentMeta = await fetchCurrentBotMeta(userId);
    const nextMeta =
        typeof metaUpdater === "function"
            ? metaUpdater({ ...currentMeta })
            : { ...currentMeta, ...(metaUpdater || {}) };
    await supabase
        .from("bots")
        .update({
            meta: nextMeta,
            ...extraPayload,
        })
        .eq("user_id", userId);
    return nextMeta;
}

async function postAsBot(bot) {
    try {
        // Generer un post varie et coherent avec le theme du bot
        const dayKey = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        
        // Fetch current post count today to make the uniq hash unique for multiple posts same day
        const { count: todayCount } = await supabase
            .from("content")
            .select("*", { count: 'exact', head: true })
            .eq("user_id", bot.user_id)
            .gte("created_at", dayKey + "T00:00:00Z");

        const postIndex = (todayCount || 0) + 1;

        // Recuperer un petit historique pour eviter les doublons de titres/descriptions
        const { data: recentPosts } = await supabase
            .from("content")
            .select("title, description")
            .eq("user_id", bot.user_id)
            .order("created_at", { ascending: false })
            .limit(20);

        const draft = buildBotPostDraft({
            bot,
            dayKey,
            postIndex,
            recentPosts: recentPosts || [],
        });

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
            title: draft.title,
            description: draft.description,
            hashtags: draft.hashtags,
            media_url: draft.mediaUrl,
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

        // Incrémenter les vues: simuler que le bot a vu ce contenu
        try {
            await supabase.rpc("increment_views", { row_id: target.id });
        } catch (incErr) {
            console.warn(
                `increment_views rpc error for ${target.id}:`,
                incErr?.message || incErr,
            );
        }

        // Utiliser la RPC server-side existante toggle_courage
        const { data: rpcData, error: rpcErr } = await supabase.rpc(
            "toggle_courage",
            { row_id: target.id, user_id_param: bot.user_id },
        );
        if (rpcErr) throw rpcErr;

        const todayStr = new Date().toISOString().slice(0, 10);

        // Ensure content.encouragements_count reflects server state (if RPC returned count)
        try {
            const serverCount =
                rpcData &&
                (Number(rpcData.count) || Number(rpcData.count) === 0
                    ? Number(rpcData.count)
                    : null);
            if (Number.isFinite(serverCount)) {
                await supabase
                    .from("content")
                    .update({ encouragements_count: serverCount })
                    .eq("id", target.id);
            } else {
                // Fallback: increment by 1 (best-effort)
                const { data: row } = await supabase
                    .from("content")
                    .select("encouragements_count")
                    .eq("id", target.id)
                    .maybeSingle();
                const newCount =
                    row && Number(row.encouragements_count)
                        ? Number(row.encouragements_count) + 1
                        : 1;
                await supabase
                    .from("content")
                    .update({ encouragements_count: newCount })
                    .eq("id", target.id);
            }
        } catch (err) {
            console.warn(
                `update encouragements_count error for ${target.id}:`,
                err?.message || err,
            );
        }
        const nowIso = new Date().toISOString();
        await persistMergedBotMeta(
            bot.user_id,
            (meta) => {
                if (meta.last_action_date !== todayStr) {
                    meta.last_action_date = todayStr;
                    meta.encouraged_today = 1;
                } else {
                    meta.encouraged_today =
                        (Number(meta.encouraged_today) || 0) + 1;
                }
                return meta;
            },
            {
                last_encouraged_at: nowIso,
                last_action_at: nowIso,
            },
        );
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
        const meta = await fetchCurrentBotMeta(bot.user_id, bot.meta);
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

        // Prioritize real users first, then bots (stronger preference)
        const realUsers = candidates.filter((c) => !c.is_bot);
        const botUsers = candidates.filter((c) => c.is_bot);
        realUsers.sort(
            (a, b) => (b.followers_count || 0) - (a.followers_count || 0),
        );
        botUsers.sort(
            (a, b) => (b.followers_count || 0) - (a.followers_count || 0),
        );
        const orderedCandidates = [...realUsers, ...botUsers];

        let followed = 0;
        for (const cand of orderedCandidates) {
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
                // Simuler que le bot a vu les derniers posts de l'utilisateur suivi
                try {
                    const { data: recent, error: recentErr } = await supabase
                        .from("content")
                        .select("id")
                        .eq("user_id", cand.id)
                        .order("created_at", { ascending: false })
                        .limit(3);
                    if (!recentErr && Array.isArray(recent)) {
                        for (const r of recent) {
                            try {
                                await supabase.rpc("increment_views", {
                                    row_id: r.id,
                                });
                            } catch (rvErr) {
                                // ignore individual errors
                            }
                            // tiny delay to avoid DB bursts
                            await sleep(60 + Math.random() * 200);
                        }
                    }
                } catch (rvCatch) {
                    // ignore
                }
                // small delay between follow actions
                await sleep(150 + Math.random() * 500);
            } catch (e) {
                console.warn("followAsBot insert error", e?.message || e);
            }
        }

        // Update meta
        await persistMergedBotMeta(
            bot.user_id,
            (latestMeta) => {
                latestMeta.follow_total =
                    (Number(latestMeta.follow_total) || 0) + followed;
                latestMeta.last_followed_date = todayStr;
                return latestMeta;
            },
            { last_action_at: new Date().toISOString() },
        );
        if (followed > 0)
            console.log(`Bot ${bot.user_id} followed ${followed} user(s)`);
        return followed;
    } catch (e) {
        console.warn(`followAsBot error for ${bot.user_id}:`, e?.message || e);
        return 0;
    }
}

async function viewAsBot(bot, dailyTarget = BOT_DAILY_VIEWS_TARGET) {
    try {
        const todayStr = new Date().toISOString().slice(0, 10);
        const meta = await fetchCurrentBotMeta(bot.user_id, bot.meta);
        const viewedToday =
            meta.last_viewed_date === todayStr
                ? Number(meta.viewed_today) || 0
                : 0;
        const remaining = Math.max(0, Number(dailyTarget) - viewedToday);
        if (remaining <= 0) return 0;

        const seenIds =
            meta.last_viewed_date === todayStr &&
            Array.isArray(meta.viewed_content_ids)
                ? meta.viewed_content_ids.map(String)
                : [];
        const seenSet = new Set(seenIds);

        const { data: candidates, error } = await supabase
            .from("content")
            .select("id, user_id, created_at")
            .neq("user_id", bot.user_id)
            .order("created_at", { ascending: false })
            .limit(1000);
        if (error) throw error;

        const available = (candidates || []).filter(
            (item) => item?.id && !seenSet.has(String(item.id)),
        );
        if (available.length === 0) return 0;

        // Seeded shuffle for deterministic variety per bot/day
        const shuffled = [...available].sort((a, b) => {
            const av = getDeterministicRandom(
                `${bot.user_id}:${todayStr}:view:${a.id}`,
                2147483646,
            );
            const bv = getDeterministicRandom(
                `${bot.user_id}:${todayStr}:view:${b.id}`,
                2147483646,
            );
            return av - bv;
        });

        const targets = shuffled.slice(0, Math.min(remaining, 30));
        let viewed = 0;
        const viewedIds = [];
        for (const target of targets) {
            try {
                await supabase.rpc("increment_views", { row_id: target.id });
                viewed += 1;
                viewedIds.push(String(target.id));
                await sleep(20 + Math.random() * 50);
            } catch (_error) {
                // ignore per-view errors
            }
        }

        if (viewed > 0) {
            const nowIso = new Date().toISOString();
            await persistMergedBotMeta(
                bot.user_id,
                (latestMeta) => {
                    const baseViewed =
                        latestMeta.last_viewed_date === todayStr
                            ? Number(latestMeta.viewed_today) || 0
                            : 0;
                    const baseIds =
                        latestMeta.last_viewed_date === todayStr &&
                        Array.isArray(latestMeta.viewed_content_ids)
                            ? latestMeta.viewed_content_ids.map(String)
                            : [];
                    const mergedIds = Array.from(
                        new Set([...baseIds, ...viewedIds]),
                    ).slice(-180);
                    latestMeta.last_viewed_date = todayStr;
                    latestMeta.viewed_today = baseViewed + viewed;
                    latestMeta.viewed_content_ids = mergedIds;
                    return latestMeta;
                },
                { last_action_at: nowIso },
            );
            console.log(`Bot ${bot.user_id} viewed ${viewed} post(s)`);
        }

        return viewed;
    } catch (e) {
        console.warn(`viewAsBot error for ${bot.user_id}:`, e?.message || e);
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
        const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
        const todayStart = new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
        );
        const todayStr = todayStart.toISOString().slice(0, 10);

        // Fetch all bot posts today to avoid many queries
        const botUserIds = bots.map((b) => b.user_id);
        const { data: postsToday } = await supabase
            .from("content")
            .select("user_id")
            .in("user_id", botUserIds)
            .gte("created_at", todayStart.toISOString());

        const postsCountMap = {};
        (postsToday || []).forEach((p) => {
            postsCountMap[p.user_id] = (postsCountMap[p.user_id] || 0) + 1;
        });

        for (const bot of bots) {
            try {
                const meta =
                    bot.meta && typeof bot.meta === "object"
                        ? bot.meta
                        : bot.meta
                          ? JSON.parse(bot.meta)
                          : {};

                // --- POSTING (0-2 posts) ---
                const numPostsTarget = getDeterministicRandom(
                    bot.user_id + todayStr + "posts",
                    3,
                );
                const currentPosts = postsCountMap[bot.user_id] || 0;

                if (currentPosts < numPostsTarget) {
                    // Spread posts: base hour for first post is schedule_hour, second is +6 hours
                    const baseHour = (Number(bot.schedule_hour) + currentPosts * 6) % 24;
                    const targetMin = getTargetMinutes(
                        baseHour,
                        bot.user_id + todayStr + "post" + currentPosts,
                        30,
                    );

                    if (currentMinutes >= targetMin) {
                        const postResult = await postAsBot(bot);
                        if (postResult) {
                            postsCountMap[bot.user_id] = currentPosts + 1;
                            await sleep(500 + Math.random() * 800);
                        }
                    }
                }

                // --- ENCOURAGING (min 5 per day) ---
                const encouragedToday =
                    meta.last_action_date === todayStr
                        ? Number(meta.encouraged_today) || 0
                        : 0;

                if (encouragedToday < 5) {
                    // Spread throughout the day (every 4 hours approximately)
                    const baseHour = (encouragedToday * 4) % 24;
                    const targetMin = getTargetMinutes(
                        baseHour,
                        bot.user_id + todayStr + "enc" + encouragedToday,
                        60,
                    );

                    if (currentMinutes >= targetMin) {
                        await encourageAsBot(bot);
                        // We don't update local meta here because encourageAsBot updates it in DB
                        // and we refetch bots every loopOnce
                        await sleep(400 + Math.random() * 800);
                    }
                }

                // --- FOLLOWING (jitter) ---
                const lastFollow = meta.last_followed_date;
                const followTotal = Number(meta.follow_total) || 0;

                if (
                    followTotal < MAX_FOLLOWS_PER_BOT &&
                    lastFollow !== todayStr
                ) {
                    // Following with ±30min jitter on a base hour
                    const baseHour = (Number(bot.schedule_hour) + 2) % 24;
                    const targetMin = getTargetMinutes(
                        baseHour,
                        bot.user_id + todayStr + "follow",
                        30,
                    );

                    if (currentMinutes >= targetMin) {
                        await followAsBot(bot, FOLLOW_DAILY_LIMIT);
                        await sleep(300 + Math.random() * 900);
                    }
                }

                // --- VIEWING (up to N posts per day across bots + real users) ---
                const viewed = await viewAsBot(bot, BOT_DAILY_VIEWS_TARGET);
                if (viewed > 0) {
                    await sleep(180 + Math.random() * 420);
                }
            } catch (botErr) {
                console.warn(
                    `Error in loopOnce for bot ${bot.user_id}:`,
                    botErr?.message || botErr,
                );
            }
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
