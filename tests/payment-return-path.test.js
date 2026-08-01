const assert = require("assert");
const {
    normalizeReturnPathForBrowser,
} = require("../server/payment-return-paths");

assert.strictEqual(
    normalizeReturnPathForBrowser(
        "/profile?user=abc",
        "/",
        "https://example.com",
    ),
    "/profile.html?user=abc",
);
assert.strictEqual(
    normalizeReturnPathForBrowser(
        "/creator-dashboard",
        "/",
        "https://example.com",
    ),
    "/creator-dashboard.html",
);
assert.strictEqual(
    normalizeReturnPathForBrowser(
        "creator-dashboard.html",
        "/",
        "https://example.com",
    ),
    "/creator-dashboard.html",
);

console.log("payment return path tests passed");
