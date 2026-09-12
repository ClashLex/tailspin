import { createServer } from "node:http";
import { joinSession, createCanvas } from "@github/copilot-sdk/extension";

const servers = new Map();
const issues = [
    { number: 8, title: "Update our repository coding standards", description: "Define comment philosophy, TSDoc expectations, component contract documentation, and TypeScript formatting guidance.", rationale: "Foundational maintenance improves every subsequent contribution and addresses gaps in contributor guidance." },
    { number: 6, title: "Implement pagination on the game list page", description: "Add paginated data helpers, accessible controls, and unit and Playwright coverage for a growing catalog.", rationale: "This has direct performance and usability impact on the main catalog and needs coordinated data-layer and UI work." },
    { number: 5, title: "Show a catalog summary on the home page", description: "Display total games and average star rating, handle empty and unrated catalogs, and test the deterministic helper.", rationale: "A small, well-scoped improvement can provide visible product value quickly using existing data." },
    { number: 4, title: "Add a publisher page listing that publisher's games", description: "Create prerendered publisher pages with descriptions and reusable game cards, then link publisher names." },
    { number: 3, title: "Show category and publisher descriptions on the game detail page", description: "Surface available descriptions on game details while hiding empty sections gracefully." },
    { number: 2, title: "Allow users to sort the game list", description: "Add accessible title and rating sort options, including sensible ordering for unrated games." },
    { number: 1, title: "Add a search box to find games by title", description: "Add case-insensitive title search with an accessible input and empty state for unmatched games." },
];

function escapeHtml(value) {
    return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function card(issue, priority) {
    return `<article class="card ${priority ? "priority" : ""}">
      <div class="head"><span>#${issue.number}</span><span>${priority ? "Priority" : "Backlog"}</span></div>
      <h3>${escapeHtml(issue.title)}</h3><p>${escapeHtml(issue.description)}</p>
      ${priority ? `<p class="why"><strong>Why now:</strong> ${escapeHtml(issue.rationale)}</p>` : ""}
      <button data-issue="${issue.number}" aria-label="Add issue #${issue.number} to the current session context">Work on #${issue.number}</button>
    </article>`;
}

function renderHtml() {
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Issue triage board</title>
    <style>
      body{margin:0;padding:24px;background:var(--background-color-default,#fff);color:var(--text-color-default,#1f2328);font:14px/1.5 var(--font-sans,system-ui,sans-serif)}
      h1,h2,h3{margin:0}h1{font-size:24px}h2{margin:28px 0 12px;font-size:16px}.intro,.status,p{color:var(--text-color-muted,#656d76)}.intro{margin:6px 0 8px}.status{min-height:20px}
      .lane{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}.card{border:1px solid var(--border-color-default,#d0d7de);border-radius:8px;padding:16px;background:var(--background-color-muted,#f6f8fa);display:flex;flex-direction:column;gap:10px}.priority{border-color:var(--true-color-blue,#0969da);box-shadow:0 0 0 1px var(--true-color-blue,#0969da)}.head{display:flex;justify-content:space-between;font-weight:700}.head span:last-child{font-size:12px;color:var(--text-color-muted,#656d76);font-weight:400}h3{font-size:15px}p{margin:0}.why{padding-top:8px;border-top:1px solid var(--border-color-default,#d0d7de)}button{margin-top:auto;border:1px solid var(--border-color-default,#d0d7de);border-radius:6px;padding:7px 10px;background:var(--accent-emphasis,#0969da);color:var(--color-white,#fff);cursor:pointer;font:inherit}button:focus-visible{outline:2px solid var(--color-focus-outline,#0969da);outline-offset:2px}button:disabled{opacity:.65;cursor:wait}
    </style></head><body>
      <h1>Issue triage board</h1><p class="intro">Open repository issues ranked for quick attention. Use a card button to add an issue to this session.</p><p id="status" class="status" role="status" aria-live="polite"></p>
      <section aria-labelledby="priority-heading"><h2 id="priority-heading">Most likely to need attention now</h2><div class="lane">${issues.slice(0, 3).map((issue) => card(issue, true)).join("")}</div></section>
      <section aria-labelledby="backlog-heading"><h2 id="backlog-heading">Remaining open issues</h2><div class="lane">${issues.slice(3).map((issue) => card(issue, false)).join("")}</div></section>
      <script>
        document.querySelectorAll("button[data-issue]").forEach((button) => button.addEventListener("click", async () => {
          button.disabled = true;
          try { const response = await fetch("/add", {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({number:button.dataset.issue})}); const result = await response.json(); document.querySelector("#status").textContent = result.message; }
          catch { button.disabled = false; document.querySelector("#status").textContent = "Could not add the issue to the session."; }
        }));
      </script></body></html>`;
}

const session = await joinSession({
    canvases: [createCanvas({
        id: "issue-triage-board",
        displayName: "Issue triage board",
        description: "A Kanban board showing the three repository issues most likely to need attention now and the remaining backlog.",
        actions: [{
            name: "add_issue_to_context",
            description: "Add a repository issue from the board to the current session context.",
            inputSchema: { type: "object", properties: { number: { type: "integer" } }, required: ["number"] },
            handler: async (ctx) => {
                const issue = issues.find((candidate) => candidate.number === ctx.input.number);
                if (!issue) return { added: false, message: "Issue not found." };
                await session.send({ prompt: `Add issue #${issue.number} (${issue.title}) to the current context and start working on it.` });
                return { added: true, issue: issue.number };
            },
        }],
        open: async (ctx) => {
            let entry = servers.get(ctx.instanceId);
            if (!entry) {
                const server = createServer((req, res) => {
                    if (req.method === "POST" && req.url === "/add") {
                        let body = "";
                        req.on("data", (chunk) => { body += chunk; });
                        req.on("end", async () => {
                            const issue = issues.find((candidate) => candidate.number === Number.parseInt(JSON.parse(body).number, 10));
                            if (!issue) { res.writeHead(404, { "Content-Type": "application/json" }); res.end(JSON.stringify({ message: "Issue not found." })); return; }
                            await session.send({ prompt: `Add issue #${issue.number} (${issue.title}) to the current context and start working on it.` });
                            res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ message: `Issue #${issue.number} added to the current session context.` }));
                        });
                        return;
                    }
                    res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(renderHtml());
                });
                await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
                const port = server.address().port;
                entry = { server, url: `http://127.0.0.1:${port}/` };
                servers.set(ctx.instanceId, entry);
            }
            return { title: "Issue triage board", url: entry.url };
        },
        onClose: async (ctx) => {
            const entry = servers.get(ctx.instanceId);
            if (entry) { servers.delete(ctx.instanceId); await new Promise((resolve) => entry.server.close(() => resolve())); }
        },
    })],
});
