const express = require('express');
const path = require('path');
const log = require('./logger');
const { requestLogger, errorHandler } = require('./middleware');

const router = express.Router();

router.use(requestLogger);

router.get("/", (req, res) => {
    log.info('Route /: Redirecting to /configure');
    res.redirect("/configure");
});

router.get("/:configParameters?/configure", (req, res) => {
    log.info('Route /:configParameters?/configure: Sending configure.html page');
    res.sendFile(path.join(__dirname, '../public/configure.html'));
});

router.get("/:configParameters?/manifest.json", (req, res) => {
    log.info('Route /manifest.json: Sending manifest');
    res.json(require('./config'));
});

router.use(errorHandler);

module.exports = router;
