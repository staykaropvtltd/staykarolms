import { MoreVertical } from "lucide-react";
import { motion } from "motion/react";

const activities = [
  {
    id: 1,
    student: "Alex Johnson",
    course: "Advanced Programming",
    action: "Completed Module 3",
    time: "Just now",
    score: "95%",
    badge: "Enterprise",
  },
  {
    id: 2,
    student: "Sarah Williams",
    course: "UI/UX Design",
    action: "Started Course",
    time: "5 min",
    score: null,
    badge: "Ongoing",
  },
  {
    id: 3,
    student: "Mike Chen",
    course: "Data Analytics",
    action: "Quiz Submitted",
    time: "12 min",
    score: "88%",
    badge: "Graded",
  },
  {
    id: 4,
    student: "Emily Davis",
    course: "Cloud Computing",
    action: "Assignment Due",
    time: "1 hour",
    score: null,
    badge: "Upcoming",
  },
];

export function RecentActivities() {
  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-foreground">Student Activities</h2>
        <div className="flex gap-2">
          <button className="text-sm px-3 py-1.5 rounded-lg bg-accent hover:bg-accent/80 transition-colors">
            Today
          </button>
          <button className="text-sm px-3 py-1.5 rounded-lg hover:bg-accent/80 transition-colors">
            Week
          </button>
          <button className="text-sm px-3 py-1.5 rounded-lg hover:bg-accent/80 transition-colors">
            Month
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {activities.map((activity, index) => (
          <motion.div
            key={activity.id}
            className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent/30 transition-colors"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05, duration: 0.3 }}
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "var(--gold)" }}>
                <span className="text-[#1A1A1A] text-sm font-bold">
                  {activity.student.charAt(0)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {activity.student}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {activity.course}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-xs text-muted-foreground">{activity.time}</p>
                {activity.score && (
                  <p className="text-sm font-medium text-[var(--gold)]">{activity.score}</p>
                )}
              </div>
              <span
                className="text-xs px-2 py-1 rounded bg-[var(--gold-muted)] text-[var(--gold)]"
              >
                {activity.badge}
              </span>
              <button className="p-1 hover:bg-accent rounded">
                <MoreVertical className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
