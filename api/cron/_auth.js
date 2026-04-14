function readHeader(req, headerName) {
    if (!req || !req.headers) return "";
    const directValue = req.headers[headerName];
    if (typeof directValue === "string") return directValue.trim();

    const normalizedKey = Object.keys(req.headers).find(
        (key) => key && key.toLowerCase() === String(headerName).toLowerCase(),
    );
    return normalizedKey ? String(req.headers[normalizedKey] || "").trim() : "";
}

function authorizeCronRequest(req) {
    const configuredSecret = String(process.env.CRON_SECRET || "").trim();
    if (!configuredSecret) {
        return { ok: true, unsecured: true };
    }

    const authHeader = readHeader(req, "authorization");
    const bearerToken = authHeader.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length).trim()
        : "";
    const headerSecret = readHeader(req, "x-cron-secret");
    const providedSecret = bearerToken || headerSecret;

    if (providedSecret && providedSecret === configuredSecret) {
        return { ok: true, unsecured: false };
    }

    return {
        ok: false,
        status: 401,
        message: "Unauthorized cron request.",
    };
}

module.exports = {
    authorizeCronRequest,
};
