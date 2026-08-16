/*!
 * Lampa plugin: radio-t
 * Добавляет в левое меню Lampa пункт "radio-t". Плагин сначала читает
 * плейлист sr.m3u (лежащий в том же репозитории, рядом со скриптом),
 * берёт из него ссылку на RSS подкаста Radio-T, затем загружает и
 * разбирает сам RSS и проигрывает выбранный выпуск в аудиоплеере.
 *
 * Файлы:
 *   sr.js  - этот файл (логика плагина)
 *   sr.m3u - плейлист с одной строкой: ссылка на RSS
 *            (https://feeds.rucast.net/radio-t)
 *
 * Установка:
 *   Оба файла должны лежать в одном репозитории/папке. В Lampa добавляется
 *   только sr.js (Настройки -> Расширения -> Добавить плагин), а sr.m3u
 *   подтягивается автоматически по тому же пути.
 *
 * Примечание про CORS:
 *   RSS-сервер обычно не отдаёт заголовки CORS, поэтому если прямой запрос
 *   из браузера не проходит, плагин последовательно пробует резервные
 *   публичные CORS-прокси.
 */
(function () {
    'use strict';

    if (window.radio_t_plugin_installed) return;
    window.radio_t_plugin_installed = true;

    // Адрес этого самого скрипта — нужен, чтобы вычислить путь к sr.m3u,
    // лежащему рядом с ним в том же репозитории/папке. Обязательно читаем
    // его синхронно в самом начале, до каких-либо async-операций.
    var CURRENT_SCRIPT_SRC = (document.currentScript && document.currentScript.src) || '';

    // Фолбэк, если по каким-то причинам не удалось определить путь к
    // соседнему sr.m3u (например, скрипт был вставлен через eval).
    // Подставьте сюда прямую ссылку на свой sr.m3u, если понадобится.
    var M3U_URL_FALLBACK = '';

    // Если и m3u не удалось прочитать вообще ни откуда — используем этот
    // RSS-адрес как последний резерв.
    var RSS_URL_FALLBACK = 'https://feeds.rucast.net/radio-t';

    // Резервные CORS-прокси, пробуются по очереди, если прямой запрос
    // (что к m3u, что к RSS) не проходит из-за отсутствия CORS-заголовков.
    var CORS_PROXIES = [
        function (url) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url); },
        function (url) { return 'https://corsproxy.io/?' + encodeURIComponent(url); },
        function (url) { return 'https://r.jina.ai/' + url; }
    ];

    var COMPONENT_NAME = 'radio_t';
    var MENU_TITLE = 'radio-t';

    // ---------- сеть ----------

    function requestOnce(url, onSuccess, onError) {
        var network = new Lampa.Reguest();
        network.timeout(15000);
        network.silent(url, onSuccess, onError, false);
    }

    // Пробует: 1) прямой запрос, 2) по очереди резервные CORS-прокси.
    // isValid(text) решает, считать ли ответ успешным (например, что это
    // не пустая страница ошибки прокси).
    function fetchWithFallback(url, isValid, onSuccess, onError) {
        var urls = [url].concat(CORS_PROXIES.map(function (build) { return build(url); }));
        var i = 0;

        function tryNext() {
            if (i >= urls.length) {
                onError();
                return;
            }

            requestOnce(
                urls[i++],
                function (text) {
                    if (isValid(text)) onSuccess(text);
                    else tryNext();
                },
                tryNext
            );
        }

        tryNext();
    }

    // ---------- m3u ----------

    function guessM3uUrl() {
        if (CURRENT_SCRIPT_SRC) return CURRENT_SCRIPT_SRC.replace(/[^\/]+$/, 'sr.m3u');
        return M3U_URL_FALLBACK;
    }

    // Достаёт первую непустую, некомментарийную строку m3u — это и есть
    // ссылка на RSS.
    function parseM3u(text) {
        var lines = (text || '').split(/\r?\n/);

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line || line.charAt(0) === '#') continue;
            return line;
        }

        return '';
    }

    function resolveRssUrl(onReady) {
        var m3uUrl = guessM3uUrl();

        if (!m3uUrl) {
            onReady(RSS_URL_FALLBACK);
            return;
        }

        fetchWithFallback(
            m3uUrl,
            function (text) { return !!parseM3u(text); },
            function (text) {
                onReady(parseM3u(text) || RSS_URL_FALLBACK);
            },
            function () {
                onReady(RSS_URL_FALLBACK);
            }
        );
    }

    // ---------- rss ----------

    function escapeHtml(str) {
        if (Lampa.Utils && Lampa.Utils.escapeHtml) return Lampa.Utils.escapeHtml(str || '');
        return (str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function textOf(node, selector) {
        var el = node.querySelector(selector);
        return el ? (el.textContent || '').trim() : '';
    }

    function parseRss(xmlText) {
        var items = [];

        try {
            var xml = new DOMParser().parseFromString(xmlText || '', 'text/xml');

            if (xml.querySelector('parsererror')) return items;

            var nodes = xml.querySelectorAll('item');

            nodes.forEach(function (node) {
                var enclosure = node.querySelector('enclosure');
                var url = enclosure ? enclosure.getAttribute('url') : '';

                if (!url) return;

                items.push({
                    title: textOf(node, 'title') || 'Без названия',
                    url: url.trim(),
                    date: textOf(node, 'pubDate'),
                    description: textOf(node, 'description')
                });
            });
        } catch (e) {
            console.error('[radio-t] rss parse error', e);
        }

        return items;
    }

    function fetchEpisodes(onSuccess, onError) {
        resolveRssUrl(function (rssUrl) {
            fetchWithFallback(
                rssUrl,
                function (text) { return parseRss(text).length > 0; },
                function (text) { onSuccess(parseRss(text)); },
                onError
            );
        });
    }

    // ---------- компонент экрана со списком выпусков ----------

    function RadioTComponent(object) {
        var self = this;
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var episodes = [];
        var audio = null;
        var current_index = -1;
        var last = null;
        var destroyed = false;

        scroll.body().addClass('radio-t-list');

        // ---------- жизненный цикл ----------

        this.create = function () {
            this.activity.loader(true);
            load();
            return this.render();
        };

        this.render = function () {
            return scroll.render();
        };

        this.start = function () {
            if (Lampa.Activity.active().activity !== this.activity) return;
            attachController();
            Lampa.Controller.toggle('content');
        };

        this.pause = function () {};
        this.stop = function () {};

        this.destroy = function () {
            destroyed = true;

            if (audio) {
                audio.pause();
                audio.remove();
                audio = null;
            }

            scroll.destroy();
            episodes = null;
        };

        // ---------- загрузка ----------

        function load() {
            fetchEpisodes(
                function (data) {
                    if (destroyed) return;
                    self.activity.loader(false);
                    episodes = data;
                    renderList();
                },
                function () {
                    if (destroyed) return;
                    self.activity.loader(false);
                    Lampa.Noty.show('Не удалось загрузить RSS radio-t');
                    showEmpty();
                }
            );
        }

        // ---------- рендер списка ----------

        function clearList() {
            scroll.body().empty();
        }

        function renderList() {
            clearList();

            if (!episodes.length) return showEmpty();

            episodes.forEach(function (ep, index) {
                var item = $(
                    '<div class="radio-t-item selector">' +
                        '<div class="radio-t-item__title">' + escapeHtml(ep.title) + '</div>' +
                        '<div class="radio-t-item__date">' + escapeHtml(ep.date) + '</div>' +
                    '</div>'
                );

                item.on('hover:focus', function (e) { last = e.target; });
                item.on('hover:enter', function () { togglePause(index); });

                scroll.append(item);
            });

            attachController();
            focusFirst();
        }

        function showEmpty() {
            clearList();

            var empty = Lampa.Template ? Lampa.Template.get('list_empty', {}) : null;

            if (empty && empty.find) {
                empty.find('.empty__descr').text('Не удалось загрузить RSS radio-t');
                scroll.append(empty);
            } else {
                scroll.append($('<div class="radio-t-empty">Не удалось загрузить RSS radio-t</div>'));
            }

            attachController();
            focusFirst();
        }

        // ---------- навигация/фокус ----------

        function attachController() {
            Lampa.Controller.add('content', {
                toggle: function () {
                    Lampa.Controller.collectionSet(scroll.render());
                    Lampa.Controller.collectionFocus(last || false, scroll.render());
                },
                back: function () {
                    if (audio) audio.pause();
                    Lampa.Activity.backward();
                }
            });
        }

        function focusFirst() {
            last = scroll.render().find('.selector').first()[0] || last;
            Lampa.Controller.toggle('content');
        }

        // ---------- воспроизведение ----------

        function ensureAudio() {
            if (audio) return audio;

            audio = document.createElement('audio');
            audio.setAttribute('playsinline', '');
            audio.style.display = 'none';
            document.body.appendChild(audio);

            audio.addEventListener('ended', function () {
                playEpisode(current_index + 1);
            });

            audio.addEventListener('error', function () {
                Lampa.Noty.show('Ошибка воспроизведения: ' + (episodes[current_index] ? episodes[current_index].title : ''));
            });

            return audio;
        }

        function highlightPlaying() {
            scroll.render().find('.radio-t-item').removeClass('radio-t-item--playing');
            scroll.render().find('.radio-t-item').eq(current_index).addClass('radio-t-item--playing');
        }

        function playEpisode(index) {
            if (!episodes || index < 0 || index >= episodes.length) return;

            var ep = episodes[index];
            var player = ensureAudio();

            current_index = index;
            player.src = ep.url;
            player.play()['catch'](function () {
                Lampa.Noty.show('Не удалось начать воспроизведение');
            });

            Lampa.Noty.show('▶ ' + ep.title);
            highlightPlaying();
        }

        function togglePause(index) {
            var player = ensureAudio();

            if (current_index === index && !player.paused) {
                player.pause();
            } else {
                playEpisode(index);
            }
        }
    }

    // ---------- стили ----------

    function addStyles() {
        var style = document.createElement('style');
        style.innerHTML =
            '.radio-t-list{display:flex;flex-direction:column;padding:1em}' +
            '.radio-t-item{padding:1em;margin-bottom:.5em;border-radius:.5em;background:rgba(255,255,255,.05)}' +
            '.radio-t-item.focus{background:rgba(255,255,255,.15)}' +
            '.radio-t-item--playing{border-left:.3em solid #fff}' +
            '.radio-t-item__title{font-size:1.2em;margin-bottom:.3em}' +
            '.radio-t-item__date{font-size:.9em;opacity:.6}' +
            '.radio-t-empty{padding:2em;font-size:1.3em;opacity:.7;text-align:center}';
        document.head.appendChild(style);
    }

    // ---------- пункт левого меню ----------

    function buildMenuButton() {
        var button = $(
            '<li class="menu__item selector" data-action="' + COMPONENT_NAME + '">' +
                '<div class="menu__ico">' +
                    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                        '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5"/>' +
                        '<path d="M9.5 8.5L15.5 12L9.5 15.5V8.5Z" fill="currentColor"/>' +
                    '</svg>' +
                '</div>' +
                '<div class="menu__text">' + MENU_TITLE + '</div>' +
            '</li>'
        );

        button.on('hover:enter', function () {
            Lampa.Activity.push({
                title: MENU_TITLE,
                component: COMPONENT_NAME,
                page: 1
            });
        });

        return button;
    }

    function addMenuButton() {
        try {
            var menu = Lampa.Menu.render();

            if (!menu || !menu.length) return false;
            if (menu.find('[data-action="' + COMPONENT_NAME + '"]').length) return true;

            var button = buildMenuButton();
            var settingsItem = menu.find('[data-action="settings"]');

            if (settingsItem.length) settingsItem.before(button);
            else menu.append(button);

            return true;
        } catch (e) {
            console.error('[radio-t] menu insert error', e);
            return false;
        }
    }

    // Lampa в некоторых сборках пересобирает левое меню уже после события
    // app:ready, из-за чего вставленный слишком рано пункт пропадает.
    // Поэтому пробуем несколько раз с задержкой, а дальше следим за меню
    // через MutationObserver и восстанавливаем пункт, если он исчез.
    function ensureMenuButtonPersists() {
        var menu = Lampa.Menu.render();
        if (!menu || !menu.length || !window.MutationObserver) return;

        var observer = new MutationObserver(function () {
            addMenuButton();
        });

        observer.observe(menu.get(0), { childList: true });
    }

    function scheduleMenuButtonInsertion() {
        addMenuButton();

        [300, 1000, 2000, 4000].forEach(function (delay) {
            setTimeout(addMenuButton, delay);
        });

        setTimeout(ensureMenuButtonPersists, 1000);
    }

    // ---------- запуск плагина ----------

    function startPlugin() {
        addStyles();
        Lampa.Component.add(COMPONENT_NAME, RadioTComponent);

        if (window.appready) {
            scheduleMenuButtonInsertion();
        } else {
            Lampa.Listener.follow('app', function (e) {
                if (e.type === 'ready') scheduleMenuButtonInsertion();
            });

            // на случай, если событие 'ready' уже прошло до подписки
            setTimeout(scheduleMenuButtonInsertion, 1500);
        }
    }

    startPlugin();
})();
