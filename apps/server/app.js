const express = require('express');
const cors = require('cors');
const path = require('path');
const apiRoutes = require('./src/routes/apiRoutes');
const errorHandler = require('./src/middleware/errorHandler');
const rateLimiter = require('./src/middleware/rateLimiter');
const { modelConfigContext } = require('./src/middleware/modelConfigContext');

function createApp() {
  const app = express();

  app.use(cors());
  app.use('/archives/import', express.json({ limit: '64mb' }));
  app.use(express.json({ limit: '5mb' }));
  app.use(modelConfigContext);
  app.use(express.static(path.join(__dirname, '../client/dist')));

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

  app.use(errorHandler);

  return app;
}
module.exports = { createApp };
