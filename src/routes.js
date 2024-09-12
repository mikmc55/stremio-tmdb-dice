const express = require('express');
const path = require('path');
const log = require('./logger');
const { requestLogger, errorHandler } = require('./middleware');
const { fetchData, getGenreId, checkGenresExistForLanguage, fetchAndStoreGenres } = require('./tmdb');
const generateManifest = require('./config');

const router = express.Router();

router.use(requestLogger);

const isPublicInstance = process.env.PUBLIC_INSTANCE === 'true'; // Vérifier la variable d'environnement

// Déterminer le dossier à utiliser en fonction de la variable d'environnement
const baseDir = isPublicInstance ? 'public' : 'private';

// Rediriger la route de base vers /configure
router.get("/", (req, res) => {
    log.info('Route /: Redirecting to /configure');
    res.redirect("/configure");
});

// Servir le fichier configure.html en fonction de PUBLIC_INSTANCE
router.get("/:configParameters?/configure", (req, res) => {
    log.info(`Route /:configParameters?/configure: Sending ${baseDir}/configure.html page`);
    res.sendFile(path.join(__dirname, `../${baseDir}/configure.html`));
});

router.get("/:configParameters?/manifest.json", async (req, res) => {
    try {
        const { configParameters } = req.params;
        const config = configParameters ? JSON.parse(decodeURIComponent(configParameters)) : {};
        const { language, tmdbApiKey } = config; // Extraction de tmdbApiKey

        log.debug(`Received request for manifest with language: ${language}`);

        if (language) {
            const genresExist = await checkGenresExistForLanguage(language);
            log.debug(`Genres exist for language ${language}: ${genresExist}`);

            if (!genresExist) {
                log.debug(`Fetching genres for language: ${language}`);
                // Passer la clé API à la fonction fetchAndStoreGenres
                await fetchAndStoreGenres(language, tmdbApiKey); // Attendez la fin du fetch et du stockage
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
    const { configParameters, type, id, extra } = req.params;
    let extraParams = req.query;
    const cacheDuration = req.query.cacheDuration || '3d';

    // Extraction du paramètre de configuration
    const config = configParameters ? JSON.parse(decodeURIComponent(configParameters)) : {};
    const { language, hideNoPoster, tmdbApiKey } = config;

    log.info(`Received catalog request with type: ${type}, id: ${id}, language: ${language}`);
    log.info(`Received extra parameters: ${JSON.stringify(extraParams)}`);
    log.info(`Cache duration set to: ${cacheDuration}`);

    // Correction du type de contenu 'series' en 'tv'
    let mediaType = type;
    if (mediaType === 'series') {
        mediaType = 'tv'; // TMDB utilise 'tv' pour les séries
    }

    if (!['movie', 'tv'].includes(mediaType)) {
        log.error(`Invalid catalog type: ${mediaType}`);
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

        // Intégrer les paramètres de configuration dans extraParams
        if (language) {
            extraParams.language = language;
        }

        if (typeof hideNoPoster !== 'undefined') {
            extraParams.hideNoPoster = hideNoPoster.toString(); // Convertir en chaîne pour comparaison
        }

        if (extraParams.genre) {
            const genreId = await getGenreId(mediaType, extraParams.genre);
            if (genreId) {
                extraParams.with_genres = genreId;
            } else {
                log.warn(`Genre ${extraParams.genre} not found for type ${mediaType}`);
            }
        }

        const metas = await fetchData(mediaType, id, extraParams, cacheDuration, tmdbApiKey);

        log.info(`Fetched ${metas.length} items from TMDB for type: ${mediaType}, id: ${id}`);

        const shouldHideNoPoster = extraParams.hideNoPoster === 'true';
        const filteredMetas = shouldHideNoPoster ? metas.filter(meta => meta.poster !== null) : metas;

        res.json({ metas: filteredMetas });
    } catch (error) {
        log.error(`Error fetching catalog data: ${error.message}`);
        res.status(500).json({ metas: [] });
    }
});

router.use(errorHandler);

module.exports = router;
