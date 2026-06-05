# TZ — техническое задание Inmemnote

Этот документ — состояние проекта. Любая сессия (включая агента после потери
контекста) должна суметь продолжить работу, прочитав этот файл + `CLAUDE.md` +
посмотрев `design/`.

Формат чек-боксов: `[ ]` — не сделано, `[~]` — в работе, `[x]` — готово.

---

## 0. Дорожная карта (high-level)

- [x] **V1 — Draft.** Quick-capture оверлей, pin поверх окон, локальный SQLite,
  дефолтный хоткей `⌘⇧Space`.
- [x] **V1.1 — отделка Draft.** Кастомные CM6-декораторы (скрытие маркеров на
  неактивных строках, цитата с акцентным бордером), Tab/Shift+Tab,
  динамический ресайз окна, угловое позиционирование pin, FLIP-морф.
- [x] **V2 — Library.** Главное окно приложения (Dock + Launchpad). Sidebar
  (Все / Закреплённые), список карточек с поиском, редактор; promote-on-⌘↵
  переносит scratch-draft в Library. Теги в V2 не делаем.
- [ ] **E2E.** Полное покрытие пользовательских кейсов через Playwright + Electron.
- [ ] **Позже — Автообновление.** Подключить `update-electron-app`
  (требует GitHub Releases фид + подпись/нотаризацию macOS).

---

## 1. Инфраструктура проекта

- [x] `CLAUDE.md` — конституция, стек, правила.
- [x] `docs/TZ.md` — этот файл.
- [x] `docs/HOTKEYS.md` — формат конфига хоткеев.
- [x] Инициализирован Electron Forge + Vite + TS + React.
- [x] Tailwind CSS + дизайн-токены палитры (`src/presentation/theme/tokens.css`).
- [x] ESLint + Prettier + EditorConfig + husky/lint-staged.
- [x] Vitest + RTL.
- [x] Playwright (electron) — конфиг заложен, smoke-тест в V2.
- [x] Структура каталогов DDD (domain/application/infrastructure/presentation).

---

## 2. Draft — функциональные требования (V1)

### 2.1 Вызов и закрытие
- [x] Открытие по глобальному хоткею (дефолт `CommandOrControl+Shift+Space`).
- [x] Хоткей читается из `config/hotkeys.json`, переопределяется пользовательским
  файлом в `~/Library/Application Support/Inmemnote/hotkeys.json`.
- [x] Повторное нажатие хоткея на открытой панели — закрывает её.
- [x] `Esc` закрывает Draft (если не закреплён) с автосохранением.
- [x] `⌘↵` — сохранить и закрыть.
- [x] При повторном открытии Draft возвращается с последним черновиком, если он
  не пустой и не был «отпущен» в Library явно.

### 2.2 Поведение окна
- [x] Появление поверх всех окон (как Spotlight), без иконки в Dock и без меню.
- [x] Центрирование по экрану с курсором (multi-display aware).
- [x] Фрейм скрыт (`frame: false`), скругление 16px, тень из макета.
- [x] Ширина фиксированная **560px**. Высота — динамически по контенту через
  ResizeObserver + IPC `draft:resize`, с clamp `[96, 60vh]` в main.
- [x] Перетаскивание панели за шапку (drag region на header).

### 2.3 Pin
- [x] Кнопка pin в правом верхнем углу шапки.
- [x] При активации:
  - окно остаётся «поверх всех» (`alwaysOnTop: true`, level `floating`);
  - сжимается до compact-формы (ширина **320px**, шапка **40px**, без футера,
    body `max-height: 180`).
- [x] Угловое позиционирование (`top-right`, отступ 24px) при включении pin;
  множественные стикеры остаются в V3.
- [x] При снятии pin — возврат к full-форме и центрированию по дисплею курсора.
- [x] FLIP morph-анимация (360ms, `cubic-bezier(.22,.7,.3,1)`) на pin/unpin
  через Web Animations API.

### 2.4 Редактор (CodeMirror 6, markdown)
- [x] Подсветка markdown (`@codemirror/lang-markdown`).
- [x] «Маркеры» (`#`, `>`, `-`, `1.`, `[ ]`) видны только на активной строке —
  кастомный ViewPlugin + Decoration.mark в `inmemnoteMarkdownExtensions.ts`.
