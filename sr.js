(function () {
    'use strict';

    function startPlugin() {
        // 1. Подготавливаем иконку радио (SVG)
        var radioIcon = '<svg height="24" viewBox="0 0 24 24" width="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9c3.9 3.9 3.9 10.2 0 14.1"/></svg>';

        // 2. Регистрируем компонент страницы
        Lampa.Component.add('selfradio', function () {
            var comp = this;
            var scroll = new Lampa.Scroll({ mask: true, over: true });

            this.create = function () {
                this.activity.loader(true);

                // Укажите ссылку на ваш M3U/M3U8 плейлист
                var playlistUrl = 'http://localhost:8080/playlist.m3u';

                // Используем встроенный Native Request
                Lampa.Reguest.native(playlistUrl, function (data) {
                    comp.build(parseM3U(data));
                }, function () {
                    comp.activity.loader(false);
                    Lampa.Noty.show('SelfRadio: Ошибка загрузки плейлиста');
                }, false, { dataType: 'text' });

                return scroll.render();
            };

            this.build = function (tracks) {
                this.activity.loader(false);

                if (!tracks || !tracks.length) {
                    var empty = Lampa.Template.get('empty', { title: 'Плейлист пуст или не найден' });
                    scroll.append(empty);
                    return;
                }

                tracks.forEach(function (track) {
                    var item = Lampa.Template.get('button', { title: track.name });
                    
                    item.on('hover:enter', function () {
                        // Запуск проигрывания аудиочерез плеер Lampa
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

        // 3. Добавляем пункт в левое меню Lampa
        Lampa.Menu.add({
            title: 'SelfRadio',
            icon: radioIcon,
            component: 'selfradio',
            page: 'selfradio'
        });
    }

    // Простой M3U-парсер
    function parseM3U(content) {
        if (!content) return [];
        var lines = content.split(/\r?\n/);
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

    // 4. Безопасный запуск после полной инициализации Lampa
    if (window.appready) {
        startPlugin();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') {
                startPlugin();
            }
        });
    }
})();
ц
