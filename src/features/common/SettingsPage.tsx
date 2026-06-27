import { useState, useEffect, useRef } from "react";
import { Bell, Lock, User, Building2, Palette, Save, Loader2, Camera } from "lucide-react";
import type { UserType } from "@/shared/userTypes";
import { PageHeader } from "@/shared/components/PageHeader";
import { Button } from "@/shared/components/ui/button";
import { toast } from "sonner";
import { useAuth } from "@/shared/context/AuthContext";
import { updateUser, uploadCourseFile } from "@/shared/lib/api";
import { supabase } from "@/shared/lib/supabase";

interface SettingsPageProps {
  userType: UserType;
}

type Tab = "profile" | "notifications" | "security" | "institution" | "appearance";

const TABS: { id: Tab; label: string; icon: React.ElementType; adminOnly?: boolean }[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "security", label: "Security", icon: Lock },
  { id: "institution", label: "Institution", icon: Building2, adminOnly: true },
  { id: "appearance", label: "Appearance", icon: Palette },
];

const NOTIFICATION_PREFS = [
  { key: "assignments", label: "Assignment deadlines", desc: "Get notified 24h before due dates" },
  { key: "grades", label: "Grade posted", desc: "When faculty grades your submission" },
  { key: "certificates", label: "Certificate issued", desc: "When a new certificate is ready" },
  { key: "digest", label: "Weekly digest", desc: "Summary of activity every Monday" },
  { key: "system", label: "System alerts", desc: "Maintenance and downtime notices" },
];

