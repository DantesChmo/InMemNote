# Тестирование слоя `presentation`

Этот файл фиксирует подход к unit-тестам для React-компонентов внутри
`src/presentation/`. Он дополняет основной `CLAUDE.md` проекта и имеет
приоритет в вопросах, касающихся именно UI-тестов.

## 1. Стек

- **Vitest** + **@testing-library/react** + **@testing-library/jest-dom**.
- Среда — `jsdom` (см. `vitest.config.ts`).
- Глобальный setup — `src/test/setup.ts` (подключает jest-dom matchers).
- Файл теста живёт рядом с компонентом: `Foo.tsx` ↔ `Foo.spec.tsx`.

## 2. Главный принцип — модульная изоляция

Каждый тест проверяет **ровно один компонент**. Всё, что вне этого
компонента, мокается. Никаких настоящих store, IPC, дочерних React-узлов,
доменных хелперов в фактическом стеке теста быть не должно.

Что обязательно мокается:

| Зависимость | Как |
|---|---|
| `useAppDispatch` / `useAppSelector` из `@presentation/app/store` | `vi.mock(...)` возвращает `() => dispatch` и `(sel) => sel(state)` |
| `useTranslation` из `@presentation/i18n/useTranslation` | `vi.mock(...)` возвращает `{ t: (k) => k, locale: 'en' }` |
| `window.inmemnote` | `installInmemnoteApiMock()` из `src/test/mockInmemnoteApi.ts` в `beforeEach` |
| Async-thunks и action-creators из соседнего `slice.ts` | `vi.mock('./slice', ...)` возвращает фабрики plain-объектов вида `{ type, payload }` |
| Доменные модули (`Hotkey`, `PaletteOverrides`, …) | `vi.mock('@domain/...')` — контракт сводится к "вход → выход", внутренние правила домена не проверяем здесь |
| Дочерние React-компоненты | См. раздел 3 |

Что **нельзя** делать в тесте на компонент:

- подключать настоящий `configureStore(...)` или `<Provider store={...}>`;
- импортировать настоящий `slice.ts` и проверять его редьюсеры (для этого
  пишется отдельный тест на сам slice);
- проверять CSS-классы Tailwind как доказательство поведения — мы тестируем
  логику, а не дизайн. Класс читается только если он напрямую отражает
  переключение состояния (`active`, `accent-tint`, и т. п.);
- ходить в реальные `localStorage`/`fetch`/электроновские IPC.

## 3. Поверхностный (shallow) рендеринг

React Testing Library не даёт `shallow()` из коробки, но эквивалентный
эффект достигается через `vi.mock` дочерних компонентов. Это и есть наш
стандарт.

Правило: каждый импортируемый React-компонент-сосед в тестируемом файле
**должен быть заменён заглушкой** через `vi.mock`. Заглушка — это простой
`div` с `data-testid` и `data-*`-атрибутами, отражающими переданные пропсы.
Если нужно проверить, что родитель прокинул callback — заглушка вызывает
этот callback по `onClick` / `onDoubleClick` / `onContextMenu`, и тест
триггерит `fireEvent.click(stub)`.

Пример канонической заглушки:

```tsx
vi.mock('./DraftHeader', () => ({
  DraftHeader: (props: {
    pinned: boolean;
    onTogglePin: () => void;
    onResetPinSize?: () => void;
  }) => (
    <div
      data-testid="stub-draft-header"
      data-pinned={String(props.pinned)}
      data-reset-available={String(props.onResetPinSize !== undefined)}
      onClick={props.onTogglePin}
    />
  ),
}));
```

`CodeMirrorEditor` всегда мокается — его внутренности CM6 в `jsdom`
тяжёлые и нерелевантны для логики родителя.

## 4. Структура файла теста

Порядок объявлений важен из-за hoisting'a `vi.mock`:

1. Импорты тест-утилит (`render`, `fireEvent`, `act`, `screen`, `vi`).
2. Импорты тест-хелперов (`installInmemnoteApiMock`, фабрики DTO).
3. Изменяемые переменные `let state = {...}` / `const dispatch = vi.fn()`
   на верхнем уровне модуля.
