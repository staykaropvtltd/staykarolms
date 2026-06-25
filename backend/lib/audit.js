const supabase = require("./supabase");

async function logAudit(req, user, action, resource = null, resourceId = null, severity = "info", status = "success", metadata = {}) {
  try {
    const actor_id = user ? user.id : null;
    const actor_email = user ? user.email : null;
    const actor_role = user ? user.role : null;
    const ip_address = req ? req.ip : null;

    const { error } = await supabase.from("audit_logs").insert({
      actor_id,
      actor_email,
      actor_role,
      action,
      resource,
      resource_id: resourceId ? String(resourceId) : null,
      severity: severity || "info",
      status: status || "success",
      metadata,
      ip_address
    });

    if (error) {
      console.error("[logAudit] DB Error inserting audit log:", error.message);
    }
  } catch (err) {
    console.error("[logAudit] Unexpected Error:", err.message);
  }
}

module.exports = { logAudit };
