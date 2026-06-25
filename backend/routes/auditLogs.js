const router = require("express").Router();
const supabase = require("../lib/supabase");
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/roleGuard");

// GET /api/audit-logs — super-admin only, paginated
router.get(
  "/",
  authenticate,
  requireRole("super-admin"),
  async (req, res, next) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const offset = (page - 1) * limit;

      let query = supabase
        .from("audit_logs")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (req.query.severity) query = query.eq("severity", req.query.severity);
      if (req.query.action) query = query.ilike("action", `%${req.query.action}%`);
      if (req.query.actor_id) query = query.eq("actor_id", req.query.actor_id);

      const { data, error, count } = await query;
      if (error) return res.status(400).json({ error: error.message });
      return res.json({ data, total: count, page, limit });
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/audit-logs — system or backend inserts a log
router.post(
  "/",
  authenticate,
  requireRole("super-admin", "admin"),
  async (req, res, next) => {
    const { action, resource, resource_id, severity, metadata, status } = req.body;

    if (!action) return res.status(400).json({ error: "action is required" });

    try {
      const { data, error } = await supabase
        .from("audit_logs")
        .insert({
          actor_id: req.user.id,
          actor_email: req.user.email,
          actor_role: req.user.role,
          action,
          resource,
          resource_id,
          severity: severity || "info",
          status: status || "success",
          metadata,
          ip_address: req.ip,
        })
        .select()
        .single();

      if (error) return res.status(400).json({ error: error.message });
      return res.status(201).json({ data });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
