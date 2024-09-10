const manifest = {
    id: 'community.stremiotmdbdice',
    version: '1.0.0',
    logo: "https://i.imgur.com/jEPaX6R.png",
    name: 'stremio-tmdb-dice',
    description: 'Random content from TMDB',
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
    resources: ['catalog'],
    catalogs: [
        {
            type: "movie",
            id: "random_movies",
            name: "Random Movies",
            extra: [
                { name: "genre", options: ["Action", "Comedy", "Drama", "Horror"], isRequired: false },
                { name: "rating", options: ["0-2", "2-4", "4-6", "6-8", "8-10"], isRequired: true },
                { name: "year", options: ["2004-2008", "2008-2012", "2012-2016", "2016-2020", "2020-2024"], isRequired: true }
            ]
        },
        {
            type: "series",
            id: "random_series",
            name: "Random Series",
            extra: [
                { name: "genre", options: ["Action", "Comedy", "Drama", "Horror"], isRequired: false },
                { name: "rating", options: ["0-2", "2-4", "4-6", "6-8", "8-10"], isRequired: true },
                { name: "year", options: ["2004-2008", "2008-2012", "2012-2016", "2016-2020", "2020-2024"], isRequired: true }
            ]
        }
    ],
    behaviorHints: {
        configurable: true,
        configurationRequired: false,
    },
    config: [
        {
            key: 'tmdbApiKey',
            type: 'text',
            title: 'TMDB API Key (<a href="https://www.themoviedb.org/settings/api" target="_blank">Get it here</a>)',
        },
        {
            key: 'language',
            type: 'text',
            title: 'Language',
        }
    ]
};

module.exports = manifest;
