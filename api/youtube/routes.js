/**
 * YouTube Anti-Cold Start Routes
 * Backend API endpoints for fetching and managing YouTube Shorts
 */

const express = require("express");
const router = express.Router();
const YouTubeAPIService = require("../../server/youtube-api-service");

// Middleware to inject Supabase client
const attachSupabase = (req, res, next) => {
    if (!req.supabase) {
        return res.status(500).json({ error: "Supabase client not available" });
    }
    next();
};

// Initialize YouTube service
const youtubeService = new YouTubeAPIService();

/**
 * GET /api/youtube/fetch-batch
 * Fetch a batch of YouTube videos and store in DB
 * Query params: batchCount=5, order=relevance|viewCount
 */
router.get("/fetch-batch", attachSupabase, async (req, res) => {
    try {
        const batchCount = parseInt(req.query.batchCount || 5);
        const order = req.query.order || "relevance";

        console.log("[API] Starting YouTube batch fetch:", {
            batchCount,
            order,
        });

        // Fetch from YouTube API
        const searchResults =
            await youtubeService.searchMultipleBatches(batchCount);

        if (searchResults.allVideos.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No videos found",
                errors: searchResults.errors,
            });
        }

        // De-duplicate by video ID
        const uniqueVideos = Array.from(
            new Map(
                searchResults.allVideos.map((v) => [v.youtube_video_id, v]),
            ).values(),
        );

        // Store in Supabase
        const { data, error } = await req.supabase
            .from("youtube_shorts")
            .upsert(
                uniqueVideos.map((v) => ({
                    ...v,
                    id: v.youtube_video_id,
                })),
                { onConflict: "id" },
            )
            .select();

        if (error) {
            console.error("[API] Supabase error:", error);
            return res
                .status(500)
                .json({ success: false, error: error.message });
        }

        res.json({
            success: true,
            stored: data?.length || 0,
            total_found: uniqueVideos.length,
            quota_used: searchResults.totalQuotaUsed,
            batches_completed: searchResults.batchesCompleted,
            errors: searchResults.errors,
        });
    } catch (error) {
        console.error("[API] Fetch batch error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/youtube/videos
 * Fetch videos from database for feed
 * Query params: limit=20, offset=0, orderBy=quality_score|view_count|published_at
 */
router.get("/videos", attachSupabase, async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit || 20), 100);
        const offset = parseInt(req.query.offset || 0);
        const orderBy = req.query.orderBy || "quality_score";

        const query = req.supabase
            .from("youtube_shorts")
            .select("*")
            .eq("is_active", true)
            .range(offset, offset + limit - 1);

        // Sort by requested field
        switch (orderBy) {
            case "view_count":
                query.order("view_count", { ascending: false });
                break;
            case "published_at":
                query.order("published_at", { ascending: false });
                break;
            case "quality_score":
            default:
                query.order("quality_score", { ascending: false });
                break;
        }

        const { data, error, count } = await query;

        if (error) {
            console.error("[API] Videos fetch error:", error);
            return res
                .status(500)
                .json({ success: false, error: error.message });
        }

        res.json({
            success: true,
            videos: data || [],
            total: count || 0,
            limit,
            offset,
            hasMore: offset + limit < (count || 0),
        });
    } catch (error) {
        console.error("[API] Videos endpoint error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/youtube/video/:id
 * Get single video details
 */
router.get("/video/:id", attachSupabase, async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await req.supabase
            .from("youtube_shorts")
            .select("*")
            .eq("youtube_video_id", id)
            .single();

        if (error || !data) {
            return res
                .status(404)
                .json({ success: false, error: "Video not found" });
        }

        res.json({ success: true, video: data });
    } catch (error) {
        console.error("[API] Single video error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/youtube/video/track
 * Track video view/engagement
 */
router.post("/video/track", attachSupabase, async (req, res) => {
    try {
        const { videoId, eventType } = req.body; // eventType: view, like, share

        if (!videoId || !eventType) {
            return res.status(400).json({
                success: false,
                error: "Missing videoId or eventType",
            });
        }

        // Get current counts
        const { data: video, error: fetchError } = await req.supabase
            .from("youtube_shorts")
            .select("like_count, comment_count")
            .eq("youtube_video_id", videoId)
            .single();

        if (fetchError || !video) {
            return res
                .status(404)
                .json({ success: false, error: "Video not found" });
        }

        // Update based on event type
        let updateData = { updated_at: new Date().toISOString() };

        if (eventType === "like") {
            updateData.like_count = (video.like_count || 0) + 1;
        } else if (eventType === "comment") {
            updateData.comment_count = (video.comment_count || 0) + 1;
        }

        const { data: updated, error: updateError } = await req.supabase
            .from("youtube_shorts")
            .update(updateData)
            .eq("youtube_video_id", videoId)
            .select()
            .single();

        if (updateError) {
            return res
                .status(500)
                .json({ success: false, error: updateError.message });
        }

        res.json({ success: true, video: updated });
    } catch (error) {
        console.error("[API] Track event error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/youtube/video/:id
 * Deactivate a video
 */
router.delete("/video/:id", attachSupabase, async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await req.supabase
            .from("youtube_shorts")
            .update({ is_active: false })
            .eq("youtube_video_id", id)
            .select()
            .single();

        if (error) {
            return res
                .status(500)
                .json({ success: false, error: error.message });
        }

        res.json({ success: true, message: "Video deactivated", video: data });
    } catch (error) {
        console.error("[API] Delete error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/youtube/stats
 * Get system stats
 */
router.get("/stats", attachSupabase, async (req, res) => {
    try {
        const { data: allVideos, count } = await req.supabase
            .from("youtube_shorts")
            .select("*", { count: "exact" })
            .eq("is_active", true);

        const avgQualityScore = allVideos?.length
            ? (
                  allVideos.reduce(
                      (sum, v) => sum + (v.quality_score || 0),
                      0,
                  ) / allVideos.length
              ).toFixed(2)
            : 0;

        const totalViews =
            allVideos?.reduce((sum, v) => sum + (v.view_count || 0), 0) || 0;
        const totalEngagement =
            allVideos?.reduce(
                (sum, v) =>
                    sum + ((v.like_count || 0) + (v.comment_count || 0)),
                0,
            ) || 0;

        res.json({
            success: true,
            stats: {
                total_videos: count || 0,
                avg_quality_score: avgQualityScore,
                total_views: totalViews,
                total_engagement: totalEngagement,
                quota_used: youtubeService.quotaUsed,
                quota_available: youtubeService.hasQuotaAvailable(),
            },
        });
    } catch (error) {
        console.error("[API] Stats error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/youtube/feed/personalized
 * Get videos for feed with user preferences filtering
 * Query: userId (optional), limit=10, offset=0
 */
router.get("/feed/personalized", attachSupabase, async (req, res) => {
    try {
        const userId = req.query.userId;
        const limit = Math.min(parseInt(req.query.limit || 10), 50);
        const offset = parseInt(req.query.offset || 0);

        // Get user preferences if userId provided
        let userPreferences = null;
        if (userId) {
            const { data: prefData } = await req.supabase
                .from("youtube_user_preferences")
                .select("*")
                .eq("user_id", userId)
                .single();
            userPreferences = prefData;
        }

        // Build query with filters
        let query = req.supabase
            .from("youtube_shorts")
            .select("*", { count: "exact" })
            .eq("is_active", true);

        // Apply language filter if preferences set
        if (userPreferences?.preferred_languages?.length > 0) {
            query = query.in("language", userPreferences.preferred_languages);
        }

        // Apply quality score minimum if preferences set
        if (userPreferences?.min_quality_score) {
            query = query.gte(
                "quality_score",
                userPreferences.min_quality_score,
            );
        }

        // Sort by quality by default, randomize for variety
        query = query.order("quality_score", { ascending: false });

        // Apply pagination
        query = query.range(offset, offset + limit - 1);

        const { data, count, error } = await query;

        if (error) {
            console.error("[API] Personalized feed error:", error);
            return res
                .status(500)
                .json({ success: false, error: error.message });
        }

        // Shuffle for variety
        const shuffled = (data || []).sort(() => Math.random() - 0.5);

        res.json({
            success: true,
            videos: shuffled,
            total: count || 0,
            limit,
            offset,
            hasMore: offset + limit < (count || 0),
        });
    } catch (error) {
        console.error("[API] Personalized feed error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/youtube/user-preferences
 * Set or update user video preferences
 * Body: userId, preferred_languages (array), min_quality_score (0-10)
 */
router.post("/user-preferences", attachSupabase, async (req, res) => {
    try {
        const { userId, preferred_languages, min_quality_score } = req.body;

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: "userId is required",
            });
        }

        // Validate input
        const languages = Array.isArray(preferred_languages)
            ? preferred_languages.filter((l) => typeof l === "string")
            : ["en", "fr"];
        const minScore = Math.max(
            0,
            Math.min(10, parseFloat(min_quality_score) || 6),
        );

        const { data, error } = await req.supabase
            .from("youtube_user_preferences")
            .upsert(
                {
                    user_id: userId,
                    preferred_languages: languages,
                    min_quality_score: minScore,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "user_id" },
            )
            .select()
            .single();

        if (error) {
            console.error("[API] Preferences save error:", error);
            return res
                .status(500)
                .json({ success: false, error: error.message });
        }

        res.json({
            success: true,
            preferences: data,
        });
    } catch (error) {
        console.error("[API] User preferences error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/youtube/user-preferences
 * Get user video preferences
 * Query: userId
 */
router.get("/user-preferences", attachSupabase, async (req, res) => {
    try {
        const userId = req.query.userId;

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: "userId is required",
            });
        }

        const { data, error } = await req.supabase
            .from("youtube_user_preferences")
            .select("*")
            .eq("user_id", userId)
            .single();

        if (error && error.code !== "PGRST116") {
            console.error("[API] Get preferences error:", error);
            return res
                .status(500)
                .json({ success: false, error: error.message });
        }

        res.json({
            success: true,
            preferences: data || null,
        });
    } catch (error) {
        console.error("[API] Get preferences error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
