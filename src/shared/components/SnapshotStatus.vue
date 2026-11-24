<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import type { NbaApiSnapshot } from '@/shared/api/nba/contracts'
import { VIEWER_TIME_ZONE } from '@/shared/utils/nbaDate'
const props = defineProps<{
  meta: NbaApiSnapshot<unknown>['meta']
  showSource?: boolean
  refreshFailed?: boolean
}>()
const updated = computed(() => {
  const date = new Date(props.meta.fetchedAt)
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
      'gc-data-status--prominent': showSource,
    }"
    role="status"
  >
    <span class="gc-data-dot" /><span
      >{{ meta.isStale ? 'Данные устарели · Обновлено' : 'Обновлено' }} {{ updated
      }}<template v-if="showSource"> · {{ VIEWER_TIME_ZONE }} · {{ source }}</template
      ><template v-if="showSource && (meta.refreshError || refreshFailed)">
        · Обновление не удалось</template
      ></span
    >
    <details class="gc-source-details">
      <summary>
        {{ showSource ? 'Подробнее' : 'Источник' }}<AppIcon name="down" :size="12" />
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
