require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const log = require('./src/logger');
const routes = require('./src/routes');

const PORT = process.env.PORT || 7000;
const app = express();

app.use(cors());

app.use(express.static(path.join(__dirname, 'public')));

app.use('/', routes);

app.listen(PORT, () => {
    log.info(`Server running on port ${PORT} - Environment: ${process.env.NODE_ENV || 'development'}`);
});
