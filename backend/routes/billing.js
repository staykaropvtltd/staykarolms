const router = require("express").Router();
const supabase = require("../lib/supabase");
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/roleGuard");

// GET /api/billing — super-admin sees all, admin sees own institution
router.get("/", authenticate, requireRole("admin", "super-admin"), async (req, res, next) => {
  try {
    let query = supabase.from("billing").select("*, institutions:institution_id(name)");

    if (req.user.role === "admin") {
      query = query.eq("institution_id", req.user.institution_id);
    }

    const { data, error } = await query.order("paid_at", { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ data });
  } catch (err) {
    return next(err);
  }
});

// POST /api/billing — create invoice (super-admin)
router.post("/", authenticate, requireRole("super-admin"), async (req, res, next) => {
  const { institution_id, plan, amount, invoice_url } = req.body;

  if (!institution_id || !plan || !amount) {
    return res.status(400).json({ error: "institution_id, plan, amount are required" });
  }

  try {
    const { data, error } = await supabase
      .from("billing")
      .insert({ institution_id, plan, amount, invoice_url })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(201).json({ data });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
