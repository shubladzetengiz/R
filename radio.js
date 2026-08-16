//name: M3U & RSS Плеер
//version: 1.2.0
//author: Custom
//description: Воспроизведение подкастов и аудиопотоков из M3U плейлистов в Lampa

(function () {
    'use strict';

    var NAME = 'Радио-Т (M3U)';
    var COMPONENT = 'm3u_rss_player';
    
    // Встроенный M3U-плейлист
    var M3U_DATA = `#EXTM3U
#EXTINF:-1 group-title="Podcasts", Radio-T
http://feeds.rucast.net/radio-t`;

    var DEFAULT_COVER = 'https://radio-t.com/images/cover.jpg';

    // Вспомогательная функция для проксирования CORS
    function getProxyUrl(url) {
        return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url);
    }

    function parseM3U(content) {
        var lines = content.split('\n');
        var result = [];
        var currentItem = {};

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line) continue;

            if (line.startsWith('#EXTINF:')) {
                var titleMatch = line.match(/,(.+)$/);
                var title = titleMatch ? titleMatch[1].trim() : 'Аудиопоток';
                
                var logoMatch = line.match(/tvg-logo="([^"]+)"/);
                var logo = logoMatch ? logoMatch[1] : DEFAULT_COVER;

                currentItem = {
                    title: title,
                    cover: logo
                };
            } else if (!line.startsWith('#')) {
                if (currentItem.title) {
                    currentItem.url = line;
                    result.push(currentItem);
                    currentItem = {};
                }
            }
        }
        return result;
    }

    function parseFeed(text) {
        var list = [];
        if (!text) return list;

        var doc;
        try {
            doc = new DOMParser().parseFromString(text, 'text/xml');
        } catch (e) {
            return list;
        }

        if (!doc || !doc.querySelectorAll) return list;

        var nodes = doc.querySelectorAll('item');

        for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            var enc = node.getElementsByTagName('enclosure')[0] || node.getElementsByTagName('media:content')[0];
            var audioUrl = enc ? enc.getAttribute('url') : '';

            if (!audioUrl) continue;

            var imgEl = node.getElementsByTagName('itunes:image')[0] || node.getElementsByTagName('media:thumbnail')[0];
            var image = imgEl ? (imgEl.getAttribute('href') || imgEl.getAttribute('url')) : DEFAULT_COVER;

            list.push({
                title: childText(node, 'title') || 'Без названия',
                date: childText(node, 'pubDate'),
                duration: childText(node, 'itunes:duration') || childText(node, 'duration'),
                description: childText(node, 'description'),
                url: audioUrl,
                cover: image
            });
        }

        return list;
    }

    function childText(node, tag) {
        var el = node.getElementsByTagName(tag)[0];
        return el ? (el.textContent || el.text || '').trim() : '';
    }

    function clearText(value) {
        return String(value || '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/https?:\/\/\S+/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function fmtDate(value) {
        var d = new Date(value || '');
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString();
    }

    function Component() {
        var network = null;
        var scroll = null;
        var items = [];
        var list = [];
        var html = $('<div class="m3u-wrap"></div>');
        var active = -1;

        this.create = function () {
            this.activity.loader(true);

            network = new Lampa.Reguest();
            network.timeout(20000);

            html.append('<div class="m3u-head"></div>');

            var body = $('<div class="m3u-body"></div>');
            html.append(body);

            scroll = new Lampa.Scroll({ mask: true });
            scroll.minus(html.find('.m3u-head'));
            body.append(scroll.render(true));

            this.processM3U();

            return this.render();
        };

        this.processM3U = function () {
            var m3uItems = parseM3U(M3U_DATA);
            if (!m3uItems.length) {
                this.fail('M3U плейлист пуст');
                return;
            }

            var target = m3uItems[0];
            // Переводим HTTP на HTTPS для стабильной работы веб-версии
            var targetUrl = target.url.replace(/^http:\/\//i, 'https://');

            this.fetchRSS(targetUrl);
        };

        this.fetchRSS = function (url) {
            var self = this;

            // Попытка 1: Запрос через прокси Lampa
            network.native(url, function (text) {
                var parsed = parseFeed(text);
                if (parsed && parsed.length) {
                    list = parsed;
                    self.build();
                } else {
                    self.fetchBackup(url);
                }
            }, function () {
                self.fetchBackup(url);
            }, false, { dataType: 'text' });
        };

        this.fetchBackup = function (url) {
            var self = this;

            // Попытка 2: Запрос через CORS-прокси
            network.native(getProxyUrl(url), function (text) {
                var parsed = parseFeed(text);
                if (!parsed || !parsed.length) {
                    self.fail('Не удалось найти аудиотреки');
                    return;
                }
                list = parsed;
                self.build();
            }, function () {
                self.fail('Ошибка загрузки потока из M3U');
            }, false, { dataType: 'text' });
        };

        this.build = function () {
            this.activity.loader(false);

            for (var i = 0; i < list.length; i++) {
                this.append(list[i], i);
            }

            this.activity.toggle();
        };

        this.append = function (ep, index) {
            var item = $('<div class="m3u-item selector layer--visible"></div>');

            item.append('<div class="m3u-item__num">' + String(index + 1) + '</div>');
            item.append('<div class="m3u-item__body"><div class="m3u-item__title"></div><div class="m3u-item__date"></div></div>');

            item.find('.m3u-item__title').text(ep.title);
            item.find('.m3u-item__date').text(
                [fmtDate(ep.date), ep.duration].filter(Boolean).join(' · ')
            );

            item.on('hover:hover hover:focus', (function () {
                active = index;
                this.cover(ep);
                item.addClass('focus');
                if (ep.cover) Lampa.Background.change(ep.cover);
                scroll.update(item);
            }).bind(this));

            item.on('hover:out', function () {
                item.removeClass('focus');
            });

            item.on('hover:enter', (function () {
                active = index;
                this.play(ep);
            }).bind(this));

            if (Lampa.Controller.own(this)) Lampa.Controller.collectionAppend(item);

            scroll.append(item);
            items.push(item);
        };

        this.cover = function (ep) {
            var desc = clearText(ep.description).slice(0, 250);

            html.find('.m3u-head').html(
                '<div class="m3u-head__title"></div>' +
                '<div class="m3u-head__sub"></div>' +
                '<div class="m3u-head__desc"></div>'
            );
            html.find('.m3u-head__title').text(ep.title);
            html.find('.m3u-head__sub').text([
                fmtDate(ep.date),
                ep.duration
            ].filter(Boolean).join(' · '));
            html.find('.m3u-head__desc').text(desc);
        };

        this.play = function (ep) {
            Lampa.Player.play({
                title: ep.title,
                url: ep.url,
                cover: ep.cover
            });

            Lampa.Player.playlist(list.map(function (a) {
                return {
                    title: a.title,
                    url: a.url,
                    cover: a.cover
                };
            }));
        };

        this.start = function () {
            if (Lampa.Activity.active() && Lampa.Activity.active().activity !== this.activity) return;

            Lampa.Controller.add('content', {
                link: this,
                invisible: true,
                toggle: (function () {
                    Lampa.Controller.collectionSet(html);
                    Lampa.Controller.collectionFocus(active >= 0 && items[active] ? items[active] : null, html);
                }).bind(this),
                back: function () {
                    Lampa.Activity.backward();
                }
            });

            Lampa.Controller.toggle('content');
        };

        this.pause = function () {};
        this.stop = function () {};

        this.render = function () {
            return html;
        };

        this.destroy = function () {
            if (network) network.clear();
            if (scroll) scroll.destroy();
            Lampa.Arrays.destroy(items);
            html.remove();
        };

        this.fail = function (msg) {
            this.activity.loader(false);
            var empty = new Lampa.Empty();
            empty.text(msg);
            html.append(empty.render());
            this.start = empty.start.bind(empty);
            this.activity.toggle();
        };
    }

    function addStyle() {
        var css = '' +
            '.m3u-wrap{position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.4)}' +
            '.m3u-head{position:absolute;top:0;left:0;right:0;padding:26px 34px 16px;z-index:5;' +
            'background:linear-gradient(to bottom,rgba(0,0,0,.8),transparent)}' +
            '.m3u-head__title{font-size:24px;font-weight:700;color:#fff}' +
            '.m3u-head__sub{font-size:14px;color:rgba(255,255,255,.6);margin-top:6px}' +
            '.m3u-head__desc{font-size:13px;color:rgba(255,255,255,.75);margin-top:8px;max-width:900px;line-height:1.4}' +
            '.m3u-body{position:absolute;top:130px;left:0;right:0;bottom:0}' +
            '.m3u-item{display:flex;align-items:center;padding:12px 34px;cursor:pointer;transition:background .15s}' +
            '.m3u-item.focus,.m3u-item:focus{background:rgba(255,255,255,.15)}' +
            '.m3u-item__num{width:45px;color:rgba(255,255,255,.45);font-size:15px}' +
            '.m3u-item__body{flex:1;min-width:0}' +
            '.m3u-item__title{font-size:17px;color:#fafafa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
            '.m3u-item__date{font-size:12px;color:rgba(255,255,255,.5);margin-top:3px}';

        var style = document.createElement('style');
        style.id = 'm3u_rss_player_style';
        style.textContent = css;
        document.head.appendChild(style);
    }

    function addMenu() {
        var button = $('<li class="menu__item selector">' +
            '<div class="menu__ico">' +
            '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<path d="M9 18V5l12-2v13M9 9l12-2"/>' +
            '<circle cx="6" cy="18" r="3"/>' +
            '<circle cx="18" cy="16" r="3"/>' +
            '</svg>' +
            '</div>' +
            '<div class="menu__text">' + NAME + '</div>' +
            '</li>');

        button.on('hover:enter', function () {
            Lampa.Activity.push({
                url: '',
                title: NAME,
                component: COMPONENT,
                page: 1
            });
        });

        var listEl = $('.menu .menu__list').eq(0);
        if (listEl.length) listEl.append(button);
        else $('body').append(button);
    }

    function start() {
        Lampa.Component.add(COMPONENT, Component);
        addStyle();
        addMenu();
    }

    if (window.plugin_m3u_rss_ready) return;
    window.plugin_m3u_rss_ready = true;

    if (window.appready) start();
    else Lampa.Listener.follow('app', function (e) {
        if (e.type == 'ready') start();
    });
})();
