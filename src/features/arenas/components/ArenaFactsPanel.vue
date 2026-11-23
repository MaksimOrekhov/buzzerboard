<script setup lang="ts">
import type { Arena } from '@/entities/nba/arenaDirectory'
import { formatArenaNumber } from '../catalog'
import ArenaSource from './ArenaSource.vue'

defineProps<{ arena: Arena }>()
</script>

<template>
  <section class="arena-panel" aria-labelledby="arena-facts-heading">
    <h2 id="arena-facts-heading">Характеристики</h2>
    <dl class="arena-data">
      <div>
        <dt>Год открытия здания</dt>
        <dd>
          <template v-if="arena.opened">
            <strong>{{ arena.opened.value }}</strong>
            <ArenaSource :source="arena.opened" />
          </template>
          <span v-else>Нет проверенных данных</span>
        </dd>
      </div>
      <div>
        <dt>Вместимость на матчах NBA</dt>
        <dd>
          <template v-if="arena.basketballCapacity">
            <strong>{{ formatArenaNumber(arena.basketballCapacity.value) }} мест</strong>
            <ArenaSource :source="arena.basketballCapacity">Справочник NBA</ArenaSource>
          </template>
          <span v-else>Нет проверенных данных</span>
        </dd>
      </div>
      <div>
        <dt>Другие команды и арендаторы</dt>
        <dd>
          <template v-if="arena.occupants">
            {{ arena.occupants.value.join(' · ') }}
            <ArenaSource :source="arena.occupants" />
          </template>
          <span v-else>Нет проверенных данных</span>
        </dd>
      </div>
      <div>
        <dt>Стоимость строительства</dt>
        <dd>
          <template v-if="arena.construction">
            {{ formatArenaNumber(arena.construction.value.amount) }}
            {{ arena.construction.value.currency }} · {{ arena.construction.value.priceYear }}
            <ArenaSource :source="arena.construction" />
          </template>
          <span v-else>Нет проверенных данных</span>
        </dd>
      </div>
    </dl>
  </section>
</template>
