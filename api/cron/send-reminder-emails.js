const {
    sweepReturnReminderEmails,
} = require("../../server/monetization-server");

module.exports = async function handler(req, res) {
    if (req.method !== "GET") {
        return res.status(405).send("Method Not Allowed");
    }

    const result = await sweepReturnReminderEmails(new Date());

    res.status(200).json({
        message: "Reminder email sweep completed.",
        result,
    });
};
