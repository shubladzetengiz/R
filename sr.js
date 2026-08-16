/*!
 * Lampa plugin: radio-t
 * Добавляет в левое меню Lampa пункт "radio-t", который открывает список
 * выпусков подкаста Radio-T из RSS (http://feeds.rucast.net/radio-t) и
 * проигрывает выбранный выпуск в аудиоплеере.
 *
 * Установка:
 *   1. Залейте этот файл в свой репозиторий на GitHub (например, через
 *      GitHub Pages), чтобы получить прямую ссылку вида:
 *      https://<user>.github.io/<repo>/radio-t.js
 *   2. В Lampa: Настройки -> Расширения -> Добавить плагин -> вставьте ссылку.
 *
 * Примечание про CORS:
 *   Сервер feeds.rucast.net, как и большинство RSS-хостингов, обычно не
 *   отдаёт заголовки CORS. Внутри нативного Android-приложения Lampa запросы
 *   идут через собственный сетевой слой и CORS не мешает. В веб-версии
 *   (браузер / lampa.mx) браузер может заблокировать прямой запрос — на этот
 *   случай ниже предусмотрен резервный публичный CORS-прокси. Если он
 *   недоступен/заблокирован у вас в регионе, замените CORS_PROXY на свой.
 */
(function () {
    'use strict';

    if (window.radio_t_plugin_installed) return;
    window.radio_t_plugin_installed = true;

    // Важно: именно https, иначе браузер/WebView блокирует запрос как
    // "смешанный контент", когда сама Lampa открыта по https (lampa.mx и т.п.)
    var RSS_URL = 'https://feeds.rucast.net/radio-t';

    // Цепочка резервных CORS-прокси на случай, если у RSS-сервера нет
    // заголовков CORS и браузерная версия Lampa не может сделать запрос
    // напрямую. Пробуем по очереди, пока один не сработает.
    var CORS_PROXIES = [
        function (url) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url); },
        function (url) { return 'https://corsproxy.io/?' + encodeURIComponent(url); },
        function (url) { return 'https://r.jina.ai/' + url; }
    ];

    var COMPONENT_NAME = 'radio_t';
    var MENU_TITLE = 'radio-t';

    // ---------- вспомогательные функции ----------

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
            var xml = new DOMParser().parseFromString(xmlText, 'text/xml');

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

    function requestOnce(url, onSuccess, onError) {
        var network = new Lampa.Reguest();
        network.timeout(15000);
        network.silent(url, onSuccess, onError, false);
    }

    // Пробуем: 1) прямой запрос к RSS, 2) по очереди резервные CORS-прокси.
    // Останавливаемся на первом варианте, который вернул валидный список
    // выпусков.
    function fetchEpisodes(onSuccess, onError) {
        var urls = [RSS_URL].concat(CORS_PROXIES.map(function (build) { return build(RSS_URL); }));
        var i = 0;

        function tryNext() {
            if (i >= urls.length) {
                onError();
                return;
            }

            var url = urls[i++];

            requestOnce(
                url,
                function (text) {
                    var episodes = parseRss(text);
                    if (episodes.length) onSuccess(episodes);
                    else tryNext();
                },
                function () {
                    tryNext();
                }
            );
        }

        tryNext();
    }

    // ---------- компонент экрана со списком выпусков ----------

    function RadioTComponent(object) {
        var activity = object && object.activity;
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var html = $('<div class="radio-t-component"></div>');
        var body = $('<div class="items-line radio-t-list"></div>');
        var status = $('<div class="radio-t-status">Radio-T</div>');
        var episodes = [];
        var audio = null;
        var current_index = -1;

        function setLoader(state) {
            if (activity && activity.loader) activity.loader(state);
        }

        function toggleActivity() {
            if (activity && activity.toggle) activity.toggle();
        }

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

        function updateStatus(text) {
            status.text(text);
        }

        function highlightPlaying() {
            body.find('.radio-t-item').removeClass('radio-t-item--playing');
            body.find('.radio-t-item').eq(current_index).addClass('radio-t-item--playing');
        }

        function playEpisode(index) {
            if (index < 0 || index >= episodes.length) return;

            var ep = episodes[index];
            var player = ensureAudio();

            current_index = index;
            player.src = ep.url;
            player.play()['catch'](function () {
                Lampa.Noty.show('Не удалось начать воспроизведение');
            });

            Lampa.Noty.show('▶ ' + ep.title);
            updateStatus('Сейчас играет: ' + ep.title);
            highlightPlaying();
        }

        function togglePause(index) {
            var player = ensureAudio();

            if (current_index === index && !player.paused) {
                player.pause();
                updateStatus('Пауза: ' + episodes[index].title);
            } else {
                playEpisode(index);
            }
        }

        function buildItem(ep, index) {
            var item = $(
                '<div class="radio-t-item selector" data-index="' + index + '">' +
                    '<div class="radio-t-item__title">' + escapeHtml(ep.title) + '</div>' +
                    '<div class="radio-t-item__date">' + escapeHtml(ep.date) + '</div>' +
                '</div>'
            );

            item.on('hover:enter', function () {
                togglePause(index);
            });

            return item;
        }

        this.create = function () {
            setLoader(true);

            fetchEpisodes(
                function (data) {
                    episodes = data;

                    episodes.forEach(function (ep, index) {
                        body.append(buildItem(ep, index));
                    });

                    html.append(status);
                    scroll.append(body);
                    html.append(scroll.render());

                    setLoader(false);
                    toggleActivity();
                },
                function () {
                    setLoader(false);
                    Lampa.Noty.show('Не удалось загрузить RSS radio-t');
                    if (Lampa.Activity && Lampa.Activity.backward) Lampa.Activity.backward();
                }
            );

            return this.render();
        };

        this.render = function (js) {
            return js ? html : $(html);
        };

        this.start = function () {
            Lampa.Controller.add('content', {
                toggle: function () {
                    Lampa.Controller.collectionSet(scroll.render());
                    Lampa.Controller.collectionFocus(false, scroll.render());
                },
                back: function () {
                    if (audio) audio.pause();
                    Lampa.Activity.backward();
                }
            });

            Lampa.Controller.toggle('content');
        };

        this.pause = function () {};
        this.stop = function () {};

        this.destroy = function () {
            if (audio) {
                audio.pause();
                audio.remove();
                audio = null;
            }

            scroll.destroy();
            html.remove();
            body.remove();
        };
    }

    // ---------- стили ----------

    function addStyles() {
        var style = document.createElement('style');
        style.innerHTML =
            '.radio-t-status{padding:0 1em 1em;font-size:1.3em;opacity:.8}' +
            '.radio-t-list{display:flex;flex-direction:column}' +
            '.radio-t-item{padding:1em;margin-bottom:.5em;border-radius:.5em;background:rgba(255,255,255,.05)}' +
            '.radio-t-item.focus{background:rgba(255,255,255,.15)}' +
            '.radio-t-item--playing{border-left:.3em solid #fff}' +
            '.radio-t-item__title{font-size:1.2em;margin-bottom:.3em}' +
            '.radio-t-item__date{font-size:.9em;opacity:.6}';
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
