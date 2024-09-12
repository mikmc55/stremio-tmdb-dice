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
    try {
        const { configParameters } = req.params;
        const config = configParameters ? JSON.parse(decodeURIComponent(configParameters)) : {};
        const { language, tmdbApiKey } = config;

        log.debug(`Manifest request for language: ${language}`);

        if (language) {
            const genresExist = await checkGenresExistForLanguage(language);
            log.debug(`Genres for language ${language}: ${genresExist ? 'Exist' : 'Fetching'}`);

            if (!genresExist) {
                await fetchAndStoreGenres(language, tmdbApiKey);
                log.debug(`Genres fetched for language: ${language}`);
            }
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
    let extraParams = req.query;
    const cacheDuration = req.query.cacheDuration || '3d';

    const config = configParameters ? JSON.parse(decodeURIComponent(configParameters)) : {};
    const { language, hideNoPoster, tmdbApiKey } = config;

    log.info(`Catalog request: type=${type}, id=${id}, language=${language}`);
    log.debug(`Extra parameters: ${JSON.stringify(extraParams)}`);

    let mediaType = type === 'series' ? 'tv' : type;

    if (!['movie', 'tv'].includes(mediaType)) {
        log.error(`Invalid catalog type: ${mediaType}`);
        return res.status(400).json({ metas: [] });
    }

    try {
        if (extra) {
            const decodedExtra = decodeURIComponent(extra);
            const extraParamsFromUrl = decodedExtra.split(/(?<!\s)&(?!\s)/).reduce((acc, param) => {
                const [key, value] = param.split('=');
                if (key && value) {
                    acc[decodeURIComponent(key.trim())] = decodeURIComponent(value.trim());
                }
                return acc;
            }, {});
            extraParams = { ...extraParams, ...extraParamsFromUrl };
        }

        if (language) extraParams.language = language;
        if (typeof hideNoPoster !== 'undefined') extraParams.hideNoPoster = hideNoPoster.toString();

        if (extraParams.genre) {
            const genreId = await getGenreId(mediaType, extraParams.genre);
            if (genreId) {
                extraParams.with_genres = genreId;
            } else {
                log.warn(`Genre ${extraParams.genre} not found for ${mediaType}`);
            }
        }

        const metas = await fetchData(mediaType, id, extraParams, cacheDuration, tmdbApiKey);
        log.info(`Fetched ${metas.length} items from TMDB`);

        const filteredMetas = extraParams.hideNoPoster === 'true' ? metas.filter(meta => meta.poster) : metas;

        res.json({ metas: filteredMetas });
    } catch (error) {
        log.error(`Error fetching catalog data: ${error.message}`);
        res.status(500).json({ metas: [] });
    }
});

router.use(errorHandler);

module.exports = router;
