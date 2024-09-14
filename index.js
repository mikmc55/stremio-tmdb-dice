require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const log = require('./src/helpers/logger');
const routes = require('./src/routes/index');

const app = express();
const PORT = process.env.PORT; // Relying on environment variable for PORT

// Open up CORS for all origins for testing purposes
app.use(cors());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/health', (req, res) => res.status(200).send('OK'));

// Root route
app.use('/', routes);

// Error handling middleware for better debugging
app.use((err, req, res, next) => {
    log.error(err.stack);
    res.status(500).send('Something broke!');
});

// Start the server
app.listen(PORT, () => {
    log.info(`Server running on port ${PORT} - Environment: ${process.env.NODE_ENV || 'development'}`);
});
