(function () {
    'use strict';

    // Ожидаем полной загрузки структуры Lampa
    var checkLampa = setInterval(function () {
        if (window.Lampa && Lampa.Menu && Lampa.Component && Lampa.Player) {
            clearInterval(checkLampa);
            initRadioTPlugin();
        }
    }, 500);

    function initRadioTPlugin() {
        // Иконка микрофона/радио для меню
        var iconSVG = '<svg height="24" viewBox="0 0 24 24" width="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg>';

        // 1. Регистрируем компонент страницы
        Lampa.Component.add('radio_t', function () {
            var comp = this;
            var scroll = new Lampa.Scroll({ mask: true, over: true });

            this.create = function () {
                this.activity.loader(true);

                // Используем CORS-прокси, так как браузеры блокируют обычные HTTP-запросы без SSL
                var rssUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent('http://feeds.rucast.net/radio-t');

                Lampa.Reguest.native(rssUrl, function (data) {
                    try {
                        var episodes = parseRSS(data);
                        comp.build(episodes);
                    } catch (e) {
                        comp.showError('Ошибка обработки RSS-ленты');
                    }
                }, function () {
                    comp.showError('Ошибка загрузки RSS-ленты Radio-T');
                }, false, { dataType: 'text' });

                return scroll.render();
            };

            this.showError = function (msg) {
                this.activity.loader(false);
                Lampa.Noty.show(msg);
                var empty = Lampa.Template.get('empty', { title: msg });
                scroll.append(empty);
            };

            this.build = function (episodes) {
                this.activity.loader(false);

                if (!episodes || !episodes.length) {
                    this.showError('Выпуски не найдены');
                    return;
                }

                episodes.forEach(function (ep) {
                    var item = Lampa.Template.get('button', { title: ep.title });

                    item.on('hover:enter', function () {
                        // Запуск проигрывания аудио в встроенном плеере Lampa
                        Lampa.Player.play({
                            title: ep.title,
                            url: ep.url,
                            timeline: false
                        });
                        Lampa.Player.playlist([{ title: ep.title, url: ep.url }]);
                    });

                    scroll.append(item);
                });
            };

            this.start = function () {
                Lampa.Controller.add('content', {
                    toggle: function () {
                        Lampa.Controller.collectionSet(scroll.render());
                        Lampa.Controller.collectionFocus(false, scroll.render());
                    },
                    left: function () { 
                        Lampa.Controller.toggle('menu'); 
                    },
                    up: function () { 
                        Lampa.Navigator.move('up'); 
                    },
                    down: function () { 
                        Lampa.Navigator.move('down'); 
                    }
                });
                Lampa.Controller.toggle('content');
            };

            this.pause = function () {};
            this.stop = function () {};
            this.destroy = function () {
                scroll.destroy();
            };
        });

        // 2. Добавляем пункт "Radio-T" в боковое меню
        Lampa.Menu.add({
            title: 'Radio-T',
            icon: iconSVG,
            component: 'radio_t',
            page: 'radio_t'
        });
    }

    // Вспомогательный парсер XML/RSS-ленты
    function parseRSS(xmlText) {
        var parser = new DOMParser();
        var xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        var items = xmlDoc.querySelectorAll('item');
        var result = [];

        items.forEach(function (item) {
            var titleEl = item.querySelector('title');
            var enclosureEl = item.querySelector('enclosure');

            if (titleEl && enclosureEl) {
                var title = titleEl.textContent || titleEl.innerText;
                var url = enclosureEl.getAttribute('url');

                if (url) {
                    result.push({
                        title: title.trim(),
                        url: url.trim()
                    });
                }
            }
        });

        return result;
    }
})();
