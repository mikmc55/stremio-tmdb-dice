const log = require('./logger');

const requestLogger = (req, res, next) => {
    const userAgent = req.headers['user-agent'] || '';
    const origin = req.get('origin') || '';
    const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

    log.info('--- Request received ---');
    log.debug(`URL: ${fullUrl}`);
    log.debug(`Method: ${req.method}`);
    log.debug(`Query: ${JSON.stringify(req.query)}`);
    log.debug(`Body: ${JSON.stringify(req.body)}`);
    log.debug(`Headers: ${JSON.stringify(req.headers)}`);
    log.debug(`User-Agent: ${userAgent}`);
    log.debug(`Origin: ${origin}`);

    next();
};

const errorHandler = (err, req, res, next) => {
    log.error(`Error: ${err.message} | Stack: ${err.stack}`);
    res.status(500).json({ error: 'Internal Server Error' });
};

module.exports = {
    requestLogger,
    errorHandler
};
