/**
 * YouTube Shorts Feed Component
 * Smooth feed display for Anti-Cold Start system
 */

class YouTubeShortsFeed {
    constructor(containerId = "youtube-feed-container") {
        this.container = document.getElementById(containerId);
        this.videos = [];
        this.currentIndex = 0;
        this.isLoading = false;
        this.hasMore = true;
        this.intersectionObserver = null;
        this.videoObservers = new Map();
        this.init();
    }

    async init() {
        if (!this.container) return;

        this.container.innerHTML = `
      <div class="youtube-feed-wrapper">
        <div class="youtube-feed-header">
          <h2>Découvrez les meilleurs contenus</h2>
          <p>Raccourcis vidéo sélectionnés pour vous</p>
        </div>
        <div class="youtube-videos-grid"></div>
        <div class="youtube-feed-loader" style="display:none;">
          <div class="loader-spinner"></div>
          <p>Chargement des vidéos...</p>
        </div>
        <div class="youtube-feed-error" style="display:none;">
          <p>Erreur lors du chargement des vidéos</p>
        </div>
      </div>
    `;

        // Ajouter les styles
        this.injectStyles();

        // Charger les vidéos initiales
        await this.loadVideos();

        // Setup intersection observer pour infinite scroll
        this.setupIntersectionObserver();
    }

    injectStyles() {
        const style = document.createElement("style");
        style.textContent = `
      .youtube-feed-wrapper {
        max-width: 1200px;
        margin: 0 auto;
        padding: 20px;
      }

      .youtube-feed-header {
        text-align: center;
        margin-bottom: 40px;
      }

      .youtube-feed-header h2 {
        font-size: 28px;
        margin: 0 0 8px;
        color: #111827;
      }

      .youtube-feed-header p {
        color: #64748b;
        margin: 0;
        font-size: 14px;
      }

      .youtube-videos-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 24px;
        margin-bottom: 40px;
      }

      .youtube-video-card {
        border-radius: 12px;
        overflow: hidden;
        background: white;
        border: 1px solid #e5e7eb;
        transition: all 0.3s ease;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        height: 100%;
      }

      .youtube-video-card:hover {
        transform: translateY(-4px);
        box-shadow: 0 12px 24px rgba(0, 0, 0, 0.1);
        border-color: #d1d5db;
      }

      .youtube-video-thumbnail {
        position: relative;
        width: 100%;
        padding-bottom: 56.25%;
        background: #f3f4f6;
        overflow: hidden;
      }

      .youtube-video-thumbnail img {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.3s ease;
      }

      .youtube-video-card:hover .youtube-video-thumbnail img {
        transform: scale(1.05);
      }

      .youtube-video-duration {
        position: absolute;
        bottom: 8px;
        right: 8px;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 500;
      }

      .youtube-play-icon {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 56px;
        height: 56px;
        background: rgba(255, 0, 0, 0.8);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.3s ease;
      }

      .youtube-play-icon::after {
        content: '';
        width: 0;
        height: 0;
        border-left: 14px solid white;
        border-top: 8px solid transparent;
        border-bottom: 8px solid transparent;
        margin-left: 3px;
      }

      .youtube-video-card:hover .youtube-play-icon {
        opacity: 1;
      }

      .youtube-video-info {
        padding: 16px;
        flex: 1;
        display: flex;
        flex-direction: column;
      }

      .youtube-video-title {
        font-size: 14px;
        font-weight: 600;
        color: #111827;
        margin: 0 0 8px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        line-height: 1.4;
      }

      .youtube-video-channel {
        font-size: 12px;
        color: #64748b;
        margin: 0 0 8px;
      }

      .youtube-video-stats {
        display: flex;
        gap: 12px;
        font-size: 11px;
        color: #94a3b8;
        margin-top: auto;
      }

      .youtube-video-stat {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .youtube-video-card.skeleton {
        background: linear-gradient(-90deg, #f5f5f5 0%, #e8e8e8 50%, #f5f5f5 100%);
        background-size: 200% 100%;
        animation: shimmer 2s infinite;
      }

      @keyframes shimmer {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }

      .youtube-feed-loader {
        text-align: center;
        padding: 40px 20px;
      }

      .loader-spinner {
        width: 40px;
        height: 40px;
        border: 4px solid #f3f4f6;
        border-top-color: #111827;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin: 0 auto 16px;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      .youtube-feed-loader p {
        color: #64748b;
        margin: 0;
      }

      .youtube-feed-error {
        text-align: center;
        padding: 40px 20px;
        color: #ef4444;
      }

      @media (max-width: 768px) {
        .youtube-videos-grid {
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px;
        }

        .youtube-feed-header h2 {
          font-size: 20px;
        }
      }

      @media (max-width: 480px) {
        .youtube-feed-wrapper {
          padding: 12px;
        }

        .youtube-videos-grid {
          grid-template-columns: 1fr;
          gap: 12px;
        }

        .youtube-feed-header {
          margin-bottom: 24px;
        }
      }
    `;
        document.head.appendChild(style);
    }

