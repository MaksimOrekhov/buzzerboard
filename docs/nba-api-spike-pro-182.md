# PRO-182: бесплатные NBA API по разделам

**Проверено:** 2026-11-16  
**Область:** SportScore, Statyx, Tank01, Free NBA на RapidAPI и лицензируемые исторические данные. Цены, квоты и права проверялись по опубликованным страницам; платные тарифы, пробные периоды и аккаунты не создавались.

## Решение

Единого бесплатного источника, который одновременно покрывает функции BuzzerBoard, имеет подтверждённые ответы за сезон 2026/27 и явно разрешает публичное production-использование, не найдено.

- **Условный кандидат для публичных live/recent карточек:** прямые endpoints SportScore под `/api/widget/`. Их собственные условия допускают ранние коммерческие проекты при видимой индексируемой dofollow-атрибуции на каждом экране с данными; кэш и объединение источников разрешены. NBA присутствует на публичной баскетбольной странице и в виджетах. Но NBA JSON GET, точные поля, обновление 2026/27 и происхождение данных проверить не удалось. До интеграции нужен smoke GET и письменное подтверждение upstream-прав.
- **Закрытый прототип справочника, расписания и standings:** Statyx Free публикует четыре NBA endpoints — players, contracts, schedule, standings — с лимитом 30 req/min без карты. Документация ограничивает Free evaluation/hobby use; коммерческий показ описан для платного плана. Для публичного BuzzerBoard не подходит без отдельного разрешения.
- **Закрытый прототип live и box score:** Tank01 Basic заявлен как $0, жёсткий лимит 1,000 обращений/месяц без карты. Документация описывает live scoreboard и текущесезонные live/completed box scores. Условия хранения, кэширования и публичного показа не найдены; бесплатный тариф на RapidAPI также требует отдельно исключить возможные bandwidth fees. Для public use не одобрять.
- **Free NBA на RapidAPI:** страница показывает $0, 500,000 обращений/месяц и 1,000/час, но также fee $0.001/MB после 10,240 MB. Карточка описывает источник как исторический и не подтверждает сезон 2026/27, live или права на показ. При требовании гарантированного нулевого расхода не использовать.
- **Исторический backfill для исследований:** репозиторий hoopR NBA Data заявляет CC BY 4.0 для кода, данных и документации и публикует расписания, box scores, rosters, standings, play-by-play и другие таблицы примерно с 2002 года. README указывает ESPN как источник значительной части файлов; лицензия репозитория сама по себе не подтверждает права на upstream-данные ESPN. Не считать его очищенным для публичного продукта без подтверждения цепочки прав.
- **Итог по запуску:** для приватного исследовательского прототипа можно раздельно оценить Statyx, Tank01 и локальный hoopR. Для публичного сайта SportScore выглядит наиболее перспективно по собственным Free terms, но пока остаётся условным кандидатом. Box score/history и полный публичный набор остаются без подтверждённого бесплатного решения.

## Подтверждённые условия

### SportScore