- [x] Inline стили `**bold**`, `*italic*`, `` `code` `` (нативно в lang-markdown).
- [x] Заголовки `# / ## / ###` (стандартный markdown styling CM6).
- [x] Цитаты `>` с левым акцентным бордером (Decoration.line + CSS-класс
  `cm-inmem-quote`).
- [x] Списки `-` / `1.` / `[ ]` (нативно в lang-markdown).
- [x] `⌘↵` — сохранить и скрыть; `Esc` — отмена с автосейвом.
- [x] `Tab` / `Shift+Tab` — нестинг списков через `indentMore`/`indentLess`.

### 2.5 Сохранение
- [x] Автосохранение по дебаунсу (500ms после последнего нажатия).
- [x] Хранилище — SQLite (`better-sqlite3`), путь — `userData/inmemnote.db`.
- [x] Схема: `drafts(id TEXT PK, content TEXT, pinned INT, created_at, updated_at)`
  с индексом по `updated_at DESC`.
- [x] Fallback на in-memory репозиторий при сбое инициализации SQLite.

### 2.6 Тема
- [x] Dark (primary) и light. Определяется системной темой macOS через
  `prefers-color-scheme` и тег `data-theme` на `<html>`.

### 2.7 Палитра и типографика (из `design/Inmemnote - Draft (hi-fi).html`)
- Акцент: `#3f7d6b` (зелёный — наш выбор; другие игнорируем).
- Dark: panel `#1c1b18`, text `#f3f1ec`, text-2 `#a39e95`, text-3 `#6f6a62`,
  line `rgba(255,255,255,.08)`.
- Light: panel `#fff`, text `#1c1b18`, text-2 `#6b665e`, text-3 `#9b968d`,
  line `rgba(0,0,0,.08)`.
- Шрифт UI: SF Pro Text (`-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui`).
- Шрифт mono: SF Mono.
- Размеры панели Draft: 560 × auto, r16, шапка 60, футер 46, body padding `20 24 24`.
- Размеры Pin: 320 × auto, r14, шапка 40, без футера, body `max-height: 180`.

---

## 3. Архитектурные обязательства

- [x] Domain слой без зависимостей от Electron/React/SQLite.
- [x] Use-cases возвращают `Result<T, DomainError>` (`Save`, `TogglePin`).
- [x] Репозитории определены интерфейсом в domain, реализация в infrastructure
  (in-memory + SQLite).
- [x] IPC между main и renderer — узкий типизированный bridge через `preload`
  (`window.inmemnote.draft.*`).

---

## 4. Открытые вопросы

> Сюда складываем всё, в чём пока не уверены — на ревью или для будущей сессии.

- Нужно ли поддерживать **множество** одновременных Pin-стикеров в V1, или
  достаточно одного активного pinned-окна? (макет «Library прототип» намекает
  на множественность — отложил до V3.)
- Что показывает Draft при первом старте — пустой холст или welcome-заметку?
- Нужна ли иконка в menu bar (tray) для входа в Library? (вне V1, но повлияет
  на разметку процесса.)
- Поведение хоткея на macOS, когда фокус в полноэкранном приложении: проверить
  отсутствие конфликтов со Spotlight (`⌘Space`).

---

## 4a. Library — функциональные требования (V2)

### 4a.1 Окно
- [x] Главное окно приложения, видимая Dock-иконка, открывается на запуск.
- [x] `titleBarStyle: 'hiddenInset'` — нативные «светофоры» macOS, наш контент
  под ними; drag-region на toolbar.
- [x] Размеры: 1100×720 default, min 720×480.
- [x] Повторное открытие через Dock — `app.on('activate')` пере-показывает.

### 4a.2 Sidebar
- [x] «Все заметки» / «Закреплённые» с tab-style активным выделением.
- [x] Счётчики обновляются реактивно от Redux-кеша.
- [x] Теги отложены (вне V2 по решению пользователя).

