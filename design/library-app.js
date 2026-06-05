(function(){
  var root = document.documentElement;

  // ---- tag palette ----
  var TAGS = {
    "работа":  "#5a8cc0",
    "идеи":    "#d98a3d",
    "личное":  "#9b7bc0",
    "проект":  "#3f9d7d"
  };

  // ---- seed notes ----
  var uid = 1;
  function N(o){ o.id = uid++; return o; }
  var notes = [
    N({ pinned:true,  tag:"проект", updated:"2 мин назад", t:9000, lines:[
      "# Архитектура синхронизации",
      "Решаем, **что** именно синхронизируем между устройствами и как мёржим конфликты.",
      "## Что синхронизируем",
      "- заголовок и тело заметки",
      "- теги и время изменения",
      "- статус «закреплено»",
      "> правило: последняя правка побеждает, но черновик никогда не теряется",
      "Поток: `sync() → diff(local, remote) → merge()`"
    ]}),
    N({ pinned:true, tag:"работа", updated:"вчера, 18:24", t:8000, lines:[
      "# Созвон с командой",
      "1) Обсудить дату релиза",
      "2) Показать **демо** стейкхолдерам",
      "3) Распределить задачи на спринт",
      "> цель — подтвердить дату и снять блокеры"
    ]}),
    N({ pinned:false, tag:"идеи", updated:"2 дня назад", t:7000, lines:[
      "# Идеи к демо",
      "- живой ввод markdown без режимов",
      "- _плавная_ морф-анимация при закрепе",
      "- быстрый захват из любого приложения",
      "Главный месседж: **записал — исчезло**, всё копится в библиотеке."
    ]}),
    N({ pinned:false, tag:"личное", updated:"3 дня назад", t:6000, lines:[
      "# Список покупок",
      "- кофе в зёрнах",
      "- овсяное молоко",
      "- что-нибудь к чаю"
    ]}),
    N({ pinned:false, tag:"идеи", updated:"4 дня назад", t:5000, lines:[
      "# Прочитать по UX",
      "Подборка статей про быстрый захват и `local-first` приложения.",
      "- паттерны Spotlight-оверлеев",
      "- как Bear и Obsidian хранят markdown",
      "> вынести лучшее в наш редактор"
    ]}),
    N({ pinned:false, tag:"проект", updated:"неделю назад", t:4000, lines:[
      "# Рефакторинг авторизации",
      "Вынести логику токенов в отдельный модуль.",
      "## Шаги",
      "1) описать контракт `auth()`",
      "2) покрыть тестами рефреш-флоу",
      "3) выпилить старый клиент"
    ]}),
    N({ pinned:false, tag:"работа", updated:"неделю назад", t:3000, lines:[
      "# 1:1 с Аней",
      "- как с нагрузкой на этой неделе",
      "- цели на квартал",
      "- обратная связь по последнему релизу"
    ]}),
    N({ pinned:false, tag:"личное", updated:"2 недели назад", t:2000, lines:[
      "# Маршрут на выходные",
      "Короткая поездка за город.",
      "- выехать до пробок",
      "- найти кофейню по дороге",
      "> взять плед и термос"
    ]})
  ];

  // ---- helpers ----
  function esc(s){ return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
  function titleOf(note){
    var first = note.lines[0] || "";
    return first.replace(/^#{1,3}\s+/,"").replace(/^[-*+]\s+/,"").replace(/^\d+[.)]\s+/,"").replace(/^>\s+/,"").trim() || "Без заголовка";
  }
  function plainLine(raw){
    return raw
      .replace(/^#{1,3}\s+/,"").replace(/^[-*+]\s+/,"• ").replace(/^\d+[.)]\s+/,"")
      .replace(/^>\s+/,"").replace(/\*\*(.+?)\*\*/g,"$1").replace(/_(.+?)_/g,"$1")
      .replace(/`(.+?)`/g,"$1");
  }
  function previewOf(note){
    return note.lines.slice(1).map(plainLine).filter(function(s){ return s.trim(); }).join("  ");
  }
  function wordCount(note){
    return note.lines.join(" ").replace(/[#>*_`)\-]/g," ").split(/\s+/).filter(Boolean).length;
  }
  function highlight(text, q){
    var safe = esc(text);
    if(!q) return safe;
    var i = safe.toLowerCase().indexOf(q.toLowerCase());
    if(i < 0) return safe;
    return safe.slice(0,i) + '<span class="hl-mark">' + safe.slice(i, i+q.length) + '</span>' + safe.slice(i+q.length);
  }

  // ---- state ----
  var filter = { kind:"all", tag:null };
  var query = "";
  var selectedId = notes[0].id;

  // ---- sidebar ----
  var sidebar = document.getElementById('sidebar');
  var ICONS = {
    all:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M3 4h10M3 8h10M3 12h7"/></svg>',
    pinned:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 1.5h4M7 1.5l-.4 4.2L4.5 8h7L9.4 5.7 9 1.5M8 8v6.5"/></svg>',
    draft:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M11 2.5l2.5 2.5L6 12.5 3 13l.5-3z"/></svg>'
  };
  function counts(){
    return {
      all: notes.length,
      pinned: notes.filter(function(n){ return n.pinned; }).length
    };
  }
  function renderSidebar(){
    var c = counts();
    var tagNames = Object.keys(TAGS);
    var html = '<div class="side-h">Библиотека</div>';
    html += sideItem('all', ICONS.all, 'Все заметки', c.all);
    html += sideItem('pinned', ICONS.pinned, 'Закреплённые', c.pinned);
    html += '<div class="side-h">Теги</div>';
    tagNames.forEach(function(name){
      var n = notes.filter(function(x){ return x.tag === name; }).length;
      var on = filter.kind==='tag' && filter.tag===name ? ' on' : '';
      html += '<div class="side-item'+on+'" data-kind="tag" data-tag="'+name+'">'
        + '<span class="si"><span class="tag-dot" style="background:'+TAGS[name]+'"></span></span>'
        + '<span class="sl">'+name+'</span><span class="sc">'+n+'</span></div>';
    });
    sidebar.innerHTML = html;
    sidebar.querySelectorAll('.side-item').forEach(function(el){
      el.addEventListener('click', function(){
        filter = { kind: el.dataset.kind, tag: el.dataset.tag || null };
        renderSidebar(); renderList();
      });
    });
  }
  function sideItem(kind, icon, label, count){
    var on = filter.kind===kind ? ' on' : '';
    return '<div class="side-item'+on+'" data-kind="'+kind+'">'
      + '<span class="si">'+icon+'</span><span class="sl">'+label+'</span>'
      + '<span class="sc">'+count+'</span></div>';
  }

  // ---- list ----
  var notelist = document.getElementById('notelist');
  var listTitle = document.getElementById('listTitle');
  var emptyHint = document.getElementById('emptyHint');

  function visibleNotes(){
    var arr = notes.slice();
    if(filter.kind==='pinned') arr = arr.filter(function(n){ return n.pinned; });
    if(filter.kind==='tag') arr = arr.filter(function(n){ return n.tag===filter.tag; });
    if(query){
      var q = query.toLowerCase();
      arr = arr.filter(function(n){
        return titleOf(n).toLowerCase().indexOf(q)>=0 || previewOf(n).toLowerCase().indexOf(q)>=0;
      });
    }
    arr.sort(function(a,b){ return (b.pinned-a.pinned) || (b.t-a.t); });
    return arr;
  }
  function filterLabel(){
    if(query) return 'Результаты';
    if(filter.kind==='pinned') return 'Закреплённые';
    if(filter.kind==='tag') return filter.tag.charAt(0).toUpperCase()+filter.tag.slice(1);
    return 'Все заметки';
  }
  function renderList(){
    var arr = visibleNotes();
    listTitle.textContent = filterLabel();
    if(arr.length===0){
      notelist.classList.add('empty'); notelist.innerHTML='';
      emptyHint.textContent = query ? 'Запрос «'+query+'» ничего не нашёл' : 'В этом разделе пусто';
      return;
    }
    notelist.classList.remove('empty');
    notelist.innerHTML = arr.map(function(n){
      var on = n.id===selectedId ? ' on' : '';
      var pin = n.pinned ? '<span class="nc-pin"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M6 1.5h4l-.4 4.2L11.5 8h-7l1.9-2.3z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" fill="currentColor"/><path d="M8 8v6.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/></svg></span>' : '';
      var tagDot = '<span class="nc-tag"><span class="tag-dot" style="background:'+(TAGS[n.tag]||'#888')+'"></span>'+n.tag+'</span>';
      return '<div class="ncard'+on+'" data-id="'+n.id+'">'
        + '<div class="nc-top"><span class="nc-title">'+highlight(titleOf(n),query)+'</span>'+pin+'</div>'
        + '<div class="nc-prev">'+highlight(previewOf(n),query)+'</div>'
        + '<div class="nc-meta">'+n.updated+'<span class="dot">·</span>'+tagDot+'</div>'
        + '</div>';
    }).join('');
    notelist.querySelectorAll('.ncard').forEach(function(el){
      el.addEventListener('click', function(){ select(+el.dataset.id); });
    });
  }

  // ---- editor ----
  var editorcol = document.getElementById('editorcol');
  var editorEl = document.getElementById('editor');
  var edPinState = document.getElementById('edPinState');
  var edModified = document.getElementById('edModified');
  var edStats = document.getElementById('edStats');
  var edPinBtn = document.getElementById('edPinBtn');
  var edDelBtn = document.getElementById('edDelBtn');

  var PIN_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 1.5h4M7 1.5l-.4 4.2L4.5 8h7L9.4 5.7 9 1.5M8 8v6.5"/></svg>';

  var api = window.InmemEditor.init(editorEl, notes[0].lines, function(lines){
    var note = noteById(selectedId);
    if(!note) return;
    note.lines = lines;
    note.updated = 'только что';
    note.t = Date.now();
    edModified.textContent = 'изменено только что';
    updateStats(note);
    // live-refresh only the affected card text without losing caret
    var card = notelist.querySelector('.ncard[data-id="'+note.id+'"]');
    if(card){
      card.querySelector('.nc-title').innerHTML = highlight(titleOf(note), query);
      card.querySelector('.nc-prev').innerHTML = highlight(previewOf(note), query);
    }
  });

  function noteById(id){ return notes.filter(function(n){ return n.id===id; })[0]; }
  function updateStats(note){ edStats.textContent = wordCount(note) + ' слов'; }
  function renderEditorMeta(note){
    edPinState.className = 'em' + (note.pinned ? ' pinned' : '');
    edPinState.innerHTML = note.pinned ? PIN_SVG + ' закреплено' : '<span style="opacity:.7">не закреплено</span>';
    edModified.textContent = 'изменено ' + note.updated;
    edPinBtn.classList.toggle('on', note.pinned);
    updateStats(note);
  }

  function select(id){
    selectedId = id;
    var note = noteById(id);
    editorcol.classList.remove('blank');
    api.setLines(note.lines);
    renderEditorMeta(note);
    // mark active card
    notelist.querySelectorAll('.ncard').forEach(function(el){
      el.classList.toggle('on', +el.dataset.id===id);
    });
  }

  edPinBtn.addEventListener('click', function(){
    var note = noteById(selectedId); if(!note) return;
    note.pinned = !note.pinned;
    renderEditorMeta(note); renderSidebar(); renderList();
  });
  edDelBtn.addEventListener('click', function(){
    var idx = notes.findIndex(function(n){ return n.id===selectedId; });
    if(idx<0) return;
    notes.splice(idx,1);
    renderSidebar();
    var arr = visibleNotes();
    if(arr.length){ select(arr[0].id); } else { editorcol.classList.add('blank'); selectedId=null; }
    renderList();
  });

  // ---- new note ----
  document.getElementById('newBtn').addEventListener('click', newNote);
  function newNote(){
    var note = N({ pinned:false, tag:"идеи", updated:"только что", t:Date.now(), lines:["# ", ""] });
    notes.unshift(note);
    filter = { kind:"all", tag:null }; query=""; syncSearchUI();
    renderSidebar(); renderList(); select(note.id);
    api.focusLine(0, 2);
  }

  // ---- search ----
  var searchBox = document.getElementById('search');
  var searchInput = document.getElementById('searchInput');
  var searchClear = document.getElementById('searchClear');
  function syncSearchUI(){
    searchInput.value = query;
    searchBox.classList.toggle('has', !!query);
  }
  searchInput.addEventListener('input', function(){
    query = searchInput.value.trim();
    searchBox.classList.toggle('has', !!query);
    renderList();
  });
  searchClear.addEventListener('click', function(){
    query=''; syncSearchUI(); renderList(); searchInput.focus();
  });

  // ---- hotkeys ----
  document.addEventListener('keydown', function(e){
    if((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='f'){ e.preventDefault(); searchInput.focus(); searchInput.select(); }
    if((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='n'){ e.preventDefault(); newNote(); }
    if(e.key==='Escape' && document.activeElement===searchInput){ query=''; syncSearchUI(); renderList(); searchInput.blur(); }
  });

  // ---- init ----
  renderSidebar();
  renderList();
  select(selectedId);

  window.__setDensity = function(d){ root.setAttribute('data-density', d); };
  window.__toggleSidebar = function(on){ root.setAttribute('data-sidebar', on?'on':'off'); };
})();
