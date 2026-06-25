import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "react-router";
import { Upload, Video, FileText, FileQuestion, Code2, Trash2, Plus, X, FolderOpen, Loader2, Eye } from "lucide-react";
import { PageHeader } from "@/shared/components/PageHeader";
import { Button } from "@/shared/components/ui/button";
import { toast } from "sonner";
import { getCourses, getCourseContent, addCourseContent, getCourseModules, createCourseModule, deleteCourseContent, uploadCourseFile } from "@/shared/lib/api";

const FILE_ICONS: Record<string, React.ReactNode> = {
  video: <Video className="w-5 h-5 text-[var(--gold)]" />,
  pdf: <FileText className="w-5 h-5 text-red-500" />,
  quiz: <FileQuestion className="w-5 h-5 text-[var(--gold)]" />,
  code: <Code2 className="w-5 h-5 text-[var(--gold)]" />,
};

const FILE_BG: Record<string, string> = {
  video: "bg-[var(--gold-muted)]",
  pdf: "bg-red-500/10",
  quiz: "bg-[var(--gold-muted)]",
  code: "bg-[var(--gold-muted)]",
};

/** Open content URL in a new tab. PDFs render natively in all modern browsers. */
function openContentUrl(url: string | undefined) {
  if (!url) {
    toast.error("No file URL available for this content.");
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

function UploadModal({ courseId, moduleId, onClose, onSuccess }: { courseId: string; moduleId: string | null; onClose: () => void; onSuccess: () => void }) {
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("video");
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    setFiles(Array.from(e.dataTransfer.files));
  };

  const handleUpload = async () => {
    if (!title || files.length === 0) return;
    setLoading(true);
    try {
      // Step 1: Upload file to Supabase Storage via backend
      setUploadProgress("Uploading file…");
      const file = files[0];

      const { data: uploadData, error: uploadError } = await uploadCourseFile(file, "course-content");

      if (uploadError || !uploadData) {
        toast.error(uploadError || "File upload failed. Make sure the backend server is running.");
        return;
      }

      // Step 2: Save content record with real URL
      setUploadProgress("Saving content record…");
      await addCourseContent(courseId, {
        title,
        module_id: moduleId,
        type: type.toLowerCase(),
        url: uploadData.url,
        duration_mins: 15,
      });

      toast.success("Content uploaded successfully");
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || "Failed to upload");
    } finally {
      setLoading(false);
      setUploadProgress("");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Upload Content</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Content type</label>
            <select value={type} onChange={e => setType(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
              <option value="video">Video lecture</option>
              <option value="pdf">PDF / Notes</option>
              <option value="quiz">Quiz</option>
              <option value="code">Code starter</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder="e.g. OOP Concepts — Part 1" />
          </div>

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-accent/20"}`}
          >
            <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Drop files here or click to browse</p>
            <p className="text-xs text-muted-foreground mt-1">MP4, PDF, ZIP, PY up to 10MB</p>
            <input ref={inputRef} type="file" multiple className="hidden" onChange={e => setFiles(Array.from(e.target.files ?? []))} />
          </div>

          {files.length > 0 && (
            <div className="space-y-2">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg">
                  <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm text-foreground flex-1 truncate">{f.name}</span>
                  <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-foreground">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {uploadProgress && (
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" /> {uploadProgress}
            </p>
          )}
        </div>
        <div className="flex gap-2 p-6 pt-0">
          <Button className="flex-1 gap-2" disabled={files.length === 0 || !title || loading} onClick={handleUpload}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Upload {files.length > 0 ? `(${files.length})` : ""}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

export function CourseContentPage() {
  const [searchParams] = useSearchParams();
  const initialCourseId = searchParams.get("courseId");

  const [courses, setCourses] = useState<any[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(initialCourseId);
  const [modules, setModules] = useState<any[]>([]);
  const [showUploadForModule, setShowUploadForModule] = useState<string | null>(null);
  const [expandedMod, setExpandedMod] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [showNewModule, setShowNewModule] = useState(false);
  const [newModuleTitle, setNewModuleTitle] = useState("");
  const [creatingModule, setCreatingModule] = useState(false);

  useEffect(() => {
    async function init() {
      setLoading(true);
      const { data } = await getCourses();
      setCourses(data || []);
      if (!initialCourseId && data && data.length > 0) {
        setSelectedCourseId(data[0].id);
      }
      setLoading(false);
    }
    init();
  }, [initialCourseId]);

  const loadContent = async () => {
    if (!selectedCourseId) return;

    const [{ data: modsData }, { data: contentData }] = await Promise.all([
      getCourseModules(selectedCourseId),
      getCourseContent(selectedCourseId)
    ]);

    let rawModules = modsData || [];
    const content = contentData || [];

    if (rawModules.length === 0) {
      rawModules = [{ id: "general", title: "General Module", order_index: 0 }];
    }

    const structuredModules = rawModules.map((m: any) => ({
      ...m,
      lessons: content.filter((c: any) => c.module_id === m.id || (m.id === "general" && !c.module_id)).length,
      duration: "Flexible",
      status: "Published",
      resources: content.filter((c: any) => c.module_id === m.id || (m.id === "general" && !c.module_id))
    }));

    setModules(structuredModules);
    if (structuredModules.length > 0 && !expandedMod) {
      setExpandedMod(structuredModules[0].id);
    }
  };

  useEffect(() => {
    loadContent();
  }, [selectedCourseId]);

  if (loading) {
    return (
      <div className="p-8 flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const handleCreateModule = async () => {
    if (!newModuleTitle.trim() || !selectedCourseId) return;
    setCreatingModule(true);
    await createCourseModule(selectedCourseId, { title: newModuleTitle });
    setNewModuleTitle("");
    setShowNewModule(false);
    setCreatingModule(false);
    loadContent();
  };

  const handleDelete = async (courseId: string, contentId: string) => {
    if (!window.confirm("Are you sure you want to delete this content? This action cannot be undone.")) return;
    setDeletingId(contentId);
    try {
      const { error } = await deleteCourseContent(courseId, contentId);
      if (error) {
        toast.error(error);
      } else {
        toast.success("Content deleted successfully");
        await loadContent();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to delete content");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="p-8">
      {showUploadForModule && selectedCourseId && (
        <UploadModal
          courseId={selectedCourseId}
          moduleId={showUploadForModule === "general" ? null : showUploadForModule}
          onClose={() => setShowUploadForModule(null)}
          onSuccess={() => {
            setShowUploadForModule(null);
            loadContent();
          }}
        />
      )}

      <PageHeader
        title="Course Content"
        description="Upload videos, PDFs, quizzes, and code starters for your modules."
        actions={
          <Button size="sm" className="gap-2" onClick={() => setShowNewModule(true)} disabled={!selectedCourseId}>
            <Plus className="size-4" /> New module
          </Button>
        }
      />

      {/* Course tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {courses.map(c => (
          <button
            key={c.id}
            onClick={() => setSelectedCourseId(c.id)}
            className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${selectedCourseId === c.id ? "bg-primary text-primary-foreground border-primary" : "border-border bg-card text-foreground hover:bg-accent/50"}`}
          >
            {c.title}
          </button>
        ))}
      </div>

      {courses.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground bg-card border rounded-2xl">
          <FolderOpen className="w-10 h-10 mx-auto mb-2 opacity-30" />
          You have no courses yet to add content to.
        </div>
      ) : (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: "Modules", value: modules.length, icon: FolderOpen, color: "text-[var(--gold)]" },
              { label: "Videos", value: modules.flatMap(m => m.resources).filter((r: any) => r.type === "video").length, icon: Video, color: "text-[var(--gold)]" },
              { label: "PDFs", value: modules.flatMap(m => m.resources).filter((r: any) => r.type === "pdf").length, icon: FileText, color: "text-red-500" },
              { label: "Quizzes", value: modules.flatMap(m => m.resources).filter((r: any) => r.type === "quiz").length, icon: FileQuestion, color: "text-[var(--gold)]" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
                <Icon className={`w-5 h-5 ${color}`} />
                <div>
                  <p className="text-xl font-bold text-foreground">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* New Module input */}
          {showNewModule && (
            <div className="mb-4 bg-card border border-primary rounded-xl p-4 flex items-center gap-3">
              <input
                autoFocus
                value={newModuleTitle}
                onChange={e => setNewModuleTitle(e.target.value)}
                placeholder="Module title (e.g. Basic Statements)..."
                className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm"
                onKeyDown={e => e.key === "Enter" && handleCreateModule()}
              />
              <Button size="sm" onClick={handleCreateModule} disabled={!newModuleTitle.trim() || creatingModule}>
                {creatingModule ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowNewModule(false)}>Cancel</Button>
            </div>
          )}

          {/* Module tree */}
          <div className="space-y-3">
            {modules.map((mod, idx) => (
              <div key={mod.id} className="bg-card border border-border rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedMod(expandedMod === mod.id ? null : mod.id)}
                  className="w-full flex items-center gap-3 px-5 py-4 hover:bg-accent/20 transition-colors text-left"
                >
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-primary">{idx + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground">{mod.title}</p>
                    <p className="text-xs text-muted-foreground">{mod.lessons} lessons · {mod.duration} · {mod.resources.length} files</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${mod.status === "Published" ? "bg-[var(--gold-muted)] text-[var(--gold)]" : "bg-amber-500/15 text-amber-700 dark:text-amber-400"}`}>{mod.status}</span>
                  <Button size="sm" variant="ghost" className="ml-1 shrink-0" onClick={e => { e.stopPropagation(); setShowUploadForModule(mod.id); }}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add Content
                  </Button>
                </button>

                {expandedMod === mod.id && (
                  <div className="border-t border-border">
                    {mod.resources.length === 0 ? (
                      <div className="px-5 py-8 text-center">
                        <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-40" />
                        <p className="text-sm text-muted-foreground">No content uploaded yet.</p>
                        <Button size="sm" className="mt-3 gap-1.5" onClick={() => setShowUploadForModule(mod.id)}>
                          <Upload className="w-3.5 h-3.5" /> Upload first file
                        </Button>
                      </div>
                    ) : (
                      <div className="divide-y divide-border">
                        {mod.resources.map((f: any) => (
                          <div key={f.id} className="flex items-center gap-3 px-5 py-3 hover:bg-accent/20 transition-colors">
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${FILE_BG[f.type] || "bg-muted"}`}>
                              {FILE_ICONS[f.type] || <FileText className="w-5 h-5" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{f.title}</p>
                              <p className="text-xs text-muted-foreground">
                                {f.duration_mins ? `${f.duration_mins} mins` : "Content"} · {new Date(f.created_at).toLocaleDateString()}
                                {!f.url && <span className="ml-2 text-amber-500">⚠ No file URL</span>}
                              </p>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-xs gap-1"
                                onClick={() => openContentUrl(f.url)}
                                disabled={!f.url}
                                title={f.url ? "Preview file in new tab" : "No URL available"}
                              >
                                <Eye className="w-3.5 h-3.5" /> Preview
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => selectedCourseId && handleDelete(selectedCourseId, f.id)}
                                disabled={deletingId === f.id}
                                title="Delete content"
                              >
                                {deletingId === f.id
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin text-red-500" />
                                  : <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-red-500" />
                                }
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
