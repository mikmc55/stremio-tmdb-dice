require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const log = require('./src/helpers/logger');
const routes = require('./src/routes/index');

const app = express();
const PORT = process.env.PORT; // Removed fallback to a hardcoded port

// CORS configuration to ensure correct origin in production
const corsOptions = {
    origin: process.env.BASE_URL || 'http://localhost:7000',
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/health', (req, res) => res.status(200).send('OK'));

app.use('/', routes);

app.listen(PORT, () => {
    log.info(`Server running on port ${PORT} - Environment: ${process.env.NODE_ENV || 'development'}`);
});
