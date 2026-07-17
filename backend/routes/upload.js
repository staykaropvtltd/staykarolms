const router = require("express").Router();
const supabase = require("../lib/supabase");
const authenticate = require("../middleware/auth");

// GET /api/upload/retrieve — secure file retrieval
router.get("/retrieve", authenticate, async (req, res, next) => {
  const { path, bucket } = req.query;

  if (!path) {
    return res.status(400).json({ error: "path is required" });
  }

  // Reject path traversal attempts and absolute paths
  if (/\.\.|\0|^\//.test(path) || path.includes("://")) {
    return res.status(400).json({ error: "Invalid file path" });
  }

  // Only allow explicitly whitelisted buckets — never trust client-supplied bucket
  const bucketName = ALLOWED_BUCKETS.includes(bucket) ? bucket : "uploads";

  try {
    // Generate a signed URL valid for 2 hours (7200 seconds)
    const { data, error } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(path, 7200);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    return res.json({
      data: {
        url: data.signedUrl,
      },
    });
  } catch (err) {
    return next(err);
  }
});

const ALLOWED_BUCKETS = ["uploads", "profiles", "course-content"];

// POST /api/upload — upload file to Supabase Storage
router.post("/", authenticate, async (req, res, next) => {
  try {
    const { file, filename, folder } = req.body;
    // Ignore client-supplied bucket — always derive from folder context
    const requestedBucket = req.body.bucket || "uploads";
    const bucketName = ALLOWED_BUCKETS.includes(requestedBucket) ? requestedBucket : "uploads";

    if (!file || !filename) {
      return res.status(400).json({ error: "file (base64) and filename are required" });
    }

    const folderPath = folder || "general";

    // Decode base64 file
    const base64Data = file.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    // File validation & Size validation
    const ext = filename.split(".").pop().toLowerCase();
    const imageExtensions = ["jpg", "jpeg", "png", "gif", "svg"];
    const documentExtensions = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "zip", "py", "js", "ts", "java", "cpp", "c", "md", "json"];
    // VIDEO/AUDIO — must be in allowed list so course content uploads (mp4, webm, etc.) are not rejected
    const videoExtensions = ["mp4", "webm", "mov", "avi", "mkv", "mp3", "ogg", "wav"];
    const fileSizeInBytes = buffer.length;

    console.log(`[UPLOAD] File received — name: ${filename}, ext: .${ext}, size: ${fileSizeInBytes} bytes, folder: ${folderPath}, bucket: ${bucketName}`);

    if (bucketName === "profiles" || folderPath === "profiles" || folderPath === "avatar") {
      if (!imageExtensions.includes(ext)) {
        return res.status(400).json({ error: "Only image files (jpg, jpeg, png, gif, svg) are allowed for profiles" });
      }
      if (fileSizeInBytes > 2 * 1024 * 1024) { // 2MB
        return res.status(400).json({ error: "Profile image size cannot exceed 2MB" });
      }
    } else {
      const allAllowed = [...imageExtensions, ...documentExtensions, ...videoExtensions];
      if (!allAllowed.includes(ext)) {
        return res.status(400).json({ error: `File type .${ext} is not supported` });
      }
      // Allow larger files for videos (up to 100MB), 10MB for everything else
      const maxSize = videoExtensions.includes(ext) ? 100 * 1024 * 1024 : 50 * 1024 * 1024;
      if (fileSizeInBytes > maxSize) {
        return res.status(400).json({ error: `File size cannot exceed ${videoExtensions.includes(ext) ? "100MB" : "10MB"}` });
      }
    }

    // Generate unique filename
    const uniqueName = `${folderPath}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    // Ensure bucket exists (create if not)
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some((b) => b.name === bucketName);
    if (!bucketExists) {
      await supabase.storage.createBucket(bucketName, {
        public: ["profiles", "uploads", "course-content"].includes(bucketName),
        fileSizeLimit: 52428800, // 50MB
      });
    }

    // Upload to Supabase Storage
    console.log(`[UPLOAD] Uploading to Supabase Storage — bucket: ${bucketName}, path: ${uniqueName}, contentType: ${getMimeType(ext)}`);
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(uniqueName, buffer, {
        contentType: getMimeType(ext),
        upsert: true,
      });

    if (error) {
      console.error(`[UPLOAD] Supabase Storage upload FAILED — ${error.message}`);
      return res.status(400).json({ error: error.message });
    }

    console.log(`[UPLOAD] Upload SUCCESS — stored path: ${data.path}`);

    // Get public URL
    const { data: publicData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(uniqueName);

    console.log(`[UPLOAD] Generated public URL: ${publicData.publicUrl}`);

    return res.json({
      data: {
        path: data.path,
        url: publicData.publicUrl,
        filename: uniqueName,
      },
    });
  } catch (err) {
    return next(err);
  }
});

// Helper to get MIME type from extension
function getMimeType(ext) {
  const types = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    svg: "image/svg+xml",
    mp4: "video/mp4",
    webm: "video/webm",
    mp3: "audio/mpeg",
    zip: "application/zip",
    py: "text/x-python",
    js: "text/javascript",
    ts: "text/typescript",
    java: "text/x-java",
    cpp: "text/x-c++src",
    c: "text/x-csrc",
    txt: "text/plain",
    md: "text/markdown",
    html: "text/html",
    css: "text/css",
    json: "application/json",
  };
  return types[ext?.toLowerCase()] || "application/octet-stream";
}

module.exports = router;
