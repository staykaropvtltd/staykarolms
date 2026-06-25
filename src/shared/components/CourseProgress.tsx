export function CourseProgress() {
  const courses = [
    { name: "Python Programming", progress: 85, color: "bg-primary" },
    { name: "Data Structures", progress: 72, color: "bg-primary" },
    { name: "Web Development", progress: 65, color: "bg-primary" },
    { name: "Machine Learning", progress: 45, color: "bg-primary" },
  ];

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-foreground mb-1">Course Progress</h2>
        <p className="text-sm text-muted-foreground">Average completion by course</p>
      </div>

      <div className="space-y-4">
        {courses.map((course, index) => (
          <div key={index}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-foreground">{course.name}</span>
              <span className="text-sm text-muted-foreground">{course.progress}%</span>
            </div>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full ${course.color} transition-all`}
                style={{ width: `${course.progress}%` }}
              ></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
