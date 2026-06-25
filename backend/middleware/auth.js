const supabase = require("../lib/supabase");

/**
 * Verifies the Supabase JWT from the Authorization header.
 * Attaches req.user = { id, role, institution_id, name, email } on success.
 */
async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  const token = authHeader.replace("Bearer ", "").trim();

  try {
    // Verify the JWT and get the user from Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    // Fetch the profile from our profiles table to get role + institution_id
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, name, email, role, institution_id, avatar_url, phone")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      if (profileError) {
        console.error("Profile fetch error:", profileError);
      }
      return res.status(401).json({ error: "User profile not found" });
    }

    req.user = profile;
    next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    return res.status(500).json({ error: "Authentication failed" });
  }
}

module.exports = authenticate;
