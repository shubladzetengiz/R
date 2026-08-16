(function () {
    'use strict';

    // Фxozoункция загрузки и парсинга RSS
    function fetchRadioT(callback) {
        // RSS-лента Радио-Т
        var rssUrl = 'https://radio-t.com/rss/';
        // Используем открытый CORS-прокси для чтения XML в браузере
        var proxyUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(rssUrl);

        fetch(proxyUrl)
            .then(function (response) { return response.text(); })
            .then(function (str) {
                var parser = new DOMParser();
                var xml = parser.parseFromString(str, 'text/xml');
                var items = xml.querySelectorAll('item');
                var result = [];

                items.forEach(function (item) {
                    var title = item.querySelector('title') ? item.querySelector('title').textContent : 'Выпуск';
                    var enclosure = item.querySelector('enclosure');
                    var audioUrl = enclosure ? enclosure.getAttribute('url') : '';
                    var pubDate = item.querySelector('pubDate') ? item.querySelector('pubDate').textContent : '';

                    if (audioUrl) {
                        result.push({
                            title: title,
                            url: audioUrl,
                            date: pubDate
                        });
                    }
                });

                callback(result);
            })
            .catch(function (e) {
                Lampa.Noty.show('Ошибка загрузки RSS Radio T');
            });
    }

    // Компонент отображения списка выпусков
    function RadioTComponent(object) {
        var comp = this;
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var files = new Lampa.Files();

        this.create = function () {
            this.activity.loader(true);

            fetchRadioT(function (episodes) {
                comp.activity.loader(false);

                if (!episodes.length) {
                    scroll.append(Lampa.Template.get('empty', { title: 'Нет доступных выпусков' }));
                    return;
                }

                episodes.forEach(function (ep) {
                    var item = Lampa.Template.get('button', { title: ep.title });
                    
                    item.on('hover:enter', function () {
                        // Запуск во встроенном плеере Lampa
                        Lampa.Player.play({
                            title: ep.title,
                            url: ep.url,
                            timeline: { time: 0 }
                        });
                        Lampa.Player.playlist([{ title: ep.title, url: ep.url }]);
                    });

                    scroll.append(item);
                });

                // Включаем навигацию для пульта / стрелок
                Lampa.Controller.add('content', {
                    toggle: function () {
                        Lampa.Controller.collectionSet(scroll.render());
                        Lampa.Controller.collectionFocus(false, scroll.render());
                    },
                    left: function () { Lampa.Sidebar.open(); },
                    up: function () { Lampa.Controller.collectionFocus(true, scroll.render()); },
                    down: function () { Lampa.Controller.collectionFocus(false, scroll.render()); }
                });

                Lampa.Controller.toggle('content');
            });

            return scroll.render();
        };
    }

    // Регистрация компонента в системе
    Lampa.Component.add('radio_t', RadioTComponent);

    // Добавление кнопки в боковое меню
    function addMenuButton() {
        var menu = Lampa.Sidebar.object;
        if (!menu) return;

        // Создаем кнопку в меню
        var item = $('<li class="menu__item selector" data-action="radio_t">' +
                        '<div class="menu__ico">' +
                            '<svg height="24" viewBox="0 0 24 24" width="24" fill="currentColor">' +
                                '<path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>' +
                            '</svg>' +
                        '</div>' +
                        '<div class="menu__text">Radio T</div>' +
                    '</li>');

        item.on('hover:enter', function () {
            Lampa.Activity.push({
                url: '',
                title: 'Radio T',
                component: 'radio_t',
                page: 1
            });
        });

        $('.menu .menu__list').append(item);
    }

    // Старт плагина после полной инициализации Lampa
    if (window.appready) {
        addMenuButton();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') addMenuButton();
        });
    }
})();
