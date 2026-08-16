(function () {
    'function' == typeof define && define.amd ? define(start) : start();

    function start() {
        // Ждем полной загрузки Lampa
        if (window.appready) {
            initPlugin();
        } else {
            Lampa.Listener.follow('app', function (e) {
                if (e.type === 'ready') initPlugin();
            });
        }
    }

    function initPlugin() {
        // Добавляем пункт "SelfRadio" в левое меню Lampa
        Lampa.Menu.add({
            title: 'SelfRadio',
            icon: '<svg height="24" viewBox="0 0 24 24" width="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>',
            component: 'selfradio',
            page: 'selfradio'
        });

        // Создаем компонент страницы
        Lampa.Component.add('selfradio', function () {
            var comp = this;
            var scroll = new Lampa.Scroll({ mask: true, over: true });
            var files = new Lampa.Files();

            this.create = function () {
                this.activity.loader(true);

                // Если плейлист лежит локально (на устройстве), укажите путь
                // Например: 'http://localhost:8080/playlist.m3u' или путь в локальной сети
                var playlistUrl = 'http://localhost:8080/playlist.m3u';

                Lampa.Reguest.native(playlistUrl, function (data) {
                    comp.build(parseM3U(data));
                }, function () {
                    Lampa.Noty.show('Ошибка загрузки M3U плейлиста');
                    comp.activity.loader(false);
                }, false, { dataType: 'text' });

                return scroll.render();
            };

            this.build = function (tracks) {
                this.activity.loader(false);

                if (!tracks.length) {
                    var empty = Lampa.Template.get('empty', { title: 'Плейлист пуст' });
                    scroll.append(empty);
                    return;
                }

                tracks.forEach(function (track) {
                    var item = Lampa.Template.get('button', { title: track.name });
                    
                    item.on('hover:enter', function () {
                        // Запуск аудиопотока через встроенный плеер Lampa
                        Lampa.Player.play({
                            title: track.name,
                            url: track.url,
                            timeline: false
                        });
                        Lampa.Player.playlist([track]);
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
                    left: function () { Lampa.Controller.toggle('menu'); },
                    up: function () { Lampa.Navigator.move('up'); },
                    down: function () { Lampa.Navigator.move('down'); }
                });
                Lampa.Controller.toggle('content');
            };

            this.pause = function () {};
            this.stop = function () {};
            this.destroy = function () {
                scroll.destroy();
            };
        });
    }

    // Простой парсер M3U
    function parseM3U(content) {
        var lines = content.split('\n');
        var result = [];
        var currentName = '';

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (line.startsWith('#EXTINF:')) {
                var commaIndex = line.indexOf(',');
                if (commaIndex !== -1) {
                    currentName = line.substring(commaIndex + 1).trim();
                }
            } else if (line && !line.startsWith('#')) {
                result.push({
                    name: currentName || line,
                    url: line
                });
                currentName = '';
            }
        }
        return result;
    }
})();
