# BuzzerBoard

NBA-хаб для утреннего обзора: результаты и расписание матчей, таблицы конференций, новости и аналитика.

Проект находится на начальном этапе. Основные разделы и визуальная оболочка готовы к подключению NBA-данных; источник данных пока не выбран. До его подключения интерфейс не показывает тестовые счета, расписание или таблицы.

## Требования

- Node.js `22.12` или новее
- pnpm `10.28.0` (через Corepack или [официальную установку](https://pnpm.io/installation))

## Начало работы

```sh
pnpm install --frozen-lockfile
pnpm run dev
```

## Команды

| Команда                 | Назначение                          |
| ----------------------- | ----------------------------------- |
| `pnpm run dev`          | Vite dev server                     |
| `pnpm run build`        | Production build                    |
| `pnpm run preview`      | Локальный preview production build  |
| `pnpm test`             | Однократный запуск Vitest           |
| `pnpm run test:watch`   | Vitest в watch-режиме               |
| `pnpm run lint`         | ESLint                              |
| `pnpm run typecheck`    | Проверка TypeScript и Vue SFC типов |
| `pnpm run format`       | Форматирование Prettier             |
| `pnpm run format:check` | Проверка форматирования             |

## Структура

- `src/app` — точка входа, app shell, маршруты и TanStack Vue Query client.
- `src/pages` — route views для Home, Games, Standings, News и Favorites.
- `src/shared/components` — небольшие общие UI-компоненты.
- `src/assets` — глобальные токены и базовые стили.
- `.github/workflows/ci.yml` — проверки pull request и push в `main`.

Состояние запросов будет принадлежать TanStack Vue Query. Pinia не добавлена: сейчас нет подтверждённого глобального клиентского состояния. Секреты и локальные настройки размещайте в `.env.local` (игнорируется git); любые переменные с префиксом `VITE_` попадут в клиентскую сборку и не должны содержать секреты.
