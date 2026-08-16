(function () {
    // Используем интервал вместо событий, чтобы точно дождаться загрузки
    var checkLampa = setInterval(function () {
        if (window.Lampa && Lampa.Menu && Lampa.Component) {
            clearInterval(checkLampa);
            initSelfRadio();
        }
    }, 500);

    function initSelfRadio() {
        // Добавляем пункт в меню
        Lampa.Menu.add({
            title: 'SelfRadio',
            component: 'selfradio',
            page: 'selfradio'
        });

        // Создаем пустую страницу (чтобы не упало)
        Lampa.Component.add('selfradio', function () {
            this.create = function () {
                var div = document.createElement('div');
                div.innerHTML = '<h1>SelfRadio работает!</h1>';
                div.style.padding = '50px';
                return div;
            };
        });
    }
})();
