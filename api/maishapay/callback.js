const { handleMaishaPayCallback } = require("../../server/monetization-server");

module.exports = function handler(req, res) {
    req.params = {
        ...(req.params || {}),
        state: req.params?.state || req.query?.state || null,
    };
    return handleMaishaPayCallback(req, res);
};
