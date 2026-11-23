<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { arenaPath } from '@/entities/nba/arenaDirectory'
import { cityPath, formatCityTime } from '@/entities/nba/cityDirectory'
import { getGameGeography } from '@/entities/nba/gameGeography'
import type { Game } from '@/entities/nba/model'
import { NBA_TIME_ZONE, VIEWER_TIME_ZONE } from '@/shared/utils/nbaDate'
import AppIcon from '@/shared/components/AppIcon.vue'

const props = defineProps<{
  game: Pick<Game, 'venue' | 'nbaGameDate' | 'homeTeam' | 'awayTeam' | 'startsAt'>
}>()
const geo = computed(() => getGameGeography(props.game))
const pairs = computed(() => [
  { key: 'away', city: geo.value.away, code: props.game.awayTeam.abbreviation },
  { key: 'home', city: geo.value.home, code: props.game.homeTeam.abbreviation },
])
const instant = computed(() => {
  if (!props.game.startsAt) return null
  const date = new Date(props.game.startsAt)
  return Number.isFinite(date.getTime()) ? date : null
})
const clocks = computed(() => {
  const { venue, home } = geo.value
  const timeZone = venue?.timeZone ?? (geo.value.currentHomes ? home?.timeZone.value : undefined)
  return [
    { label: 'Восточное время NBA', timeZone: NBA_TIME_ZONE },
    { label: 'Ваше время', timeZone: VIEWER_TIME_ZONE },
    ...(timeZone
      ? [
          {
            label: venue
              ? `Местное время площадки · ${venue.cityName}`
              : `Справочное время города хозяев · ${home?.name}`,
            timeZone,
          },
        ]
      : []),
  ]
})
const distanceFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })
</script>

<template>
  <section class="game-geography" aria-labelledby="game-geography-heading">
    <h2 id="game-geography-heading"><AppIcon name="globe" :size="20" /> География матча</h2>
    <div class="game-geography__grid">
      <div>
        <h3>{{ geo.currentHomes ? 'Города команд' : 'Текущие города команд' }}</h3>
        <ul class="game-geography__teams">
          <li v-for="{ key, city, code } in pairs" :key="key">
            <span>{{ code ?? (key === 'home' ? 'Хозяева' : 'Гости') }}</span>
            <RouterLink v-if="city" :to="cityPath(city)" class="ui-text-link">{{
              city.name
            }}</RouterLink>
            <span v-else>Город не подтверждён</span>
          </li>
        </ul>
        <p v-if="geo.distance !== null" class="game-geography__distance">
          <strong>≈ {{ distanceFormatter.format(geo.distance) }} км</strong>
          <span>Приближённое расстояние по прямой между географическими ориентирами</span>
          <small
            >{{ geo.from?.name }} ·
            {{
              geo.from?.referencePoint?.value.gnisId ? 'USGS GNIS' : 'данные города Торонто'
            }}</small
          >
          <small
            >{{ geo.to?.name }} ·
            {{
              geo.to?.referencePoint?.value.gnisId ? 'USGS GNIS' : 'данные города Торонто'
            }}</small
          >
        </p>
        <p v-else-if="geo.neutral || geo.offHomeCourt">
          Площадка вне основной домашней арены. Расстояние между городами не показано.
        </p>
        <p v-else-if="geo.unknownVenue">
          Место указанной площадки не подтверждено. Расстояние не показано.
        </p>
        <p v-else-if="!geo.currentHomes">
          Для этой даты нет подтверждённой привязки команд к домашним городам.
        </p>
        <p v-else>Для расчёта нужны два подтверждённых географических ориентира.</p>
      </div>

      <div>
        <h3>Площадка и время начала</h3>
        <p v-if="geo.venue">
          <RouterLink
            v-if="geo.venue.arena"
            :to="arenaPath(geo.venue.arena)"
            class="ui-text-link"
            >{{ geo.venue.name }}</RouterLink
          >
          <a
            v-else
            :href="geo.venue.sourceUrl"
            class="ui-text-link"
            target="_blank"
            rel="noopener noreferrer"
            >{{ geo.venue.name }}</a
          >
          · {{ geo.venue.cityName }}
        </p>
        <p v-else>
          {{
            geo.neutral
              ? 'Нейтральная площадка, город не подтверждён.'
              : 'Место проведения матча не подтверждено.'
          }}
        </p>
        <p>
          Игровая дата NBA · <time :datetime="game.nbaGameDate">{{ game.nbaGameDate }}</time> (ET)
        </p>
        <dl v-if="instant" class="game-geography__clocks">
          <div v-for="{ label, timeZone } in clocks" :key="label">
            <dt>{{ label }}</dt>
            <dd>
              <time :datetime="game.startsAt ?? undefined">{{
                formatCityTime(instant, timeZone)
              }}</time><small>{{ timeZone }}</small>
            </dd>
          </div>
        </dl>
        <p v-else>Время начала не опубликовано.</p>
      </div>
    </div>
  </section>
</template>
