# NBA data sources: исследование

**Проверено:** 2026-11-16

**Область:** матчи, standings, box score, квоты, CORS и права для публичного сайта. Новостные RSS/API здесь не оценивались: для них нужен отдельный обзор условий каждого издателя.

## Решение

- **Условный primary — BALLDONTLIE (BDL)** для расписания, счёта, статуса игры и справочников команд/игроков. Условия BDL прямо разрешают законное публичное и коммерческое использование полученных данных. Перед подключением нужен бесплатный аккаунт и API key; ключ хранить только в server-side proxy. Реальный API GET и сезон 2026/27 не проверялись без ключа.
- **Fallback — пока нет.** ESPN и NBA нельзя считать разрешёнными публичными источниками; у API-Sports нет лицензии на публикацию данных; публичное использование бесплатного TheSportsDB сформулировано недостаточно ясно, а его бесплатные ответы неполны. При сбое BDL показывать last-known-good данные с временем обновления, затем явное состояние unavailable; не подмешивать данные другого провайдера.
- **Ограничение MVP:** бесплатный BDL не включает standings, box scores и player game stats. Полностью соответствующего MVP бесплатного источника с ясными условиями публичного использования не найдено. Для standings нужно получить права/условия источника или отдельно согласовать платный план; покупка не производилась.

Это оценка опубликованных документов поставщиков, а не юридическое заключение. Разрешение BDL распространяется только на права, которые сам поставщик может предоставить; права на сторонние знаки, изображения и likeness отдельно не подтверждены.

## Сравнение

