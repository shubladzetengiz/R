/* Radio-T Podcast Plugin v1.1.0 */
(function () {
  'use strict';

  var NAME = 'Radio-T';
  var COMPONENT = 'radio_t_main';

  var DEFAULT_COVER = 'https://radio-t.com/images/covers/cover.png';
  var DEFAULTS = {
    radio_t_rss_url: 'https://radio-t.com/podcast.rss',
    radio_t_auto: 'on',
    radio_t_interval: '30'
  };

  var FEED_PROXIES = [
    'https://cors.eu.org/'
  ];

  function get(key) { return Lampa.Storage.get(key, DEFAULTS[key]); }

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function childText(node, tag) {
    var el = node.getElementsByTagName(tag)[0];
    return el ? (el.textContent || el.text || '').trim() : '';
  }

  function clearText(value) {
    return String(value || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function fmtDate(value) {
    var d = new Date(value || '');
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function parseFeed(text) {
    var list = [];
    if (!text) return list;
    var doc;
    try { doc = new DOMParser().parseFromString(text, 'text/xml'); } catch (e) { return list; }
    if (!doc || !doc.querySelectorAll) return list;

    var nodes = doc.querySelectorAll('item');

    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var enc = node.getElementsByTagName('enclosure')[0];
      var audioUrl = enc ? enc.getAttribute('url') : '';
      if (!audioUrl) continue;

      var imgEl = node.getElementsByTagName('itunes:image')[0];
      var cover = imgEl ? (imgEl.getAttribute('href') || imgEl.getAttribute('url')) : DEFAULT_COVER;

      list.push({
        title: childText(node, 'title') || 'Без названия',
        date: childText(node, 'pubDate'),
        description: clearText(childText(node, 'description')),
        url: audioUrl,
        cover: cover
      });
    }

    return list;
  }

  function parseMeta(text) {
    var meta = { title: NAME, image: DEFAULT_COVER };
    if (!text) return meta;
    var doc;
    try { doc = new DOMParser().parseFromString(text, 'text/xml'); } catch (e) { return meta; }
    var channel = doc && doc.querySelector ? doc.querySelector('channel') : null;
    if (!channel) return meta;
    var t = channel.getElementsByTagName('title')[0];
    if (t) meta.title = (t.textContent || '').trim();
    var img = channel.getElementsByTagName('itunes:image')[0];
    if (img) meta.image = img.getAttribute('href') || img.getAttribute('url') || DEFAULT_COVER;
    return meta;
  }

  var FETCH_TIMEOUT = 8000;
  var CACHE_KEY = 'radio_t_cache';

  function fetchWithTimeout(url) {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT) : null;
    return fetch(url, controller ? { signal: controller.signal } : undefined)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function (text) {
        if (timer) clearTimeout(timer);
        if (!parseFeed(text).length) throw new Error('feed empty');
        return text;
      })
      .catch(function (e) {
        if (timer) clearTimeout(timer);
        throw e;
      });
  }

  function candidates(url) {
    var list = [url];
    for (var i = 0; i < FEED_PROXIES.length; i++) {
      list.push(FEED_PROXIES[i] + encodeURIComponent(url));
    }
    return list;
  }

  async function fetchFeed() {
    var url = get('radio_t_rss_url') || DEFAULTS.radio_t_rss_url;
    var urls = candidates(url);
    var lastErr = null;

    return Promise.all(urls.map(function (u) {
      return fetchWithTimeout(u).then(function (text) {
        return text;
      }).catch(function (e) {
        lastErr = e;
        return null;
      });
    })).then(function (results) {
      for (var i = 0; i < results.length; i++) {
        if (results[i]) {
          Lampa.Storage.set(CACHE_KEY, results[i]);
          return results[i];
        }
      }
      var cached = Lampa.Storage.get(CACHE_KEY, '');
      if (cached && parseFeed(cached).length) return cached;
      throw new Error(lastErr ? lastErr.message : 'RSS недоступен');
    });
  }

  var _body = null;
  var _timer = null;

  class RadioTMain {
    constructor(object) { this.activity = object; }

    render() {
      this.html = $('<div class="radio-t-container"></div>');
      _body = this.html;
      this.load(false);
      return this.html[0];
    }

    create() { return this.render(); }

    start() { this.scheduleAutoRefresh(); }
    pause() {}
    stop() { clearInterval(_timer); _timer = null; }

    destroy() {
      clearInterval(_timer);
      _timer = null;
      _body = null;
    }

    scheduleAutoRefresh() {
      clearInterval(_timer);
      _timer = null;
      if (get('radio_t_auto') === 'off') return;
      var mins = parseInt(get('radio_t_interval') || '30', 10) || 30;
      _timer = setInterval((function () {
        this.load(true);
      }).bind(this), mins * 60 * 1000);
    }

    showLoading() {
      this.html.empty().append(
        '<div class="radio-t-loading">Загрузка выпусков...</div>'
      );
    }

    showError(msg) {
      this.html.empty().append(
        '<div class="radio-t-loading">Ошибка загрузки: ' + esc(msg) +
        '<div class="radio-t-btn selector" data-action="refresh">⟳ Попробовать снова</div></div>'
      );
      this.html.find('[data-action="refresh"]').on('hover:enter', (function () {
        this.load(false);
      }).bind(this));
      Lampa.Controller.toggle('content');
    }

    async load(silent) {
      if (!silent) {
        var cached = Lampa.Storage.get(CACHE_KEY, '');
        if (cached && parseFeed(cached).length) {
          this.renderFeed(cached);
        } else {
          this.showLoading();
        }
      }
      try {
        var text = await fetchFeed();
        this.renderFeed(text);
      } catch (e) {
        if (silent) Lampa.Noty.show('Radio-T: не удалось обновить (' + e.message + ')');
        else this.showError(e.message);
      }
    }

    renderFeed(text) {
      var list = parseFeed(text);
      if (!list.length) { this.showError('В ленте не найдено аудиофайлов'); return; }

      var meta = parseMeta(text);

      var rows = list.map(function (ep, i) {
        return '<div class="radio-t-ep selector" data-idx="' + i + '">' +
          '<img class="radio-t-ep__cover" src="' + esc(ep.cover) + '" onerror="this.style.display=\'none\'">' +
          '<div class="radio-t-ep__body">' +
          '<div class="radio-t-ep__title">' + esc(ep.title) + '</div>' +
          '<div class="radio-t-ep__meta">' + esc(fmtDate(ep.date)) + '</div>' +
          '</div>' +
          '<div class="radio-t-ep__play">▶</div>' +
          '</div>';
      }).join('');

      this.html.empty().append(
        '<div class="radio-t-wrap">' +
        '<div class="radio-t-head">' +
        '<img class="radio-t-head__cover" src="' + esc(meta.image) + '" onerror="this.style.display=\'none\'">' +
        '<div class="radio-t-head__info">' +
        '<div class="radio-t-head__title">' + esc(meta.title) + '</div>' +
        '<div class="radio-t-head__sub">' + list.length + ' выпусков · обновлено ' +
        new Date().toLocaleTimeString() + '</div>' +
        '</div>' +
        '<div class="radio-t-btn selector" data-action="refresh">⟳ Обновить</div>' +
        '</div>' +
        '<div class="radio-t-list">' + rows + '</div>' +
        '</div>'
      );

      this.html.find('[data-action="refresh"]').on('hover:enter', (function () {
        this.load(true);
      }).bind(this));

      this.html.find('[data-idx]').on('hover:enter', (function () {
        var ep = list[$(this).data('idx')];
        if (ep) this.play(ep, list);
      }).bind(this));

      Lampa.Controller.toggle('content');
    }

    play(ep, list) {
      Lampa.Player.play({
        url: ep.url,
        title: ep.title,
        cover: ep.cover
      });

      Lampa.Player.playlist(list.map(function (a) {
        return { url: a.url, title: a.title, cover: a.cover };
      }));
    }
  }

  function injectStyles() {
    if (document.getElementById('radio-t-styles')) return;

    var style = document.createElement('style');
    style.id = 'radio-t-styles';
    style.textContent = '\
.radio-t-container{width:100%;height:100%;overflow:hidden}\
.radio-t-wrap{display:flex;flex-direction:column;height:100%}\
.radio-t-head{display:flex;align-items:center;gap:1em;padding:1em 1.5em 0.5em;flex-shrink:0}\
.radio-t-head__cover{width:3.4em;height:3.4em;object-fit:cover;border-radius:0.5em;flex-shrink:0}\
.radio-t-head__info{flex:1;min-width:0}\
.radio-t-head__title{color:#fff;font-size:1.3em;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\
.radio-t-head__sub{color:rgba(255,255,255,.5);font-size:0.85em;margin-top:0.2em}\
.radio-t-btn{flex-shrink:0;padding:0.5em 1.2em;border-radius:0.5em;background:rgba(255,255,255,.08);color:#fff;font-size:0.95em;cursor:pointer;white-space:nowrap}\
.radio-t-btn.focus{background:rgba(255,255,255,.28)}\
.radio-t-list{flex:1;overflow-y:auto;padding:0.3em 1.5em 2em}\
.radio-t-ep{display:flex;align-items:center;gap:1em;padding:0.6em 1em;margin-bottom:0.2em;border-radius:0.5em;cursor:pointer}\
.radio-t-ep.focus{background:rgba(255,255,255,.15)}\
.radio-t-ep__cover{width:3em;height:3em;object-fit:cover;border-radius:0.35em;flex-shrink:0}\
.radio-t-ep__body{flex:1;min-width:0}\
.radio-t-ep__title{color:#fff;font-size:1.05em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\
.radio-t-ep__meta{color:rgba(255,255,255,.45);font-size:0.85em;margin-top:0.15em}\
.radio-t-ep__play{color:rgba(255,255,255,.6);font-size:1.1em;flex-shrink:0}\
.radio-t-loading{color:rgba(255,255,255,.5);font-size:1.05em;padding:3em 1.5em;display:flex;flex-direction:column;gap:1.5em;align-items:flex-start}\
';
    document.head.appendChild(style);
  }

  function registerSettings() {
    Lampa.SettingsApi.addComponent({
      component: 'radio_t',
      icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>',
      name: 'Radio-T'
    });

    Lampa.SettingsApi.addParam({
      component: 'radio_t',
      param: { name: 'radio_t_rss_url', type: 'trigger', default: false },
      field: { name: 'RSS URL', description: get('radio_t_rss_url') },
      onChange: function () {
        var current = get('radio_t_rss_url');
        var done = function (v) {
          if (v && v.trim()) Lampa.Storage.set('radio_t_rss_url', v.trim());
        };
        if (Lampa.Keypad && typeof Lampa.Keypad.show === 'function') {
          Lampa.Keypad.show({ title: 'RSS URL', value: current, confirm: done });
        } else if (window.prompt) {
          var r = window.prompt('RSS URL:', current);
          if (r !== null) done(r);
        }
      }
    });

    Lampa.SettingsApi.addParam({
      component: 'radio_t',
      param: { name: 'radio_t_auto', type: 'select', values: { on: 'Включено', off: 'Выключено' }, default: 'on' },
      field: { name: 'Автообновление списка' },
      onChange: function () {}
    });

    Lampa.SettingsApi.addParam({
      component: 'radio_t',
      param: {
        name: 'radio_t_interval',
        type: 'select',
        values: { '10': '10 минут', '30': '30 минут', '60': '1 час', '120': '2 часа' },
        default: '30'
      },
      field: { name: 'Интервал автообновления' },
      onChange: function () {}
    });
  }

  function addMenu() {
    var icon = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>';
    var item = $('<li class="menu__item selector" data-action="radio_t">' +
      '<div class="menu__ico">' + icon + '</div>' +
      '<div class="menu__text">Radio-T</div></li>');

    item.on('hover:enter', function () {
      Lampa.Activity.push({ component: COMPONENT, url: '', title: NAME });
    });

    var settingsItem = $('.menu .menu__list .menu__item[data-action="settings"]');
    if (settingsItem.length) settingsItem.before(item);
    else $('.menu .menu__list').eq(0).append(item);
  }

  function init() {
    Lampa.Component.add(COMPONENT, RadioTMain);
    injectStyles();
    registerSettings();
    addMenu();
  }

  if (window.appready) {
    init();
  } else {
    Lampa.Listener.follow('app', function (e) {
      if (e.type === 'ready') init();
    });
  }
})();
