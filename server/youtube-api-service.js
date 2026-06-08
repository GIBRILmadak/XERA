/**
 * YouTube Data API v3 Service
 * Manages YouTube Shorts fetching with anti-cold-start strategy
 */

const fetch = require("node-fetch");
const dotenv = require("dotenv");

dotenv.config();

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
const DAILY_QUOTA_LIMIT = 10000;
const SEARCH_QUOTA_COST = 100; // Per search request

// Tag collections organized by category
const TAG_COLLECTIONS = {
    buildinpublic: [
        "#buildinpublic",
        "#indiehacker",
        "#diy",
        "#solofounder",
        "#codinglife",
    ],
    general: ["#coding", "#programming", "#developer", "#tech"],
    indieProjects: [
        "#indiedev",
        "#gamedev",
        "#indiegamedev",
        "#codinglife",
        "#creativecoding",
        "#buildinpublic",
    ],
    technologies: [
        "#python",
        "#javascript",
        "#ai",
        "#artificialintelligence",
        "#reactjs",
        "#webdev",
    ],
    learning: [
        "#learncoding",
        "#codingchallenge",
        "#programmer",
        "#computerscience",
    ],
    diy: [
        "#DIY",
        "#creativity",
        "#projects",
        "#maker",
        "#creation",
        "#handmade",
    ],
    shorts: ["#lifehacks", "#diyprojects", "#tips", "#creative"],
    technical: ["#engineering", "#electronics", "#3dprinting", "#craft"],
    tutorials: [
        "#howto",
        "#tutorial",
        "#learning",
        "#codingtutorial",
        "#techreview",
    ],
    career: [
        "#techcareer",
        "#softwareengineer",
        "#studentlife",
        "#codingjourney",
    ],
    trending: [
        "#Shorts",
        "#YouTubeShorts",
        "#Viral",
        "#Trending",
        "#FYP",
        "#ForYou",
    ],
    // French tags
    french: [
        "#informatique",
        "#programmation",
        "#développeur",
        "#codage",
        "#devweb",
        "#devindé",
        "#créationdejeuxvideo",
        "#autodidacte",
        "#entrepreneurtech",
        "#apprendreàcoder",
        "#coursinformatique",
        "#tutofr",
        "#formationgratuite",
    ],
    frenchDiy: [
        "#bricolage",
        "#création",
        "#faitmain",
        "#projetsdiy",
        "#astucebricolage",
        "#récup",
        "#menuiserie",
        "#impression3d",
        "#bricolagefacile",
        "#astucetech",
        "#enuneminute",
    ],
    frenchLearning: [
        "#apprentissage",
        "#tutoriel",
        "#apprendreautrement",
        "#astuce",
        "#ressources",
        "#objectifs",
        "#inspiration",
        "#productivité",
    ],
};

// Flatten all tags for varied queries
const ALL_TAGS = Object.values(TAG_COLLECTIONS).flat();
const EXCLUDED_KEYWORDS = ["humour", "prank", "funny", "comedy"];
const PREFERRED_LANGUAGE = "en";

class YouTubeAPIService {
    constructor(apiKey = YOUTUBE_API_KEY) {
        this.apiKey = apiKey;
        this.quotaUsed = 0;
    }

    /**
     * Check if we have quota available for a search (100 units per search)
     */
    hasQuotaAvailable() {
        return this.quotaUsed < DAILY_QUOTA_LIMIT;
    }

