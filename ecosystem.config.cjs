module.exports = {
  apps: [
    {
      name: 'pokemeow-web',
      script: 'npm',
      args: 'run start',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
    },
    {
      name: 'pokemeow-bot',
      script: 'npm',
      args: 'run bot:dev',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
      },
      autorestart: true,
      max_restarts: 20,
      restart_delay: 5000,
    },
  ],
};
