// Addresses are from venue operators. Capacity is the NBA directory's seating
// figure, checked against the named building even where its sponsor name changed.
export const ARENA_DIRECTORY_SOURCE = 'https://www.nba.com/news/all-30-nba-arenas-by-team'
export const ARENA_CAPACITY_AS_OF = '2026-10-28'
export const ARENA_REVIEWED_AT = '2026-11-23'
export const ARENA_SEASON_START = '2026-10-20'
export const ARENA_SEASON_END_YEAR = 2027

type ArenaSeed = {
  address: string
  addressSource: string
  basketballCapacity: number
}

export const arenaFacts: Readonly<Record<string, ArenaSeed>> = {
  'state-farm-arena': {
    address: '1 State Farm Drive, Atlanta, GA 30303',
    addressSource: 'https://www.statefarmarena.com/plan-your-visit/transportation',
    basketballCapacity: 17044,
  },
  'barclays-center': {
    address: '620 Atlantic Avenue, Brooklyn, NY 11217',
    addressSource: 'https://www.barclayscenter.com/getting-here',
    basketballCapacity: 17732,
  },
  'td-garden': {
    address: '100 Legends Way, Boston, MA 02114',
    addressSource: 'https://www.tdgarden.com/arena-info/a-z-guide',
    basketballCapacity: 18624,
  },
  'spectrum-center': {
    address: '333 East Trade Street, Charlotte, NC 28202',
    addressSource: 'https://www.spectrumcentercharlotte.com/plan-your-visit',
    basketballCapacity: 19077,
  },
  'united-center': {
    address: '1901 W. Madison Street, Chicago, IL 60612',
    addressSource: 'https://www.unitedcenter.com/venue/frequently-asked-questions/',
    basketballCapacity: 20917,
  },
  'rocket-arena': {
    address: '1 Center Court, Cleveland, OH 44115',
    addressSource: 'https://www.rocketarena.com/plan-your-visit/transportation',
    basketballCapacity: 19432,
  },
  'american-airlines-center': {
    address: '2500 Victory Avenue, Dallas, TX 75219',
    addressSource: 'https://www.americanairlinescenter.com/directions',
    basketballCapacity: 19200,
  },
  'ball-arena': {
    address: '1000 Chopper Circle, Denver, CO 80204',
    addressSource: 'https://www.ballarena.com/connect-with-us/contact-us/',
    basketballCapacity: 19520,
  },
  'little-caesars-arena': {
    address: '2645 Woodward Avenue, Detroit, MI 48201',
    addressSource: 'https://www.313presents.com/little-caesars-arena/venue/little-caesars-arena',
    basketballCapacity: 20332,
  },
  'chase-center': {
    address: '1 Warriors Way, San Francisco, CA 94158',
    addressSource: 'https://www.chasecenter.com/plan-your-visit/transportation/',
    basketballCapacity: 18064,
  },
  'toyota-center': {
    address: '1510 Polk Street, Houston, TX 77002',
    addressSource: 'https://www.toyotacenter.com/contact-us',
    basketballCapacity: 18055,
  },
  'gainbridge-fieldhouse': {
    address: '125 S. Pennsylvania Street, Indianapolis, IN 46204',
    addressSource: 'https://www.gainbridgefieldhouse.com/plan-your-visit/directions-parking',
    basketballCapacity: 17923,
  },
  'intuit-dome': {
    address: '3930 W. Century Boulevard, Inglewood, CA 90303',
    addressSource: 'https://www.intuitdome.com/plan-your-visit/how-to-get-here',
    basketballCapacity: 18000,
  },
  'crypto-com-arena': {
    address: '1111 South Figueroa Street, Los Angeles, CA 90015',
    addressSource: 'https://www.cryptoarena.com/directions',
    basketballCapacity: 18997,
  },
  fedexforum: {
    address: '191 Beale Street, Memphis, TN 38103',
    addressSource: 'https://www.fedexforum.com/connect-with-us/contact-us',
    basketballCapacity: 17794,
  },
  'kaseya-center': {
    address: '601 Biscayne Boulevard, Miami, FL 33132',
    addressSource: 'https://www.kaseyacenter.com/connect-with-us/contact-us',
    basketballCapacity: 19600,
  },
  'fiserv-forum': {
    address: '1111 Vel R. Phillips Avenue, Milwaukee, WI 53203',
    addressSource: 'https://www.fiservforum.com/plan-your-visit/directions-parking',
    basketballCapacity: 17341,
  },
  'target-center': {
    address: '600 First Avenue North, Minneapolis, MN 55403',
    addressSource: 'https://www.targetcenter.com/arena-info/about-target-center',
    basketballCapacity: 18024,
  },
  'smoothie-king-center': {
    address: '1501 Dave Dixon Drive, New Orleans, LA 70113',
    addressSource: 'https://www.smoothiekingcenter.com/connect-with-us/contact-information',
    basketballCapacity: 16867,
  },
  'madison-square-garden': {
    address: '4 Pennsylvania Plaza, New York, NY 10001',
    addressSource: 'https://www.msg.com/madison-square-garden/directions',
    basketballCapacity: 19812,
  },
  'paycom-center': {
    address: '100 W. Reno Avenue, Oklahoma City, OK 73102',
    addressSource: 'https://www.paycomcenter.com/about-the-arena/overview',
    basketballCapacity: 18203,
  },
  'kia-center': {
    address: '400 West Church Street, Orlando, FL 32801',
    addressSource: 'https://www.kiacenter.com/plan-your-visit/directions-and-parking',
    basketballCapacity: 18846,
  },
  'xfinity-mobile-arena': {
    address: '3601 South Broad Street, Philadelphia, PA 19148',
    addressSource: 'https://www.xfinitymobilearena.com/plan-your-visit/guest-services',
    basketballCapacity: 20007,
  },
  'mortgage-matchup-center': {
    address: '201 East Jefferson Street, Phoenix, AZ 85004',
    addressSource: 'https://mortgagematchupcenter.com/plan-your-visit/transportation-parking/',
    basketballCapacity: 17071,
  },
  'moda-center': {
    address: 'One Center Court, Portland, OR 97227',
    addressSource: 'https://www.rosequarter.com/plan-your-visit/directions-transportation',
    basketballCapacity: 19411,
  },
  'golden-1-center': {
    address: '500 David J Stern Walk, Sacramento, CA 95814',
    addressSource: 'https://www.golden1center.com/contact-us/',
    basketballCapacity: 17611,
  },
  'frost-bank-center': {
    address: '1 Frost Bank Center Drive, San Antonio, TX 78219',
    addressSource: 'https://www.frostbankcenter.com/directions',
    basketballCapacity: 18354,
  },
  'scotiabank-arena': {
    address: '40 Bay Street, Toronto, ON M5J 2X2',
    addressSource: 'https://www.scotiabankarena.com/venue-information/contact-us',
    basketballCapacity: 19800,
  },
  'delta-center': {
    address: '301 West South Temple, Salt Lake City, UT 84101',
    addressSource: 'https://www.deltacenter.com/contact/',
    basketballCapacity: 18306,
  },
  'capital-one-arena': {
    address: '601 F Street NW, Washington, DC 20004',
    addressSource: 'https://www.capitalonearena.com/plan-your-visit/arena-faqs',
    basketballCapacity: 20333,
  },
}

