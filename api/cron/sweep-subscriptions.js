const { sweepExpiredSubscriptions } = require("../../server/monetization-server");

module.exports = async function handler(req, res) {
    if (req.method !== "GET") {
        // Vercel cron jobs typically trigger GET requests
        return res.status(405).send("Method Not Allowed");
    }

    await sweepExpiredSubscriptions();

    res.status(200).json({
        message: "Subscription sweep initiated successfully.",
    });
};
