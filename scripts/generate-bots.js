#!/usr/bin/env node
// Script de génération de comptes bots (utiliser en staging)
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/generate-bots.js 100

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
    global: { headers: { "X-Client-Info": "xera-bot-generator" } }
});

function randomDaysOfWeek(count = 3) {
    const s = new Set();
    while (s.size < count) s.add(Math.floor(Math.random() * 7));
    return Array.from(s).sort();
}

 async function createBot(i) {
     const id = crypto.randomUUID();
     const name = `Bot XERA ${i}`;
     const avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`;
     const scheduleHour = i % 24;
     const encourageDays = randomDaysOfWeek(3);

     try {
         // Upsert user - use name instead of username (users table has no username column)
         const { error: upErr } = await supabase.from("users").upsert({
             id,
             name,
             avatar,
             is_bot: true,
             updated_at: new Date().toISOString(),
         });
         if (upErr) throw upErr;

         // Insert bots table
         const { error: botErr } = await supabase.from("bots").insert({
             user_id: id,
             display_name: name,
             avatar_url: avatar,
             active: false,
             schedule_hour: scheduleHour,
             encourage_days: encourageDays,
             meta: { seeded: true },
         });
         if (botErr) throw botErr;

         console.log(
             `Created bot ${i}: ${id} (${name}) hour=${scheduleHour} days=${encourageDays}`,
         );
         return id;
     } catch (e) {
         console.error(`Failed to create bot ${i}:`, e?.message || e);
         return null;
     }
 }
}

async function main() {
    const target = Math.max(0, Number(process.argv[2] || 50));
    console.log(`Generating ${target} bots ...`);
    for (let i = 1; i <= target; i++) {
        await createBot(i);
        // small delay
        await new Promise((r) => setTimeout(r, 120));
    }
    console.log("Done");
    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