export function SettingsPage({ userType }: SettingsPageProps) {
  const isAdmin = userType === "admin" || userType === "super-admin";
  const [tab, setTab] = useState<Tab>("profile");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ newPassword: "", confirmPassword: "" });
  const [appearanceTheme, setAppearanceTheme] = useState<"Light" | "Dark" | "System">(
    () => (localStorage.getItem("sk-theme") as "Light" | "Dark" | "System") || "System"
  );
  const { user, refreshUser } = useAuth();
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [profileForm, setProfileForm] = useState({
    name: "",
    email: "",
    phone: "",
    avatar_url: "",
  });

  useEffect(() => {
    if (user) {
      setProfileForm({
        name: user.name || "",
        email: user.email || "",
        phone: user.phone || "",
        avatar_url: user.avatar_url || "",
      });
    }
  }, [user]);

  const visibleTabs = TABS.filter(t => !t.adminOnly || isAdmin);

  const handleSaveProfile = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { error } = await updateUser(user.id, {
        name: profileForm.name,
        avatar_url: profileForm.avatar_url,
      });
      if (error) { toast.error(error); setLoading(false); return; }
      await refreshUser();
      setSaved(true);
      toast.success("Profile saved successfully!");
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      toast.error(err.message || "Failed to update profile");
    }
    setLoading(false);
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Image must be under 2 MB"); return; }
    setUploadingAvatar(true);
    const { data, error } = await uploadCourseFile(file, "profiles");
    setUploadingAvatar(false);
    if (error || !data) { toast.error(error || "Upload failed"); return; }
    setProfileForm(f => ({ ...f, avatar_url: data.url }));
    toast.success("Photo ready — click Save profile to apply");
  };

  const handleSave = () => {
    setSaved(true);
    toast.success("Settings saved successfully!");
    setTimeout(() => setSaved(false), 2000);
  };

  const handleUpdatePassword = async () => {
    if (!passwordForm.newPassword) { toast.error("Enter a new password"); return; }
    if (passwordForm.newPassword.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) { toast.error("Passwords do not match"); return; }
    setPasswordLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: passwordForm.newPassword });
      if (error) { toast.error(error.message); return; }
      toast.success("Password updated successfully!");
      setPasswordForm({ newPassword: "", confirmPassword: "" });
    } catch (err: any) {
      toast.error(err.message || "Failed to update password");
    }
    setPasswordLoading(false);
  };

  const handleSaveAppearance = () => {
    localStorage.setItem("sk-theme", appearanceTheme);
    toast.success("Appearance saved!");
  };

  const getInitials = (name: string) => {
    if (!name) return "U";
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  return (
    <div className="p-8 max-w-5xl">
      <PageHeader title="Settings" description="Manage your preferences, security, and institution configuration." />

      <div className="flex gap-6">
        {/* Sidebar nav */}
        <nav className="w-48 shrink-0 space-y-1">
          {visibleTabs.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${tab === t.id ? "bg-accent text-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"}`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </nav>

        {/* Content */}
        <div className="flex-1 space-y-6">
          {tab === "profile" && (
            <section className="rounded-xl border border-border bg-card p-6">
              <h2 className="font-semibold text-foreground mb-5 flex items-center gap-2"><User className="w-4 h-4" style={{ color: "var(--gold)" }} /> Profile</h2>
              <div className="flex items-center gap-4 mb-6">
                <div className="relative w-16 h-16 shrink-0">
                  {profileForm.avatar_url ? (
                    <img src={profileForm.avatar_url} alt="avatar" className="w-16 h-16 rounded-full object-cover" />
                  ) : (
                    <div className="w-16 h-16 rounded-full flex items-center justify-center text-[#1A1A1A] text-xl font-bold" style={{ background: "var(--gold)" }}>
                      {getInitials(user?.name || "")}
                    </div>
                  )}
                  {uploadingAvatar && (
                    <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                      <Loader2 className="w-5 h-5 animate-spin text-white" />
                    </div>
                  )}
                </div>
                <div>
                  <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhotoChange} />
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => photoInputRef.current?.click()} disabled={uploadingAvatar}>
                    <Camera className="w-3.5 h-3.5" /> {uploadingAvatar ? "Uploading…" : "Change photo"}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1">JPG, PNG up to 2MB</p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Display name</label>
                  <input 
                    value={profileForm.name} 
                    onChange={e => setProfileForm({...profileForm, name: e.target.value})}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" 
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Email (Cannot be changed)</label>
                  <input 
                    disabled 
                    value={profileForm.email} 
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm opacity-50 cursor-not-allowed" 
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Phone</label>
                  <input 
                    value={profileForm.phone} 
                    onChange={e => setProfileForm({...profileForm, phone: e.target.value})}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" 
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Timezone</label>
                  <select className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                    <option>Asia/Kolkata (IST)</option>
                    <option>UTC</option>
                    <option>America/New_York</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">Bio</label>
                  <textarea className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none" rows={3} placeholder="A short bio about yourself…" />
                </div>
              </div>
              <Button className="mt-4 gap-2" onClick={handleSaveProfile} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {saved ? "Saved!" : "Save profile"}
              </Button>
            </section>
          )}

          {tab === "notifications" && (
            <section className="rounded-xl border border-border bg-card p-6">
              <h2 className="font-semibold text-foreground mb-5 flex items-center gap-2"><Bell className="w-4 h-4" style={{ color: "var(--gold)" }} /> Notification Preferences</h2>
              <div className="space-y-0 divide-y divide-border">
                {NOTIFICATION_PREFS.map(pref => (
                  <label key={pref.key} className="flex items-center justify-between gap-4 py-4 cursor-pointer">
                    <div>
                      <p className="text-sm font-medium text-foreground">{pref.label}</p>
                      <p className="text-xs text-muted-foreground">{pref.desc}</p>
                    </div>
                    <input type="checkbox" defaultChecked className="w-4 h-4 accent-primary" />
                  </label>
                ))}
              </div>
              <Button className="mt-4 gap-2" onClick={handleSave}>
                <Save className="w-4 h-4" /> {saved ? "Saved!" : "Save preferences"}
              </Button>
            </section>
          )}

          {tab === "security" && (
            <section className="rounded-xl border border-border bg-card p-6">
              <h2 className="font-semibold text-foreground mb-5 flex items-center gap-2"><Lock className="w-4 h-4" style={{ color: "var(--gold)" }} /> Security</h2>
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">New password</label>
                    <input
                      type="password"
                      value={passwordForm.newPassword}
                      onChange={e => setPasswordForm(f => ({ ...f, newPassword: e.target.value }))}
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      placeholder="Min 6 characters"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Confirm new password</label>
                    <input
                      type="password"
                      value={passwordForm.confirmPassword}
                      onChange={e => setPasswordForm(f => ({ ...f, confirmPassword: e.target.value }))}
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      placeholder="Repeat new password"
                    />
                  </div>
                </div>
              </div>
              <Button className="mt-4 gap-2" variant="secondary" onClick={handleUpdatePassword} disabled={passwordLoading}>
                {passwordLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Update password
              </Button>

              <div className="mt-6 pt-6 border-t border-border">
                <h3 className="text-sm font-semibold text-foreground mb-3">Two-Factor Authentication</h3>
                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/40">
                  <div>
                    <p className="text-sm font-medium text-foreground">Authenticator app</p>
                    <p className="text-xs text-muted-foreground">Use an app like Google Authenticator</p>
                  </div>
                  <Button variant="outline" size="sm">Enable 2FA</Button>
                </div>
              </div>

              <div className="mt-4 p-4 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20">
                <h3 className="text-sm font-semibold text-red-700 dark:text-red-400 mb-1">Danger zone</h3>
                <p className="text-xs text-muted-foreground mb-3">Permanently delete your account and all associated data.</p>
                <Button variant="destructive" size="sm">Delete account</Button>
              </div>
            </section>
          )}

          {tab === "institution" && isAdmin && (
            <section className="rounded-xl border border-border bg-card p-6">
              <h2 className="font-semibold text-foreground mb-5 flex items-center gap-2"><Building2 className="w-4 h-4" style={{ color: "var(--gold)" }} /> Institution Settings</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Institution name</label>
                  <input defaultValue="Mumbai Technical Institute" className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Short code</label>
                  <input defaultValue="MTI" className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Contact email</label>
                  <input defaultValue="admin@mti.edu.in" className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Website</label>
                  <input defaultValue="https://mti.edu.in" className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">Address</label>
                  <input defaultValue="Bandra Kurla Complex, Mumbai, Maharashtra 400051" className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Academic year</label>
                  <select className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                    <option>2025–26</option>
                    <option>2026–27</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Default language</label>
                  <select className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                    <option>English</option>
                    <option>Hindi</option>
                    <option>Marathi</option>
                  </select>
                </div>
              </div>
              <Button className="mt-4 gap-2" onClick={handleSave}>
                <Save className="w-4 h-4" /> {saved ? "Saved!" : "Save settings"}
              </Button>
            </section>
          )}

          {tab === "appearance" && (
            <section className="rounded-xl border border-border bg-card p-6">
              <h2 className="font-semibold text-foreground mb-5 flex items-center gap-2"><Palette className="w-4 h-4" style={{ color: "var(--gold)" }} /> Appearance</h2>
              <div className="space-y-5">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-2">Theme</label>
                  <div className="flex gap-3">
                    {(["Light", "Dark", "System"] as const).map(t => (
                      <label key={t} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="theme"
                          checked={appearanceTheme === t}
                          onChange={() => setAppearanceTheme(t)}
                          className="accent-primary"
                        />
                        <span className="text-sm text-foreground">{t}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-2">Accent color</label>
                  <div className="flex gap-2">
                    {["#ff6b35", "#3b82f6", "#10b981", "#8b5cf6", "#f59e0b"].map(color => (
                      <button key={color} className="w-8 h-8 rounded-full border-2 border-transparent hover:border-foreground transition-colors" style={{ backgroundColor: color }} />
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-2">Sidebar density</label>
                  <select className="rounded-md border border-border bg-background px-3 py-2 text-sm">
                    <option>Comfortable</option>
                    <option>Compact</option>
                  </select>
                </div>
              </div>
              <Button className="mt-4 gap-2" onClick={handleSaveAppearance}>
                <Save className="w-4 h-4" /> Save appearance
              </Button>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