const unitedCenter = 'https://www.unitedcenter.com/venue/introduction-history/'
const cryptoArena = 'https://www.cryptoarena.com/about-us'
const targetCenter = 'https://www.targetcenter.com/arena-info/about-target-center'

/** Years refer to the opening of the current building, not its NBA debut. */
export const arenaOpenings: Readonly<Record<string, readonly [number, string]>> = {
  'state-farm-arena': [1999, 'https://www.statefarmarena.com/about-the-arena/quick-facts'],
  'td-garden': [1995, 'https://www.tdgarden.com/about-td-garden'],
  'spectrum-center': [
    2005,
    'https://www.spectrumcentercharlotte.com/news/detail/spectrum-centers-20th-anniversary-campaign-celebrates-landmark-first-month-of-reopening',
  ],
  'rocket-arena': [
    1994,
    'https://www.rocketarena.com/news/detail/30th-anniversary-announcement-240930/',
  ],
  'american-airlines-center': [2001, 'https://www.americanairlinescenter.com/about-aacenter'],
  'ball-arena': [1999, 'https://www.ballarena.com/arena-information/about-ball-arena/'],
  'little-caesars-arena': [
    2017,
    'https://www.313presents.com/news/detail/little-caesars-arena-opens-with-10-consecutive-concert-sellouts',
  ],
  'chase-center': [2019, 'https://www.chasecenter.com/press-kit/'],
  'gainbridge-fieldhouse': [
    1999,
    'https://www.gainbridgefieldhouse.com/news/detail/partnership-to-feature-indiana-artists-through-fieldhouse-of-the-future-renovations',
  ],
  'kaseya-center': [
    1999,
    'https://www.kaseyacenter.com/news/detail/kaseya-center-celebrates-25-years',
  ],
  'fiserv-forum': [2018, 'https://www.fiservforum.com/news/detail/statement-from-fiserv-forum'],
  'paycom-center': [2002, 'https://www.paycomcenter.com/about-the-arena/overview'],
  'kia-center': [2010, 'https://www.kiacenter.com/arena-info/about-kia-center'],
  'golden-1-center': [
    2016,
    'https://www.golden1center.com/news/detail/golden-1-center-created-entertainment-destination-for-worlds-biggest-tours-in-2017/',
  ],
  'delta-center': [1991, 'https://www.deltacenter.com/about-us/'],
  'barclays-center': [2012, ARENA_DIRECTORY_SOURCE],
  'united-center': [1994, unitedCenter],
  'toyota-center': [2003, ARENA_DIRECTORY_SOURCE],
  'intuit-dome': [
    2024,
    'https://www.nba.com/news/starting-5-oct-15-go-inside-the-nbas-newest-arena-for-its-first-game',
  ],
  'crypto-com-arena': [1999, cryptoArena],
  fedexforum: [2004, ARENA_DIRECTORY_SOURCE],
  'target-center': [1990, targetCenter],
  'smoothie-king-center': [1999, ARENA_DIRECTORY_SOURCE],
  'madison-square-garden': [1968, ARENA_DIRECTORY_SOURCE],
  'xfinity-mobile-arena': [
    1996,
    'https://www.nba.com/news/wells-fargo-center-receive-250-million-renovation-upgrades',
  ],
  'mortgage-matchup-center': [
    1992,
    'https://www.nba.com/suns/news/qa-suns-legacy-partners-staff-celebrate-30-years-with-organization',
  ],
  'moda-center': [1995, ARENA_DIRECTORY_SOURCE],
  'frost-bank-center': [2002, ARENA_DIRECTORY_SOURCE],
  'scotiabank-arena': [1999, ARENA_DIRECTORY_SOURCE],
  'capital-one-arena': [1997, ARENA_DIRECTORY_SOURCE],
}

