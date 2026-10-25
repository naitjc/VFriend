function errorHandler(err, req, res, next) {
    const statusCode = Number(err.status) || 500;
    const defaultCode = statusCode === 400
        ? 'VALIDATION_ERROR'
        : statusCode === 413
            ? 'PAYLOAD_TOO_LARGE'
            : statusCode >= 500
                ? 'INTERNAL_ERROR'
                : 'REQUEST_ERROR';
    console.error(`[${req.method} ${req.originalUrl}]`, err.message);
    if (process.env.NODE_ENV !== 'production' && err.stack) {
        console.error(err.stack);
    }

    res.status(statusCode).json({
        error: {
            message: statusCode >= 500 ? '内部服务器错误' : (err.message || '请求失败'),
            code: err.code || defaultCode
        }
    });
}

module.exports = errorHandler;
