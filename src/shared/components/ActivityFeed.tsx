import { Clock, CheckCircle, AlertCircle } from "lucide-react";
import { motion } from "motion/react";

const activities = [
  {
    id: 1,
    type: "enrollment",
    title: "New Student Enrollment",
    description: "John Doe enrolled in Python Programming",
    time: "2 minutes ago",
    status: "success",
  },
  {
    id: 2,
    type: "completion",
    title: "Course Completed",
    description: "Sarah Smith completed Data Structures",
    time: "15 minutes ago",
    status: "success",
  },
  {
    id: 3,
    type: "assignment",
    title: "Assignment Submitted",
    description: "Mike Johnson submitted Algorithm Analysis",
    time: "1 hour ago",
    status: "pending",
  },
  {
    id: 4,
    type: "interview",
    title: "AI Interview Scheduled",
    description: "Emma Wilson - Technical Interview",
    time: "2 hours ago",
    status: "pending",
  },
  {
    id: 5,
    type: "alert",
    title: "Low Completion Rate",
    description: "Advanced JavaScript - Only 45% completion",
    time: "3 hours ago",
    status: "warning",
  },
];

export function ActivityFeed() {
  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-foreground">Recent Activity</h2>
        <button className="text-sm text-primary hover:underline">View All</button>
      </div>

      <div className="space-y-4">
        {activities.map((activity, index) => (
          <motion.div
            key={activity.id}
            className="flex items-start gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05, duration: 0.3 }}
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                activity.status === "success"
                  ? "bg-[var(--gold-muted)]"
                  : activity.status === "warning"
                  ? "bg-[var(--gold-muted)]"
                  : "bg-[var(--gold-muted)]"
              }`}
            >
              {activity.status === "success" ? (
                <CheckCircle className="w-4 h-4 text-[var(--gold)]" />
              ) : activity.status === "warning" ? (
                <AlertCircle className="w-4 h-4 text-[var(--gold)]" />
              ) : (
                <Clock className="w-4 h-4 text-[var(--gold)]" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground text-sm">{activity.title}</p>
              <p className="text-sm text-muted-foreground truncate">
                {activity.description}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{activity.time}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
