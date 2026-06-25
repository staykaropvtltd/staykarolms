import { useState, useEffect } from "react";
import { Check, X, Zap, Crown, Rocket, Loader2 } from "lucide-react";
import { PageHeader } from "@/shared/components/PageHeader";
import { Button } from "@/shared/components/ui/button";
import { getInstitutions } from "@/shared/lib/api";
import { toast } from "sonner";

interface ApiInstitution {
  id: string;
  name: string;
  plan?: string;
}

const SUBSCRIPTION_PLANS = [
  { id: "plan_1", name: "Starter" as const, price: 21000, students: 1000, faculty: 50, storage: "50 GB", highlighted: false,
    features: ["Student accounts", "Faculty accounts", "Storage", "Course builder", "Assignments & quizzes", "Basic analytics"] },
  { id: "plan_2", name: "Growth" as const, price: 45000, students: 5000, faculty: 200, storage: "250 GB", highlighted: true,
    features: ["Student accounts", "Faculty accounts", "Storage", "Course builder", "Assignments & quizzes", "Basic analytics", "Advanced analytics", "Live classes", "AI interview prep", "Custom branding", "API access"] },
  { id: "plan_3", name: "Enterprise" as const, price: 150000, students: 20000, faculty: 1000, storage: "1 TB", highlighted: false,
    features: ["Student accounts", "Faculty accounts", "Storage", "Course builder", "Assignments & quizzes", "Basic analytics", "Advanced analytics", "Real-time analytics", "Live classes", "AI interview prep", "Custom branding", "White-label", "API access", "SSO / SAML", "SLA 99.9%", "Dedicated support"] },
];

const PLAN_ICONS = { Starter: Rocket, Growth: Zap, Enterprise: Crown };
const PLAN_GRADIENT = {
  Starter:    "from-[var(--gold-muted)] to-transparent border-[var(--gold)]/20",
  Growth:     "from-[var(--gold-muted)] to-transparent border-[var(--gold)]/30",
  Enterprise: "from-[var(--gold-muted)] to-transparent border-[var(--gold)]/40",
};

const ALL_FEATURES = [
  "Student accounts", "Faculty accounts", "Storage", "Course builder", "Assignments & quizzes",
  "Basic analytics", "Advanced analytics", "Real-time analytics", "Live classes", "AI interview prep",
  "Custom branding", "White-label", "API access", "SSO / SAML", "SLA 99.9%", "Dedicated support",
];

const PLAN_FEATURE_MAP: Record<string, string[]> = {
  Starter:    ["Student accounts", "Faculty accounts", "Storage", "Course builder", "Assignments & quizzes", "Basic analytics"],
  Growth:     ["Student accounts", "Faculty accounts", "Storage", "Course builder", "Assignments & quizzes", "Basic analytics", "Advanced analytics", "Live classes", "AI interview prep", "Custom branding", "API access"],
  Enterprise: ALL_FEATURES,
};

