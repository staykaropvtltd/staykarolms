const router = require("express").Router();
const supabase = require("../lib/supabase");
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/roleGuard");

// GET /api/support-tickets — list tickets (admins see all, users see their own)
router.get("/", authenticate, async (req, res, next) => {
  try {
    let query = supabase
      .from("support_tickets")
      .select(`
        *,
        institutions:institution_id ( name ),
        profiles:raised_by ( name, email ),
        messages:support_ticket_messages (
          id,
          ticket_id,
          sender_id,
          content,
          is_staff,
          created_at,
          profiles:sender_id ( name, email, avatar_url )
        )
      `)
      .order("created_at", { ascending: false });

    // Admins see institutional tickets, super-admin sees all
    if (req.user.role === "admin") {
      query = query.eq("institution_id", req.user.institution_id);
    } else if (req.user.role !== "super-admin") {
      // Regular users only see their own tickets
      query = query.eq("raised_by", req.user.id);
    }

    if (req.query.status) query = query.eq("status", req.query.status);
    if (req.query.priority) query = query.eq("priority", req.query.priority);

    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ data: data || [] });
  } catch (err) {
    return next(err);
  }
});

// GET /api/support-tickets/:id — view ticket details (owner or staff only)
router.get("/:id", authenticate, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("support_tickets")
      .select(`
        *,
        institutions:institution_id ( name ),
        profiles:raised_by ( name, email ),
        messages:support_ticket_messages (
          id,
          ticket_id,
          sender_id,
          content,
          is_staff,
          created_at,
          profiles:sender_id ( name, email, avatar_url )
        )
      `)
      .eq("id", req.params.id)
      .single();

    if (error || !data) return res.status(404).json({ error: "Ticket not found" });

    // Verify access: staff (admin/super-admin) or ticket owner
    if (req.user.role !== "super-admin" && req.user.role !== "admin" && data.raised_by !== req.user.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    return res.json({ data });
  } catch (err) {
    return next(err);
  }
});

// POST /api/support-tickets — create a ticket (any authenticated user)
router.post("/", authenticate, async (req, res, next) => {
  const { subject, priority, category } = req.body;

  if (!subject) return res.status(400).json({ error: "subject is required" });

  try {
    const { data, error } = await supabase
      .from("support_tickets")
      .insert({
        subject,
        institution_id: req.user.institution_id,
        raised_by: req.user.id,
        priority: priority || "medium",
        category: category || "technical",
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    // Audit log
    try {
      await supabase.from("audit_logs").insert({
        actor_id: req.user.id,
        actor_email: req.user.email,
        actor_role: req.user.role,
        action: "create_support_ticket",
        resource: "support_tickets",
        resource_id: data.id,
        severity: "info",
        metadata: { subject },
        ip_address: req.ip,
      });
    } catch (e) {
      console.error("[supportTickets] audit error", e.message);
    }

    return res.status(201).json({ data });
  } catch (err) {
    return next(err);
  }
});

// GET /api/support-tickets/:id/messages — get ticket thread (owner or staff)
router.get("/:id/messages", authenticate, async (req, res, next) => {
  try {
    // Verify access: staff (admin/super-admin) or ticket owner
    const { data: ticket } = await supabase
      .from("support_tickets")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    if (req.user.role !== "super-admin" && req.user.role !== "admin" && ticket.raised_by !== req.user.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { data, error } = await supabase
      .from("support_ticket_messages")
      .select("*, profiles:sender_id ( name, email, avatar_url )")
      .eq("ticket_id", req.params.id)
      .order("created_at", { ascending: true });

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ data: data || [] });
  } catch (err) {
    return next(err);
  }
});

// POST /api/support-tickets/:id/messages — reply to ticket (owner or staff)
router.post("/:id/messages", authenticate, async (req, res, next) => {
  const { content, is_staff } = req.body;
  if (!content) return res.status(400).json({ error: "content is required" });

  try {
    const { data: ticket } = await supabase
      .from("support_tickets")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    // Only staff or ticket owner can post
    if (req.user.role !== "super-admin" && req.user.role !== "admin" && ticket.raised_by !== req.user.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { data, error } = await supabase
      .from("support_ticket_messages")
      .insert({
        ticket_id: req.params.id,
        sender_id: req.user.id,
        content,
        is_staff: is_staff || (req.user.role === "admin" || req.user.role === "super-admin"),
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    // Notify the other party
    try {
      const recipientId = ticket.raised_by === req.user.id ? ticket.assigned_to || null : ticket.raised_by;
      if (recipientId) {
        await supabase.from("notifications").insert({
          user_id: recipientId,
          title: "📩 Support Ticket Update",
          message: `New message on ticket: ${ticket.subject}`,
          type: "info",
          category: "system",
        });
      }
    } catch (nErr) {
      console.error("[supportTickets] notify error", nErr.message);
    }

    // Audit
    try {
      await supabase.from("audit_logs").insert({
        actor_id: req.user.id,
        actor_email: req.user.email,
        actor_role: req.user.role,
        action: "support_ticket_message",
        resource: "support_ticket_messages",
        resource_id: data.id,
        severity: "info",
        metadata: { ticket_id: req.params.id },
        ip_address: req.ip,
      });
    } catch (e) {
      console.error("[supportTickets] audit error", e.message);
    }

    return res.status(201).json({ data });
  } catch (err) {
    return next(err);
  }
});

// PUT /api/support-tickets/:id/status — update status
router.put(
  "/:id/status",
  authenticate,
  requireRole("admin", "super-admin"),
  async (req, res, next) => {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: "status is required" });

    try {
      const { data, error } = await supabase
        .from("support_tickets")
        .update({ status, updated_at: new Date().toISOString() })
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

module.exports = router;
