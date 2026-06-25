import { Users, BookOpen, Award, TrendingUp } from "lucide-react";
import { StatCard } from "./StatCard";
import { ActivityFeed } from "./ActivityFeed";
import { RevenueChart } from "./RevenueChart";
import { CourseProgress } from "./CourseProgress";
import { RecentActivities } from "./RecentActivities";
import { motion } from "motion/react";

export function Dashboard() {
  return (
    <div className="p-8 space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-3xl font-bold text-foreground mb-2">Platform Overview</h1>
        <p className="text-muted-foreground">Monitor your LMS performance and key metrics</p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Students"
          value="50K+"
          icon={Users}
          delay={0 * 0.08}
          trend={{ value: "12% from last month", isPositive: true }}
        />
        <StatCard
          title="Active Courses"
          value="200+"
          icon={BookOpen}
          delay={1 * 0.08}
          trend={{ value: "8% from last month", isPositive: true }}
        />
        <StatCard
          title="Completion Rate"
          value="86%"
          icon={TrendingUp}
          delay={2 * 0.08}
          trend={{ value: "5% from last month", isPositive: true }}
        />
        <StatCard
          title="Certificates Issued"
          value="3,420"
          icon={Award}
          delay={3 * 0.08}
          trend={{ value: "15% from last month", isPositive: true }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RevenueChart />
        </div>
        <div>
          <CourseProgress />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ActivityFeed />
        <RecentActivities />
      </div>
    </div>
  );
}
