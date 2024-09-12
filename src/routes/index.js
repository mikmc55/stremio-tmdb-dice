const express = require('express');
const configureRoutes = require('./configure');
const manifestRoutes = require('./manifest');
const catalogRoutes = require('./catalog');
const testErrorRoutes = require('./testError');
const log = require('../helpers/logger');

const router = express.Router();

router.use((req, res, next) => {
    log.info(`${req.method} ${req.originalUrl}`);
    next();
});

router.use(configureRoutes);
router.use(manifestRoutes);
router.use(catalogRoutes);
router.use(testErrorRoutes);

router.use((err, req, res, next) => {
    const errorTime = new Date().toISOString();
    log.error(`${errorTime} - Error: ${err.stack}`);

    res.status(500).send(`Something broke! If you need help, please provide this timestamp to the developer : ${errorTime}`);
});


module.exports = router;
