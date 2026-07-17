// backend/routes/imports.js
// Universal Question Import — file upload, parse, history, job tracking.

"use strict";

const router = require("express").Router();
const multer = require("multer");
const supabase = require("../lib/supabase");
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/roleGuard");
const { parseFile, MAX_FILE_SIZE } = require("../lib/import-parser");
const { logAudit } = require("../lib/audit");

// ── In-memory job store (fallback when DB table is unavailable) ──────────────────
// Maps jobId → { ...job }
const jobStore = new Map();

function makeJobId() {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Multer ─────────────────────────────────────────────────────────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
});

// ── Helpers ─────────────────────────────────────────────────────────────────────

const JOB_STORE_MAX = 200; // cap in-memory fallback — evict oldest on overflow

function jobStoreSet(key, value) {
  if (!jobStore.has(key) && jobStore.size >= JOB_STORE_MAX) {
    // Map preserves insertion order; delete the oldest entry
    jobStore.delete(jobStore.keys().next().value);
  }
  jobStore.set(key, value);
}

async function saveJob(job) {
  try {
    const { error } = await supabase.from("import_jobs").insert([{
      id: job.id,
      institution_id: job.institution_id,
      test_id: job.test_id || null,
      created_by: job.created_by,
      status: job.status,
      file_name: job.file_name,
      file_type: job.file_type,
      file_size: job.file_size,
      total_questions: job.total_questions,
      inserted: job.inserted,
      skipped: job.skipped,
      failed_count: job.failed_count,
      error_log: job.error_log,
    }]);
    if (error) {
      // Table may not exist yet — store in-memory only
      jobStoreSet(job.id, job);
    }
  } catch {
    jobStoreSet(job.id, job);
  }
}

async function updateJob(jobId, patch) {
  jobStoreSet(jobId, { ...(jobStore.get(jobId) || {}), ...patch });
  try {
    await supabase.from("import_jobs").update(patch).eq("id", jobId);
  } catch { /* ignore */ }
}

async function getJobs(institutionId, limit = 50) {
  try {
    const { data, error } = await supabase
      .from("import_jobs")
      .select("*")
      .eq("institution_id", institutionId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (!error && data) return data;
  } catch { /* ignore */ }
  // Fallback to in-memory
  return [...jobStore.values()]
    .filter(j => j.institution_id === institutionId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, limit);
}

async function getJob(jobId, institutionId) {
  try {
    const { data, error } = await supabase
      .from("import_jobs")
      .select("*")
      .eq("id", jobId)
      .eq("institution_id", institutionId)
      .single();
    if (!error && data) return data;
  } catch { /* ignore */ }
  const job = jobStore.get(jobId);
  return job?.institution_id === institutionId ? job : null;
}

// ── Routes ──────────────────────────────────────────────────────────────────────

/**
 * POST /api/imports/parse
 * Upload a file (multipart) → returns parsed questions for preview.
 * Body: multipart form with field "file".
 * Query: ?sheet=SheetName (optional, for Excel multi-sheet)
 */
router.post(
  "/parse",
  authenticate,
  requireRole("admin", "faculty", "super-admin"),
  upload.single("file"),
  async (req, res, next) => {
    if (!req.file) {
      return res.status(400).json({ error: "A file is required (field name: file)" });
    }

    const { originalname, mimetype, buffer, size } = req.file;
    const sheetName = req.query.sheet;

    try {
      const result = await parseFile(buffer, originalname, mimetype);

      const totalRows = result.rows.length;
      const validCount = result.rows.filter(r => r._errors.length === 0).length;
      const errorCount = totalRows - validCount;

      return res.json({
        data: {
          rows: result.rows,
          fileErrors: result.fileErrors || [],
          sheetNames: result.sheetNames || [],
          activeSheet: result.activeSheet || "",
          stats: { total: totalRows, valid: validCount, errors: errorCount },
          file: {
            name: originalname,
            size,
            ext: originalname.split(".").pop()?.toLowerCase() || "",
          },
        },
      });
    } catch (err) {
      if (err.message.includes("not supported") || err.message.includes("not appear") ||
          err.message.includes("too large") || err.message.includes("Invalid")) {
        return res.status(400).json({ error: err.message });
      }
      return next(err);
    }
  }
);

/**
 * POST /api/imports/parse/sheet
 * Re-parse an already-uploaded Excel file with a different sheet.
 * Body: { buffer: base64, filename, sheet }
 */
router.post(
  "/parse/sheet",
  authenticate,
  requireRole("admin", "faculty", "super-admin"),
  async (req, res, next) => {
    const { buffer: b64, filename, sheet } = req.body;
    if (!b64 || !filename) return res.status(400).json({ error: "buffer and filename are required" });

    try {
      const buffer = Buffer.from(b64, "base64");
      const result = await parseFile(buffer, filename, "");
      return res.json({ data: { rows: result.rows, fileErrors: result.fileErrors || [], sheetNames: result.sheetNames || [], activeSheet: result.activeSheet || "" } });
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * POST /api/imports/jobs
 * Create an import job record (called after successful bulk import).
 * Body: { test_id?, file_name, file_type, file_size, total_questions, inserted, skipped, failed_count, error_log }
 */
router.post(
  "/jobs",
  authenticate,
  requireRole("admin", "faculty", "super-admin"),
  async (req, res, next) => {
    const { test_id, file_name, file_type, file_size, total_questions, inserted, skipped, failed_count, error_log } = req.body;
    if (!file_name) return res.status(400).json({ error: "file_name is required" });

    const job = {
      id: makeJobId(),
      institution_id: req.user.institution_id,
      test_id: test_id || null,
      created_by: req.user.id,
      status: "complete",
      file_name,
      file_type: file_type || "",
      file_size: file_size || 0,
      total_questions: total_questions || 0,
      inserted: inserted || 0,
      skipped: skipped || 0,
      failed_count: failed_count || 0,
      error_log: error_log || [],
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    };

    await saveJob(job);

    try {
      await logAudit({
        userId: req.user.id,
        action: "import_questions",
        resource: "test_questions",
        resourceId: test_id || "none",
        severity: "info",
        metadata: { file_name, inserted, skipped, failed_count },
      });
    } catch { /* audit failure is non-fatal */ }

    return res.status(201).json({ data: job });
  }
);

/**
 * GET /api/imports/jobs
 * List import history for the institution.
 */
router.get(
  "/jobs",
  authenticate,
  requireRole("admin", "faculty", "super-admin"),
  async (req, res, next) => {
    try {
      const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
      const jobs = await getJobs(req.user.institution_id, limit);
      return res.json({ data: jobs });
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * GET /api/imports/jobs/:jobId
 * Get a specific import job.
 */
router.get(
  "/jobs/:jobId",
  authenticate,
  requireRole("admin", "faculty", "super-admin"),
  async (req, res, next) => {
    try {
      const job = await getJob(req.params.jobId, req.user.institution_id);
      if (!job) return res.status(404).json({ error: "Job not found" });
      return res.json({ data: job });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
