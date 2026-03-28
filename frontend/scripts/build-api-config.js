/**
 * Vercel build: Environment Variable PUBLIC_API_URL → frontend/api-config.js
 */
const fs = require("fs");
const path = require("path");

const publicUrl = (process.env.PUBLIC_API_URL || "").trim().replace(/\/$/, "");
const content = `/* Vercel build — PUBLIC_API_URL */
window.__API_BASE_URL__ = ${JSON.stringify(publicUrl)};
window.__DEV_API_PORT__ = "3000";
`;

fs.writeFileSync(path.join(__dirname, "..", "api-config.js"), content, "utf8");
console.log("[vercel build] api-config.js PUBLIC_API_URL =", publicUrl || "(empty = same origin)");
