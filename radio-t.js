//name: RSS Аудио Плеер
//version: 1.0.1
//author: Custom
//description: Парсер RSS-лент с воспроизведением аудио во встроенном плеере Lampa

(function () {
    'use strict';

    var NAME = 'Аудио RSS';
    var COMPONENT = 'rss_audio_player';
    
    // -------------------------------------------------------------
    var RSS_URL = 'https://feeds.rucast.net/radio-t'; 
    var DEFAULT_COVER = 'https://lampa.mx/img/img_broken.svg';
    // -------------------------------------------------------------

    var PROXY_URL = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(RSS_URL);

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
        var html = $('<div class="rss-wrap"></div>');
        var active = -1;

        this.create = function () {
            this.activity.loader(true);

            network = new Lampa.Reguest();
            network.timeout(20000);

            html.append('<div class="rss-head"></div>');

            var body = $('<div class="rss-body"></div>');
            html.append(body);

            scroll = new Lampa.Scroll({ mask: true });
            scroll.minus(html.find('.rss-head'));
            body.append(scroll.render(true));

            this.fetch();

            return this.render();
        };

        this.fetch = function () {
            var self = this;

            // Запрос через native с типом text
            network.native(RSS_URL, function (text) {
                var parsed = parseFeed(text);
                if (parsed && parsed.length) {
                    list = parsed;
                    self.build();
                } else {
                    self.fetchBackup();
                }
            }, function () {
                self.fetchBackup();
            }, false, { dataType: 'text' });
        };

        this.fetchBackup = function () {
            var self = this;

            network.native(PROXY_URL, function (text) {
                var parsed = parseFeed(text);
                if (!parsed || !parsed.length) {
                    self.fail('В ленте не найдено аудиофайлов');
                    return;
                }
                list = parsed;
                self.build();
            }, function () {
                self.fail('Ошибка загрузки RSS-ленты');
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
            var item = $('<div class="rss-item selector layer--visible"></div>');

            item.append('<div class="rss-item__num">' + String(index + 1) + '</div>');
            item.append('<div class="rss-item__body"><div class="rss-item__title"></div><div class="rss-item__date"></div></div>');

            item.find('.rss-item__title').text(ep.title);
            item.find('.rss-item__date').text(
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

            html.find('.rss-head').html(
                '<div class="rss-head__title"></div>' +
                '<div class="rss-head__sub"></div>' +
                '<div class="rss-head__desc"></div>'
            );
            html.find('.rss-head__title').text(ep.title);
            html.find('.rss-head__sub').text([
                fmtDate(ep.date),
                ep.duration
            ].filter(Boolean).join(' · '));
            html.find('.rss-head__desc').text(desc);
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
            '.rss-wrap{position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.4)}' +
            '.rss-head{position:absolute;top:0;left:0;right:0;padding:26px 34px 16px;z-index:5;' +
            'background:linear-gradient(to bottom,rgba(0,0,0,.8),transparent)}' +
            '.rss-head__title{font-size:24px;font-weight:700;color:#fff}' +
            '.rss-head__sub{font-size:14px;color:rgba(255,255,255,.6);margin-top:6px}' +
            '.rss-head__desc{font-size:13px;color:rgba(255,255,255,.75);margin-top:8px;max-width:900px;line-height:1.4}' +
            '.rss-body{position:absolute;top:130px;left:0;right:0;bottom:0}' +
            '.rss-item{display:flex;align-items:center;padding:12px 34px;cursor:pointer;transition:background .15s}' +
            '.rss-item.focus,.rss-item:focus{background:rgba(255,255,255,.15)}' +
            '.rss-item__num{width:45px;color:rgba(255,255,255,.45);font-size:15px}' +
            '.rss-item__body{flex:1;min-width:0}' +
            '.rss-item__title{font-size:17px;color:#fafafa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
            '.rss-item__date{font-size:12px;color:rgba(255,255,255,.5);margin-top:3px}';

        var style = document.createElement('style');
        style.id = 'rss_audio_player_style';
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

    if (window.plugin_rss_audio_ready) return;
    window.plugin_rss_audio_ready = true;

    if (window.appready) start();
    else Lampa.Listener.follow('app', function (e) {
        if (e.type == 'ready') start();
    });
})();