| Источник | Цена, доступ и лимиты | Покрытие и сезон 2026/27 | Публичный сайт | Вывод |
|---|---|---|---|---|
| [BALLDONTLIE NBA API](https://docs.balldontlie.io/) | Free — $0, нужен аккаунт и ключ; 5 запросов/мин. Бесплатно: teams, players, games. Standings/box scores доступны в GOAT — $39.99/мес за NBA-лигу; покупки и free trial не использовались. | Документация заявляет данные с 1946 года по текущий сезон и realtime для матчей в процессе. Квартальные счёты доступны с сезона 2023. Standings, box scores, player game stats — не бесплатны. Фактический 2026/27 GET без ключа не выполнялся. | Условия от 2026-10-20 разрешают lawful personal/commercial use, включая сайты; BDL не требует отдельной лицензии или атрибуции. При этом BDL не очищает сторонние IP/товарные знаки и не гарантирует точность/задержку. | Лучший условный primary для матчей. Недостаточен для всего MVP. |
| [API-Sports Basketball](https://api-sports.io/sports/basketball) | Free — $0, 100 запросов/день, сброс в 00:00 UTC; нужен `x-apisports-key`. Per-minute лимит зависит от плана. Страница показывает paid PRO/ULTRA/MEGA от $13/мес, без VAT; платный план не подключался. | Официальная матрица включает NBA, расписание, историю, standings и командную/игроковую статистику. Доступность этих endpoint'ов именно на Free не подтверждена; документация требует ключ для API-запросов. Сезон 2026/27 и ответы не проверялись. | API-Sports прямо пишет, что не выдаёт лицензию на публикацию данных в приложениях/сайтах; права нужно получать у компетентных правообладателей. | Технически интересен, но для публичного сайта не использовать без отдельной лицензии. |
| [TheSportsDB](https://www.thesportsdb.com/documentation) | v1 Free — $0, общий ключ `123`, регистрация не нужна. Лимиты заданы для отдельных методов/результатов: day schedule — 3, season schedule — 15; free team next/previous показывает только домашние игры. Платную подписку не покупали. | Проверен NBA league ID `4387`, текущий сезон `2026-2027`. Запросы на день и сезон вернули данные, но с ограничениями. Standings для NBA не поддерживаются таблицей API; event stats вернул `null`. | Условия позволяют копировать/менять API-данные с оговорками по правам. Бесплатное использование описано как lookup для development projects; публикация в app store требует paid. Право на публичный production website явно не установлено. Изображения/логотипы требуют отдельной проверки лицензии. | Не подходит как primary или fallback: неполное покрытие и неясность публикации. |
| ESPN site JSON | Ключ не нужен; прямой GET доступен. Официальная публичная API-документация и лимиты не обнаружены. | На дату проверки доступны scoreboard, standings и summary/box score для сезона 2026/27. | ESPN направляет к Disney Terms; изученные US Terms описывают personal, non-commercial use и не дают общего разрешения на публичное распространение. | Не использовать на публичном сайте без письменного разрешения. Endpoint считать неофициальным и нестабильным. |
| NBA live/stats endpoints | Проверенный live scoreboard вернул HTTP 403 из текущего окружения. Публичной поддерживаемой API-документации для этого endpoint не найдено. | Реальный ответ/coverage получить не удалось. | NBA Terms ограничивают использование статистики новостной отчётностью или частными некоммерческими целями; публичное использование материалов NBA.com требует письменного разрешения, для некоторых статистических баз нужно предварительное согласие. | Не использовать без прямого разрешения правообладателя. |

## Результаты реальных запросов

Проверки выполнены 2026-11-16. Запрашивались только публичные endpoints без ключей; платные аккаунты/планы не подключались. Обезличенные формы ответов сохранены в [`docs/fixtures/nba-api-response-shapes.json`](fixtures/nba-api-response-shapes.json).

| Проверка | Результат | Что подтверждено / не подтверждено |
|---|---|---|
| [ESPN scoreboard на 2026-11-16](https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=20261116) | HTTP 200; 8 игр; JSON около 160 KB. | Матчи сезона 2026/27 технически доступны без ключа. `Access-Control-Allow-Origin: *`. Это не подтверждает право публикации. |
| [ESPN standings за 2026](https://site.api.espn.com/apis/v2/sports/basketball/nba/standings?season=2026) | HTTP 200; Eastern Conference — 15 команд, Western Conference — 15. | Standings технически доступны. `Access-Control-Allow-Origin: *`. Вариант пути `/apis/site/v2/.../standings` возвращает 404; проверенный путь — `/apis/v2/...`. |
| [ESPN summary/box score](https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event={eventId}) | HTTP 200; `boxscore.teams` содержит 2 команды и статистику. | Проверен на одном ID из scoreboard; `Access-Control-Allow-Origin: *`. Полный игроковый box score этим результатом не подтверждён. |
| [TheSportsDB NBA league](https://www.thesportsdb.com/api/v1/json/123/lookupleague.php?id=4387) | HTTP 200; `strCurrentSeason=2026-2027`. | Сезон 2026/27 объявлен текущим в справочнике лиги; CORS wildcard. |
| [TheSportsDB games за 2026-11-16](https://www.thesportsdb.com/api/v1/json/123/eventsday.php?d=2026-11-16&l=4387) | HTTP 200; 3 события со статусом завершения. | Данные есть, но бесплатный метод документирован с лимитом 3 результата; в этот день ESPN показывал 8 игр. CORS wildcard. |
| [TheSportsDB сезон 2026-2027](https://www.thesportsdb.com/api/v1/json/123/eventsseason.php?id=4387&s=2026-2027) | HTTP 200; 15 событий. | Совпадает с бесплатным лимитом метода; полнота расписания сезона не обеспечена. CORS wildcard. |
| [TheSportsDB standings](https://www.thesportsdb.com/api/v1/json/123/lookuptable.php?l=4387) | HTTP 200, пустое тело. | Документация ограничивает league table выбранными футбольными лигами; standings NBA нет. |
| [TheSportsDB event stats](https://www.thesportsdb.com/api/v1/json/123/lookupeventstats.php?id=2601859) | HTTP 200; `eventstats: null`. | Player/team box score для проверенной игры не предоставлен. |
| [NBA CDN live scoreboard](https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json) | HTTP 403 Access Denied. | Не удалось проверить поля, актуальность и CORS из этого окружения. |
| BDL / API-Sports data GET | Не выполнялись. | Оба требуют API key; BDL дополнительно требует аккаунт. Поэтому не подтверждены фактический ответ, реальный доступ к 2026/27, quota headers и CORS для авторизованных GET. Регистрации и платных проб не было. |

### CORS

- ESPN scoreboard, standings и summary: wildcard для проверенных GET; `/teams` в GET-ответе не прислал `Access-Control-Allow-Origin`. Разные endpoints ведут себя по-разному.
- TheSportsDB v1: wildcard на проверенных GET.
- BDL: OPTIONS без ключа вернул 200; разрешил тестовый Origin `https://buzzerboard.example` (placeholder, не production domain) и заголовок `Authorization`. Авторизованный GET не проверялся.
- API-Sports: OPTIONS без ключа вернул 204, wildcard и разрешённый `x-apisports-key`. Авторизованный GET не проверялся.
- NBA CDN: 403, CORS не установлен.

CORS — только браузерное разрешение на чтение ответа, не лицензия и не гарантия стабильности. Ключи BDL/API-Sports нельзя помещать во frontend; запрашивать их нужно через серверный proxy с кешированием и ограничением частоты.

## Источники и существенные условия

- [BDL NBA API docs](https://docs.balldontlie.io/) — tiers, endpoint matrix, pagination, game fields, realtime wording и authentication.
- По актуальной таблице BDL тариф GOAT стоит $39.99/мес за одну лигу и включает NBA standings/box scores; ALL-STAR ($9.99/мес) их не включает. Цена проверена для оценки доступа, тариф и trial не подключались.
- [BDL Terms of Service](https://www.balldontlie.io/terms.html) — обновлены 2026-10-20. Разрешают законное downstream-использование данных в приложениях/сайтах; запрещают использовать их для замещающего BDL data API/feed. Источник отдельно предупреждает о third-party rights и best-effort точности/задержке.
- [API-Sports Basketball plans/coverage](https://api-sports.io/sports/basketball), [Basketball API spec](https://api-sports.io/documentation/basketball/basketball-v1.yaml), [Terms](https://api-sports.io/terms) — лимиты, NBA coverage, необходимые ключи и отсутствие предоставленной лицензии на публикацию.
- Текущая страница API-Sports показывает PRO $13, ULTRA $23 и MEGA $33 в месяц (цены без VAT); ни один paid plan не подключался.
- [TheSportsDB docs](https://www.thesportsdb.com/documentation), [Terms](https://api.thesportsdb.com/docs_terms_of_use.php) — free key/лимиты, API data permissions, app-store restriction и отдельные права на artwork.
- [ESPN Terms of Use help page](https://support.espn.com/hc/en-us/articles/360035445091-Terms-of-Use) ведёт на [Disney US Terms](https://disneytermsofuse.com/english/). Рассмотрены US Terms; для других юрисдикций условия могут отличаться.
- [NBA Terms of Use](https://api-hub.nba.com/termsofuse), [NBA Stats FAQ](https://api-hub.nba.com/stats/help/faq) — ограничения на публичную публикацию статистики и скачивание.
