(function () {
    'use strict';

    Lampa.Utils.putStyle(`
        .radio-t-plugin {
            display: inline-block;
        }
    `);

    function startRadioTPlugin() {
        // Добавляем пункт в главное меню Lampa
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') {
                var streamUrl = 'http://feeds.rucast.net/radio-t';
                
                // Добавляем кнопку запуска в боковое/главное меню
                var menu_item = $(`
                    <div class="menu__item selector" data-action="radio-t">
                        <div class="menu__ico">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="2"></circle>
                                <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-11.31 0a6 6 0 0 1 0-8.49m14.14-2.83a10 10 0 0 1 0 14.14m-16.97 0a10 10 0 0 1 0-14.14"></path>
                            </svg>
                        </div>
                        <div class="menu__text">Радио-Т</div>
                    </div>
                `);

                menu_item.on('hover:enter', function () {
                    // Создаем объект элемента для плеера Lampa
                    var mediaData = {
                        title: 'Радио-Т',
                        subtitle: 'Прямой эфир / Подкаст',
                        url: streamUrl,
                        is_radio: true
                    };

                    // Запускаем встроенный плеер Lampa
                    Lampa.Player.play(mediaData);
                    Lampa.Player.playlist([mediaData]);
                });

                $('.menu .menu__list').append(menu_item);
            }
        });
    }

    if (window.appready) {
        startRadioTPlugin();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') startRadioTPlugin();
        });
    }
})();