export const arenaOccupants: Readonly<Record<string, readonly [readonly string[], string]>> = {
  'td-garden': [['Boston Bruins'], ARENA_DIRECTORY_SOURCE],
  'united-center': [['Chicago Blackhawks'], unitedCenter],
  'rocket-arena': [['Cleveland Monsters'], ARENA_DIRECTORY_SOURCE],
  'american-airlines-center': [['Dallas Stars'], ARENA_DIRECTORY_SOURCE],
  'ball-arena': [['Colorado Avalanche', 'Colorado Mammoth'], ARENA_DIRECTORY_SOURCE],
  'little-caesars-arena': [['Detroit Red Wings'], ARENA_DIRECTORY_SOURCE],
  'crypto-com-arena': [['Los Angeles Kings', 'Los Angeles Sparks'], cryptoArena],
  fedexforum: [['Memphis Tigers'], ARENA_DIRECTORY_SOURCE],
  'target-center': [['Minnesota Lynx'], targetCenter],
  'madison-square-garden': [['New York Rangers'], ARENA_DIRECTORY_SOURCE],
  'xfinity-mobile-arena': [['Philadelphia Flyers', 'Philadelphia Wings'], ARENA_DIRECTORY_SOURCE],
  'mortgage-matchup-center': [['Phoenix Mercury'], 'https://mortgagematchupcenter.com/'],
  'scotiabank-arena': [['Toronto Maple Leafs'], ARENA_DIRECTORY_SOURCE],
  'fiserv-forum': [
    ['Marquette Golden Eagles'],
    'https://www.fiservforum.com/plan-your-visit/a-z-guide',
  ],
  'kia-center': [['Orlando Solar Bears'], 'https://www.kiacenter.com/rental-spaces'],
  'delta-center': [['Utah Mammoth'], 'https://www.nba.com/jazz/ticket-partner'],
  'capital-one-arena': [['Washington Capitals', 'Georgetown Hoyas'], ARENA_DIRECTORY_SOURCE],
}

