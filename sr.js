(function () {
    // Ждем готовности Lampa
    function init() {
        if (!window.Lampa || !Lampa.Menu) return setTimeout(init, 1000);
        
        Lampa.Menu.add({
            title: 'SelfRadio',
            component: 'selfradio',
            page: 'selfradio'
        });

        Lampa.Component.add('selfradio', function () {
            this.create = function () {
                return Lampa.Template.get('empty', { title: 'Плагин работает!' });
            };
        });
        
        console.log('SelfRadio plugin initialized');
    }
    init();
})();
