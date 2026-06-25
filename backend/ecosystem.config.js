module.exports = {
  apps: [
    {
      name: "staykaro-api",
      script: "server.js",

      // Cluster mode: one worker per CPU core.
      // On a 2-core server this doubles throughput; 4-core = 4×.
      instances: "max",
      exec_mode: "cluster",

      // Restart a worker if it exceeds 500 MB — guards against memory leaks
      // without taking the entire API down.
      max_memory_restart: "500M",

      // Exponential back-off on crash: don't hammer the process manager.
      exp_backoff_restart_delay: 100,

      // Keep stdout/stderr from rotting disk space.
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "./logs/error.log",
      out_file: "./logs/out.log",
      merge_logs: true,

      env: {
        NODE_ENV: "development",
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 3001,
      },
    },
  ],
};
