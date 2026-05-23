#!/usr/bin/env node
/**
 * Import Clockify detailed time report CSV into TimeTracker (Supabase).
 *
 * Usage (from timetracker/):
 *   node scripts/import-clockify-ytd.mjs [--dry-run] [--fresh] [--timezone Europe/Madrid]
 *          [--set-workspace-timezone] [--csv path] [--workspace-id uuid]
 *
 * --fresh  Delete existing clients, projects, tasks, tags, and time entries in the
 *          target workspace before importing (keeps workspace, profiles, auth users).
 *
 * Requires in .env.local (or environment):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Idempotent: time entry IDs are deterministic UUIDs derived from each CSV row.
 */

import { createHash, randomBytes } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const { fromZonedTime } = require("date-fns-tz");

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const DEFAULT_CSV = resolve(
  ROOT,
  "supabase/Clockify_Time_Report_Detailed_01_01_2026-22_05_2026.csv"
);

const CLOCKIFY_IMPORT_NS = "a10c0c1f-5e2a-4b8d-9f01-clockify000001";
const PALETTE = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f43f5e",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
];

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const fresh = args.includes("--fresh");
const csvPath =
  args.find((a) => a.startsWith("--csv="))?.slice("--csv=".length) ??
  (args.includes("--csv")
    ? args[args.indexOf("--csv") + 1]
    : DEFAULT_CSV);
const workspaceIdArg =
  args.find((a) => a.startsWith("--workspace-id="))?.slice("--workspace-id=".length) ??
  (args.includes("--workspace-id")
    ? args[args.indexOf("--workspace-id") + 1]
    : undefined);
const timezoneArg =
  args.find((a) => a.startsWith("--timezone="))?.slice("--timezone=".length) ??
  (args.includes("--timezone") ? args[args.indexOf("--timezone") + 1] : undefined);
const setWorkspaceTimezone = args.includes("--set-workspace-timezone");

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === "") {
      process.env[key] = val;
    }
  }
}

function normalizeSupabaseUrl(raw) {
  let u = raw.trim();
  while (u.endsWith("/")) u = u.slice(0, -1);
  if (u.endsWith("/rest/v1")) u = u.slice(0, -"/rest/v1".length);
  if (u.endsWith("/rest")) u = u.slice(0, -"/rest".length);
  while (u.endsWith("/")) u = u.slice(0, -1);
  return u;
}

/** @param {string} line */
function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        q = !q;
      }
    } else if (c === "," && !q) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

/** @param {string} path */
function parseClockifyCsv(path) {
  const text = readFileSync(path, "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const header = parseCsvLine(lines[0]);
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));

  /** @type {Array<Record<string, string>>} */
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    /** @type {Record<string, string>} */
    const row = {};
    for (const [h, j] of Object.entries(idx)) {
      row[h] = (cols[j] ?? "").trim();
    }
    rows.push(row);
  }
  return rows;
}

function colorForName(name) {
  const n = name.trim().toLowerCase();
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function uuidv5(name, namespaceUuid) {
  const ns = Buffer.from(namespaceUuid.replace(/-/g, ""), "hex");
  const hash = createHash("sha1").update(ns).update(name, "utf8").digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.toString("hex").slice(0, 32);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

/**
 * @param {string} dateStr DD/MM/YYYY
 * @param {string} timeStr HH:mm:ss
 * @param {string} timeZone
 */
function clockifyLocalToUtcIso(dateStr, timeStr, timeZone) {
  const [day, month, year] = dateStr.split("/").map((s) => parseInt(s, 10));
  const parts = timeStr.split(":").map((s) => parseInt(s, 10));
  const [hour, minute, second = 0] = parts;
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour)
  ) {
    throw new Error(`Invalid date/time: ${dateStr} ${timeStr}`);
  }
  const local = new Date(year, month - 1, day, hour, minute, second);
  return fromZonedTime(local, timeZone).toISOString();
}

function parseDurationSeconds(durationH) {
  const m = durationH.match(/^(\d+):(\d+):(\d+)$/);
  if (!m) return 0;
  return (
    parseInt(m[1], 10) * 3600 +
    parseInt(m[2], 10) * 60 +
    parseInt(m[3], 10)
  );
}

