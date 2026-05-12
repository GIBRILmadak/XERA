/**
 * YouTube Feed Integration
 * Integrates YouTube videos directly into XERA's main discover feed
 * Shows personalized videos mixed with user content
 */

class YouTubeFeedIntegration {
    constructor() {
        this.youtubeVideos = [];
        this.currentUserId = null;
        this.isLoading = false;
        this.hasMore = true;
        this.offset = 0;
        this.limit = 5; // Show 5 YouTube videos per page load
    }

    /**
     * Initialize YouTube feed integration
     * Called when discover grid is being rendered
     */
    async init(userId = null) {
        this.currentUserId = userId || window.currentUserId;
        if (!this.currentUserId) return;

        try {
            // Fetch user preferences
            await this.fetchUserPreferences();
            // Load initial batch of videos
            await this.loadMoreVideos();
        } catch (error) {
            console.warn("[YouTube Feed] Initialization error:", error);
        }
    }

    /**
     * Fetch user preferences from API
     */
    async fetchUserPreferences() {
        try {
            const response = await fetch(
                `/api/youtube/user-preferences?userId=${this.currentUserId}`,
            );
            const result = await response.json();
            if (result.success && result.preferences) {
                this.userPreferences = result.preferences;
            }
        } catch (error) {
            console.warn("[YouTube Feed] Could not fetch preferences:", error);
        }
    }

