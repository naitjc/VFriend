const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./src/config/config');
const apiRoutes = require('./src/routes/apiRoutes');
const errorHandler = require('./src/middleware/errorHandler');
const rateLimiter = require('./src/middleware/rateLimiter');
const { modelConfigContext } = require('./src/middleware/modelConfigContext');

try {
  config.validate();
} catch (e) {
  console.error('❌ 配置错误:', e.message);
  process.exit(1);
}

const app = express();

app.use(cors());
app.use('/archives/import', express.json({ limit: '64mb' }));
app.use(express.json({ limit: '5mb' }));
app.use(modelConfigContext);
app.use(express.static(path.join(__dirname, '../frontend-vue/dist')));

// 对 AI 接口应用速率限制
app.use('/qa', rateLimiter);

// Use routes
app.use('/', apiRoutes);

app.use((req, res) => {
  res.status(404).json({
    error: {
      message: '接口不存在',
      code: 'NOT_FOUND',
    },
  });
});

// Global Error Handler
app.use(errorHandler);

const server = app.listen(config.port, () => {
  console.log(`✅ 后端服务器运行在 http://localhost:${server.address().port}`);
});
