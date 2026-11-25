<script setup lang="ts">
import { nextTick, useTemplateRef } from 'vue'
import type { StandingsRow, TeamId } from '@/entities/nba/model'
import AppButton from '@/shared/components/AppButton.vue'
import AppIcon from '@/shared/components/AppIcon.vue'

const props = defineProps<{ rows: readonly StandingsRow[] }>()
const emit = defineEmits<{ remove: [id: TeamId]; clear: []; exit: []; open: [] }>()
const bar = useTemplateRef('bar')

function teamName(row: StandingsRow) {
  return row.team.displayName ?? row.team.abbreviation ?? 'Команда без названия'
}

function focusAction() {
  bar.value?.querySelector<HTMLButtonElement>('button[data-compare-action]:enabled')?.focus({
    preventScroll: true,
  })
}

function remove(id: TeamId) {
  emit('remove', id)
  void nextTick(focusAction)
}

function open(event: MouseEvent) {
  // On touch browsers a tapped button is not always focused before the modal opens.
  if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus({ preventScroll: true })
  emit('open')
}

function clear() {
  if (props.rows.length) emit('clear')
  else emit('exit')
}

defineExpose({ focusAction })
</script>

<template>
  <aside ref="bar" class="standings-compare-bar" aria-label="Выбранные команды">
    <AppIcon name="compare" class="standings-compare-mark" />
    <strong class="standings-selection-count" role="status">
      <span class="visually-hidden">Выбрано команд: </span>{{ rows.length }} / 2
    </strong>
    <div class="standings-selection-teams">
      <button
        v-for="row in rows"
        :key="row.team.id"
        class="standings-selection-chip"
        type="button"
        :aria-label="`Убрать ${teamName(row)} из сравнения`"
        :title="teamName(row)"
        @click="remove(row.team.id)"
      >
        <span>{{ row.team.abbreviation ?? teamName(row) }}</span><AppIcon name="close" :size="13" />
      </button>
      <span
        v-for="slot in 2 - rows.length"
        :key="slot"
        class="standings-selection-slot"
        aria-hidden="true"
        >—</span
      >
    </div>
    <AppButton
      data-compare-action
      icon="close"
      icon-only
      :aria-label="rows.length ? 'Сбросить выбор команд' : 'Закрыть режим сравнения'"
      @click="clear"
    />
    <AppButton
      class="standings-compare-submit"
      variant="primary"
      aria-label="Сравнить команды"
      :disabled="rows.length !== 2"
      @click="open"
      >Сравнить</AppButton
    >
  </aside>
</template>
