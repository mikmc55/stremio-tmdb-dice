const express = require('express');
const path = require('path');
const log = require('../helpers/logger');

const router = express.Router();

const isPublicInstance = process.env.PUBLIC_INSTANCE === 'true';
const baseDir = isPublicInstance ? 'public' : 'private';

router.get("/", (req, res) => {
    log.info('Redirecting to /configure');
    res.redirect("/configure");
});

router.get("/:configParameters?/configure", (req, res) => {
    log.info(`Sending ${baseDir}/configure.html`);
    res.sendFile(path.join(__dirname, `../../${baseDir}/configure.html`));
});

module.exports = router;
