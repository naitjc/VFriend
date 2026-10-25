/**
 * 速率限制中间件 - 基于内存，每 IP 每分钟最多 30 次请求
 */
const requestMap = new Map();
const WINDOW_MS = 60 * 1000; // 1 分钟
const MAX_REQUESTS = 30;

function rateLimiter(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();

    if (!requestMap.has(ip)) {
        requestMap.set(ip, { count: 1, resetTime: now + WINDOW_MS });
        return next();
    }

    const record = requestMap.get(ip);

    // 窗口重置
    if (now > record.resetTime) {
        record.count = 1;
        record.resetTime = now + WINDOW_MS;
        return next();
    }

    record.count++;

    if (record.count > MAX_REQUESTS) {
        const retryAfter = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
        res.setHeader('Retry-After', String(retryAfter));
        return res.status(429).json({
            error: {
                message: '请求过于频繁，请稍后再试。',
                code: 'RATE_LIMIT_EXCEEDED',
                retryAfter
            }
        });
    }

    next();
}

// 每 5 分钟清理过期记录，防止内存泄漏
const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of requestMap.entries()) {
        if (now > record.resetTime) requestMap.delete(ip);
    }
}, 5 * 60 * 1000);
cleanupTimer.unref();

module.exports = rateLimiter;
