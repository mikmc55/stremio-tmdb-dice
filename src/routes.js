const express = require('express');
const path = require('path');
const log = require('./logger');
const { requestLogger, errorHandler } = require('./middleware');
const { fetchData, getGenreId, checkGenresExistForLanguage, fetchAndStoreGenres } = require('./tmdb');
const generateManifest = require('./config');

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

router.get("/:configParameters?/manifest.json", async (req, res) => {
    try {
        const { configParameters } = req.params;
        const config = configParameters ? JSON.parse(decodeURIComponent(configParameters)) : {};
        const { language } = config;

        log.debug(`Received request for manifest with language: ${language}`);

        if (language) {
            const genresExist = await checkGenresExistForLanguage(language);
            log.debug(`Genres exist for language ${language}: ${genresExist}`);

            if (!genresExist) {
                log.debug(`Fetching genres for language: ${language}`);
                await fetchAndStoreGenres(language); // Attendez la fin du fetch et du stockage
                log.debug(`Genres fetched and stored for language: ${language}`);
            } else {
                log.debug(`Genres already fetched for language: ${language}`);
            }
        } else {
            log.debug(`No language specified in request, skipping genre check.`);
        }

        // Génération du manifest après que le fetch des genres soit terminé
        const manifest = await generateManifest(language);
        res.json(manifest);
    } catch (error) {
        log.error('Error generating manifest:', error.message);
        res.status(500).json({ error: 'Error generating manifest' });
    }
});

router.get("/:configParameters?/catalog/:type/:id/:extra?.json", async (req, res) => {
    const { type, id, extra } = req.params;
    let extraParams = req.query;
    const cacheDuration = req.query.cacheDuration || '3d';

    log.info(`Received catalog request with type: ${type}, id: ${id}`);
    log.info(`Received extra parameters: ${JSON.stringify(extraParams)}`);
    log.info(`Cache duration set to: ${cacheDuration}`);

    if (!['movie', 'series'].includes(type)) {
        log.error(`Invalid catalog type: ${type}`);
        return res.status(400).json({ metas: [] });
    }

    try {
        if (extra) {
            const decodedExtra = decodeURIComponent(extra);
            const extraParamsFromUrl = decodedExtra.split('&').reduce((acc, param) => {
                const [key, value] = param.split('=');
                if (key && value) {
                    acc[key] = value;
                }
                return acc;
            }, {});
            extraParams = { ...extraParams, ...extraParamsFromUrl };
        }

        if (extraParams.genre) {
            const genreId = await getGenreId(type, extraParams.genre);
            if (genreId) {
                extraParams.with_genres = genreId;
            } else {
                log.warn(`Genre ${extraParams.genre} not found for type ${type}`);
            }
        }

        const metas = await fetchData(type, id, extraParams, cacheDuration);

        log.info(`Fetched ${metas.length} items from TMDB for type: ${type}, id: ${id}`);
        
        res.json({ metas });
    } catch (error) {
        log.error(`Error fetching catalog data: ${error.message}`);
        res.status(500).json({ metas: [] });
    }
});

router.use(errorHandler);

module.exports = router;
