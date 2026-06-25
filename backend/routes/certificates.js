const router = require("express").Router();
const supabase = require("../lib/supabase");
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/roleGuard");

// POST /api/certificates/generate — issue a certificate
router.post(
  "/generate",
  authenticate,
  requireRole("admin", "faculty", "super-admin"),
  async (req, res, next) => {
    const { student_id, course_id, file_url } = req.body;

    if (!student_id || !course_id) {
      return res.status(400).json({ error: "student_id and course_id are required" });
    }

    try {
      // Check if already issued
      const { data: existing } = await supabase
        .from("certificates")
        .select("id")
        .eq("student_id", student_id)
        .eq("course_id", course_id)
        .maybeSingle();

      if (existing) {
        return res.status(409).json({ error: "Certificate already issued for this student and course" });
      }

      const crypto = require("crypto");
      const code = crypto.randomBytes(8).toString("hex");

      const { data: cert, error: insertError } = await supabase
        .from("certificates")
        .insert({
          student_id,
          course_id,
          verification_code: code,
        })
        .select()
        .single();

      if (insertError) return res.status(400).json({ error: insertError.message });

      const host = req.get("host");
      const protocol = req.protocol;
      const downloadUrl = `${protocol}://${host}/api/certificates/${cert.id}/download`;

      const { data, error } = await supabase
        .from("certificates")
        .update({ file_url: file_url || downloadUrl })
        .eq("id", cert.id)
        .select()
        .single();

      if (error) return res.status(400).json({ error: error.message });
      return res.status(201).json({ data });
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/certificates/bulk-generate — issue certificates to all eligible students in a course/batch
router.post(
  "/bulk-generate",
  authenticate,
  requireRole("admin", "faculty", "super-admin"),
  async (req, res, next) => {
    const { course_id, batch_id } = req.body;
    if (!course_id) return res.status(400).json({ error: "course_id is required" });

    try {
      // Resolve list of student IDs: from batch membership or course enrollments
      let studentIds = [];
      if (batch_id) {
        const { data: batchStudents, error: bsErr } = await supabase
          .from("batch_students")
          .select("student_id")
          .eq("batch_id", batch_id);
        if (bsErr) return res.status(400).json({ error: bsErr.message });
        studentIds = (batchStudents || []).map(bs => bs.student_id);
      } else {
        const { data: enrollments, error: enrErr } = await supabase
          .from("enrollments")
          .select("student_id")
          .eq("course_id", course_id);
        if (enrErr) return res.status(400).json({ error: enrErr.message });
        studentIds = (enrollments || []).map(e => e.student_id);
      }

      if (studentIds.length === 0) {
        return res.status(404).json({ error: "No students found for the selected course/batch" });
      }

      // Skip students who already have a certificate for this course
      const { data: existing } = await supabase
        .from("certificates")
        .select("student_id")
        .eq("course_id", course_id)
        .in("student_id", studentIds);

      const existingIds = new Set((existing || []).map(e => e.student_id));
      const eligible = studentIds.filter(id => !existingIds.has(id));

      if (eligible.length === 0) {
        return res.json({ data: { issued: 0, skipped: existingIds.size, message: "All students already have certificates for this course" } });
      }

      const crypto = require("crypto");
      const inserts = eligible.map(student_id => ({
        student_id,
        course_id,
        verification_code: crypto.randomBytes(8).toString("hex"),
      }));

      const { data: certs, error: insertError } = await supabase
        .from("certificates")
        .insert(inserts)
        .select();

      if (insertError) return res.status(400).json({ error: insertError.message });

      return res.status(201).json({
        data: { issued: certs.length, skipped: existingIds.size, total: studentIds.length },
      });
    } catch (err) {
      return next(err);
    }
  }
);

// GET /api/certificates/:id/download — render completion certificate
router.get("/:id/download", authenticate, async (req, res, next) => {
  try {
    const { data: cert, error } = await supabase
      .from("certificates")
      .select(`
        *,
        profiles:student_id ( name, email ),
        courses:course_id ( title )
      `)
      .eq("id", req.params.id)
      .single();

    if (error || !cert) {
      return res.status(404).send("Certificate not found");
    }

    const studentName = cert.profiles?.name || "Student Name";
    const courseTitle = cert.courses?.title || "Course Title";
    const issueDate = cert.issued_at ? new Date(cert.issued_at).toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' }) : new Date().toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' });
    const code = cert.verification_code || "N/A";

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Certificate of Completion - ${studentName}</title>
    <style>
        body {
            font-family: 'Georgia', serif;
            background-color: #f7f9fa;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            padding: 20px;
        }
        .certificate-container {
            border: 20px solid #C9A84C;
            padding: 40px;
            background-color: #ffffff;
            width: 800px;
            text-align: center;
            box-shadow: 0 0 20px rgba(0,0,0,0.1);
            position: relative;
        }
        .logo {
            font-size: 24px;
            font-weight: bold;
            color: #C9A84C;
            text-transform: uppercase;
            letter-spacing: 4px;
            margin-bottom: 20px;
        }
        .title {
            font-size: 36px;
            font-weight: normal;
            color: #1a1a1a;
            margin-bottom: 5px;
        }
        .subtitle {
            font-size: 16px;
            font-style: italic;
            color: #666666;
            margin-bottom: 40px;
        }
        .presented-to {
            font-size: 18px;
            color: #666666;
            margin-bottom: 10px;
        }
        .student-name {
            font-size: 40px;
            font-weight: bold;
            color: #C9A84C;
            border-bottom: 2px solid #E8C96A;
            display: inline-block;
            padding-bottom: 5px;
            margin-bottom: 20px;
            font-family: 'Times New Roman', serif;
        }
        .achievement {
            font-size: 16px;
            color: #333333;
            line-height: 1.6;
            margin: 20px auto;
            max-width: 600px;
        }
        .course-title {
            font-size: 24px;
            font-weight: bold;
            color: #1a1a1a;
            margin-bottom: 30px;
        }
        .meta-container {
            display: flex;
            justify-content: space-between;
            margin-top: 50px;
            padding: 0 50px;
        }
        .meta-item {
            text-align: center;
        }
        .meta-value {
            font-weight: bold;
            font-size: 14px;
            color: #1a1a1a;
            border-bottom: 1px solid #cccccc;
            padding-bottom: 5px;
            margin-bottom: 5px;
            min-width: 150px;
        }
        .meta-label {
            font-size: 11px;
            color: #888888;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .badge {
            width: 80px;
            height: 80px;
            border-radius: 50%;
            background-color: #C9A84C;
            color: #ffffff;
            display: flex;
            justify-content: center;
            align-items: center;
            font-weight: bold;
            font-size: 12px;
            border: 4px double #ffffff;
            margin: 0 auto;
            box-shadow: 0 0 0 4px #C9A84C;
        }
        .verification {
            position: absolute;
            bottom: 20px;
            left: 20px;
            font-size: 10px;
            color: #999999;
            font-family: monospace;
        }
    </style>
</head>
<body>
    <div class="certificate-container">
        <div class="logo">StayKaro LMS</div>
        <div class="title">Certificate of Completion</div>
        <div class="subtitle">This is proudly presented to</div>
        
        <div class="student-name">${studentName}</div>
        
        <div class="achievement">
            for successfully completing all requirements and demonstrating proficiency in the course
        </div>
        <div class="course-title">${courseTitle}</div>
        
        <div class="badge">VERIFIED</div>
        
        <div class="meta-container">
            <div class="meta-item">
                <div class="meta-value">${issueDate}</div>
                <div class="meta-label">Date Issued</div>
            </div>
            <div class="meta-item">
                <div class="meta-value">StayKaro Academy</div>
                <div class="meta-label">Authorized Signatory</div>
            </div>
        </div>
        
        <div class="verification">Credential ID: ${code}</div>
    </div>
</body>
</html>
    `;
    res.setHeader("Content-Type", "text/html");
    return res.send(htmlContent);
  } catch (err) {
    return res.status(500).send("Error generating certificate download file");
  }
});

// GET /api/certificates/verify/:code — public verification endpoint
router.get("/verify/:code", async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("certificates")
      .select(`
        *,
        profiles:student_id ( name, email ),
        courses:course_id ( title )
      `)
      .eq("verification_code", req.params.code)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: "Certificate not found" });
    }

    return res.json({ data });
  } catch (err) {
    return next(err);
  }
});

// GET /api/certificates — list certificates for current user or institution
router.get("/", authenticate, async (req, res, next) => {
  try {
    let query = supabase
      .from("certificates")
      .select("*, profiles:student_id(name, email), courses:course_id(title)");

    if (req.user.role === "student") {
      query = query.eq("student_id", req.user.id);
    }

    const { data, error } = await query.order("issued_at", { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ data });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
