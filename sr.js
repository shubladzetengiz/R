//name: Радио-Т RSS
//version: 1.1.0
//author: lampa
//description: Подкасты Радио-Т из RSS-ленты feeds.rucast.net/radio-t

(function () {
    'use strict';

    var NAME = 'Радио-Т';
    var COMPONENT = 'rt_podcast';
    var FEED_URLS = [
        'http://feeds.rucast.net/radio-t',
        'https://feeds.rucast.net/radio-t'
    ];
    var COVER = 'https://radio-t.com/images/cover.jpg';

    function parseFeed(text) {
        text = text || '';

        if (typeof DOMParser != 'undefined') {
            return parseFeedDom(text);
        }
        return parseFeedRegex(text);
    }

    function parseFeedDom(text) {
        var list = [];
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
            var enc = node.getElementsByTagName('enclosure')[0];
            var url = enc ? enc.getAttribute('url') : '';

            if (!url) continue;

            list.push({
                title: childText(node, 'title'),
                date: childText(node, 'pubDate'),
                duration: childText(node, 'itunes\\:duration') || childText(node, 'duration'),
                description: childText(node, 'description'),
                url: url
            });
        }

        return list;
    }

    function parseFeedRegex(text) {
        var list = [];
        var re = /<item>([\s\S]*?)<\/item>/g;
        var m;

        while ((m = re.exec(text))) {
            var block = m[1];
            var enc = block.match(/<enclosure[^>]*\surl="([^"]+)"/);
            var url = enc ? enc[1] : '';

            if (!url) continue;

            list.push({
                title: grepTag(block, 'title'),
                date: grepTag(block, 'pubDate'),
                duration: grepTag(block, 'itunes\\:duration') || grepTag(block, 'duration'),
                description: grepTag(block, 'description'),
                url: url
            });
        }

        return list;
    }

    function grepTag(block, tag) {
        var m = block.match(new RegExp('<' + tag + '>([\\s\\S]*?)<\\/' + tag + '>'));
        return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
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
        var html = $('<div class="rt-wrap"></div>');
        var active = -1;

        this.create = function () {
            this.activity.loader(true);

            network = new Lampa.Reguest();
            network.timeout(20000);

            html.append('<div class="rt-head"></div>');

            var body = $('<div class="rt-body"></div>');
            html.append(body);

            scroll = new Lampa.Scroll({ mask: true });
            scroll.minus(html.find('.rt-head'));
            body.append(scroll.render(true));

            this.fetch();

            return this.render();
        };

        this.fetch = function () {
            var attempt = 0;
            var go = (function () {
                if (attempt >= FEED_URLS.length) {
                    this.fail('Не удалось загрузить ленту Радио-Т');
                    return;
                }
                var url = FEED_URLS[attempt++];
                network.native(url, (function (text) {
                    var parsed = parseFeed(text);
                    if (!parsed || !parsed.length) {
                        this.fail('В ленте нет эпизодов');
                        return;
                    }
                    list = parsed;
                    this.build();
                }).bind(this), (function () {
                    go();
                }).bind(this), false, { dataType: 'text' });
            }).bind(this);

            go();
        };

        this.build = function () {
            this.activity.loader(false);

            for (var i = 0; i < list.length; i++) {
                this.append(list[i], i);
            }

            this.activity.loader(false);
            this.activity.toggle();
        };

        this.append = function (ep, index) {
            var item = $('<div class="rt-item selector layer--visible"></div>');

            item.append('<div class="rt-item__num">' + String(index + 1).pad(3) + '</div>');
            item.append('<div class="rt-item__body"><div class="rt-item__title"></div><div class="rt-item__date"></div></div>');

            item.find('.rt-item__title').text(ep.title);
            item.find('.rt-item__date').text(
                [fmtDate(ep.date), ep.duration].filter(Boolean).join(' · ')
            );

            item.on('hover:hover hover:focus', (function () {
                active = index;
                this.cover(ep);
                item.addClass('focus');
                Lampa.Background.change(COVER);
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
            var desc = clearText(ep.description).slice(0, 220);

            html.find('.rt-head').html(
                '<div class="rt-head__title"></div>' +
                '<div class="rt-head__sub"></div>' +
                '<div class="rt-head__desc"></div>'
            );
            html.find('.rt-head__title').text(ep.title);
            html.find('.rt-head__sub').text([
                fmtDate(ep.date),
                ep.duration
            ].filter(Boolean).join(' · '));
            html.find('.rt-head__desc').text(desc);
        };

        this.play = function (ep) {
            Lampa.Player.play({
                title: ep.title,
                url: ep.url
            });

            Lampa.Player.playlist(list.map(function (a) {
                return {
                    title: a.title,
                    url: a.url
                };
            }));
        };

        this.background = function () {
            Lampa.Background.immediately(COVER);
        };

        this.start = function () {
            if (Lampa.Activity.active() && Lampa.Activity.active().activity !== this.activity) return;

            this.background();

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
            '.rt-wrap{position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.2)}' +
            '.rt-head{position:absolute;top:0;left:0;right:0;padding:26px 34px 16px;z-index:5;' +
            'background:linear-gradient(to bottom,rgba(0,0,0,.6),transparent)}' +
            '.rt-head__title{font-size:26px;font-weight:700;color:#fff}' +
            '.rt-head__sub{font-size:14px;color:rgba(255,255,255,.6);margin-top:6px}' +
            '.rt-head__desc{font-size:13px;color:rgba(255,255,255,.75);margin-top:8px;max-width:900px;line-height:1.4}' +
            '.rt-body{position:absolute;top:120px;left:0;right:0;bottom:0}' +
            '.rt-item{display:flex;align-items:center;padding:13px 34px;cursor:pointer;transition:background .15s}' +
            '.rt-item.focus,.rt-item:focus{background:rgba(255,255,255,.12)}' +
            '.rt-item__num{width:58px;color:rgba(255,255,255,.45);font-size:15px;font-variant-numeric:tabular-nums}' +
            '.rt-item__body{flex:1;min-width:0}' +
            '.rt-item__title{font-size:18px;color:#fafafa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
            '.rt-item__date{font-size:13px;color:rgba(255,255,255,.5);margin-top:3px}';

        var style = document.createElement('style');
        style.id = 'rt_podcast_style';
        style.textContent = css;
        document.head.appendChild(style);
    }

    function addMenu() {
        var button = $('<li class="menu__item selector">' +
            '<div class="menu__ico">' +
            '<svg width="38" height="31" viewBox="0 0 38 31" fill="none" xmlns="http://www.w3.org/2000/svg">' +
            '<rect x="17.613" width="3" height="16.3327" rx="1.5" transform="rotate(63.4707 17.613 0)" fill="currentColor"/>' +
            '<circle cx="13" cy="19" r="6" fill="currentColor"/>' +
            '<path fill-rule="evenodd" clip-rule="evenodd" d="M0 11C0 8.79086 1.79083 7 4 7H34C36.2091 7 38 8.79086 38 11V27C38 29.2091 36.2092 31 34 31H4C1.79083 31 0 29.2091 0 27V11ZM21 19C21 23.4183 17.4183 27 13 27C8.58173 27 5 23.4183 5 19C5 14.5817 8.58173 11 13 11C17.4183 11 21 14.5817 21 19ZM30.5 18C31.8807 18 33 16.8807 33 15.5C33 14.1193 31.8807 13 30.5 13C29.1193 13 28 14.1193 28 15.5C28 16.8807 29.1193 18 30.5 18Z" fill="currentColor"/>' +
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
        console.log('Plugins', NAME + ' init');
    }

    function start() {
        Lampa.Component.add(COMPONENT, Component);
        addStyle();
        addMenu();
    }

    if (window.plugin_rt_podcast_ready) return;
    window.plugin_rt_podcast_ready = true;

    if (window.appready) start();
    else Lampa.Listener.follow('app', function (e) {
        if (e.type == 'ready') start();
    });
})();
