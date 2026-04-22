const crypto = require("crypto");

const MINUTE_MIN = 0;
const MINUTE_MAX = 24 * 60 - 1;

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function getDeterministicRandom(seed, max) {
    const safeMax = Number(max) || 0;
    if (safeMax <= 0) return 0;
    const hash = crypto.createHash("sha1").update(String(seed)).digest("hex");
    return parseInt(hash.slice(0, 8), 16) % safeMax;
}

function buildDistributedMinuteSlots(items, options = {}) {
    const list = Array.isArray(items)
        ? items.filter((item) => item && (item.user_id || item.id))
        : [];
    const result = new Map();
    if (list.length === 0) return result;

    const dayKey = String(options.dayKey || new Date().toISOString().slice(0, 10));
    const actionKey = String(options.actionKey || "action");
    const startMinute = clamp(
        Math.floor(Number(options.startMinute) || 0),
        MINUTE_MIN,
        MINUTE_MAX,
    );
    let endMinute = clamp(
        Math.floor(
            Number.isFinite(Number(options.endMinute))
                ? Number(options.endMinute)
                : MINUTE_MAX,
        ),
        startMinute,
        MINUTE_MAX,
    );
    if (endMinute < startMinute) endMinute = startMinute;

    const span = Math.max(1, endMinute - startMinute + 1);
    const ordered = [...list].sort((a, b) => {
        const aId = String(a.user_id || a.id);
        const bId = String(b.user_id || b.id);
        const aScore = getDeterministicRandom(
            `${dayKey}:${actionKey}:${aId}`,
            2147483646,
        );
        const bScore = getDeterministicRandom(
            `${dayKey}:${actionKey}:${bId}`,
            2147483646,
        );
        if (aScore === bScore) return aId.localeCompare(bId);
        return aScore - bScore;
    });

    const usedMinutes = new Set();
    ordered.forEach((item, index) => {
        const slotMinute =
            startMinute + Math.floor(((index + 0.5) * span) / ordered.length);
        let minute = clamp(slotMinute, startMinute, endMinute);

        while (usedMinutes.has(minute) && minute < endMinute) {
            minute += 1;
        }
        while (usedMinutes.has(minute) && minute > startMinute) {
            minute -= 1;
        }

        usedMinutes.add(minute);
        result.set(String(item.user_id || item.id), minute);
    });

    return result;
}

function getDistributedMinuteForIndex(options = {}) {
    const total = Math.max(1, Math.floor(Number(options.total) || 1));
    const index = clamp(
        Math.floor(Number(options.index) || 0),
        0,
        Math.max(0, total - 1),
    );
    const startMinute = clamp(
        Math.floor(Number(options.startMinute) || 0),
        MINUTE_MIN,
        MINUTE_MAX,
    );
    let endMinute = clamp(
        Math.floor(
            Number.isFinite(Number(options.endMinute))
                ? Number(options.endMinute)
                : MINUTE_MAX,
        ),
        startMinute,
        MINUTE_MAX,
    );
    if (endMinute < startMinute) endMinute = startMinute;

    const span = Math.max(1, endMinute - startMinute + 1);
    return clamp(
        startMinute + Math.floor(((index + 0.5) * span) / total),
        startMinute,
        endMinute,
    );
}

function buildIsoFromMinuteOfDay(dayKey, minuteOfDay, seed = "") {
    const safeMinute = clamp(
        Math.floor(Number(minuteOfDay) || 0),
        MINUTE_MIN,
        MINUTE_MAX,
    );
    const date = new Date(`${dayKey}T00:00:00.000Z`);
    date.setUTCMinutes(safeMinute);
    date.setUTCSeconds(
        getDeterministicRandom(`${dayKey}:${seed}:seconds`, 60),
    );
    return date.toISOString();
}

function getBotDailyEncourageTarget(bot, minDaily = 15) {
    const base = Math.max(15, Math.floor(Number(minDaily) || 15));
    return bot && bot.active === false ? 0 : base;
}

module.exports = {
    buildDistributedMinuteSlots,
    buildIsoFromMinuteOfDay,
    getBotDailyEncourageTarget,
    getDeterministicRandom,
    getDistributedMinuteForIndex,
};
