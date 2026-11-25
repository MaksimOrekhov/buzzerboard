<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import type { NbaApiSnapshot } from '@/shared/api/nba/contracts'
import { VIEWER_TIME_ZONE } from '@/shared/utils/nbaDate'
const props = defineProps<{
  meta: NbaApiSnapshot<unknown>['meta']
  showSource?: boolean
  compact?: boolean
  refreshFailed?: boolean
}>()
const fetchedAt = computed(() => new Date(props.meta.fetchedAt))
const updated = computed(() => {
  const date = fetchedAt.value
  if (!Number.isFinite(date.getTime())) return 'время не указано'
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: VIEWER_TIME_ZONE,
  }).format(date)
})
const source = computed(() =>
  props.meta.source === 'dunkapi'
    ? 'DunkAPI'
    : props.meta.source === 'bbs'
      ? 'Big Balls Sports Data'
      : 'ESPN',
)
</script>
<template>
  <div
    class="gc-data-status"
    :class="{
      'gc-data-status--stale': meta.isStale || meta.refreshError || refreshFailed,
      'gc-data-status--prominent': showSource && !compact,
      'gc-data-status--compact': compact,
    }"
    role="status"
  >
    <span class="gc-data-dot" />
    <span v-if="compact">
      <span v-if="meta.isStale">Данные устарели · </span>
      <span v-else class="visually-hidden">Загружено </span>
      <time v-if="Number.isFinite(fetchedAt.getTime())" :datetime="fetchedAt.toISOString()">{{
        updated
      }}</time>
      <template v-else>{{ updated }}</template>
    </span>
    <span v-else
      >{{ meta.isStale ? 'Данные устарели · Обновлено' : 'Обновлено' }} {{ updated
      }}<template v-if="showSource"> · {{ VIEWER_TIME_ZONE }} · {{ source }}</template
      ><template v-if="showSource && (meta.refreshError || refreshFailed)">
        · Обновление не удалось</template
      ></span
    >
    <details class="gc-source-details">
      <summary :aria-label="compact ? `Источник: ${source}. Сведения о снимке` : undefined">
        {{
          compact
            ? meta.source === 'bbs'
              ? 'BBS'
              : source
            : showSource
              ? 'Подробнее'
              : 'Источник'
        }}<AppIcon name="down" :size="12" />
      </summary>
      <p>
        {{ source }} · {{ VIEWER_TIME_ZONE }}<br />Время загрузки: {{ updated }}.<br />{{
          meta.providerUpdatedAt
            ? `Обновление источника: ${meta.providerUpdatedAt}`
            : 'Источник не указал точное время обновления.'
        }}<br />Отклонено записей: {{ meta.rejectedRecords }}.<span v-if="meta.refreshError"
          ><br />Последнее обновление не удалось.</span
        >
      </p>
    </details>
  </div>
</template>