function entryFingerprint(row) {
  return [
    row.Email.toLowerCase(),
    row.Project,
    row["Start Date"],
    row["Start Time"],
    row["End Date"],
    row["End Time"],
    row.Description,
    row.Task,
    row.Tags,
  ].join("|");
}

/** Remove all tracking data for one workspace (projects cascade to entries, tasks, members). */
async function clearWorkspaceTrackingData(supabase, workspaceId) {
  const { data: projects, error: pErr } = await supabase
    .from("projects")
    .select("id")
    .eq("workspace_id", workspaceId);
  if (pErr) throw pErr;

  const projectIds = (projects ?? []).map((p) => p.id);
  if (projectIds.length > 0) {
    const { error: delProjErr } = await supabase
      .from("projects")
      .delete()
      .eq("workspace_id", workspaceId);
    if (delProjErr) throw delProjErr;
    console.log(`Deleted ${projectIds.length} projects (and cascaded time entries, tasks, members).`);
  }

  const { error: clErr } = await supabase
    .from("clients")
    .delete()
    .eq("workspace_id", workspaceId);
  if (clErr) throw clErr;

  const { error: tagErr } = await supabase
    .from("tags")
    .delete()
    .eq("workspace_id", workspaceId);
  if (tagErr) throw tagErr;

  console.log("Cleared clients and tags for workspace.");
}

async function listAllAuthUsers(supabase) {
  /** @type {import('@supabase/supabase-js').User[]} */
  const users = [];
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const batch = data?.users ?? [];
    users.push(...batch);
    if (batch.length < 200) break;
    page++;
  }
  return users;
}

