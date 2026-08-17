(function () {
    'use strict';

    // Подгружаем библиотеку PeerJS динамически
    let script = document.createElement('script');
    script.src = 'https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js';
    document.head.appendChild(script);

    let peer = null;
    let conn = null;
    let isRemoteAction = false;
    let myCode = '';

    // Генерация случайного короткого кода комнаты (напр. "WP-4821")
    function generateRoomCode() {
        return 'WP-' + Math.floor(1000 + Math.random() * 9000);
    }

    // Инициализация P2P соединения
    function initP2P(roomCode, isHost) {
        if (!window.Peer) {
            Lampa.Noty.show('Библиотека PeerJS еще не загрузилась, попробуйте снова.');
            return;
        }

        const peerId = isHost ? roomCode : undefined;
        peer = new Peer(peerId);

        peer.on('open', (id) => {
            if (isHost) {
                Lampa.Noty.show('Комната создана! Ваш код: ' + id);
            } else {
                // Если мы гость — подключаемся к хосту
                conn = peer.connect(roomCode);
                setupConnection();
            }
        });

        // Если мы хост — ждем подключения гостя
        peer.on('connection', (incomingConn) => {
            conn = incomingConn;
            Lampa.Noty.show('Друг подключился к просмотру!');
            setupConnection();
        });

        peer.on('error', (err) => {
            Lampa.Noty.show('Ошибка P2P: ' + err.type);
        });
    }

    // Обработка входящих команд от друга
    function setupConnection() {
        conn.on('data', (data) => {
            isRemoteAction = true;

            if (data.type === 'pause') {
                Lampa.Player.pause();
            } else if (data.type === 'play') {
                Lampa.Player.play();
            } else if (data.type === 'seek') {
                Lampa.Player.to(data.time);
            }

            setTimeout(() => {
                isRemoteAction = false;
            }, 400);
        });

        conn.on('close', () => {
            Lampa.Noty.show('Совместный просмотр завершен');
        });
    }

    // Отправка действий партнеру
    function sendAction(actionData) {
        if (conn && conn.open && !isRemoteAction) {
            conn.send(actionData);
        }
    }

    // Отслеживание действий плеера Lampa
    function listenPlayerEvents() {
        Lampa.Player.listener.follow('state', (e) => {
            if (e.state === 'play') {
                sendAction({ type: 'play' });
            } else if (e.state === 'pause') {
                sendAction({ type: 'pause' });
            }
        });

        // Отслеживание ручной перемотки
        let lastTime = 0;
        Lampa.Player.listener.follow('time', (e) => {
            if (Math.abs(e.time - lastTime) > 3) { // Перемотка более чем на 3 секунды
                sendAction({ type: 'seek', time: e.time });
            }
            lastTime = e.time;
        });
    }

    // Меню управления плагином в Lampa
    function showPartyMenu() {
        Lampa.Select.show({
            title: 'WParty - Совместный просмотр',
            items: [
                { title: 'Создать комнату (Хост)', action: 'create' },
                { title: 'Войти по коду', action: 'join' }
            ],
            onSelect: (item) => {
                if (item.action === 'create') {
                    myCode = generateRoomCode();
                    initP2P(myCode, true);
                } else if (item.action === 'join') {
                    Lampa.Input.edit({
                        title: 'Введите код комнаты (например WP-1234)',
                        value: ''
                    }, (code) => {
                        if (code) {
                            initP2P(code.trim(), false);
                        }
                    });
                }
            }
        });
    }

    // Запуск плагина
    function startPlugin() {
        listenPlayerEvents();

        // Регистрируем кнопку в настройках Lampa
        Lampa.SettingsApi.addComponent({
            component: 'wparty_p2p',
            name: 'WParty (Совместный просмотр)',
            icon: '<svg height="24" viewBox="0 0 24 24" width="24"><path d="M0 0h24v24H0z" fill="none"/><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>'
        });

        // Слушаем открытие нашего компонента в настройках
        Lampa.Listener.follow('open', (e) => {
            if (e.name === 'wparty_p2p') {
                showPartyMenu();
            }
        });
    }

    if (window.appready) {
        startPlugin();
    } else {
        Lampa.Listener.follow('app', (e) => {
            if (e.type === 'ready') startPlugin();
        });
    }
})();
