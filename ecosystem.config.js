module.exports = {
  apps: [
    {
      name: 'daily-standup-chatbot',
      script: 'server.js',
      watch: false,
      env: {
        NODE_ENV: 'development'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 4000
      }
    }
  ]
};