async function main() {
  loadEnvFile(resolve(__dirname, "../.env.local"));

  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY
  )?.trim();

  if (!rawUrl) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL");
    process.exit(1);
  }
  if (!serviceKey && !dryRun) {
    console.error(
      "Missing SUPABASE_SERVICE_ROLE_KEY (required unless --dry-run). Add it to timetracker/.env.local from Supabase → Project Settings → API."
    );
    process.exit(1);
  }

  if (!existsSync(csvPath)) {
    console.error(`CSV not found: ${csvPath}`);
    process.exit(1);
  }

  const rows = parseClockifyCsv(csvPath);
  console.log(`Parsed ${rows.length} rows from ${csvPath}`);

  const supabase = serviceKey
    ? createClient(normalizeSupabaseUrl(rawUrl), serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

  let workspaceId = workspaceIdArg;
  // Clockify CSV times are in the workspace TZ at export time (not UTC).
  let timeZone = timezoneArg?.trim() || "Europe/Madrid";

  if (supabase) {
    if (!workspaceId) {
      const { data: workspaces, error } = await supabase
        .from("workspaces")
        .select("id, name, timezone")
        .order("created_at", { ascending: true })
        .limit(1);
      if (error) throw error;
      if (!workspaces?.length) {
        console.error("No workspace found. Create one first or pass --workspace-id=");
        process.exit(1);
      }
      workspaceId = workspaces[0].id;
      if (!timezoneArg && workspaces[0].timezone?.trim()) {
        timeZone = workspaces[0].timezone.trim();
      }
      console.log(`Workspace: ${workspaces[0].name} (${workspaceId})`);
    } else if (!timezoneArg) {
      const { data: ws, error } = await supabase
        .from("workspaces")
        .select("timezone")
        .eq("id", workspaceId)
        .maybeSingle();
      if (error) throw error;
      if (ws?.timezone?.trim()) timeZone = ws.timezone.trim();
    }

    console.log(`Import timezone (Clockify local times): ${timeZone}`);

    if (setWorkspaceTimezone && !dryRun) {
      const { error: tzErr } = await supabase
        .from("workspaces")
        .update({ timezone: timeZone })
        .eq("id", workspaceId);
      if (tzErr) throw tzErr;
      console.log(`Updated workspace timezone to ${timeZone}.`);
    }

    if (fresh) {
      if (dryRun) {
        console.log("--fresh: would delete all projects, clients, and tags in this workspace.");
      } else {
        console.log("Clearing existing workspace tracking data…");
        await clearWorkspaceTrackingData(supabase, workspaceId);
      }
    }
  }

  /** @type {Map<string, string>} email -> userId */
  const userIdByEmail = new Map();
  if (supabase) {
    const authUsers = await listAllAuthUsers(supabase);
    for (const u of authUsers) {
      if (u.email) userIdByEmail.set(u.email.toLowerCase(), u.id);
    }
  }

  const emailsInCsv = new Set(rows.map((r) => r.Email.toLowerCase()));
  const missingEmails = [...emailsInCsv].filter((e) => !userIdByEmail.has(e));

  /** @type {Map<string, { displayName: string }>} */
  const displayNameByEmail = new Map();
  for (const row of rows) {
    const email = row.Email.toLowerCase();
    if (!displayNameByEmail.has(email)) {
      const name = row.User?.trim() || email.split("@")[0];
      displayNameByEmail.set(email, { displayName: name });
    }
  }

  if (supabase && missingEmails.length > 0) {
    console.log(`Creating ${missingEmails.length} auth users for emails not in Supabase…`);
    for (const email of missingEmails.sort()) {
      const { displayName } = displayNameByEmail.get(email) ?? {
        displayName: email.split("@")[0],
      };
      if (dryRun) {
        userIdByEmail.set(email, `dry-run-${email}`);
        continue;
      }
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
        password: randomBytes(24).toString("base64url"),
        user_metadata: { full_name: displayName },
      });
      if (error) {
        console.error(`Failed to create user ${email}:`, error.message);
        continue;
      }
      const uid = data.user?.id;
      if (!uid) continue;
      userIdByEmail.set(email, uid);

      await supabase
        .from("profiles")
        .update({
          workspace_id: workspaceId,
          full_name: displayName,
          role: "member",
          is_active: true,
        })
        .eq("id", uid);
    }
  } else if (dryRun && missingEmails.length > 0) {
    for (const email of missingEmails) {
      userIdByEmail.set(email, `dry-run-${email}`);
    }
  }

  // Attach all Clockify users to this workspace
  if (supabase && !dryRun) {
    const csvUserIds = [...emailsInCsv]
      .map((email) => userIdByEmail.get(email))
      .filter((id) => id && !id.startsWith("dry-run"));
    if (csvUserIds.length > 0) {
      await supabase
        .from("profiles")
        .update({ workspace_id: workspaceId, is_active: true })
        .in("id", csvUserIds);
    }
  }

  /** @type {Map<string, string>} lower client name -> id */
  const clientIdByKey = new Map();
  /** @type {Map<string, string>} lower project name -> id */
  const projectIdByKey = new Map();
  /** @type {Map<string, string>} projectId|lower task -> task id */
  const taskIdByKey = new Map();
  /** @type {Map<string, string>} lower tag name -> id */
  const tagIdByKey = new Map();

  if (supabase) {
    const { data: existingClients } = await supabase
      .from("clients")
      .select("id, name")
      .eq("workspace_id", workspaceId);
    for (const c of existingClients ?? []) {
      clientIdByKey.set(c.name.trim().toLowerCase(), c.id);
    }

    const { data: existingProjects } = await supabase
      .from("projects")
      .select("id, name")
      .eq("workspace_id", workspaceId);
    for (const p of existingProjects ?? []) {
      projectIdByKey.set(p.name.trim().toLowerCase(), p.id);
    }

    const { data: existingTags } = await supabase
      .from("tags")
      .select("id, name")
      .eq("workspace_id", workspaceId);
    for (const t of existingTags ?? []) {
      tagIdByKey.set(t.name.trim().toLowerCase(), t.id);
    }
  }

  const clientNamesNeeded = new Set();
  const projectDefs = new Map();
  const taskDefs = new Map();
  const tagNamesNeeded = new Set();

  for (const row of rows) {
    const projectName = row.Project.trim();
    if (!projectName) continue;

    const clientName = row.Client.trim() || null;
    if (clientName) clientNamesNeeded.add(clientName);

    const projectKey = projectName.toLowerCase();
    if (!projectDefs.has(projectKey)) {
      projectDefs.set(projectKey, {
        name: projectName,
        clientName,
        isBillable: row.Billable.toLowerCase() === "yes",
      });
    }

    const taskName = row.Task.trim();
    if (taskName && taskName.toLowerCase() !== projectName.toLowerCase()) {
      taskDefs.set(`${projectKey}|${taskName.toLowerCase()}`, {
        projectKey,
        name: taskName,
      });
    }

    if (row.Tags.trim()) {
      for (const tag of row.Tags.split(",").map((t) => t.trim()).filter(Boolean)) {
        tagNamesNeeded.add(tag);
      }
    }
  }

  const clientsToInsert = [...clientNamesNeeded]
    .filter((n) => !clientIdByKey.has(n.toLowerCase()))
    .map((name) => ({
      id: uuidv5(`client|${workspaceId}|${name.toLowerCase()}`, CLOCKIFY_IMPORT_NS),
      workspace_id: workspaceId,
      name,
      color: colorForName(name),
    }));

  if (clientsToInsert.length > 0) {
    console.log(`Clients to insert: ${clientsToInsert.length}`);
    if (supabase && !dryRun) {
      const { error } = await supabase.from("clients").upsert(clientsToInsert, {
        onConflict: "id",
        ignoreDuplicates: false,
      });
      if (error) throw error;
    }
    for (const c of clientsToInsert) {
      clientIdByKey.set(c.name.toLowerCase(), c.id);
    }
  }

  const projectsToInsert = [];
  for (const [projectKey, def] of projectDefs) {
    if (projectIdByKey.has(projectKey)) continue;
    const clientId = def.clientName
      ? clientIdByKey.get(def.clientName.toLowerCase()) ?? null
      : null;
    const id = uuidv5(
      `project|${workspaceId}|${projectKey}`,
      CLOCKIFY_IMPORT_NS
    );
    projectsToInsert.push({
      id,
      workspace_id: workspaceId,
      client_id: clientId,
      name: def.name,
      color: colorForName(def.name),
      is_billable: def.isBillable,
      is_archived: false,
    });
    projectIdByKey.set(projectKey, id);
  }

  if (projectsToInsert.length > 0) {
    console.log(`Projects to insert: ${projectsToInsert.length}`);
    if (supabase && !dryRun) {
      const { error } = await supabase.from("projects").upsert(projectsToInsert, {
        onConflict: "id",
      });
      if (error) throw error;
    }
  }

  const tasksToInsert = [];
  for (const [key, def] of taskDefs) {
    if (taskIdByKey.has(key)) continue;
    const projectId = projectIdByKey.get(def.projectKey);
    if (!projectId) continue;
    const id = uuidv5(`task|${projectId}|${def.name.toLowerCase()}`, CLOCKIFY_IMPORT_NS);
    tasksToInsert.push({
      id,
      project_id: projectId,
      name: def.name,
      is_archived: false,
    });
    taskIdByKey.set(key, id);
  }

  if (tasksToInsert.length > 0) {
    console.log(`Tasks to insert: ${tasksToInsert.length}`);
    if (supabase && !dryRun) {
      const { error } = await supabase.from("tasks").upsert(tasksToInsert, {
        onConflict: "id",
      });
      if (error) throw error;
    }
  }

  const tagsToInsert = [...tagNamesNeeded]
    .filter((n) => !tagIdByKey.has(n.toLowerCase()))
    .map((name) => ({
      id: uuidv5(`tag|${workspaceId}|${name.toLowerCase()}`, CLOCKIFY_IMPORT_NS),
      workspace_id: workspaceId,
      name,
      color: colorForName(name),
    }));

  if (tagsToInsert.length > 0) {
    console.log(`Tags to insert: ${tagsToInsert.length}`);
    if (supabase && !dryRun) {
      const { error } = await supabase.from("tags").upsert(tagsToInsert, {
        onConflict: "id",
      });
      if (error) throw error;
    }
    for (const t of tagsToInsert) {
      tagIdByKey.set(t.name.toLowerCase(), t.id);
    }
  }

  // Load existing tasks for projects we might reference
  if (supabase) {
    const projectIds = [...projectIdByKey.values()];
    if (projectIds.length > 0) {
      const { data: existingTasks } = await supabase
        .from("tasks")
        .select("id, project_id, name")
        .in("project_id", projectIds);
      for (const t of existingTasks ?? []) {
        const pk = [...projectIdByKey.entries()].find(([, id]) => id === t.project_id)?.[0];
        if (pk) taskIdByKey.set(`${pk}|${t.name.trim().toLowerCase()}`, t.id);
      }
    }
  }

  let skippedZero = 0;
  let skippedNoUser = 0;
  let skippedNoProject = 0;
  let skippedDuplicate = 0;
  /** @type {Map<string, object>} */
  const entriesById = new Map();
  /** @type {Array<{ time_entry_id: string, tag_id: string }>} */
  const entryTags = [];
  const projectMemberPairs = new Set();

  for (const row of rows) {
    const durationSec = parseDurationSeconds(row["Duration (h)"]);
    if (durationSec < 1) {
      skippedZero++;
      continue;
    }

    const email = row.Email.toLowerCase();
    const userId = userIdByEmail.get(email);
    if (!userId) {
      skippedNoUser++;
      continue;
    }

    const projectName = row.Project.trim();
    const projectId = projectIdByKey.get(projectName.toLowerCase());
    if (!projectId) {
      skippedNoProject++;
      continue;
    }

    projectMemberPairs.add(`${projectId}|${userId}`);

    let taskId = null;
    const taskName = row.Task.trim();
    if (taskName && taskName.toLowerCase() !== projectName.toLowerCase()) {
      taskId =
        taskIdByKey.get(`${projectName.toLowerCase()}|${taskName.toLowerCase()}`) ??
        null;
    }

    const startedAt = clockifyLocalToUtcIso(
      row["Start Date"],
      row["Start Time"],
      timeZone
    );
    const endedAt = clockifyLocalToUtcIso(
      row["End Date"],
      row["End Time"],
      timeZone
    );

    const id = uuidv5(entryFingerprint(row), CLOCKIFY_IMPORT_NS);
    const description = row.Description.trim() || null;
    const isBillable = row.Billable.toLowerCase() === "yes";

    let createdAt;
    try {
      createdAt = clockifyLocalToUtcIso(
        row["Date of creation"],
        "12:00:00",
        timeZone
      );
    } catch {
      createdAt = startedAt;
    }

    const entry = {
      id,
      user_id: userId,
      project_id: projectId,
      task_id: taskId,
      description,
      started_at: startedAt,
      ended_at: endedAt,
      is_billable: isBillable,
      created_at: createdAt,
    };
    if (entriesById.has(id)) skippedDuplicate++;
    entriesById.set(id, entry);

    if (row.Tags.trim()) {
      for (const tag of row.Tags.split(",").map((t) => t.trim()).filter(Boolean)) {
        const tagId = tagIdByKey.get(tag.toLowerCase());
        if (tagId) entryTags.push({ time_entry_id: id, tag_id: tagId });
      }
    }
  }

  const entries = [...entriesById.values()];
  console.log(
    `Time entries prepared: ${entries.length} (skipped ${skippedZero} sub-second, ${skippedNoUser} no user, ${skippedNoProject} no project, ${skippedDuplicate} duplicate rows)`
  );
  console.log(`Entry-tag links: ${entryTags.length}`);
  console.log(`Project memberships to ensure: ${projectMemberPairs.size}`);

  if (dryRun) {
    console.log("\nDry run complete — no database writes.");
    return;
  }

  const members = [...projectMemberPairs].map((pair) => {
    const [project_id, user_id] = pair.split("|");
    return { project_id, user_id };
  });

  if (members.length > 0) {
    const chunkSize = 500;
    for (let i = 0; i < members.length; i += chunkSize) {
      const chunk = members.slice(i, i + chunkSize);
      const { error } = await supabase
        .from("project_members")
        .upsert(chunk, { onConflict: "project_id,user_id", ignoreDuplicates: true });
      if (error) throw error;
    }
  }

  const chunkSize = 400;
  for (let i = 0; i < entries.length; i += chunkSize) {
    const chunk = entries.slice(i, i + chunkSize);
    const { error } = await supabase.from("time_entries").upsert(chunk, {
      onConflict: "id",
    });
    if (error) throw error;
    process.stdout.write(
      `\rTime entries: ${Math.min(i + chunkSize, entries.length)} / ${entries.length}`
    );
  }
  console.log("\nTime entries upserted.");

  for (let i = 0; i < entryTags.length; i += chunkSize) {
    const chunk = entryTags.slice(i, i + chunkSize);
    const { error } = await supabase.from("time_entry_tags").upsert(chunk, {
      onConflict: "time_entry_id,tag_id",
      ignoreDuplicates: true,
    });
    if (error) throw error;
  }
  console.log("Entry tags linked.");

  console.log("\nImport finished successfully.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
