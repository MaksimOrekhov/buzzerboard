<script setup lang="ts">
import MatchCard from '@/shared/components/MatchCard.vue'
import StandingsTable from '@/shared/components/StandingsTable.vue'
import '@/assets/main.css'
import type {
  Game,
  GameId,
  NbaGameDate,
  ProviderRecordId,
  StandingsRow,
  TeamId,
  UtcTimestamp,
} from '@/entities/nba/model'

const eastRow: StandingsRow = {
  team: {
    id: 'nba:team:bos' as TeamId,
    providerId: 'bos' as ProviderRecordId,
    abbreviation: 'BOS',
    displayName: 'Boston Celtics',
  },
  seasonEndYear: 2026 as StandingsRow['seasonEndYear'],
  conference: 'east',
  record: {
    wins: 8,
    losses: 3,
    conferenceWins: 6,
    conferenceLosses: 2,
    homeWins: 5,
    homeLosses: 1,
    awayWins: 3,
    awayLosses: 2,
    lastTenWins: 7,
    pointsFor: 119.2,
    pointsAgainst: 108.4,
    averageMargin: 10.8,
  },
  winPercentage: 8 / 11,
  officialRank: 1,
  playoffSeed: 1,
  providerOrder: 1,
}

const westRow: StandingsRow = {
  ...eastRow,
  team: {
    id: 'nba:team:den' as TeamId,
    providerId: 'den' as ProviderRecordId,
    abbreviation: 'DEN',
    displayName: 'Denver Nuggets',
  },
  conference: 'west',
  record: {
    ...eastRow.record,
    wins: 7,
    losses: 4,
    conferenceWins: 5,
    conferenceLosses: 3,
  },
  winPercentage: 7 / 11,
  officialRank: 2,
  playoffSeed: 2,
  providerOrder: 2,
}

const game: Game = {
  id: 'dunkapi:game:visual-fixture' as GameId,
  provider: 'dunkapi',
  providerId: 'visual-fixture' as ProviderRecordId,
  seasonEndYear: 2026 as Game['seasonEndYear'],
  nbaGameDate: '2026-11-15' as NbaGameDate,
  startsAt: '2026-11-16T02:30:00.000Z' as UtcTimestamp,
  status: 'scheduled',
  homeTeam: westRow.team,
  awayTeam: eastRow.team,
  score: { home: null, away: null },
  scoreByPeriod: null,
  venue: 'Визуальная проверка · без результата',
}
</script>

<template>
  <main class="visual-fixture">
    <header class="visual-fixture-heading">
      <p class="eyebrow">Тестовый стенд · синтетические данные</p>
      <h1>Визуальная проверка компонентов</h1>
      <p>Эти примеры изолированы от пользовательских экранов и не входят в production-сборку.</p>
    </header>
    <section aria-labelledby="match-heading">
      <div class="visual-fixture-section-heading">
        <div>
          <p class="eyebrow">Карточка</p>
          <h2 id="match-heading">Матч</h2>
        </div>
      </div>
      <MatchCard :game="game" />
    </section>
    <section aria-labelledby="standings-heading">
      <div class="visual-fixture-section-heading">
        <div>
          <p class="eyebrow">Таблица</p>
          <h2 id="standings-heading">Состояние с данными</h2>
        </div>
      </div>
      <StandingsTable :rows="[eastRow, westRow]" />
    </section>
  </main>
</template>

<style>
.visual-fixture {
  display: grid;
  width: min(calc(100% - 2rem), 72rem);
  min-width: 0;
  grid-template-columns: minmax(0, 1fr);
  gap: 2rem;
  margin: 0 auto;
  padding: 2rem 0 3rem;
}

.visual-fixture > section {
  min-width: 0;
}

.visual-fixture-heading {
  max-width: 48rem;
}

.visual-fixture-heading h1 {
  margin: 0.55rem 0 0;
  font-size: clamp(2rem, 4vw, 3rem);
  line-height: 1.1;
}

.visual-fixture-heading > p:last-child {
  color: var(--muted);
  line-height: 1.6;
}

.visual-fixture-section-heading {
  margin-bottom: 0.75rem;
}

.visual-fixture-section-heading h2 {
  margin: 0.3rem 0 0;
  font-size: 1.4rem;
}
</style>
