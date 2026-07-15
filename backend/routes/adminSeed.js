const router = require("express").Router();
const supabase = require("../lib/supabase");
const authenticate = require("../middleware/auth");

// POST /api/admin/seed-exam — TEMP: re-seed the load-test exam via SECURITY DEFINER RPC
// Calls seed_load_test_exam() which runs as postgres (bypasses RLS entirely)
router.post(
  "/seed-exam",
  authenticate,
  async (req, res, next) => {
    try {
      const { data, error } = await supabase.rpc("seed_load_test_exam");
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