4. Все `vi.mock(...)` блоки. Если фабрика мока ссылается на переменную, эта
   переменная объявляется через `vi.hoisted(() => ({...}))` — иначе
   получаем `Cannot access ... before initialization`.
5. Импорт тестируемого компонента — **после** всех моков.
6. `describe` / `beforeEach` (сброс `state`, `dispatch.mockClear()`,
   `installInmemnoteApiMock()`) / `afterEach(() => vi.restoreAllMocks())`.

## 5. `window.inmemnote`

Используем общий хелпер `src/test/mockInmemnoteApi.ts`:

- `installInmemnoteApiMock()` — ставит на `window.inmemnote` свежий мок и
  возвращает его, чтобы можно было ассертить вызовы (`expect(api.draft.save)
  .toHaveBeenCalledWith(...)`).
- Все async-методы возвращают разумные дефолты, все `on*(handler)` —
  no-op-unsubscribe. Поведение под конкретный тест — точечно через
  `(api.draft.foo as ReturnType<typeof vi.fn>).mockImplementation(...)`
  или `mockResolvedValueOnce(...)`.
- Чтобы протестировать поведение при `on*`-событии — переопределяем `onX`
  так, чтобы запомнить хендлер, дальше `act(() => savedHandler(payload))`.

DTO для подстановок: `emptyDraftDTO()`, `noteDTO()`, `settingsDTO()` оттуда же.

## 6. `act()`, таймеры, асинхронность

- Любое обновление React-состояния вне `fireEvent` оборачиваем в `act(...)`
  (`act(() => savedHandler(true))`, `await act(async () => render(...))`).
- Дебаунсы и таймеры тестируем через `vi.useFakeTimers()` +
  `act(() => vi.advanceTimersByTime(...))`. В `finally`-блоке возвращаем
  `vi.useRealTimers()`.
- Async-thunks: `dispatch` — это `vi.fn()`. Если компонент делает
  `await dispatch(thunk)` и проверяет результат (`fulfilled.match(action)`),
  в этом тесте `dispatch.mockImplementation(async (a) => typeof a ===
  'function' ? resolvedAction : a)`.

## 7. Стиль ассертов

- Ассертим **поведение и контракт**, а не внутренние имена классов.
- Дочернему стабу — `data-testid="stub-<имя>"`, проброшенные пропсы — через
  `data-*` атрибуты, читаемые `expect(stub).toHaveAttribute(...)`.
- Action-объекты, попадающие в `dispatch`, проверяются через
  `expect(dispatch).toHaveBeenCalledWith({ type: '...', payload: ... })`.
- IPC: `expect(api.draft.save).toHaveBeenCalledWith('id', 'content')`.
- Текст из `t(...)` будет ключом сообщения (потому что `t: (k) => k`), —
  ищем `screen.getByText('library.allNotes')`, а не русский перевод.

## 8. Что мы НЕ тестируем здесь

- Реальный CodeMirror, реальный Redux, реальный IPC — это уровень
  интеграционных / E2E тестов (Playwright, `e2e/`).
- Поведение редьюсеров slice'а — отдельный unit-тест на сам slice без UI.
- Доменные правила (например, валидация `Hotkey`) — тесты в `src/domain/`.
- Визуальные регрессии (Tailwind, цвета) — это область design QA / E2E.

## 9. Запуск и покрытие

- Все unit-тесты: `npm test`.
- Точечный файл: `npx vitest run src/presentation/draft/DraftPanel.spec.tsx`.
- Покрытие только `.tsx` в presentation:
  ```
  npx vitest run --coverage \
    --coverage.include='src/presentation/**/*.tsx' \
    --coverage.exclude='src/presentation/**/*.spec.{ts,tsx}'
  ```
- Целевой минимум для React-компонентов в `presentation/` — **>65%** по
  statements/lines. На момент введения этого документа фактическое покрытие
  компонентов было >80%; падение ниже 65% при добавлении новой компоненты
  — это red flag, а не повод понижать порог.
