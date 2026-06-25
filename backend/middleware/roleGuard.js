/**
 * Role guard middleware factory.
 * Usage: router.get("/", requireRole("admin", "super-admin"), handler)
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: "Forbidden",
        detail: `Requires one of: ${allowedRoles.join(", ")}. Got: ${req.user.role}`,
      });
    }

    next();
  };
}

module.exports = { requireRole };
