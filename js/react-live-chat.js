// React-powered live chat renderer (read-only); plugs into existing Supabase events.
// Falls back silently if React is unavailable.
(function () {
    const PLACEHOLDER_AVATAR = "https://placehold.co/32";

    function createStore() {
        let messages = [];
        const subs = new Set();
        const notify = () => subs.forEach((fn) => fn(messages));
        return {
            replace(newList) {
                messages = Array.isArray(newList) ? [...newList] : [];
                notify();
            },
            push(msg) {
                messages = [...messages, msg];
                notify();
            },
            get() {
                return messages;
            },
            subscribe(fn) {
                subs.add(fn);
                fn(messages);
                return () => subs.delete(fn);
            },
        };
    }

    const store = createStore();
    window.liveChatStore = store;

    function formatTime(ts) {
        if (!ts) return "";
        const d = new Date(ts);
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }

    function escapeHtml(value) {
        if (value === null || value === undefined) return "";
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function resolveMessageUserId(msg) {
        return msg?.user_id || msg?.users?.id || msg?.users?.user_id || null;
    }

    function mountReact() {
        if (!window.React || !window.ReactDOM) return;
        const rootEl = document.getElementById("stream-chat-messages");
        if (!rootEl) return;

        const e = React.createElement;
        const { useEffect, useState } = React;

        function useChatMessages() {
            const [list, setList] = useState(store.get());
            useEffect(() => store.subscribe(setList), []);
            return list;
        }

        function ChatMessage({ msg }) {
            const isOwn = msg.user_id && msg.user_id === window.currentUser?.id;
            const className = "chat-message" + (isOwn ? " own-message" : "");
            const username = msg.users?.name || msg.user_name || "Utilisateur";
            const userId = resolveMessageUserId(msg);
            const usernameHtml =
                typeof window.renderUsernameWithBadge === "function" && userId
                    ? window.renderUsernameWithBadge(username, userId)
                    : escapeHtml(username);
            const avatar = msg.users?.avatar || PLACEHOLDER_AVATAR;
            return e(
                "div",
                { className },
                e("img", {
                    src: avatar,
                    className: "chat-avatar",
                    alt: username,
                    loading: "lazy",
                    referrerPolicy: "no-referrer",
                }),
                e(
                    "div",
                    { className: "chat-message-content" },
                    e(
                        "div",
                        { className: "chat-message-header" },
                        e("span", {
                            className: "chat-username",
                            dangerouslySetInnerHTML: { __html: usernameHtml },
                        }),
                        e(
                            "span",
                            { className: "chat-timestamp" },
                            formatTime(msg.created_at),
                        ),
                    ),
                    e(
                        "div",
                        { className: "chat-message-text" },
                        msg.message || "",
                    ),
                ),
            );
        }

        function ChatList() {
            const messages = useChatMessages();
            const [, setBadgeRenderTick] = useState(0);

            useEffect(() => {
                // Badge metadata may load after chat messages; force a lightweight rerender then.
                let previousSignature = "";
                const computeSignature = () => {
                    const usersLoaded = window.hasLoadedUsers ? "1" : "0";
                    const userCount = Array.isArray(window.allUsers)
                        ? window.allUsers.length
                        : 0;
                    let creators = 0;
                    let staff = 0;
                    if (typeof window.getVerifiedBadgeSets === "function") {
                        const sets = window.getVerifiedBadgeSets();
                        creators = sets?.creators?.size || 0;
                        staff = sets?.staff?.size || 0;
                    }
                    return `${usersLoaded}|${userCount}|${creators}|${staff}`;
                };

                const refreshIfNeeded = () => {
                    const nextSignature = computeSignature();
                    if (nextSignature !== previousSignature) {
                        previousSignature = nextSignature;
                        setBadgeRenderTick((n) => n + 1);
                    }
                };

                refreshIfNeeded();
                const timer = window.setInterval(refreshIfNeeded, 1200);
                return () => window.clearInterval(timer);
            }, []);

            useEffect(() => {
                rootEl.scrollTop = rootEl.scrollHeight;
            }, [messages.length]);

            if (!messages || messages.length === 0) {
                return e(
                    "div",
                    { className: "chat-empty" },
                    "Aucun message pour le moment",
                );
            }

            return e(
                React.Fragment,
                null,
                messages.map((m) =>
                    e(ChatMessage, {
                        key: m.id || m.created_at || Math.random(),
                        msg: m,
                    }),
                ),
            );
        }

        ReactDOM.createRoot(rootEl).render(
            e(React.StrictMode, null, e(ChatList)),
        );
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", mountReact, {
            once: true,
        });
    } else {
        mountReact();
    }
})();
