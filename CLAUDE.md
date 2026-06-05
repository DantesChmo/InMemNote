# Inmemnote — конституция проекта

> Этот документ — **источник правды** для агента и людей, работающих в репозитории.
> Любое расхождение «код vs CLAUDE.md» — повод остановиться и обсудить, а не молча
> поправить документ под код.

---

## 1. Что это

**Inmemnote** — настольный сервис быстрых заметок для macOS в духе Spotlight.
Главный сценарий: пользователь нажимает глобальный хоткей → поверх любого приложения
появляется панель «Draft» → пишет заметку в Markdown → закрывает / сохраняет / закрепляет.

Никакого облака. Никакого бэкенда. Всё хранится локально.

### Экраны (V1 → дальше)
- **Draft** — quick-capture оверлей (V1, текущая итерация).
- **Pin** — компактный «стикер», прибитый поверх окон.
- **Library** — браузер всех заметок.

### Чего у проекта НЕТ и не будет
- HTTP-сервера / API / синхронизации через бэкенд.
- Учёток, авторизации, телеметрии.

---

## 2. Стек

| Слой               | Технология                                  |
|--------------------|---------------------------------------------|
| Язык               | TypeScript (strict)                         |
| Runtime            | Electron + Node.js                          |
| Сборка             | Electron Forge с Vite-шаблоном              |
| UI                 | React 18                                    |
| Стили              | Tailwind CSS (+ CSS custom properties)      |
| State              | Redux Toolkit                               |
| Markdown-редактор  | CodeMirror 6                                |
| Storage (cold)     | SQLite (`better-sqlite3`)                   |
| Валидация конфигов | Zod                                         |
| Тесты unit/comp    | Vitest + React Testing Library              |
| Тесты E2E          | Playwright (electron driver)                |
| Линтер             | ESLint (typescript-eslint, react-hooks)     |
| Форматтер          | Prettier                                    |
| Pre-commit         | husky + lint-staged                         |
| Автообновление     | `update-electron-app` (через GitHub Releases или статичный фид) |

Любое отклонение от стека — через явное обсуждение и обновление этого раздела.

---

## 3. Архитектура — DDD по слоям

```
src/
├── domain/            # чистый TS. Никаких импортов из react/electron/sqlite.
│   ├── draft/
│   │   ├── DraftNote.ts          # Entity
│   │   ├── NoteContent.ts        # Value Object
│   │   ├── DraftId.ts            # Value Object (branded string)
│   │   ├── DraftRepository.ts    # interface
│   │   └── events.ts             # доменные события
│   └── shared/                   # общие типы, Result/Either, errors
│
├── application/       # use-cases. Знает domain, не знает фреймворки.
│   └── draft/
│       ├── OpenDraftUseCase.ts
│       ├── SaveDraftUseCase.ts
│       ├── TogglePinUseCase.ts
│       └── CloseDraftUseCase.ts
│
├── infrastructure/    # реализации: SQLite-репозиторий, Electron-адаптеры, IPC.
│   ├── persistence/sqlite/
│   ├── electron/
│   │   ├── main/                 # entrypoint главного процесса
│   │   ├── preload/              # contextBridge
│   │   └── hotkey/               # GlobalShortcut wrapper
│   └── config/                   # загрузка hotkeys.json и user-override
│
├── presentation/      # React + Redux.
│   ├── draft/
│   │   ├── DraftPanel.tsx
│   │   ├── DraftHeader.tsx
│   │   ├── DraftFooter.tsx
│   │   ├── editor/CodeMirrorEditor.tsx
│   │   └── slice.ts              # Redux Toolkit slice
│   ├── theme/
│   └── app/                      # корень React-приложения
│
└── shared/            # совсем общие утилиты (logger, assert)
```

**Правило зависимостей** (ослабление = баг ревью):
`presentation → application → domain`
`infrastructure → application/domain (только реализация интерфейсов)`
`domain` ни на что не зависит. Никогда.

---

## 4. Принципы

### SOLID
- **S** — каждый use-case = один сценарий.
- **O** — расширяем через новые реализации интерфейсов, не правя существующие.
- **L** — реализации репозиториев взаимозаменяемы (in-memory для тестов, sqlite в проде).
- **I** — узкие порт-интерфейсы (`DraftRepository` ≠ «GodRepository»).
- **D** — application/presentation зависят от интерфейсов из domain.

