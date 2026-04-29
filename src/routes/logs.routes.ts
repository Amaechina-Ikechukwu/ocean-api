import { Router } from "express";
import { logViewerAuth } from "../middleware/log-viewer-auth.middleware";
import { getBufferedLogs } from "../services/logger.service";

export const logsRouter = Router();

logsRouter.use(logViewerAuth);

logsRouter.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Ocean API Logs</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; margin: 0; color: #172033; background: #f6f7f9; }
    header { padding: 18px 24px; background: #111827; color: white; }
    main { padding: 20px 24px; }
    .toolbar { display: flex; gap: 12px; flex-wrap: wrap; align-items: end; margin-bottom: 16px; }
    label { display: grid; gap: 4px; font-size: 12px; font-weight: 700; color: #465264; }
    input, select, button { height: 36px; border: 1px solid #c8ced8; border-radius: 6px; padding: 0 10px; background: white; }
    button { cursor: pointer; background: #1f6feb; color: white; border-color: #1f6feb; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; background: white; border: 1px solid #d9dee7; }
    th, td { padding: 10px; border-bottom: 1px solid #e8ebf0; vertical-align: top; text-align: left; font-size: 13px; }
    th { background: #eef2f7; position: sticky; top: 0; z-index: 1; }
    code { white-space: pre-wrap; word-break: break-word; }
    .level { font-weight: 800; text-transform: uppercase; }
    .error { color: #b42318; }
    .warn { color: #b54708; }
    .info { color: #175cd3; }
    .debug, .http { color: #475467; }
  </style>
</head>
<body>
  <header><h1>Ocean API Logs</h1></header>
  <main>
    <form class="toolbar" id="filters">
      <label>Search <input name="q" placeholder="requestId, path, message"></label>
      <label>Level
        <select name="level">
          <option value="">All</option>
          <option value="error">Error</option>
          <option value="warn">Warn</option>
          <option value="info">Info</option>
          <option value="http">HTTP</option>
          <option value="debug">Debug</option>
        </select>
      </label>
      <label>Sort
        <select name="sort">
          <option value="desc">Newest first</option>
          <option value="asc">Oldest first</option>
        </select>
      </label>
      <label>Limit <input name="limit" type="number" min="1" max="5000" value="200"></label>
      <button type="submit">Apply</button>
    </form>
    <table>
      <thead><tr><th>Time</th><th>Level</th><th>Message</th><th>Meta</th></tr></thead>
      <tbody id="rows"><tr><td colspan="4">Loading...</td></tr></tbody>
    </table>
  </main>
  <script>
    const token = new URLSearchParams(location.search).get("token") || "";
    const rows = document.querySelector("#rows");
    const form = document.querySelector("#filters");

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
    }

    async function loadLogs() {
      const params = new URLSearchParams(new FormData(form));
      params.set("token", token);
      const res = await fetch("/logs/data?" + params.toString());
      const json = await res.json();
      rows.innerHTML = json.data.map((entry) => \`
        <tr>
          <td>\${escapeHtml(entry.timestamp)}</td>
          <td class="level \${escapeHtml(entry.level)}">\${escapeHtml(entry.level)}</td>
          <td>\${escapeHtml(entry.message)}</td>
          <td><code>\${escapeHtml(JSON.stringify(entry.meta || {}, null, 2))}</code></td>
        </tr>
      \`).join("") || '<tr><td colspan="4">No logs found</td></tr>';
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      loadLogs();
    });

    loadLogs();
    setInterval(loadLogs, 5000);
  </script>
</body>
</html>`);
});

logsRouter.get("/data", (req, res) => {
  res.json({
    data: getBufferedLogs({
      level: typeof req.query.level === "string" && req.query.level ? req.query.level : undefined,
      q: typeof req.query.q === "string" ? req.query.q : undefined,
      sort: req.query.sort === "asc" ? "asc" : "desc",
      limit: typeof req.query.limit === "string" ? Number(req.query.limit) : undefined
    })
  });
});
