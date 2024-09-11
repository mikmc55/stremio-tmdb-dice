document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('dark-mode-toggle');
    toggle.textContent = '🌜';

    toggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        toggle.textContent = document.body.classList.contains('dark-mode') ? '🌜' : '🌞';
    });

    function populateLanguageDropdown() {
        const dropdown = document.getElementById('language');
        languages.forEach(lang => {
            const option = document.createElement('option');
            option.value = lang.iso_639_1;
            option.textContent = lang.english_name + (lang.name ? ` (${lang.name})` : '');
            dropdown.appendChild(option);
        });
    }
    populateLanguageDropdown();

    function getConfig() {
        const tmdbApiKey = document.getElementById('tmdb-api-key').value;
        const language = document.getElementById('language').value;

        if (!tmdbApiKey || !language) {
            showModal('Warning', 'Please fill in all required fields: TMDB API Key and Language.', 'btn-error');
            return null;
        }

        const config = {
            tmdbApiKey: tmdbApiKey,
            language: language,
            hideNoPoster: document.getElementById('hide-no-poster').checked,
            filterAdult: document.getElementById('filter-adult').checked
        };
        return config;
    }

    function showModal(headerText, message, buttonClass) {
        const modal = document.getElementById('modal');
        const overlay = document.getElementById('modal-overlay');
        const modalHeader = document.getElementById('modal-header');
        const modalBody = document.getElementById('modal-body');
        const closeModalButton = document.getElementById('close-modal');

        modalHeader.textContent = headerText;
        modalBody.textContent = message;
        closeModalButton.className = 'btn ' + buttonClass;
        modal.classList.add('show');
        overlay.classList.add('show');

        closeModalButton.onclick = () => {
            modal.classList.remove('show');
            overlay.classList.remove('show');
        };
    }

    function showSuccessNotification(message) {
        const notification = document.getElementById('notification-success');
        const notificationText = document.getElementById('notification-text');

        notificationText.textContent = message;
        notification.classList.add('show');

        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    }

    function getStremioLink() {
        const config = getConfig();
        if (!config) return;
        return "stremio://" + window.location.host + "/" + encodeURIComponent(JSON.stringify(config)) + "/manifest.json";
    }

    function getHttpsLink() {
        const config = getConfig();
        if (!config) return;
        return "https://" + window.location.host + "/" + encodeURIComponent(JSON.stringify(config)) + "/manifest.json";
    }

    document.querySelector('.install').addEventListener('click', () => {
        const installURL = getStremioLink();
        if (installURL) {
            window.location.href = installURL;
        }
    });

    document.querySelector('.copy-link').addEventListener('click', () => {
        const copyURL = getHttpsLink();
        if (copyURL) {
            navigator.clipboard.writeText(copyURL).then(() => {
                showSuccessNotification('Link copied to clipboard!');
            }).catch(err => {
                console.error('Failed to copy the link: ', err);
            });
        }
    });
});