type BuildingCost = { amount: number; currency: 'USD' | 'CAD'; priceYear: number }
export const arenaConstruction: Readonly<Record<string, readonly [BuildingCost, string]>> = {
  'paycom-center': [
    { amount: 89_200_000, currency: 'USD', priceYear: 2002 },
    'https://www.paycomcenter.com/about-the-arena/overview',
  ],
  fedexforum: [{ amount: 250_000_000, currency: 'USD', priceYear: 2004 }, ARENA_DIRECTORY_SOURCE],
  'moda-center': [
    { amount: 267_000_000, currency: 'USD', priceYear: 1995 },
    ARENA_DIRECTORY_SOURCE,
  ],
}

// Explicit building coordinates from the linked Wikidata entities, corroborated
// against their venue addresses. These are venue pins, not entrance locations.
export const arenaCoordinates: Readonly<Record<string, { qid: string; lat: number; lon: number }>> =
  {
    'united-center': { qid: 'Q639975', lat: 41.88056, lon: -87.67417 },
    'crypto-com-arena': { qid: 'Q186080', lat: 34.04306, lon: -118.26722 },
    'target-center': { qid: 'Q14456555', lat: 44.97944, lon: -93.27611 },
  }

interface ArenaNameStart {
  from: string
  sourceUrl: string
}

export interface ArenaNamePeriod extends ArenaNameStart {
  name: string
  until: string
  asOf: string
}

const rocketRename = 'https://www.rocketarena.com/news/detail/rocket-announcement-250218'
const cryptoRename =
  'https://www.nba.com/news/staples-center-to-be-renamed-crypto-com-arena-beginning-december-25'
const torontoVenueHistory = 'https://www.scotiabankarena.com/venue-information/about'

export const arenaCurrentNameStarts: Readonly<Partial<Record<string, ArenaNameStart>>> = {
  'chase-center': {
    from: '2019-09-06',
    sourceUrl: 'https://www.chasecenter.com/plan-your-visit.timelines',
  },
  'crypto-com-arena': { from: '2021-12-25', sourceUrl: cryptoRename },
  'delta-center': {
    from: '2023-07-01',
    sourceUrl: 'https://www.nba.com/news/everything-to-know-about-nba-summer-league-2023',
  },
  'intuit-dome': {
    from: '2024-08-15',
    sourceUrl: 'https://www.nba.com/clippers/intuitdomepress',
  },
  'mortgage-matchup-center': {
    from: '2025-10-02',
    sourceUrl:
      'https://www.nba.com/suns/news/phoenix-suns-and-phoenix-mercury-announce-landmark-naming-rights-partnership-with-mortgage-matchup-ushering-in-a-new-era-in-sports-and-entertainment-at-mortgage-matchup-center',
  },
  'rocket-arena': { from: '2025-02-18', sourceUrl: rocketRename },
  'scotiabank-arena': { from: '2018-07-01', sourceUrl: torontoVenueHistory },
  'united-center': { from: '1994-08-18', sourceUrl: unitedCenter },
}

export const arenaFormerNames: Readonly<Record<string, readonly ArenaNamePeriod[]>> = {
  'rocket-arena': [
    {
      name: 'Rocket Mortgage FieldHouse',
      from: '2019-04-09',
      until: '2025-02-18',
      sourceUrl: rocketRename,
      asOf: ARENA_REVIEWED_AT,
    },
  ],
  'crypto-com-arena': [
    {
      name: 'Staples Center',
      from: '1999-10-17',
      until: '2021-12-25',
      sourceUrl: cryptoRename,
      asOf: ARENA_REVIEWED_AT,
    },
  ],
  'scotiabank-arena': [
    {
      name: 'Air Canada Centre',
      from: '1999-02',
      until: '2018-07-01',
      sourceUrl: torontoVenueHistory,
      asOf: ARENA_REVIEWED_AT,
    },
  ],
}

export const arenaAlternateHomes: Readonly<
  Record<
    string,
    {
      name: string
      city: string
      dates: readonly string[]
      sourceUrl: string
      asOf: string
    }
  >
> = {
  'frost-bank-center': {
    name: 'Moody Center',
    city: 'Austin, Texas',
    dates: ['2026-10-23', '2027-02-26', '2027-02-28'],
    sourceUrl: 'https://www.nba.com/spurs/schedule?os=___',
    asOf: ARENA_REVIEWED_AT,
  },
}
