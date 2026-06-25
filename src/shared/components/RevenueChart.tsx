import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

const data = [
  { month: "Jan", revenue: 45000, students: 320 },
  { month: "Feb", revenue: 52000, students: 380 },
  { month: "Mar", revenue: 48000, students: 350 },
  { month: "Apr", revenue: 61000, students: 420 },
  { month: "May", revenue: 55000, students: 390 },
  { month: "Jun", revenue: 67000, students: 460 },
];

export function RevenueChart() {
  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-foreground mb-1">Revenue Overview</h2>
        <p className="text-sm text-muted-foreground">Monthly revenue and student enrollment</p>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="month" stroke="var(--muted-foreground)" />
          <YAxis stroke="var(--muted-foreground)" />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
            }}
          />
          <Legend />
          <Bar dataKey="revenue" fill="hsl(var(--chart-1))" radius={[8, 8, 0, 0]} />
          <Bar dataKey="students" fill="hsl(var(--chart-2))" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