function EditPlanModal({ plan, onClose }: { plan: typeof SUBSCRIPTION_PLANS[0]; onClose: () => void }) {
  const [price, setPrice] = useState(String(plan.price));
  const [students, setStudents] = useState(String(plan.students));
  const [faculty, setFaculty] = useState(String(plan.faculty));
  const [storage, setStorage] = useState(plan.storage);

  const handleSave = () => {
    toast.success(`${plan.name} plan settings saved (contact support to apply changes)`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Edit {plan.name} Plan</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Monthly price (₹)</label>
            <input type="number" value={price} onChange={e => setPrice(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Max students</label>
              <input value={students} onChange={e => setStudents(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Max faculty</label>
              <input value={faculty} onChange={e => setFaculty(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Storage</label>
            <input value={storage} onChange={e => setStorage(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="flex gap-2 p-6 pt-0">
          <Button className="flex-1" onClick={handleSave}>Save Plan</Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

export function SubscriptionsPage() {
  const [editing, setEditing] = useState<typeof SUBSCRIPTION_PLANS[0] | null>(null);
  const [view, setView] = useState<"cards" | "matrix">("cards");
  const [institutions, setInstitutions] = useState<ApiInstitution[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getInstitutions()
      .then(({ data }) => setInstitutions((data as ApiInstitution[]) || []))
      .finally(() => setLoading(false));
  }, []);

  const tenantCount = (planName: string) =>
    institutions.filter(i => i.plan === planName).length;

  return (
    <div className="p-8">
      {editing && <EditPlanModal plan={editing} onClose={() => setEditing(null)} />}

      <PageHeader
        title="Subscription Plans"
        description="Manage pricing tiers, feature gates, and tenant plan assignments."
        actions={
          <div className="flex gap-1 bg-muted/40 p-1 rounded-lg">
            {(["cards", "matrix"] as const).map(v => (
              <button key={v} onClick={() => setView(v)} className={`px-3 py-1 rounded text-sm font-medium capitalize transition-colors ${view === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>{v}</button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {SUBSCRIPTION_PLANS.map(p => {
          const Icon = PLAN_ICONS[p.name];
          return (
            <div key={p.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
              <Icon className="w-5 h-5 text-[var(--gold)]" />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  {loading ? "—" : `${tenantCount(p.name)} tenants`}
                </p>
              </div>
              <p className="text-lg font-bold text-foreground">
                ₹{(p.price / 1000).toFixed(0)}K<span className="text-xs text-muted-foreground font-normal">/mo</span>
              </p>
            </div>
          );
        })}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mr-2" />
          <span className="text-sm text-muted-foreground">Loading tenant data…</span>
        </div>
      )}

      {view === "cards" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {SUBSCRIPTION_PLANS.map(plan => {
            const Icon = PLAN_ICONS[plan.name];
            return (
              <div key={plan.id} className={`relative rounded-xl border bg-gradient-to-br p-6 ${PLAN_GRADIENT[plan.name]} ${plan.highlighted ? "ring-2 ring-[var(--gold)]" : ""}`}>
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-white text-xs font-bold px-3 py-1 rounded-full" style={{ background: "var(--gold)" }}>Most Popular</div>
                )}
                <div className="flex items-center gap-2 mb-4">
                  <Icon className="w-6 h-6 text-[var(--gold)]" />
                  <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
                </div>
                <div className="mb-4">
                  <span className="text-3xl font-bold text-foreground">₹{(plan.price / 1000).toFixed(0)}K</span>
                  <span className="text-muted-foreground text-sm">/month</span>
                </div>
                <div className="space-y-2 mb-6">
                  {plan.features.map(f => (
                    <div key={f} className="flex items-center gap-2 text-sm text-foreground">
                      <Check className="w-4 h-4 shrink-0 text-[var(--gold)]" />
                      {f}
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-4 border-t border-border/50">
                  <div>
                    <p className="text-xs text-muted-foreground">Active tenants</p>
                    <p className="text-lg font-bold text-foreground">
                      {loading ? <Loader2 className="w-4 h-4 animate-spin inline" /> : tenantCount(plan.name)}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setEditing(plan)}>Edit Plan</Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === "matrix" && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left py-3 px-6 font-medium text-muted-foreground w-64">Feature</th>
                  {SUBSCRIPTION_PLANS.map(p => (
                    <th key={p.id} className="text-center py-3 px-6 font-medium text-foreground">{p.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ALL_FEATURES.map(feature => (
                  <tr key={feature} className="border-b border-border last:border-0 hover:bg-accent/20">
                    <td className="py-3 px-6 text-muted-foreground">{feature}</td>
                    {SUBSCRIPTION_PLANS.map(p => (
                      <td key={p.id} className="py-3 px-6 text-center">
                        {PLAN_FEATURE_MAP[p.name].includes(feature)
                          ? <Check className="w-4 h-4 mx-auto text-[var(--gold)]" />
                          : <X className="w-4 h-4 text-muted-foreground/30 mx-auto" />}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t-2 border-border bg-muted/20">
                  <td className="py-3 px-6 font-semibold text-foreground">Monthly price</td>
                  {SUBSCRIPTION_PLANS.map(p => (
                    <td key={p.id} className="py-3 px-6 text-center font-bold text-foreground">₹{(p.price / 1000).toFixed(0)}K</td>
                  ))}
                </tr>
                <tr className="border-b border-border bg-muted/10">
                  <td className="py-3 px-6 font-semibold text-foreground">Active tenants</td>
                  {SUBSCRIPTION_PLANS.map(p => (
                    <td key={p.id} className="py-3 px-6 text-center font-bold text-foreground">
                      {loading ? "—" : tenantCount(p.name)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
