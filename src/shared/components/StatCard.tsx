import { LucideIcon } from "lucide-react";
import { motion } from "motion/react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  iconColor?: string;
  trend?: {
    value: string;
    isPositive: boolean;
  };
  delay?: number;
}

export function StatCard({ title, value, icon: Icon, trend, delay = 0 }: StatCardProps) {
  return (
    <motion.div
      className="bg-card border border-border rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow border-l-4"
      style={{ borderLeftColor: "var(--gold)" }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut", delay }}
      whileHover={{ y: -3, boxShadow: "0 8px 24px rgba(201,168,76,0.15)" }}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground mb-1">{title}</p>
          <h3 className="text-3xl font-bold text-foreground mb-2 tabular-nums">{value}</h3>
          {trend && (
            <p
              className="text-sm font-medium"
              style={{ color: trend.isPositive ? "var(--gold)" : "var(--destructive)" }}
            >
              {trend.isPositive ? "↑" : "↓"} {trend.value}
            </p>
          )}
        </div>
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "var(--gold-muted)", border: "1px solid var(--gold)" }}
        >
          <Icon className="w-6 h-6" style={{ color: "var(--gold)" }} />
        </div>
      </div>
    </motion.div>
  );
}
