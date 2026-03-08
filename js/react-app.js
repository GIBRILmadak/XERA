(function () {
    function canUseReact() {
        return !!(window.React && window.ReactDOM && window.ReactDOM.createRoot);
    }

    function withCacheBust(url, version) {
        if (!url) return url;
        if (typeof url !== "string") return url;
        if (url.startsWith("data:")) return url;
        const joiner = url.includes("?") ? "&" : "?";
        return `${url}${joiner}v=${encodeURIComponent(version || Date.now())}`;
    }

    function getDiscoverUsers() {
        const list = Array.isArray(window.allUsers) ? window.allUsers : [];
        if (typeof window.sortUsersByLatestRecency === "function") {
            try {
                return window.sortUsersByLatestRecency([...list]);
            } catch (e) {
                return [...list];
            }
        }
        return [...list];
    }

    function renderCardHtml(user) {
        if (!user || !user.id) return "";
        if (typeof window.renderUserCard === "function") {
            try {
                return window.renderUserCard(user.id);
            } catch (e) {
                return "";
            }
        }
        return "";
    }

    function DiscoverGridIsland(props) {
        const React = window.React;
        const [limit, setLimit] = React.useState(props.initialLimit || 18);

        const users = props.users;
        const total = users.length;

        React.useEffect(() => {
            if (limit >= total) return;
            const next = () => setLimit((l) => Math.min(total, l + 24));

            let handle = null;
            if (typeof requestIdleCallback === "function") {
                handle = requestIdleCallback(next, { timeout: 1200 });
                return () => {
                    try {
                        cancelIdleCallback(handle);
                    } catch (e) {
                        /* ignore */
                    }
                };
            }

            const t = setTimeout(next, 150);
            return () => clearTimeout(t);
        }, [limit, total]);

        return React.createElement(
            React.Fragment,
            null,
            users.slice(0, limit).map((u) =>
                React.createElement("div", {
                    key: u.id,
                    dangerouslySetInnerHTML: { __html: renderCardHtml(u) },
                }),
            ),
        );
    }

    function mountDiscover(gridEl) {
        if (!canUseReact()) return false;
        if (!gridEl) return false;

        const React = window.React;
        const users = getDiscoverUsers();

        try {
            if (gridEl.__xeraReactRoot && typeof gridEl.__xeraReactRoot.unmount === "function") {
                gridEl.__xeraReactRoot.unmount();
            }
        } catch (e) {
            /* ignore */
        }

        const root = window.ReactDOM.createRoot(gridEl);
        gridEl.__xeraReactRoot = root;

        root.render(React.createElement(DiscoverGridIsland, { users }));
        return true;
    }

    // Public API used by app-supabase.js
    window.renderDiscoverGridReact = function (gridEl) {
        const el = gridEl || document.querySelector(".discover-grid");
        return mountDiscover(el);
    };

    function ProfileIsland(props) {
        const React = window.React;
        const user = props.user;
        const version = user?.updated_at || user?.updatedAt || Date.now();

        const safeBanner =
            user?.banner &&
            (user.banner.startsWith("http") || user.banner.startsWith("data:"))
                ? user.banner
                : null;
        const safeAvatar =
            user?.avatar &&
            (user.avatar.startsWith("http") || user.avatar.startsWith("data:"))
                ? user.avatar
                : "https://placehold.co/150";

        const [fullHtml, setFullHtml] = React.useState("");
        const [isLoading, setIsLoading] = React.useState(true);

        React.useEffect(() => {
            let canceled = false;
            let idleHandle = null;
            let timerHandle = null;
            (async () => {
                try {
                    if (typeof window.renderProfileTimeline !== "function") {
                        setIsLoading(false);
                        return;
                    }

                    // Defer heavy HTML building to idle time to keep PWA responsive.
                    await new Promise((resolve) => {
                        if (typeof requestIdleCallback === "function") {
                            idleHandle = requestIdleCallback(
                                () => resolve(),
                                { timeout: 900 },
                            );
                        } else {
                            timerHandle = setTimeout(resolve, 40);
                        }
                    });

                    const html = await window.renderProfileTimeline(props.userId);
                    if (canceled) return;
                    setFullHtml(html || "");
                } catch (e) {
                    if (canceled) return;
                    setFullHtml("");
                } finally {
                    if (canceled) return;
                    setIsLoading(false);
                    if (typeof props.onRenderedFull === "function") {
                        props.onRenderedFull();
                    }
                }
            })();
            return () => {
                canceled = true;
                if (idleHandle && typeof cancelIdleCallback === "function") {
                    try {
                        cancelIdleCallback(idleHandle);
                    } catch (e) {
                        /* ignore */
                    }
                }
                if (timerHandle) {
                    try {
                        clearTimeout(timerHandle);
                    } catch (e) {
                        /* ignore */
                    }
                }
            };
        }, [props.userId]);

        if (fullHtml) {
            return React.createElement("div", {
                dangerouslySetInnerHTML: { __html: fullHtml },
            });
        }

        return React.createElement(
            "div",
            { className: "profile-react-shell" },
            safeBanner
                ? React.createElement("img", {
                      src: withCacheBust(safeBanner, version),
                      className: "profile-banner",
                      alt: user?.name ? `Bannière de ${user.name}` : "Bannière",
                      onError: (e) => {
                          try {
                              e.currentTarget.style.display = "none";
                          } catch (err) {}
                      },
                  })
                : null,
            React.createElement(
                "div",
                { className: "profile-hero" },
                React.createElement(
                    "div",
                    { className: "profile-avatar-wrapper" },
                    React.createElement("img", {
                        src: withCacheBust(safeAvatar, version),
                        className: "profile-avatar-img",
                        alt: user?.name ? `Avatar de ${user.name}` : "Avatar",
                        onClick: () =>
                            typeof window.navigateToUserProfile === "function" &&
                            window.navigateToUserProfile(props.userId),
                        style: { cursor: "pointer" },
                    }),
                ),
                React.createElement(
                    "h2",
                    {
                        dangerouslySetInnerHTML: {
                            __html:
                                typeof window.renderUsernameForProfile ===
                                "function"
                                    ? window.renderUsernameForProfile(
                                          user?.name || "Utilisateur",
                                          user?.id,
                                      )
                                    : user?.name || "Utilisateur",
                        },
                    },
                    null,
                ),
                user?.title
                    ? React.createElement(
                          "p",
                          { style: { color: "var(--text-secondary)" } },
                          React.createElement("strong", null, user.title),
                      )
                    : null,
                isLoading
                    ? React.createElement(
                          "div",
                          {
                              className: "loading-state-container profile-skeleton",
                              role: "status",
                              "aria-busy": "true",
                              "aria-live": "polite",
                          },
                          null,
                      )
                    : null,
            ),
        );
    }

    function mountProfile(containerEl, userId, onRenderedFull) {
        if (!canUseReact()) return false;
        if (!containerEl) return false;
        if (!userId) return false;

        const React = window.React;
        const user = typeof window.getUser === "function" ? window.getUser(userId) : null;
        if (!user) return false;

        try {
            if (
                containerEl.__xeraProfileReactRoot &&
                typeof containerEl.__xeraProfileReactRoot.unmount === "function"
            ) {
                containerEl.__xeraProfileReactRoot.unmount();
            }
        } catch (e) {
            /* ignore */
        }

        const root = window.ReactDOM.createRoot(containerEl);
        containerEl.__xeraProfileReactRoot = root;
        root.render(
            React.createElement(ProfileIsland, {
                userId,
                user,
                onRenderedFull,
            }),
        );
        return true;
    }

    window.renderProfileReact = function (containerEl, userId, onRenderedFull) {
        const el = containerEl || document.querySelector(".profile-container");
        return mountProfile(el, userId, onRenderedFull);
    };
})();
