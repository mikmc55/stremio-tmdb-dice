const express = require('express');
const path = require('path');
const log = require('./logger');
const { requestLogger, errorHandler } = require('./middleware');
const { fetchData, getGenreId, checkGenresExistForLanguage, fetchAndStoreGenres } = require('./tmdb');
const generateManifest = require('./config');

const router = express.Router();

router.use(requestLogger);

const isPublicInstance = process.env.PUBLIC_INSTANCE === 'true';
const baseDir = isPublicInstance ? 'public' : 'private';

router.get("/", (req, res) => {
    log.info('Redirecting to /configure');
    res.redirect("/configure");
});

router.get("/:configParameters?/configure", (req, res) => {
    log.info(`Sending ${baseDir}/configure.html`);
    res.sendFile(path.join(__dirname, `../${baseDir}/configure.html`));
});

router.get("/:configParameters?/manifest.json", async (req, res) => {
    const { configParameters } = req.params;
    const config = configParameters ? JSON.parse(decodeURIComponent(configParameters)) : {};
    const { language, tmdbApiKey } = config;

    log.debug(`Manifest request for language: ${language}`);

    try {
        if (language && !(await checkGenresExistForLanguage(language))) {
            log.debug(`Fetching genres for language: ${language}`);
            await fetchAndStoreGenres(language, tmdbApiKey);
        }

        const manifest = await generateManifest(language);
        res.json(manifest);
    } catch (error) {
        log.error(`Error generating manifest: ${error.message}`);
        res.status(500).json({ error: 'Error generating manifest' });
    }
});

router.get("/:configParameters?/catalog/:type/:id/:extra?.json", async (req, res) => {
    const { configParameters, type, id, extra } = req.params;
    const { cacheDuration = '3d', ...query } = req.query;
    const config = configParameters ? JSON.parse(decodeURIComponent(configParameters)) : {};
    const { language, hideNoPoster, tmdbApiKey, fanartApiKey } = config; // Ajoutez fanartApiKey

    log.info(`Catalog request: type=${type}, id=${id}, language=${language}`);
    log.debug(`Extra parameters: ${JSON.stringify(query)}`);

    const mediaType = type === 'series' ? 'tv' : type;
    if (!['movie', 'tv'].includes(mediaType)) {
        log.error(`Invalid catalog type: ${mediaType}`);
        return res.status(400).json({ metas: [] });
    }

    try {
        let extraParams = { ...query };

        if (extra) {
            const decodedExtra = decodeURIComponent(extra);
            extraParams = {
                ...extraParams,
                ...Object.fromEntries(
                    decodedExtra.split(/(?<!\s)&(?!\s)/).map(param => {
                        const [key, value] = param.split('=').map(decodeURIComponent);
                        return [key.trim(), value.trim()];
                    })
                )
            };
        }

        if (language) extraParams.language = language;
        if (hideNoPoster !== undefined) extraParams.hideNoPoster = String(hideNoPoster);

        if (extraParams.genre) {
            const genreId = await getGenreId(mediaType, extraParams.genre);
            if (genreId) {
                extraParams.with_genres = genreId;
            } else {
                log.warn(`Genre ${extraParams.genre} not found for ${mediaType}`);
            }
        }

        log.debug(`Extra parameters after processing: ${JSON.stringify(extraParams)}`);
        const metas = await fetchData(mediaType, id, extraParams, cacheDuration, tmdbApiKey, fanartApiKey); // Passez fanartApiKey
        log.info(`Fetched ${metas.length} items from TMDB`);

        res.json({
            metas: extraParams.hideNoPoster === 'true' ? metas.filter(meta => meta.poster) : metas
        });
    } catch (error) {
        log.error(`Error fetching catalog data: ${error.message}`);
        res.status(500).json({ metas: [] });
    }
});

router.use(errorHandler);

module.exports = router;