    /**
     * Get random tags from a collection
     */
    getRandomTags(count = 3) {
        const shuffled = [...ALL_TAGS].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, count);
    }

    /**
     * Build search query with quality filters
     */
    buildSearchQuery(tags) {
        const tagString = tags.join(" ");
        return `${tagString} #Shorts`;
    }

    /**
     * Filter videos by quality criteria
     */
    filterByQuality(video) {
        const title = (video.snippet?.title || "").toLowerCase();

        // Exclude unwanted keywords
        for (const keyword of EXCLUDED_KEYWORDS) {
            if (title.includes(keyword.toLowerCase())) {
                return false;
            }
        }

        return true;
    }

    /**
     * Fetch videos from YouTube API with retry logic
     */
    async searchVideos(query, options = {}) {
        if (!this.hasQuotaAvailable()) {
            throw new Error("Daily quota limit exceeded");
        }

        const {
            maxResults = 50,
            order = "relevance",
            videoDuration = "short",
            publishedAfter = null,
            regionCode = "US",
            relevanceLanguage = PREFERRED_LANGUAGE,
        } = options;

        try {
            const params = new URLSearchParams({
                part: "snippet,contentDetails,statistics",
                q: query,
                type: "video",
                videoDuration,
                maxResults,
                order,
                key: this.apiKey,
                relevanceLanguage,
                regionCode,
                safeSearch: "moderate",
            });

            if (publishedAfter) {
                params.append("publishedAfter", publishedAfter);
            }

            const url = `${YOUTUBE_API_BASE}/search?${params.toString()}`;
            const response = await fetch(url, {
                headers: { Accept: "application/json" },
                timeout: 10000,
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(
                    `YouTube API error: ${response.status} - ${errorData.error?.message || "Unknown"}`,
                );
            }

            const data = await response.json();
            this.quotaUsed += SEARCH_QUOTA_COST;

            return {
                success: true,
                videos: data.items || [],
                quotaUsed: this.quotaUsed,
                pageInfo: data.pageInfo || {},
            };
        } catch (error) {
            console.error("YouTube search error:", error.message);
            return {
                success: false,
                videos: [],
                error: error.message,
                quotaUsed: this.quotaUsed,
            };
        }
    }

    /**
     * Fetch multiple batches with different tag combinations
     */
    async searchMultipleBatches(batchCount = 5) {
        const results = {
            allVideos: [],
            batchesCompleted: 0,
            totalQuotaUsed: 0,
            errors: [],
        };

        for (let i = 0; i < batchCount; i++) {
            const tags = this.getRandomTags(2);
            const query = this.buildSearchQuery(tags);

            console.log(
                `[YouTube] Batch ${i + 1}/${batchCount}: Searching for "${query}"`,
            );

            const searchResult = await this.searchVideos(query, {
                maxResults: 50,
                order: i % 2 === 0 ? "relevance" : "viewCount",
            });

            if (!searchResult.success) {
                results.errors.push(searchResult.error);
                continue;
            }

            // Filter and format results
            const filteredVideos = searchResult.videos
                .filter((video) => this.filterByQuality(video))
                .map((video) => this.formatVideoForStorage(video));

            results.allVideos.push(...filteredVideos);
            results.batchesCompleted++;
            results.totalQuotaUsed = searchResult.quotaUsed;

            // Respect API rate limits
            if (i < batchCount - 1) {
                await this.delay(500);
            }
        }

        console.log(
            `[YouTube] Completed ${results.batchesCompleted} batches, found ${results.allVideos.length} videos`,
        );
        return results;
    }

    /**
     * Format YouTube video for database storage
     */
    formatVideoForStorage(video) {
        const snippet = video.snippet || {};
        const contentDetails = video.contentDetails || {};
        const statistics = video.statistics || {};

        return {
            youtube_video_id: video.id?.videoId || "",
            title: snippet.title || "",
            description: snippet.description || "",
            thumbnail_url:
                snippet.thumbnails?.medium?.url ||
                snippet.thumbnails?.default?.url ||
                "",
            channel_title: snippet.channelTitle || "",
            channel_id: snippet.channelId || "",
            channel_logo_url: `https://www.youtube.com/yt4uc/${snippet.channelId}`,
            published_at: snippet.publishedAt || new Date().toISOString(),
            view_count: parseInt(statistics.viewCount || 0),
            like_count: parseInt(statistics.likeCount || 0),
            comment_count: parseInt(statistics.commentCount || 0),
            duration: contentDetails.duration || "PT0S",
            language: "en",
            quality_score: this.calculateQualityScore(statistics, snippet),
            fetched_at: new Date().toISOString(),
            is_active: true,
        };
    }

    /**
     * Calculate quality score for videos
     */
    calculateQualityScore(statistics, snippet) {
        const viewCount = parseInt(statistics.viewCount || 0);
        const likeCount = parseInt(statistics.likeCount || 0);
        const commentCount = parseInt(statistics.commentCount || 0);

        // Engagement ratio
        const engagement = (likeCount + commentCount) / Math.max(viewCount, 1);
        const engagementScore = Math.min(engagement * 100, 10);

        // View popularity score
        const viewScore = Math.min(Math.log(viewCount + 1) / 10, 10);

        // Title quality (length and relevance)
        const titleLength = (snippet.title || "").length;
        const titleScore = titleLength > 10 && titleLength < 100 ? 10 : 5;

        return (
            Math.round(
                (engagementScore * 0.4 + viewScore * 0.4 + titleScore * 0.2) *
                    10,
            ) / 10
        );
    }

    /**
     * Helper: delay between requests
     */
    delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Reset quota (for testing or daily reset)
     */
    resetQuota() {
        this.quotaUsed = 0;
    }
}

module.exports = YouTubeAPIService;