[Developer portal](https://sportscore.com/developers/) документирует JSON endpoints с лимитом около 10,000 запросов за 24 часа на IP, открытым CORS и 60-секундным edge cache. В бесплатной группе `/api/widget/` есть matches, match details, team fixtures, standings, top scorers, player data и live tracker. Документация описывает у match score/status/lineups/timeline; это не подтверждение полного player box score.

[Условия](https://sportscore.com/developers/terms/) обновлены 23 апреля 2026 года и явно относятся к endpoints `/api/widget/`: кэшировать ответы и объединять их с другими источниками можно; раннему коммерческому проекту разрешено бесплатное использование с условием видимой crawlable ссылки `Powered by SportScore` с `rel="dofollow"` на каждой странице, экране или поверхности с данными. Нет SLA; точность не гарантируется, данные могут исправляться. Поставщик пишет, что агрегирует несколько upstream-источников, не раскрывая их по каждому набору.

Не переносить эти условия автоматически на `/api/v1/`. В [REST v1 reference](https://sportscore.com/developers/api/) есть отдельный набор fixtures/search/standings endpoints и собственные замечания об анонимном и ключевом лимите, но открытая Terms page описывает только `/api/widget/`. Использование `/api/v1/` в публичном продукте требует отдельного подтверждения применимой лицензии.

Публичные страницы SportScore показывают NBA fixtures и live tracker, включая 2026 календарный период ([виджеты](https://sportscore.com/embed/), [баскетбольная доска](https://sportscore.com/basketball/)). Это подтверждает отображение NBA самим сайтом SportScore, но не точные API-поля и не фактический ответ JSON endpoint.

### Statyx

[NBA overview](https://api.statyx.io/nba-api) и [OpenAPI](https://api.statyx.io/v1/openapi.json) указывают четыре бесплатных NBA endpoints: `/v1/nba/players`, `/contracts`, `/schedule`, `/standings`. Free даёт `reference:read`, одну лигу, 30 запросов/минуту и не требует банковскую карту; API требует ключ в `x-api-key`. Standings описаны с conference/division records и ranks, player directory — с draft info, schedule — со счётом и статусом матча. В том же OpenAPI game stats/box score и расширенные показатели относятся к Pro, не к Free.

OpenAPI описывает Free как предназначенный для evaluation и hobby projects. FAQ на NBA page разрешает коммерческий показ в собственном app/site для платных планов; отдельного разрешения на Free не опубликовано. Для бесплатной коммерческой публикации, хранения и кэширования требуется ответ Statyx. Свежесть live-счёта, история сезонов и ответы за 2026/27 не проверены.

### Tank01

[Официальная страница Tank01](https://www.tank01.com/) заявляет Basic: $0, hard cap 1,000 обращений/месяц, без карты; квота отдельна для каждой лиги и доступ идёт через RapidAPI. [Документация NBA endpoints](https://rapidapi.com/tank01/api/tank01-fantasy-stats) описывает текущесезонный `getNBABoxScore` для игры в процессе или завершённой игры. Box score включает обычные игроковые статистики; scoreboard доступен через `getNBAScoresOnly`. [Руководство getNBATeams](https://www.tank01.com/Guides_Teams_NBA.html) описывает standings, roster и расписания, но team endpoint отдаёт player/team season stats, накопленные за день, не в реальном времени; расписание само по себе не включает статус матча.

Условия API по downstream-показу, хранению, кэшированию и атрибуции в проверенных публичных документах не установлены. Поэтому техническая доступность Free не равна разрешению на публичное использование. RapidAPI отдельно пишет, что для подписок с декабря 2025 включено 10 GB трафика, затем тарифицируется дополнительный объём; billing-конфигурацию именно NBA плана Tank01 мы не проверяли. Не тестировать Tank01 до подтверждения, что ключ/план исключает плату за трафик.

### Free NBA на RapidAPI

[Карточка и pricing](https://rapidapi.com/theapiguy/api/free-nba/pricing) показывают план Basic за $0 с hard limit 500,000 запросов/месяц, rate limit 1,000/час и 10,240 MB включённого трафика, затем $0.001/MB. RapidAPI отдельно различает бесплатные API и freemium, а [справка по тарификации](https://docs.rapidapi.com/v2/docs/api-pricing) предупреждает, что у freemium-планов могут быть требования к карте и overage fees.

Каталог помечает Free NBA как unofficial API для исторических NBA data, но не даёт надёжно проверяемого диапазона сезонов, актуального payload или чётких условий лицензии на публичный показ. Тарифная квота не подтверждает ни актуальность, ни права на данные. Текущий сезон 2026/27, standings, live и box score не smoke-tested; план не выбран, запросы с ключом не делались. Из-за bandwidth fee источник не удовлетворяет условию «гарантированно без расходов».

### Исторические данные hoopR

[hoopR NBA Data](https://github.com/sportsdataverse/hoopR-nba-data) публикует parquet-релизы для расписания, play-by-play, team/player box scores, rosters, season stats, standings, shots и crosswalks. README заявляет NBA данные с 2002 года и публикации отдельных наборов от 2026-11-13. [LICENSE](https://github.com/sportsdataverse/hoopR-nba-data/blob/main/LICENSE.md) распространяет CC BY 4.0 на содержимое репозитория, что разрешает share/adapt, в том числе коммерческое, с указанием авторства, ссылки на лицензию и изменений.

README помечает основную группу перечисленных наборов как sourced from ESPN; для части NBA Stats есть отдельный upstream. ESPN/Disney US [условия](https://disneytermsofuse.com/english/) ограничивают коммерческое использование и автоматическое извлечение без письменного разрешения. Следовательно, CC BY от репозитория — полезная лицензия для его авторского вклада, но без подтверждения upstream-разрешения недостаточна для уверенного public production. Наборы загружаются как файлы, это не live API; размер релизов значителен. Отдельную полноту файлов именно за сезон 2026/27 не проверяли.

## Распределение по возможностям BuzzerBoard

| Возможность | Кандидаты с бесплатной документацией | Рекомендация и границы |
|---|---|---|
| Игры, недавние результаты | SportScore `/api/widget/matches/`; Statyx `schedule`; Tank01 date/game endpoints | Для публичных live/recent карточек первым проверить SportScore widget и NBA JSON sample. Будущий календарь по SportScore documented в `/api/v1/`, но право для него не подтверждено. Statyx/Tank01 — только закрытый POC до выяснения прав. |
| Standings | SportScore widget; Statyx `standings`; Tank01 `getNBATeams` | Для POC Statyx даёт отдельный endpoint и заявленный rank. Для публичного показа условно SportScore с badge. Не вычислять «официальное место» из W/L или процента побед, если источник не возвращает подтверждённое место и семантику tiebreakers. |
| Live score / период / часы | SportScore widget match/tracker; Tank01 `getNBAScoresOnly` и live box score | У SportScore условия лучше подходят публичному веб-сайту, но SLA и JSON smoke отсутствуют. Tank01 технически подробнее для закрытого теста, но публичные права не подтверждены и 1,000 запросов/месяц быстро ограничат polling. |
| Box score | Tank01 текущего сезона; Statyx Pro; ранее проверенный DunkAPI | Ни один новый Free кандидат не имеет подтверждённых одновременно публичных прав и реального ответа. Tank01 — только технический private smoke; Statyx box score не бесплатен. Предыдущие реальные DunkAPI поля и стоимость описаны в [PRO-163 report](./dunkapi-spike.md); новых обращений DunkAPI в этом spike не было. |
| Player directory / profile | Statyx `players` и `contracts`; SportScore widget `player`; Tank01 rosters | Statyx — удобная free reference модель для закрытого прототипа. Публичный вариант — условно SportScore при наличии NBA slug/ответа и badge. Tank01 roster-запрос содержит много полей и тратит общий месячный лимит; частота обновления отдельных данных различается. |
| История, player logs, play-by-play | hoopR локальный архив; ранее проверенный DunkAPI | hoopR удобен как локальный backfill при CC BY attribution, но upstream права требуют подтверждения. DunkAPI остаётся более интегрированным API-кандидатом из PRO-163, не live и с лимитом 500 credits/month; права на происхождение dataset также нужно подтвердить. |

## Модель идентификаторов и конфликтов

- Хранить внешний ID как пару `(source, source_id)`. Ни team ID, ни game ID, ни player ID разных поставщиков не считать общими.
- Назначать BuzzerBoard собственные canonical IDs и таблицы crosswalk для каждой пары источников. Team crosswalk должен учитывать историческое имя/франшизу и сезон действия.
- Матч сопоставлять только после map команд: NBA game date в Eastern time, mapped home/away, сезон и тип игры. Не объединять игры по одному времени/названию; спорные пары оставлять unmatched для проверки.
- Игрока связывать по source-scoped ID. Имя использовать только как вспомогательный признак вместе с независимыми полями (например, дата рождения или draft metadata), а не как ключ.
- В каждой нормализованной записи сохранять `source`, `source_id`, `season`, `fetched_at` и upstream timestamp, если он есть. Задать provider precedence отдельно по capability/полю; не склеивать live clock одного источника с score другого без проверки согласованности.
- Rank/seed считать официальным только при явном rank-поле и документированной семантике. Если это не подтверждено, сохранять rank как отсутствующий; порядок строк не превращать в место команды.

## Smoke и расходы

Прямой анонимный GET к SportScore `/api/widget/matches/?sport=basketball&limit=5` был предпринят, но не дошёл до API: сетевой sandbox не разрешил DNS/внешний fetch. Browser reader также не смог открыть raw JSON URLs. Поэтому **ответы endpoint и реальные NBA-поля в этом окружении не подтверждены**; страницы документации и публичные NBA fixtures/live listings являются только косвенным evidence. Для Statyx и RapidAPI нужны ключи; Tank01 работает через RapidAPI. Аккаунты и подписки не создавались.

Платных подписок, trial-запросов и расходов DunkAPI в PRO-182 не было (DunkAPI: 0 новых запросов, 0 новых credits). При дальнейшем тесте RapidAPI не выбирать платный/freemium тариф и проверить billing guardrails до вызова; бесплатная quota не должна автоматически превращаться в плату за трафик или overage.

## Источники

- SportScore: [developer portal](https://sportscore.com/developers/), [widget/API reference](https://sportscore.com/developers/api/), [API Terms](https://sportscore.com/developers/terms/), [NBA widgets](https://sportscore.com/embed/).
- Statyx: [NBA API and plans](https://api.statyx.io/nba-api), [OpenAPI 3.1](https://api.statyx.io/v1/openapi.json).
- Tank01: [official pricing/features](https://www.tank01.com/), [NBA API listing](https://rapidapi.com/tank01/api/tank01-fantasy-stats), [getNBATeams guide](https://www.tank01.com/Guides_Teams_NBA.html).
- RapidAPI Free NBA: [plan page](https://rapidapi.com/theapiguy/api/free-nba/pricing), [free API and bandwidth pricing rules](https://docs.rapidapi.com/docs/connecting-to-an-api).
- History and upstream: [hoopR data repository](https://github.com/sportsdataverse/hoopR-nba-data), [CC BY 4.0 license](https://github.com/sportsdataverse/hoopR-nba-data/blob/main/LICENSE.md), [ESPN/Disney US Terms](https://disneytermsofuse.com/english/), [NBA Terms of Use](https://api-hub.nba.com/termsofuse).

Оценка опубликованных документов не является юридическим заключением. Перед публичным запуском запросить у источника письменное подтверждение права на отображение конкретных NBA данных, а также проверить отдельные права на лиговые marks, фотографии, logos и likeness.
