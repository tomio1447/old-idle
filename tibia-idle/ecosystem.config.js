module.exports = {
  apps: [
    {
      name: "global-idle",
      script: "./server/server.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "450M",
    },
  ],
};