    async loadVideos(reset = false) {
        if (this.isLoading || (!this.hasMore && !reset)) return;

        this.isLoading = true;
        const loaderEl = this.container?.querySelector(".youtube-feed-loader");
        if (loaderEl && reset) loaderEl.style.display = "block";

        try {
            const response = await fetch(
                `/api/youtube/videos?limit=20&offset=${reset ? 0 : this.videos.length}&orderBy=quality_score`,
            );

            if (!response.ok) throw new Error("Failed to load videos");

            const data = await response.json();

            if (reset) {
                this.videos = [];
                this.currentIndex = 0;
            }

            this.videos.push(...(data.videos || []));
            this.hasMore = data.hasMore || false;

            this.renderVideos(reset);

            if (loaderEl) loaderEl.style.display = "none";
        } catch (error) {
            console.error("Error loading YouTube videos:", error);
            const errorEl = this.container?.querySelector(
                ".youtube-feed-error",
            );
            if (errorEl) {
                errorEl.style.display = "block";
                errorEl.innerHTML =
                    "<p>Impossible de charger les vidéos. Veuillez réessayer.</p>";
            }
        } finally {
            this.isLoading = false;
        }
    }

    renderVideos(reset = false) {
        const gridEl = this.container?.querySelector(".youtube-videos-grid");
        if (!gridEl) return;

        if (reset) {
            gridEl.innerHTML = "";
        }

        this.videos.slice(this.currentIndex).forEach((video) => {
            const card = this.createVideoCard(video);
            gridEl.appendChild(card);
            this.currentIndex++;
        });
    }

    createVideoCard(video) {
        const card = document.createElement("div");
        card.className = "youtube-video-card";
        card.dataset.videoId = video.youtube_video_id;

        const duration = this.parseDuration(video.duration || "PT0S");
        const views = this.formatNumber(video.view_count || 0);
        const likes = this.formatNumber(video.like_count || 0);

        card.innerHTML = `
      <div class="youtube-video-thumbnail">
        <img 
          src="${this.escapeHtml(video.thumbnail_url || "")}" 
          alt="${this.escapeHtml(video.title || "")}"
          loading="lazy"
        />
        <div class="youtube-play-icon"></div>
        <div class="youtube-video-duration">${duration}</div>
      </div>
      <div class="youtube-video-info">
        <h3 class="youtube-video-title">${this.escapeHtml(video.title || "")}</h3>
        <p class="youtube-video-channel">${this.escapeHtml(video.channel_title || "Unknown Channel")}</p>
        <div class="youtube-video-stats">
          <div class="youtube-video-stat">
            <span>👁</span>
            <span>${views}</span>
          </div>
          <div class="youtube-video-stat">
            <span>👍</span>
            <span>${likes}</span>
          </div>
        </div>
      </div>
    `;

        card.addEventListener("click", () => {
            this.openVideo(video);
        });

        return card;
    }

    openVideo(video) {
        const url = `https://www.youtube.com/watch?v=${video.youtube_video_id}`;
        window.open(url, "_blank");

        // Track view
        this.trackEvent(video.youtube_video_id, "view");
    }

    async trackEvent(videoId, eventType) {
        try {
            await fetch("/api/youtube/video/track", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ videoId, eventType }),
            });
        } catch (error) {
            console.warn("Failed to track event:", error);
        }
    }

    setupIntersectionObserver() {
        if (!this.container) return;

        const gridEl = this.container.querySelector(".youtube-videos-grid");
        if (!gridEl) return;

        this.intersectionObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (
                        entry.isIntersecting &&
                        this.hasMore &&
                        !this.isLoading
                    ) {
                        this.loadVideos();
                    }
                });
            },
            { rootMargin: "100px" },
        );

        // Observe last child
        const lastChild = gridEl.lastElementChild;
        if (lastChild) {
            this.intersectionObserver.observe(lastChild);
        }
    }

    parseDuration(iso8601) {
        const match = iso8601.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
        if (!match) return "0:00";

        const hours = parseInt(match[1] || 0);
        const minutes = parseInt(match[2] || 0);
        const seconds = parseInt(match[3] || 0);

        const totalSeconds = hours * 3600 + minutes * 60 + seconds;
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;

        return `${mins}:${String(secs).padStart(2, "0")}`;
    }

    formatNumber(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
        if (num >= 1000) return (num / 1000).toFixed(1) + "K";
        return String(num);
    }

    escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }

    destroy() {
        if (this.intersectionObserver) {
            this.intersectionObserver.disconnect();
        }
        if (this.container) {
            this.container.innerHTML = "";
        }
    }
}

// Auto-initialize on page load
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
        window.youTubeShortsFeed = new YouTubeShortsFeed();
    });
} else {
    window.youTubeShortsFeed = new YouTubeShortsFeed();
}

// Export for use in other modules
if (typeof module !== "undefined" && module.exports) {
    module.exports = YouTubeShortsFeed;
}
