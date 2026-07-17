const router = require("express").Router();
const supabase = require("../lib/supabase");
const redis = require("../lib/redis");
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/roleGuard");

const UNREAD_TTL_S = 10; // 10-second TTL — fresh enough for sidebar badge

function unreadKey(userId) { return `notif:unread:${userId}`; }

// GET /api/notifications — get notifications for current user
router.get("/", authenticate, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ data });
  } catch (err) {
    return next(err);
  }
});

// GET /api/notifications/history — get history of notifications
router.get("/history", authenticate, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ data });
  } catch (err) {
    return next(err);
  }
});

// PUT /api/notifications/:id/read — mark as read
router.put("/:id/read", authenticate, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", req.params.id)
      .eq("user_id", req.user.id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    await redis.del(unreadKey(req.user.id)); // invalidate cached count
    return res.json({ data });
  } catch (err) {
    return next(err);
  }
});

// POST /api/notifications — admin sends notification to user(s)
router.post(
  "/",
  authenticate,
  requireRole("admin", "faculty", "super-admin"),
  async (req, res, next) => {
    const { user_id, user_ids, title, message, type, category } = req.body;

    if (!title || !message) {
      return res.status(400).json({ error: "title and message are required" });
    }

    try {
      // Support sending to single user or multiple users
      const recipients = user_ids || (user_id ? [user_id] : null);

      if (!recipients || recipients.length === 0) {
        return res.status(400).json({ error: "user_id or user_ids is required" });
      }

      // Tenant isolation: non-super-admins can only notify users in their own institution
      if (req.user.role !== "super-admin") {
        const { data: validProfiles } = await supabase
          .from("profiles")
          .select("id")
          .in("id", recipients)
          .eq("institution_id", req.user.institution_id);
        const validIds = new Set((validProfiles || []).map((p) => p.id));
        const outsiders = recipients.filter((id) => !validIds.has(id));
        if (outsiders.length > 0) {
          return res.status(403).json({ error: "One or more recipients are not in your institution" });
        }
      }

      const rows = recipients.map((uid) => ({
        user_id: uid,
        title,
        message,
        type: type || "info",
        category: category || "system",
      }));

      const { data, error } = await supabase
        .from("notifications")
        .insert(rows)
        .select();

      if (error) return res.status(400).json({ error: error.message });
      return res.status(201).json({ data });
    } catch (err) {
      return next(err);
    }
  }
);

// PUT /api/notifications/read-all — mark all notifications read
router.put("/read-all", authenticate, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", req.user.id)
      .eq("read", false)
      .select();

    if (error) return res.status(400).json({ error: error.message });
    await redis.del(unreadKey(req.user.id)); // invalidate cached count
    return res.json({ data });
  } catch (err) {
    return next(err);
  }
});

// GET /api/notifications/unread/count — unread count for current user
// Cached in Redis for UNREAD_TTL_S seconds — eliminates repeated DB COUNT on every page load.
router.get("/unread/count", authenticate, async (req, res, next) => {
  try {
    const cached = await redis.get(unreadKey(req.user.id));
    if (cached !== null) {
      return res.json({ data: { count: parseInt(cached, 10) } });
    }

    const { count, error } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", req.user.id)
      .eq("read", false);

    if (error) return res.status(400).json({ error: error.message });
    const result = count || 0;
    await redis.set(unreadKey(req.user.id), String(result), UNREAD_TTL_S);
    return res.json({ data: { count: result } });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
