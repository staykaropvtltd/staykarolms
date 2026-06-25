const router = require("express").Router();
const supabase = require("../lib/supabase");
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/roleGuard");

// GET /api/institutions — list all (super-admin) or single (admin)
router.get("/", authenticate, async (req, res, next) => {
  try {
    let query = supabase
      .from("institutions")
      .select("*, profiles(count)")
      .order("created_at", { ascending: false });

    if (req.user.role === "admin") {
      query = query.eq("id", req.user.institution_id).single();
      const { data, error } = await query;
      if (error) return res.status(404).json({ error: "Institution not found" });
      return res.json({ data: [data] });
    }

    if (req.user.role !== "super-admin") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ data: data || [] });
  } catch (err) {
    return next(err);
  }
});

// GET /api/institutions/:id — single institution with counts
router.get("/:id", authenticate, requireRole("super-admin", "admin"), async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("institutions")
      .select(`
        *,
        students:profiles!profiles_institution_id_fkey(count)
      `)
      .eq("id", req.params.id)
      .single();

    if (error) return res.status(404).json({ error: "Institution not found" });
    return res.json({ data });
  } catch (err) {
    return next(err);
  }
});

// POST /api/institutions — create (super-admin only)
router.post(
  "/",
  authenticate,
  requireRole("super-admin"),
  async (req, res, next) => {
    const { name, logo_url, plan } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });

    try {
      const { data, error } = await supabase
        .from("institutions")
        .insert({ name, logo_url, plan: plan || "basic" })
        .select()
        .single();

      if (error) return res.status(400).json({ error: error.message });
      return res.status(201).json({ data });
    } catch (err) {
      return next(err);
    }
  }
);

// PUT /api/institutions/:id — update institution
router.put(
  "/:id",
  authenticate,
  requireRole("super-admin"),
  async (req, res, next) => {
    try {
      const { data, error } = await supabase
        .from("institutions")
        .update(req.body)
        .eq("id", req.params.id)
        .select()
        .single();

      if (error) return res.status(400).json({ error: error.message });
      return res.json({ data });
    } catch (err) {
      return next(err);
    }
  }
);

// DELETE /api/institutions/:id — super-admin only
router.delete(
  "/:id",
  authenticate,
  requireRole("super-admin"),
  async (req, res, next) => {
    try {
      const { error } = await supabase
        .from("institutions")
        .delete()
        .eq("id", req.params.id);

      if (error) return res.status(400).json({ error: error.message });
      return res.json({ data: { message: "Institution deleted" } });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
