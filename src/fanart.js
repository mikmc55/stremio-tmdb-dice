const axios = require('axios');

const getFanartPoster = async (tmdbId, preferredLang, fanartApiKey) => {
    try {
        const url = `https://webservice.fanart.tv/v3/movies/${tmdbId}/?api_key=${fanartApiKey}`;
        
        console.log(`Fetching Fanart logos from: ${url}`);

        const response = await axios.get(url);
        const logos = response.data.hdmovielogo || [];
        
        console.log(`Logos fetched: ${JSON.stringify(logos)}`);

        const preferredLangLogos = logos.filter(logo => logo.lang === preferredLang);
        console.log(`Logos in preferred language (${preferredLang}): ${JSON.stringify(preferredLangLogos)}`);

        const bestLogoInPreferredLang = preferredLangLogos.sort((a, b) => b.likes - a.likes)[0];
        console.log(`Best logo in preferred language: ${JSON.stringify(bestLogoInPreferredLang)}`);

        if (!bestLogoInPreferredLang) {
            const englishLogos = logos.filter(logo => logo.lang === 'en');
            console.log(`Logos in English: ${JSON.stringify(englishLogos)}`);

            const bestLogoInEnglish = englishLogos.sort((a, b) => b.likes - a.likes)[0];
            console.log(`Best logo in English: ${JSON.stringify(bestLogoInEnglish)}`);

            return bestLogoInEnglish ? bestLogoInEnglish.url.replace('http://', 'https://') : '';
        }

        const bestLogoUrl = bestLogoInPreferredLang.url.replace('http://', 'https://');
        console.log(`Best logo URL: ${bestLogoUrl}`);
        return bestLogoUrl;
    } catch (error) {
        console.error(`Error fetching logos from Fanart.tv for TMDB ID ${tmdbId}:`, error.message);
        return '';
    }
};

module.exports = { getFanartPoster };
