const express = require('express');
const path = require('path');
const log = require('./logger');
const { requestLogger, errorHandler } = require('./middleware');
const { fetchData, getGenreId } = require('./tmdb'); // Assurez-vous que fetchData soit une fonction pour interroger TMDB
const generateManifest = require('./config'); // Chemin vers le fichier avec la fonction generateManifest

const router = express.Router();

router.use(requestLogger);

// Route principale redirigeant vers la page de configuration
router.get("/", (req, res) => {
    log.info('Route /: Redirecting to /configure');
    res.redirect("/configure");
});

// Page de configuration
router.get("/:configParameters?/configure", (req, res) => {
    log.info('Route /:configParameters?/configure: Sending configure.html page');
    res.sendFile(path.join(__dirname, '../public/configure.html'));
});

// Manifest Stremio
router.get("/:configParameters?/manifest.json", async (req, res) => {
    try {
        const manifest = await generateManifest();
        res.json(manifest);
    } catch (error) {
        res.status(500).json({ error: 'Error generating manifest' });
    }
});

// Route pour le catalogue
router.get("/:configParameters?/catalog/:type/:id/:extra?.json", async (req, res) => {
    const { type, id, extra } = req.params;
    let extraParams = req.query; // Les paramètres supplémentaires comme genre, rating, year, skip
    const cacheDuration = req.query.cacheDuration || '3d'; // Durée du cache par défaut : 3 jours

    // Logs pour les paramètres reçus
    log.info(`Received catalog request with type: ${type}, id: ${id}`);
    log.info(`Received extra parameters: ${JSON.stringify(extraParams)}`);
    log.info(`Cache duration set to: ${cacheDuration}`);

    // Validation des paramètres
    if (!['movie', 'series'].includes(type)) {
        log.error(`Invalid catalog type: ${type}`);
        return res.status(400).json({ metas: [] });
    }

    try {
        // Traitement des paramètres supplémentaires
        if (extra) {
            // Extrait les paramètres supplémentaires depuis l'URL
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

        // Si un genre est spécifié dans les paramètres supplémentaires, obtenez l'ID du genre
        if (extraParams.genre) {
            const genreId = await getGenreId(type, extraParams.genre);
            if (genreId) {
                extraParams.with_genres = genreId;
            } else {
                log.warn(`Genre ${extraParams.genre} not found for type ${type}`);
            }
        }

        // Appel de fetchData avec les paramètres
        const metas = await fetchData(type, id, extraParams, cacheDuration);

        // Logs pour les données récupérées
        log.info(`Fetched ${metas.length} items from TMDB for type: ${type}, id: ${id}`);
        
        // Construction de la réponse avec gestion du cache
        const response = {
            metas,
            cacheMaxAge: 3600, // Cache-Control: max-age=1h
            staleRevalidate: 86400, // Stale-while-revalidate: 1 jour
            staleError: 43200 // Stale-if-error: 12 heures
        };

        res.json(response);
    } catch (error) {
        log.error(`Error fetching catalog data: ${error.message}`);
        res.status(500).json({ metas: [] });
    }
});

router.use(errorHandler);

module.exports = router;
