const router = require("express").Router();
const supabase = require("../lib/supabase");
const authenticate = require("../middleware/auth");

// GET /api/messages — get all conversation threads for current user
router.get("/", authenticate, async (req, res, next) => {
  try {
    // Get messages where user is sender or receiver
    const { data, error } = await supabase
      .from("messages")
      .select(`
        *,
        sender:sender_id ( id, name, email, avatar_url, role ),
        receiver:receiver_id ( id, name, email, avatar_url, role )
      `)
      .or(`sender_id.eq.${req.user.id},receiver_id.eq.${req.user.id}`)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) return res.status(400).json({ error: error.message });

    // Group into threads by the other person
    const threads = {};
    for (const msg of data || []) {
      const otherId = msg.sender_id === req.user.id ? msg.receiver_id : msg.sender_id;
      const otherProfile = msg.sender_id === req.user.id ? msg.receiver : msg.sender;

      if (!threads[otherId]) {
        threads[otherId] = {
          userId: otherId,
          name: otherProfile?.name || "Unknown",
          email: otherProfile?.email || "",
          avatar_url: otherProfile?.avatar_url || "",
          role: otherProfile?.role || "student",
          lastMessage: msg.content,
          lastMessageTime: msg.created_at,
          unread: 0,
          messages: [],
        };
      }

      threads[otherId].messages.push({
        id: msg.id,
        content: msg.content,
        sender_id: msg.sender_id,
        isMe: msg.sender_id === req.user.id,
        read: msg.read,
        created_at: msg.created_at,
      });

      if (!msg.read && msg.receiver_id === req.user.id) {
        threads[otherId].unread++;
      }
    }

    // Sort messages within each thread chronologically
    Object.values(threads).forEach((thread) => {
      thread.messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    });

    return res.json({ data: Object.values(threads) });
  } catch (err) {
    return next(err);
  }
});

// GET /api/messages/unread/count — must be before /:userId to avoid Express shadowing
router.get("/unread/count", authenticate, async (req, res, next) => {
  try {
    const { count, error } = await supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("receiver_id", req.user.id)
      .eq("read", false);

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ data: { count: count || 0 } });
  } catch (err) {
    return next(err);
  }
});

// GET /api/messages/:userId — get thread with specific user
router.get("/:userId", authenticate, async (req, res, next) => {
  try {
    const otherId = req.params.userId;
    const myId = req.user.id;

    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .or(
        `and(sender_id.eq.${myId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${myId})`
      )
      .order("created_at", { ascending: true });

    if (error) return res.status(400).json({ error: error.message });

    // Mark unread messages as read
    await supabase
      .from("messages")
      .update({ read: true })
      .eq("sender_id", otherId)
      .eq("receiver_id", myId)
      .eq("read", false);

    return res.json({
      data: (data || []).map((msg) => ({
        ...msg,
        isMe: msg.sender_id === myId,
      })),
    });
  } catch (err) {
    return next(err);
  }
});

// POST /api/messages — send message
router.post("/", authenticate, async (req, res, next) => {
  const { receiver_id, content } = req.body;

  if (!receiver_id || !content) {
    return res.status(400).json({ error: "receiver_id and content are required" });
  }

  try {
    // Verify receiver belongs to the same institution (super-admin is exempt)
    if (req.user.role !== "super-admin") {
      const { data: receiver, error: receiverErr } = await supabase
        .from("profiles")
        .select("institution_id")
        .eq("id", receiver_id)
        .single();

      if (receiverErr || !receiver) {
        return res.status(404).json({ error: "Recipient not found" });
      }
      if (receiver.institution_id !== req.user.institution_id) {
        return res.status(403).json({ error: "You cannot message users from other institutions" });
      }
    }

    const { data, error } = await supabase
      .from("messages")
      .insert({
        sender_id: req.user.id,
        receiver_id,
        content,
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    // Send notification to recipient
    try {
      await supabase.from("notifications").insert({
        user_id: receiver_id,
        title: "💬 New Message",
        message: `${req.user.name || "Someone"} sent you a message: "${content.substring(0, 50)}${content.length > 50 ? '...' : ''}"`,
        type: "info",
        category: "system",
      });
    } catch (nErr) {
      console.error("[messages] notification error:", nErr.message);
    }

    return res.status(201).json({ data: { ...data, isMe: true } });
  } catch (err) {
    return next(err);
  }
});

// PUT /api/messages/:id/read — mark single message as read
router.put("/:id/read", authenticate, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("messages")
      .update({ read: true })
      .eq("id", req.params.id)
      .eq("receiver_id", req.user.id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ data });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