### 4a.3 Список заметок
- [x] Карточки: title (из первой непустой строки, стрипуются `#`/`>`/`-`/`1.`),
  preview (2 строки, line-clamp), relative-updated, индикатор pin.
- [x] Подсветка поискового совпадения (`<mark class="lib-hl">`), HTML-safe.
- [x] Сортировка: pinned first, потом updated DESC (контракт `NoteRepository`).
- [x] Empty-state для пустого фильтра и для «ничего не найдено».

### 4a.4 Поиск
- [x] Поле в toolbar с `⌘F` фокус-шорткатом.
- [x] Live-search (`onChange` → `fetchNotes` thunk).
- [x] `Esc` в фокусе — очищает запрос и фильтр.
- [x] LIKE по `content` в SQLite, эскейп `%` и `_`.

### 4a.5 Редактор
- [x] Тот же `CodeMirrorEditor`, что в Draft (общая лексика markdown).
- [x] Top-bar: pinned-state, modified, кнопки pin/delete.
- [x] Footer: word count + ⌘↵ hint.
- [x] Empty-state, когда заметка не выбрана.
- [x] `key={note.id}` на CM пере-монтирует view при смене заметки
  (изоляция undo-истории).

### 4a.6 CRUD и шорткаты
- [x] `⌘N` — создать пустую заметку, выделение прыгает на неё.
- [x] Auto-save 500ms после последнего нажатия.
- [x] `⌘↵` в редакторе Library — синхронный flush, без promote.
- [x] Кнопка delete — `deleteNote`; селекция переезжает на следующую.

### 4a.7 Draft → Library
- [x] `⌘↵` в Draft вызывает `draft:promote`, не `draft:close`.
- [x] Empty drafts не promote-ятся (silently дропаются).
- [x] Broadcast `notes:changed` обновляет открытое Library-окно.

### 4a.8 Архитектура
- [x] Два окна в одном renderer bundle, выбор через `?view=draft|library`.
- [x] Domain `Note` aggregate отдельно от `DraftNote`.
- [x] `NoteRepository` port + `SqliteNoteRepository` / `InMemoryNoteRepository`.
- [x] Use-cases: List / Find / Create / Update / TogglePin / Delete / Search /
  PromoteDraftToNote. Все возвращают `Result` где есть ожидаемые ошибки.
- [x] IPC: `notes:*` + `draft:promote` + `notes:changed` broadcast.

## 5. История решений

- **2026-06-05** — стек подтверждён: Electron Forge + Vite, Redux Toolkit,
  CodeMirror 6, Vitest + Playwright. Акцент `#3f7d6b`.
- **2026-06-05** — комментарии в исходниках пишем на английском (язык кода);
  документация (`*.md`) — на русском.
- **2026-06-05** — V1 Draft закрыт: domain + application + infrastructure
  (SQLite + Electron main/preload/IPC + global hotkey) + presentation
  (React + Redux Toolkit + CodeMirror 6 + Tailwind). 23 unit-теста зелёные,
  `tsc --noEmit` и `eslint` чистые.
- **2026-06-05** — V1.1 закрыт: кастомные CM6-декораторы (скрытие маркеров на
  неактивных строках, цитата с акцентным бордером), Tab/Shift+Tab для
  нестинга списков, динамический ресайз окна через ResizeObserver + IPC,
  угловое позиционирование pin (`top-right`, 24px) и FLIP-морф 360ms на
  pin/unpin через Web Animations API.
- **2026-06-05** — V3 (множественные стикеры) и V4 (импорт/экспорт MD)
  удалены из дорожной карты. V5 (autoupdate) оставлен «на потом».
- **2026-06-05** — V2 (Library) закрыт. Главное окно с 3-pane layout, Dock
  visible, два BrowserWindow в одном renderer bundle через `?view=`.
  Domain Note + NoteRepository (Sqlite/InMemory), 8 use-cases с тестами.
  Library Redux slice с async thunks и locally-patched редактором.
  Draft⌘↵ → PromoteDraftToNoteUseCase + broadcast `notes:changed`.
  Теги отложены по решению заказчика. 47/47 unit-тестов зелёные.