    /**
     * Load more YouTube videos
     */
    async loadMoreVideos() {
        if (this.isLoading || !this.hasMore) return;

        this.isLoading = true;
        try {
            const url = new URL(
                "/api/youtube/feed/personalized",
                window.location.origin,
            );
            url.searchParams.set("userId", this.currentUserId);
            url.searchParams.set("limit", this.limit);
            url.searchParams.set("offset", this.offset);

            const response = await fetch(url.toString());
            const result = await response.json();

            if (result.success && Array.isArray(result.videos)) {
                this.youtubeVideos.push(...result.videos);
                this.hasMore = result.hasMore !== false;
                this.offset += result.videos.length;
            }
        } catch (error) {
            console.error("[YouTube Feed] Error loading videos:", error);
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Get a random YouTube video from the collection
     * Removes it from the pool so it's not shown twice
     */
    getRandomVideo() {
        if (this.youtubeVideos.length === 0) return null;

        const randomIndex = Math.floor(
            Math.random() * this.youtubeVideos.length,
        );
        const video = this.youtubeVideos[randomIndex];
        this.youtubeVideos.splice(randomIndex, 1);

        // Load more if running low
        if (this.youtubeVideos.length < 3 && this.hasMore) {
            this.loadMoreVideos().catch(() => {});
        }

        return video;
    }

    /**
     * Create an immersive YouTube video card for the feed
     */
    createVideoCard(video) {
        const card = document.createElement("div");
        card.className = "youtube-video-card discover-card";
        card.setAttribute("data-video-id", video.youtube_video_id);

        // Thumbnail with gradient overlay
        const thumbnailHTML = `
            <div class="youtube-card-thumbnail" onclick="window.open('https://www.youtube.com/watch?v=${video.youtube_video_id}', '_blank')">
                <img 
                    src="${video.thumbnail_url || "https://via.placeholder.com/480x270?text=YouTube"}" 
                    alt="${video.title}"
                    loading="lazy"
                    class="thumbnail-image"
                />
                <div class="youtube-card-overlay">
                    <div class="youtube-card-gradient"></div>
                    <div class="youtube-card-content">
                        <div class="youtube-card-header">
                            <span class="youtube-badge">▶ YouTube</span>
                        </div>
                        <div class="youtube-card-footer">
                            <div class="youtube-card-creator-info">
                                <img 
                                    src="${video.channel_logo_url || "https://via.placeholder.com/32x32?text=YT"}"
                                    alt="${this.escapeHtml(video.channel_title || "Creator")}"
                                    class="youtube-creator-avatar"
                                    onerror="this.src='https://via.placeholder.com/32x32?text=YT'"
                                />
                                <p class="youtube-card-creator">${this.escapeHtml(video.channel_title || "Creator")}</p>
                            </div>
                            <h3 class="youtube-card-title">${this.escapeHtml(video.title)}</h3>
                            <div class="youtube-card-stats">
                                <span class="stat">👁 ${this.formatNumber(video.view_count || 0)}</span>
                                <span class="stat">❤️ ${this.formatNumber(video.like_count || 0)}</span>
                                <span class="stat">⭐ ${(video.quality_score || 0).toFixed(1)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        card.innerHTML = thumbnailHTML;

        // Track click
        card.addEventListener("click", () => {
            this.trackVideoView(video.youtube_video_id);
        });

        return card;
    }

    /**
     * Track video view/engagement
     */
    async trackVideoView(videoId) {
        try {
            await fetch("/api/youtube/video/track", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    videoId,
                    eventType: "view",
                }),
            });
        } catch (error) {
            console.warn("[YouTube Feed] Tracking error:", error);
        }
    }

    /**
     * Format large numbers for display
     */
    formatNumber(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
        if (num >= 1000) return (num / 1000).toFixed(1) + "K";
        return String(num);
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }
}

// Create global instance
window.youtubeFeedIntegration = new YouTubeFeedIntegration();

/**
 * Inject YouTube video cards into discover grid
 * Should be called after user cards are rendered
 * Distributes YouTube videos throughout the feed for variety
 */
async function injectYouTubeVideosIntoGrid() {
    const grid = document.querySelector(".discover-grid");
    if (!grid || !window.youtubeFeedIntegration) return;

    try {
        // Wait for initial grid to be populated
        await new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                const cards = grid.querySelectorAll(".user-card");
                if (cards.length > 0) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);
            setTimeout(() => clearInterval(checkInterval), 5000);
        });

        // Initialize YouTube feed if not already done
        if (!window.youtubeFeedIntegration.youtubeVideos.length) {
            await window.youtubeFeedIntegration.init(window.currentUserId);
        }

        // Distribute YouTube videos throughout the grid
        // Show 1 YouTube video every 3-4 user cards
        const userCards = Array.from(grid.querySelectorAll(".user-card"));
        const cardsToProcess = userCards.length;

        if (
            cardsToProcess > 0 &&
            window.youtubeFeedIntegration.youtubeVideos.length > 0
        ) {
            const interval = Math.max(3, Math.floor(cardsToProcess / 5)); // Show ~5 YouTube videos

            for (let i = interval; i < cardsToProcess; i += interval) {
                const youtubeVideo =
                    window.youtubeFeedIntegration.getRandomVideo();
                if (!youtubeVideo) break;

                const videoCard =
                    window.youtubeFeedIntegration.createVideoCard(youtubeVideo);
                const insertPosition = Math.min(i, userCards.length - 1);
                const targetCard = userCards[insertPosition];

                if (targetCard && targetCard.parentNode) {
                    targetCard.parentNode.insertBefore(
                        videoCard,
                        targetCard.nextSibling,
                    );
                    userCards.splice(insertPosition + 1, 0, videoCard);
                }
            }
        }
    } catch (error) {
        console.warn("[YouTube Feed] Injection error:", error);
    }
}

/**
 * Hook into discover grid rendering
 * Called when renderDiscoverGrid() completes
 */
const originalRenderDiscoverGrid = window.renderDiscoverGrid;
if (typeof originalRenderDiscoverGrid === "function") {
    window.renderDiscoverGrid = async function (...args) {
        const result = await originalRenderDiscoverGrid.apply(this, args);
        // Inject YouTube videos after rendering
        setTimeout(() => injectYouTubeVideosIntoGrid(), 500);
        return result;
    };
}

// Fallback: Monitor grid for changes and inject when populated
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
        const observer = new MutationObserver((mutations) => {
            const grid = document.querySelector(".discover-grid");
            if (
                grid &&
                grid.children.length > 0 &&
                !grid.dataset.youtubeInjected
            ) {
                grid.dataset.youtubeInjected = "true";
                injectYouTubeVideosIntoGrid();
            }
        });

        const grid = document.querySelector(".discover-grid");
        if (grid) {
            observer.observe(grid, {
                childList: true,
                subtree: false,
            });
        }
    });
} else {
    const grid = document.querySelector(".discover-grid");
    if (grid) {
        const observer = new MutationObserver(() => {
            if (grid.children.length > 0 && !grid.dataset.youtubeInjected) {
                grid.dataset.youtubeInjected = "true";
                injectYouTubeVideosIntoGrid();
            }
        });
        observer.observe(grid, { childList: true, subtree: false });
    }
}
