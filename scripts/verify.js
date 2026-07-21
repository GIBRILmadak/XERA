const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const skipDirectories = new Set([".git", "node_modules"]);

function collectJavaScriptFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        if (entry.isDirectory()) {
            return skipDirectories.has(entry.name)
                ? []
                : collectJavaScriptFiles(path.join(directory, entry.name));
        }
        return entry.isFile() && entry.name.endsWith(".js")
            ? [path.join(directory, entry.name)]
            : [];
    });
}

const jsFiles = collectJavaScriptFiles(root);
for (const file of jsFiles) {
    execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}

JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));

const serverSource = fs.readFileSync(
    path.join(root, "server", "monetization-server.js"),
    "utf8",
);
const forbiddenEmbeddedSecrets = [
    /SUPABASE_SERVICE_ROLE_KEY\s*=\s*["'][^"']+/,
    /VAPID_PRIVATE_KEY\s*=\s*["'][^"']+/,
];
if (forbiddenEmbeddedSecrets.some((pattern) => pattern.test(serverSource))) {
    throw new Error("A server secret is embedded in source code.");
}

console.log(`Verified ${jsFiles.length} JavaScript files and Vercel config.`);
