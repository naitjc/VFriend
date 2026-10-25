const config = require('./src/config/config');
const { createApp } = require('./app');
try { config.validate(); }
catch (error) { console.error('配置错误:', error.message); process.exit(1); }
const server = createApp().listen(config.port, () => {
  console.log(`VFriend 后端运行在 http://localhost:${server.address().port}`);
});
const shutdown = () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
