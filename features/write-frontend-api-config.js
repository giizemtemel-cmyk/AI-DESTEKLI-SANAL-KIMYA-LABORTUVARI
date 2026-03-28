/**
 * Reads repo-root .env and writes frontend/api-config.js for the browser.
 * Run automatically before `npm start` (prestart).
 */
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const publicUrl = (process.env.PUBLIC_API_URL || "").trim().replace(/\/$/, "");
const port = String(process.env.PORT || "3000").trim();

const content = `/* Otomatik üretildi — elle düzenlemeyin. Kaynak: .env (PUBLIC_API_URL, PORT) */
window.__API_BASE_URL__ = ${JSON.stringify(publicUrl)};
window.__DEV_API_PORT__ = ${JSON.stringify(port)};
`;

const outPath = path.join(__dirname, "..", "frontend", "api-config.js");
fs.writeFileSync(outPath, content, "utf8");
console.log("[config] Wrote", outPath);
