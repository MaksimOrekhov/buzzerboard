type PlaceKind = 'city' | 'borough' | 'consolidated-balance' | 'federal-district'
type TimeZone =
  | 'America/New_York'
  | 'America/Toronto'
  | 'America/Detroit'
  | 'America/Indiana/Indianapolis'
  | 'America/Chicago'
  | 'America/Denver'
  | 'America/Phoenix'
  | 'America/Los_Angeles'

interface CityEditorial {
  nameRu: string
  regionRu: string
  timeZone: TimeZone
  description: string
  descriptionSource?: string
  kind?: PlaceKind
  established?: readonly [year: number, event: string, sourceUrl: string]
  boroughOf?: string
  arenaLocality?: { name: string; nameEn: string; sourceUrl: string }
  brandArea?: {
    name: string
    kind: 'город' | 'регион' | 'штат' | 'федеральный округ'
    sourceUrl: string
    relatedCityId?: string
  }
}

export const cityEditorial: Readonly<Record<string, CityEditorial>> = {
  ATL: {
    nameRu: 'Атланта',
    regionRu: 'Джорджия',
    timeZone: 'America/New_York',
    description:
      'На матч Hawks удобно приехать по железной дороге MARTA. От станции SEC District до входа на State Farm Arena всего несколько шагов.',
  },
  BKN: {
    nameRu: 'Бруклин',
    regionRu: 'Нью-Йорк',
    timeZone: 'America/New_York',
    kind: 'borough',
    boroughOf: 'nba:city:new-york-new-york-united-states',
    description:
      'Бруклин был самостоятельным городом. В 1898 году он вошёл в состав Нью-Йорка и сегодня совпадает по границам с округом Кингс. В городском справочнике это отдельное место для Nets и Barclays Center на Atlantic Avenue.',
    descriptionSource: 'https://a860-collectionguides.nyc.gov/repositories/2/resources/74',
    established: [
      1898,
      'Образование боро в составе Нью-Йорка',
      'https://a860-collectionguides.nyc.gov/repositories/2/resources/74',
    ],
  },
  BOS: {
    nameRu: 'Бостон',
    regionRu: 'Массачусетс',
    timeZone: 'America/New_York',
    description:
      'TD Garden находится над North Station. В дни матчей сюда приезжают зрители Celtics и хоккейных Bruins по тем же пригородным линиям и метро.',
    descriptionSource: 'https://www.tdgarden.com/plan-your-visit/directions-parking',
  },
  CHA: {
    nameRu: 'Шарлотт',
    regionRu: 'Северная Каролина',
    timeZone: 'America/New_York',
    description:
      'Дом Hornets находится на East Trade Street в центральной части Шарлотта. Поездку на матч можно совместить с прогулкой по Uptown.',
  },
  CHI: {
    nameRu: 'Чикаго',
    regionRu: 'Иллинойс',
    timeZone: 'America/Chicago',
    description:
      'Река Чикаго и выход к озеру Мичиган определили ранний рост города. Прогулка по Riverwalk знакомит с речной частью центра. Домашние вечера Bulls проходят западнее, на Madison Street, где United Center делят баскетболисты и хоккейные Blackhawks.',
    descriptionSource: 'https://chicago.gov/city/en/sites/chicagoriverwalk/home/site-history.html',
    established: [1837, 'Инкорпорация города', 'https://chicago.gov/city/en/about/history.html'],
  },
  CLE: {
    nameRu: 'Кливленд',
    regionRu: 'Огайо',
    timeZone: 'America/New_York',
    description:
      'Rocket Arena находится на Center Court в центре Кливленда. В одном здании проходят матчи Cavaliers и выступления хоккейных Cleveland Monsters.',
    descriptionSource: 'https://www.nba.com/news/all-30-nba-arenas-by-team',
  },
  DAL: {
    nameRu: 'Даллас',
    regionRu: 'Техас',
    timeZone: 'America/Chicago',
    description:
      'Точка притяжения болельщиков Mavericks находится на Victory Avenue. К American Airlines Center также ведёт станция Victory пригородной железной дороги.',
    descriptionSource: 'https://www.americanairlinescenter.com/public-transportation',
  },
  DEN: {
    nameRu: 'Денвер',
    regionRu: 'Колорадо',
    timeZone: 'America/Denver',
    description:
      'В Денвере баскетбольные Nuggets, хоккейные Avalanche и клуб по лакроссу Mammoth играют в Ball Arena. Здание на Chopper Circle объединяет в одном месте три разных спортивных календаря.',
    descriptionSource: 'https://www.ballarena.com/arena-information/about-ball-arena/',
  },
  DET: {
    nameRu: 'Детройт',
    regionRu: 'Мичиган',
    timeZone: 'America/Detroit',
    description:
      'На Woodward Avenue находится Little Caesars Arena. Pistons и Red Wings делят площадку в спортивном квартале The District Detroit.',
  },
  GSW: {
    nameRu: 'Сан-Франциско',
    regionRu: 'Калифорния',
    timeZone: 'America/Los_Angeles',
    description:
      'Chase Center вернул домашние матчи Warriors в Сан-Франциско в 2019 году после десятилетий в Окленде. Название Golden State сохранилось. Историю команды в районе залива связывают оба берега, а городские цифры относятся к Сан-Франциско.',
    descriptionSource: 'https://www.nba.com/news/bay-area-basketball-history-2025-nba-all-star',
    established: [
      1850,
      'Первая инкорпорация города',
      'https://www.sfgov.org/services/city-organization-chart',
    ],
    brandArea: {
      name: 'Golden State · район залива Сан-Франциско',
      kind: 'регион',
      sourceUrl: 'https://www.nba.com/news/bay-area-basketball-history-2025-nba-all-star',
    },
  },
  HOU: {
    nameRu: 'Хьюстон',
    regionRu: 'Техас',
    timeZone: 'America/Chicago',
    description:
      'Матчи Rockets собирают болельщиков у Toyota Center на Polk Street. Со стороны той же улицы находится гараж арены, связанный с ней переходом.',
    descriptionSource: 'https://www.toyotacenter.com/plan-your-visit/directions-parking',
  },
  IND: {
    nameRu: 'Индианаполис',
    regionRu: 'Индиана',
    timeZone: 'America/Indiana/Indianapolis',
    kind: 'consolidated-balance',
    description:
      'Gainbridge Fieldhouse стоит на South Pennsylvania Street в центре Индианаполиса. Население и площадь здесь приведены для статистической части консолидированного Индианаполиса за вычетом отдельно учтённых муниципалитетов.',
    brandArea: { name: 'Индиана', kind: 'штат', sourceUrl: 'https://www.nba.com/pacers/' },
  },
  LAC: {
    nameRu: 'Инглвуд',
    regionRu: 'Калифорния',
    timeZone: 'America/Los_Angeles',
    description:
      'В 2024 году Clippers открыли Intuit Dome на Century Boulevard в Инглвуде. На афише осталось LA, а адрес домашней площадки указывает на отдельный город округа Лос-Анджелес. Для Инглвуда приводятся собственные муниципальные цифры.',
    descriptionSource:
      'https://www.nba.com/news/starting-5-oct-15-go-inside-the-nbas-newest-arena-for-its-first-game',
    established: [
      1908,
      'Инкорпорация города',
      'https://www.sco.ca.gov/Files-AUD/05-2020_lga-lgo_cityofInglewood.pdf',
    ],
    brandArea: {
      name: 'Лос-Анджелес',
      kind: 'город',
      sourceUrl: 'https://www.nba.com/clippers/',
      relatedCityId: 'nba:city:los-angeles-california-united-states',
    },
  },
  LAL: {
    nameRu: 'Лос-Анджелес',
    regionRu: 'Калифорния',
    timeZone: 'America/Los_Angeles',
    description:
      'История испанского пуэбло на месте Лос-Анджелеса восходит к 1781 году, а город получил муниципальный статус в 1850-м. За матчами Lakers идут на South Figueroa Street. Домашняя площадка носит имя Crypto.com Arena, а в истории Lakers знакома как Staples Center.',
    descriptionSource: 'https://lacity.gov/government/history-los-angeles',
    established: [1850, 'Инкорпорация города', 'https://streets.lacity.gov/about-us/history'],
  },
  MEM: {
    nameRu: 'Мемфис',
    regionRu: 'Теннесси',
    timeZone: 'America/Chicago',
    description:
      'Матч Grizzlies ведёт на Beale Street. FedExForum стоит рядом с кварталами, которые город связывает с историей блюза.',
    descriptionSource: 'https://www.memphistravel.com/fedexforumart/bealestreet',
  },
  MIA: {
    nameRu: 'Майами',
    regionRu: 'Флорида',
    timeZone: 'America/New_York',
    description:
      'Kaseya Center стоит на Biscayne Boulevard. Вечер Heat можно начать на набережной залива Бискейн рядом с ареной.',
    descriptionSource: 'https://www.kaseyacenter.com/about',
  },
  MIL: {
    nameRu: 'Милуоки',
    regionRu: 'Висконсин',
    timeZone: 'America/Chicago',
    description:
      'Fiserv Forum на Vel R. Phillips Avenue выходит к Deer District, где зрители собираются до и после матчей Bucks.',
    descriptionSource: 'https://www.deerdistrict.com/',
  },
  MIN: {
    nameRu: 'Миннеаполис',
    regionRu: 'Миннесота',
    timeZone: 'America/Chicago',
    description:
      'У водопада Сент-Энтони на Миссисипи вырос мельничный район Миннеаполиса. Баскетбол сосредоточен в центре, где в Target Center играют Timberwolves и Lynx. Названия обеих команд отсылают ко всему штату Миннесота.',
    descriptionSource:
      'https://www.nps.gov/miss/learn/historyculture/river-of-history-chapter-8.htm',
    established: [
      1867,
      'Действующий акт об инкорпорации города',
      'https://lims.minneapolismn.gov/Download/FileV2/22792/Minneapolis_Charter_Elected_Officials.pdf',
    ],
    brandArea: {
      name: 'Миннесота',
      kind: 'штат',
      sourceUrl: 'https://www.targetcenter.com/arena-info/about-target-center',
    },
  },
  NOP: {
    nameRu: 'Новый Орлеан',
    regionRu: 'Луизиана',
    timeZone: 'America/Chicago',
    description:
      'Зрители Pelicans идут на Dave Dixon Drive, к Smoothie King Center. По соседству стоит Caesars Superdome, поэтому у района есть отдельные баскетбольные и футбольные вечера.',
    descriptionSource: 'https://www.smoothiekingcenter.com/plan-your-visit/directions-parking',
  },
  NYK: {
    nameRu: 'Нью-Йорк',
    regionRu: 'Нью-Йорк',
    timeZone: 'America/New_York',
    arenaLocality: {
      name: 'Манхэттен',
      nameEn: 'Manhattan',
      sourceUrl: 'https://www.msg.com/madison-square-garden/directions',
    },
    description:
      'Knicks играют на Манхэттене над транспортным узлом Penn Station. Цифры этой страницы охватывают пять боро Нью-Йорка. У Бруклина, где играют Nets, в справочнике есть собственная страница с данными округа Кингс.',
    descriptionSource: 'https://portal.311.nyc.gov/article/?kanumber=KA-02877',
    established: [
      1898,
      'Объединение современного Нью-Йорка',
      'https://a860-collectionguides.nyc.gov/repositories/2/resources/74',
    ],
  },
  OKC: {
    nameRu: 'Оклахома-Сити',
    regionRu: 'Оклахома',
    timeZone: 'America/Chicago',
    description:
      'Paycom Center стоит на West Reno Avenue в центре Оклахома-Сити. Арена работает с 2002 года, а домашние матчи Thunder появились в её календаре после переезда команды в 2008-м.',
  },
  ORL: {
    nameRu: 'Орландо',
    regionRu: 'Флорида',
    timeZone: 'America/New_York',
    description:
      'Матчи Magic проходят в центре Орландо на West Church Street. Kia Center открылся в 2010 году. На площадке проводят и игры Orlando Solar Bears.',
    descriptionSource: 'https://www.kiacenter.com/arena-info/about-kia-center',
  },
  PHI: {
    nameRu: 'Филадельфия',
    regionRu: 'Пенсильвания',
    timeZone: 'America/New_York',
    description:
      'Домашний зал 76ers расположен на South Broad Street в спортивном комплексе Южной Филадельфии. Те же трибуны принимают зрителей Flyers и Wings.',
    descriptionSource: 'https://www.nba.com/news/all-30-nba-arenas-by-team',
  },
  PHX: {
    nameRu: 'Финикс',
    regionRu: 'Аризона',
    timeZone: 'America/Phoenix',
    description:
      'Suns играют на East Jefferson Street в центре Финикса. Город живёт по горному стандартному времени круглый год, поэтому разница с восточным временем NBA меняется в течение сезона.',
    descriptionSource:
      'https://www.nist.gov/pml/time-and-frequency-division/popular-links/daylight-saving-time-dst',
  },
  POR: {
    nameRu: 'Портленд',
    regionRu: 'Орегон',
    timeZone: 'America/Los_Angeles',
    description:
      'Дом Trail Blazers находится в комплексе Rose Quarter. К Moda Center можно приехать трамваем MAX до одноимённого пересадочного узла.',
  },
  SAC: {
    nameRu: 'Сакраменто',
    regionRu: 'Калифорния',
    timeZone: 'America/Los_Angeles',
    description:
      'Golden 1 Center в центре Сакраменто стоит на David J Stern Walk. Арена Kings находится в самом центре квартала Downtown Commons.',
    descriptionSource: 'https://www.golden1center.com/visit/downtown-commons/',
  },
  SAS: {
    nameRu: 'Сан-Антонио',
    regionRu: 'Техас',
    timeZone: 'America/Chicago',
    description:
      'Постоянный дом Spurs расположен в Сан-Антонио. В расписании также бывают домашние матчи в Moody Center в Остине. Для конкретной встречи важно сверить название площадки.',
    descriptionSource: 'https://www.nba.com/spurs/schedule?os=___',
  },
  TOR: {
    nameRu: 'Торонто',
    regionRu: 'Онтарио',
    timeZone: 'America/Toronto',
    description:
      'Торонто выходит к озеру Онтарио, а с островов видна панорама центра с Си-Эн Тауэр. Raptors и Maple Leafs делят Scotiabank Arena на Bay Street. Перепись относится к муниципалитету Торонто в границах после объединения 1998 года.',
    descriptionSource:
      'https://www.toronto.ca/wp-content/uploads/2018/04/9672-city-planning-tocore-blg-for-livability-4.pdf',
    established: [
      1834,
      'Инкорпорация города из тауна Йорк',
      'https://www.toronto.ca/explore-enjoy/history-art-culture/online-exhibits/web-exhibits/web-exhibits-significant-events/toronto-in-1834/',
    ],
  },
  UTA: {
    nameRu: 'Солт-Лейк-Сити',
    regionRu: 'Юта',
    timeZone: 'America/Denver',
    description:
      'На афишах Jazz указан штат Юта. Домашний адрес ведёт на West South Temple в Солт-Лейк-Сити, где Delta Center работает с 1991 года.',
    descriptionSource: 'https://www.deltacenter.com/about-us/',
    brandArea: { name: 'Юта', kind: 'штат', sourceUrl: 'https://www.nba.com/jazz/' },
  },
  WAS: {
    nameRu: 'Вашингтон',
    regionRu: 'Округ Колумбия',
    timeZone: 'America/New_York',
    kind: 'federal-district',
    description:
      'Wizards принимают гостей на F Street NW в Capital One Arena. Американская статистика на этой странице относится к федеральному округу Колумбия.',
    brandArea: {
      name: 'Вашингтон, округ Колумбия',
      kind: 'федеральный округ',
      sourceUrl: 'https://www.nba.com/wizards/',
    },
  },
}
