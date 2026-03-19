const app = require("../../server/monetization-server");

module.exports = function handler(req, res) {
    req.url = "/api/monetization/overview";
    req.originalUrl = req.url;
    return app(req, res);
};