### DRY — но без фанатизма
Три похожие строки лучше преждевременной абстракции. Дублирование вытаскиваем,
когда оно зажмёт нас при изменении.

### DDD
- Доменный язык в коде = язык макетов и ТЗ (`Draft`, `Pin`, `Library`, `NoteContent`).
- Domain не знает про SQLite, React, IPC.
- Use-cases возвращают `Result<T, DomainError>` — никаких throw сквозь слои.

### TDD (workflow)
Каждая фича едет по конвейеру:

1. **Интерфейсы и сигнатуры** — типы, абстрактные классы, JSDoc. Без тел.
2. **Тесты** — красные, описывающие желаемое поведение.
3. **Реализация** — пока тесты не позеленеют.
4. **Рефакторинг** под зелёные тесты.

Коммитим маленькими шагами: «interfaces», «red tests», «green», «refactor».

---

## 5. Код пишет Senior, читает Junior

### Что комментируем
- **Зачем**, а не «что» (имена уже говорят «что»).
- Неочевидные инварианты («контент длиннее 1 МБ хранится отдельно, потому что…»).
- Workaround’ы с причиной («Electron 28 не доставляет shortcut при fullscreen — обходим…»).
- Доменные правила, которые не выводятся из типов.

### Чего НЕ комментируем
- «Здесь мы создаём редьюсер» над `createSlice` — это очевидно.
- «Используется в LibraryScreen» — устаревает мгновенно.
- TODO без даты и автора.

### Стиль комментариев
- **Все комментарии в исходниках — на английском** (`//`, `/* */`, JSDoc).
  Документация (`*.md`, включая этот файл) — на русском.
- JSDoc для публичных интерфейсов domain/application (он видим в IDE).
- Многострочные блоки в начале файла-агрегата объясняют **роль файла в системе**.

---

## 6. Хоткеи

- Файл-источник: `config/hotkeys.json` (в репозитории — дефолты).
- Пользовательский override: `~/Library/Application Support/Inmemnote/hotkeys.json`.
- Схема валидируется через Zod при старте; ошибочный пользовательский конфиг → fallback на дефолты + лог.
- Дефолт `openDraft` = `CommandOrControl+Shift+Space`.

Подробнее — см. `docs/HOTKEYS.md`.

---

## 7. Дизайн

- Источник истины — `design/` (HTML-прототипы + скриншоты от заказчика).
- Палитра, типографика, размеры — извлекаются из `design/Inmemnote - Draft (hi-fi).html`.
- **Акцентный цвет — `#3f7d6b` (зелёный).** Остальные предложенные цвета в макете игнорируем.
- Сетка 4px. Все паддинги/размеры — целые кратные 4.
- Темы: dark (primary) + light.

---

## 8. Тестирование

- **Unit (Vitest)** — domain (100% покрытие желательно), application (use-cases) — обязательно.
- **Component (Vitest + RTL)** — презентационные компоненты с логикой состояния.
- **E2E (Playwright)** — критичные сценарии: открытие Draft по хоткею, сохранение, pin.
- Все тесты — рядом с кодом: `Foo.ts` ↔ `Foo.spec.ts`.

---

## 9. Качество кода

- `tsc --noEmit` чисто на pre-commit.
- ESLint без `warn`-ов в diff’е.
- Prettier — единственный форматтер.
- Любая функция с цикломатической сложностью > 10 — повод декомпозировать.

---

## 10. Workflow

1. Берём задачу из `docs/TZ.md` (отмечаем `[~]` — в работе).
2. Делаем по TDD-конвейеру (раздел 4).
3. По завершении — `[x]` в `docs/TZ.md`, краткая заметка о решениях.
4. Если в процессе всплывают вопросы — фиксируем в `docs/TZ.md` блок «Открытые вопросы».

---

## 11. Контекст и память

`docs/TZ.md` — это **state**. Если лимиты контекста кончились, новая сессия должна
смочь продолжить, прочитав:
1. `CLAUDE.md` (этот файл — что и как).
2. `docs/TZ.md` (где мы сейчас).
3. `design/` (как должно выглядеть).
