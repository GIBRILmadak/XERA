# ⚡ Quick Start - YouTube Anti-Cold Start (5 Minutes)

## 🚀 Go Live in 5 Steps

### Step 1: Add YouTube API Key (1 min)

```bash
# Edit .env in project root
echo "YOUTUBE_API_KEY=AIzaSy... # Paste your key here" >> /home/g/Bureau/XERA/.env
```

**Get your key:**

- Go to [console.cloud.google.com](https://console.cloud.google.com)
- Create/select project
- Enable "YouTube Data API v3"
- Create API Key
- Paste it above

### Step 2: Setup Database (1 min)

1. Open [Supabase SQL Editor](https://app.supabase.com/project/_/sql)
2. Create new query
3. Paste content from `/sql/youtube-shorts-schema.sql`
4. Click "Run"
5. Wait for "Tables created successfully"

### Step 3: Start Server (30 sec)

```bash
cd /home/g/Bureau/XERA
node server/monetization-server.js
```

Should see:

```
Server running on port 5050
YouTube API routes registered at /api/youtube/*
```

### Step 4: Load Videos (1 min)

Open terminal tab 2:

```bash
curl "http://localhost:5050/api/youtube/fetch-batch?batchCount=1"
```

Wait for response:

```json
{
    "success": true,
    "fetchedVideos": 10,
    "storedVideos": 10
}
```

### Step 5: Open Frontend (30 sec)

Open browser:

```
http://localhost:3000/youtube-demo.html
```

Click "Charger les vidéos" → Videos appear in grid ✅

---

## 🔗 Test URLs

| Test         | URL                                                        |
| ------------ | ---------------------------------------------------------- |
| **Health**   | http://localhost:5050/health                               |
| **Stats**    | http://localhost:5050/api/youtube/stats                    |
| **Fetch**    | http://localhost:5050/api/youtube/fetch-batch?batchCount=1 |
| **Videos**   | http://localhost:5050/api/youtube/videos?limit=10          |
| **Frontend** | http://localhost:3000/youtube-demo.html                    |

---

## 📋 One-Page Checklist

- [ ] YOUTUBE_API_KEY added to `.env`
- [ ] SQL schema executed in Supabase
- [ ] Server started (`node server/...js`)
- [ ] Health check returns 200 OK
- [ ] Fetch-batch returns videos
- [ ] Frontend loads and shows videos
- [ ] Click video → opens in YouTube

---

## 🐛 Quick Troubleshoot

| Issue              | Fix                                |
| ------------------ | ---------------------------------- |
| "key missing"      | Add YOUTUBE_API_KEY to .env        |
| "table not exist"  | Run SQL schema in Supabase         |
| "routes not found" | Restart server                     |
| "no videos"        | Check quota with `/stats` endpoint |
| "console errors"   | Check DevTools F12 Network tab     |

---

## 📚 Next: Deep Dive

Once working, read:

1. `YOUTUBE_SETUP.md` - Complete setup guide
2. `YOUTUBE_VERIFICATION.md` - Full test suite
3. `ANTI_COLD_START_YOUTUBE_API.md` - API documentation

---

## ✅ Done!

You now have a production-ready YouTube anti-cold-start system. 🎉

Next: Deploy to Vercel with env vars set.
