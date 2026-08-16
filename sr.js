(function () {
    'use strict';

    // SVG-иконка радио для бокового меню
    var RADIO_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-10.48 0a6 6 0 0 1 0-8.49M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14"/></svg>';

    // RSS-лента подкаста и CORS-прокси
    var RSS_URL = 'http://feeds.rucast.net/radio-t';
    var PROXY_URL = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(RSS_URL);

    // 1. Определение компонента отображения подкастов
    function RadioTComponent() {
        var self = this;
        var scroll;
        var items = [];
        var activeIndex = 0;

        this.create = function () {
            // Создаем структуру компонента Lampa
            this.activity.loader = true;
            
            scroll = new Lampa.Scroll({
                mask: true,
                over: true
            });

            this.activity.toggle();
            this.fetchEpisodes();

            return scroll.render();
        };

        // Загрузка и парсинг RSS
        this.fetchEpisodes = function () {
            var network = new Lampa.Reguest();
            
            network.native(PROXY_URL, function (data) {
                try {
                    var parser = new DOMParser();
                    var xmlDoc = parser.parseFromString(data, "text/xml");
                    var xmlItems = xmlDoc.querySelectorAll("item");
                    
                    items = [];
                    xmlItems.forEach(function (item) {
                        var titleElem = item.querySelector("title");
                        var enclosureElem = item.querySelector("enclosure");
                        
                        var title = titleElem ? titleElem.textContent : 'Без названия';
                        var audioUrl = enclosureElem ? enclosureElem.getAttribute("url") : null;

                        if (audioUrl) {
                            items.push({
                                title: title,
                                url: audioUrl
                            });
                        }
                    });

                    self.buildList();
                } catch (e) {
                    self.showError('Ошибка парсинга RSS-ленты');
                }
            }, function () {
                self.showError('Не удалось загрузить список выпусков');
            }, false, { dataType: 'text' });
        };

        // Построение DOM-элементов списка
        this.buildList = function () {
            scroll.clear();

            if (items.length === 0) {
                this.showError('Выпуски не найдены');
                return;
            }

            var body = $('<div class="radio-t-list" style="padding: 1.5em;"></div>');

            items.forEach(function (element, index) {
                var itemDom = $('<div class="selectable selector" style="padding: 1em; margin-bottom: 0.5em; background: rgba(255,255,255,0.05); border-radius: 0.5em; cursor: pointer;">' +
                    '<div style="font-size: 1.2em; font-weight: bold;">' + element.title + '</div>' +
                '</div>');

                itemDom.on('hover:enter', function () {
                    self.playEpisode(element);
                });

                body.append(itemDom);
            });

            scroll.append(body);
            this.activity.loader = false;
            this.activity.toggle();
            
            // Регистрируем компонент в контроллере навигации Lampa
            self.startController();
        };

        // Запуск штатного плеера Lampa
        this.playEpisode = function (episode) {
            var playlistData = {
                title: episode.title,
                url: episode.url
            };

            Lampa.Player.play(playlistData);
            Lampa.Player.playlist([playlistData]);
        };

        // Настройка фокусировки для пульта ДУ
        this.startController = function () {
            Lampa.Controller.add('content', {
                toggle: function () {
                    var selectables = scroll.render().find('.selectable');
                    Lampa.Controller.collectionSet(scroll.render());
                    Lampa.Controller.collectionFocus(selectables.eq(activeIndex)[0] || selectables.first()[0], scroll.render());
                },
                left: function () {
                    Lampa.Controller.toggle('menu');
                },
                up: function () {
                    if (navigator.move('up')) {
                        activeIndex = scroll.render().find('.selectable').index(Lampa.Controller.focused());
                    } else {
                        Lampa.Controller.toggle('head');
                    }
                },
                down: function () {
                    if (navigator.move('down')) {
                        activeIndex = scroll.render().find('.selectable').index(Lampa.Controller.focused());
                    }
                },
                back: function () {
                    Lampa.Activity.backward();
                }
            });

            Lampa.Controller.toggle('content');
        };

        this.showError = function (message) {
            scroll.clear();
            var errorDom = $('<div style="padding: 2em; text-align: center; color: #ff5252;">' + message + '</div>');
            scroll.append(errorDom);
            this.activity.loader = false;
            this.activity.toggle();
        };

        this.start = function () {
            this.startController();
        };

        this.pause = function () {};
        this.stop = function () {};
        this.destroy = function () {
            scroll.destroy();
            items = null;
        };
    }

    // 2. Безопасная инициализация плагина с проверкой готовности среды Lampa
    function initPlugin() {
        if (
            typeof window.Lampa !== 'undefined' &&
            Lampa.Menu &&
            Lampa.Component &&
            Lampa.Player &&
            Lampa.Listener
        ) {
            // Регистрация кастомного компонента
            Lampa.Component.add('radio_t', RadioTComponent);

            // Добавление пункта меню
            var addMenuItem = function () {
                var menuList = $('.menu .menu__list');
                if (menuList.length && !menuList.find('.menu__item[data-action="radio_t"]').length) {
                    var menuItem = $('<li class="menu__item selector" data-action="radio_t">' +
                        '<div class="menu__ico">' + RADIO_ICON + '</div>' +
                        '<div class="menu__text">Radio-T</div>' +
                    '</li>');

                    menuItem.on('hover:enter', function () {
                        Lampa.Activity.push({
                            url: '',
                            title: 'Radio-T',
                            component: 'radio_t',
                            page: 1
                        });
                    });

                    // Вставляем пункт меню перед настройками или в конец
                    var settingsItem = menuList.find('[data-action="settings"]');
                    if (settingsItem.length) {
                        menuItem.insertBefore(settingsItem);
                    } else {
                        menuList.append(menuItem);
                    }
                }
            };

            // Добавляем пункт в меню при готовности интерфейса
            Lampa.Listener.follow('app', function (e) {
                if (e.type === 'ready') {
                    addMenuItem();
                }
            });

            // Запасной запуск, если событие ready уже прошло
            addMenuItem();

        } else {
            // Если Lampa ещё не загрузилась, проверяем снова через 100мс
            setTimeout(initPlugin, 100);
        }
    }

    // Точка входа
    initPlugin();
})();
