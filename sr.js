(function () {
    'use strict';

    function RadioTPlugin() {
        var rss_url = 'https://api.allorigins.win/raw?url=' + encodeURIComponent('http://feeds.rucast.net/radio-t');

        this.start = function () {
            Lampa.Component.add('radio_t', RadioComponent);

            var addMenuItem = function () {
                if ($('.menu .menu__list [data-action="radio_t"]').length) return;

                var item = $(
                    '<div class="menu__item selector" data-action="radio_t">' +
                        '<div class="menu__ico">' +
                            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.83a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/></svg>' +
                        '</div>' +
                        '<div class="menu__text">Радио-Т</div>' +
                    '</div>'
                );

                item.on('hover:enter', function () {
                    Lampa.Activity.push({
                        title: 'Радио-Т',
                        component: 'radio_t',
                        page: 1
                    });
                });

                $('.menu .menu__list').append(item);
            };

            Lampa.Listener.follow('app', function (e) {
                if (e.type === 'ready') addMenuItem();
            });
        };

        function RadioComponent(object) {
            var scroll  = new Lampa.Scroll({mask: true, over: true});
            var items   = [];
            var html    = $('<div class="category-full"></div>');
            var body    = $('<div class="category-full__body"></div>');
            var _this   = this;

            // Нативный аудио-плеер
            var audio = window.radioTAudioPlayer || new Audio();
            window.radioTAudioPlayer = audio;

            this.create = function () {
                this.activity.loader(true);

                $.ajax({
                    url: rss_url,
                    type: 'GET',
                    dataType: 'xml',
                    success: function (xml) {
                        _this.activity.loader(false);
                        var episodes = _this.parseRSS(xml);
                        if (episodes.length) {
                            _this.build(episodes);
                        } else {
                            html.append('<div class="empty">Не удалось распарсить выпуски</div>');
                        }
                    },
                    error: function () {
                        _this.activity.loader(false);
                        html.append('<div class="empty">Ошибка загрузки RSS-ленты</div>');
                    }
                });

                return this.render();
            };

            this.parseRSS = function (xml) {
                var list = [];
                var defaultImg = 'https://radio-t.com/images/radio-t-cover.png';

                $(xml).find('item').each(function () {
                    var $item = $(this);
                    var title = $item.find('title').text();
                    var pubDate = $item.find('pubDate').text();
                    var enclosure = $item.find('enclosure').attr('url');

                    if (enclosure) {
                        list.push({
                            title: title,
                            date: pubDate ? pubDate.split(' ').slice(1, 4).join(' ') : '',
                            url: enclosure,
                            img: defaultImg
                        });
                    }
                });

                return list;
            };

            this.build = function (episodes) {
                episodes.forEach(function (episode) {
                    var cardData = {
                        title: episode.title,
                        release_year: episode.date
                    };

                    var card = Lampa.Template.get('card', cardData);
                    card.find('.card__img').attr('src', episode.img);
                    card.addClass('selector');

                    // Клик по выпуску — запуск прямого аудиовещания
                    card.on('hover:enter', function () {
                        audio.src = episode.url;
                        audio.play();
                        
                        Lampa.Noty.show('Воспроизведение: ' + episode.title);
                    });

                    body.append(card);
                    items.push(card[0]);
                });

                html.append(body);
                scroll.append(html);

                _this.start();
            };

            this.render = function () {
                return scroll.render();
            };

            this.start = function () {
                Lampa.Controller.add('content', {
                    toggle: function () {
                        Lampa.Controller.collectionSet(scroll.render());
                        if (items.length) {
                            Lampa.Controller.collectionFocus(items[0], scroll.render());
                        }
                    },
                    left: function () {
                        Lampa.Controller.toggle('menu');
                    },
                    up: function () {
                        Lampa.Controller.toggle('head');
                    }
                });

                Lampa.Controller.toggle('content');
            };

            this.pause = function () {};
            this.stop = function () {};
            this.destroy = function () {
                scroll.destroy();
                html.remove();
                items = [];
            };
        }
    }

    if (window.appready) {
        new RadioTPlugin().start();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') new RadioTPlugin().start();
        });
    }
})();
