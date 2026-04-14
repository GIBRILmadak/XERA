const { sweepExpiredSubscriptions } = require("../../server/monetization-server");
const { authorizeCronRequest } = require("./_auth");

module.exports = async function handler(req, res) {
    if (req.method !== "GET") {
        return res.status(405).send("Method Not Allowed");
    }

    const auth = authorizeCronRequest(req);
    if (!auth.ok) {
        return res.status(auth.status || 401).json({
            error: auth.message || "Unauthorized cron request.",
        });
    }

    await sweepExpiredSubscriptions();

    res.status(200).json({
        message: "Subscription sweep initiated successfully.",
    });
};
