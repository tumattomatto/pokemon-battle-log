const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 5173);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const JSON_PATH = path.join(DATA_DIR, "battle-log.json");
const DEFAULT_DATA = { records: [], seasons: [], partyPresets: [] };

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(JSON_PATH)) writeData(DEFAULT_DATA);

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/api/data" && req.method === "GET") return sendJson(res, readData());
    if (url.pathname === "/api/data" && req.method === "POST") {
      const body = await readBody(req);
      const data = normalizeData(JSON.parse(body || "{}"));
      writeData(data);
      return sendJson(res, { ok: true });
    }
    return serveStatic(url.pathname, res);
  } catch (error) {
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: error.message }));
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log("Battle log app: http://localhost:" + PORT);
    console.log("Data file: " + JSON_PATH);
  });
}

module.exports = { server, readData, writeData };

function readData() {
  try { return normalizeData(JSON.parse(fs.readFileSync(JSON_PATH, "utf8"))); } catch { return DEFAULT_DATA; }
}
function writeData(data) {
  const normalized = normalizeData(data);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(JSON_PATH, JSON.stringify(normalized, null, 2), "utf8");
}
function normalizeData(data) {
  return { records: Array.isArray(data.records) ? data.records : [], seasons: Array.isArray(data.seasons) ? data.seasons : [], partyPresets: Array.isArray(data.partyPresets) ? data.partyPresets : [] };
}
function sendJson(res, data) {
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => { body += chunk; if (body.length > 10_000_000) req.destroy(); });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}
function serveStatic(pathname, res) {
  const cleanPath = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const filePath = path.normalize(path.join(ROOT, cleanPath));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end("Forbidden"); }
  fs.readFile(filePath, (error, content) => {
    if (error) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": contentType(filePath) });
    res.end(content);
  });
}
function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8" }[ext] || "application/octet-stream";
}
