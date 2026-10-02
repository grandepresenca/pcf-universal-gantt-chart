// PWA (Project Online) task extract for the migration validator. READ-ONLY: GET requests only.
// Paste into the DevTools console of a tab open on the PWA site
// (https://<tenant>.sharepoint.com/teams/kingranch/...), signed in as a user who can see ALL projects
// in reporting (ProjectData). Downloads pwa-tasks.json. Nothing is written to PWA.
(async () => {
  const site = "/teams/kingranch";
  const select = [
    "ProjectId", "ProjectName", "TaskId", "TaskName", "TaskWBS", "TaskOutlineLevel",
    "ParentTaskId", "TaskIsProjectSummary", "TaskIsActive",
  ].join(",");
  const first = site + "/_api/ProjectData/Tasks?$select=" + select;
  const headers = { Accept: "application/json;odata=verbose" };
  const get = async (url) => {
    for (let attempt = 1; ; attempt++) {
      const r = await fetch(url, { method: "GET", credentials: "include", headers });
      if ((r.status === 429 || r.status === 503) && attempt <= 5) {
        const wait = Number(r.headers.get("Retry-After") || 10);
        console.warn("Throttled; retrying in " + wait + "s");
        await new Promise((ok) => setTimeout(ok, wait * 1000));
        continue;
      }
      if (!r.ok) throw new Error("HTTP " + r.status + ": " + (await r.text()).slice(0, 500));
      return r.json();
    }
  };
  const rows = [];
  for (let url = first, page = 1; url; page++) {
    const body = await get(url);
    // OData v3 verbose: { d: { results, __next } }; tolerate the light/no-metadata shapes too.
    const d = body.d || body;
    const results = d.results || d.value || [];
    results.forEach((row) => {
      const slim = {};
      select.split(",").forEach((k) => { if (k in row) slim[k] = row[k]; });
      rows.push(slim);
    });
    console.log("PWA page " + page + ": " + rows.length + " rows");
    url = d.__next || body["odata.nextLink"] || body["@odata.nextLink"] || null;
  }
  const file = { header: { source: "pwa", extractedAt: new Date().toISOString(), url: location.origin + first, count: rows.length }, rows };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: "application/json" }));
  a.download = "pwa-tasks.json";
  a.click();
  console.log("Done: " + rows.length + " PWA tasks -> pwa-tasks.json");
})().catch((e) => console.error("PWA extract FAILED (no file written):", e));
