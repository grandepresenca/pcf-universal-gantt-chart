// Dataverse task extract for the migration validator. READ-ONLY: GET requests only.
// Paste into the DevTools console of a tab open on the Dataverse org
// (https://<org>.crm.dynamics.com/...), signed in as a user who can READ ALL tasks.
// Downloads dataverse-tasks.json. Nothing is written to Dataverse.
(async () => {
  const select = [
    "activityid", "subject", "klein_legacyid", "klein_wbs", "klein_outlinelevel",
    "_klein_parenttaskid_value", "_klein_projectid_value",
  ].join(",");
  const first = "/api/data/v9.2/tasks?$select=" + select + "&$filter=" + encodeURIComponent("klein_legacyid ne null");
  const keep = select.split(",").concat(["_klein_projectid_value@OData.Community.Display.V1.FormattedValue"]);
  const headers = {
    Accept: "application/json",
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0",
    Prefer: 'odata.maxpagesize=5000,odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
  };
  const get = async (url) => {
    for (let attempt = 1; ; attempt++) {
      const r = await fetch(url, { method: "GET", credentials: "include", headers });
      if ((r.status === 429 || r.status === 503) && attempt <= 5) {
        const wait = Number(r.headers.get("Retry-After") || 5);
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
    body.value.forEach((row) => {
      const slim = {};
      keep.forEach((k) => { if (k in row) slim[k] = row[k]; });
      rows.push(slim);
    });
    console.log("Dataverse page " + page + ": " + rows.length + " rows");
    url = body["@odata.nextLink"] || null;
  }
  const file = { header: { source: "dataverse", extractedAt: new Date().toISOString(), url: location.origin + first, count: rows.length }, rows };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: "application/json" }));
  a.download = "dataverse-tasks.json";
  a.click();
  console.log("Done: " + rows.length + " Dataverse tasks -> dataverse-tasks.json");
})().catch((e) => console.error("Dataverse extract FAILED (no file written):", e));
