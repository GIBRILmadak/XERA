const app = require("../server/monetization-server");

function forwardToApp(targetPath) {
    return function handler(req, res) {
        const rawUrl = String(req?.url || "");
        const queryIndex = rawUrl.indexOf("?");
        const querySuffix = queryIndex >= 0 ? rawUrl.slice(queryIndex) : "";
        const nextUrl = `${targetPath}${querySuffix}`;

        req.url = nextUrl;
        req.originalUrl = nextUrl;

        return app(req, res);
    };
}

module.exports = {
    forwardToApp,
};
