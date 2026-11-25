<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import type { Team } from '@/entities/nba/model'
const props = withDefaults(defineProps<{ team: Team; size?: number }>(), {
  size: 40,
})
// Canonical NBA team abbreviations map to the IDs used by the official NBA CDN.
const logoIds: Record<string, number> = {
  atl: 1610612737,
  bos: 1610612738,
  bkn: 1610612751,
  cha: 1610612766,
  chi: 1610612741,
  cle: 1610612739,
  dal: 1610612742,
  den: 1610612743,
  det: 1610612765,
  gsw: 1610612744,
  gs: 1610612744,
  hou: 1610612745,
  ind: 1610612754,
  lac: 1610612746,
  lal: 1610612747,
  mem: 1610612763,
  mia: 1610612748,
  mil: 1610612749,
  min: 1610612750,
  nop: 1610612740,
  no: 1610612740,
  nyk: 1610612752,
  ny: 1610612752,
  okc: 1610612760,
  orl: 1610612753,
  phi: 1610612755,
  phx: 1610612756,
  por: 1610612757,
  sac: 1610612758,
  sas: 1610612759,
  sa: 1610612759,
  tor: 1610612761,
  uta: 1610612762,
  utah: 1610612762,
  was: 1610612764,
  wsh: 1610612764,
}
const key = computed(() =>
  props.team.id.startsWith('nba:team:')
    ? props.team.id.slice(9).toLowerCase()
    : props.team.abbreviation?.toLowerCase(),
)
const logoId = computed(() => (key.value ? logoIds[key.value] : undefined))
const failed = shallowRef(false)
const src = computed(() =>
  logoId.value ? `https://cdn.nba.com/logos/nba/${logoId.value}/primary/L/logo.svg` : null,
)
const initials = computed(
  () =>
    props.team.abbreviation ??
    props.team.displayName
      ?.split(/\s+/)
      .map((word) => word[0])
      .join('')
      .slice(0, 3)
      .toUpperCase() ??
    'NBA',
)
watch(src, () => {
  failed.value = false
})
</script>
<template>
  <span
    class="gc-team-logo"
    :style="{ width: `${size}px`, height: `${size}px` }"
    aria-hidden="true"
  >
    <img
      v-if="src && !failed"
      :src="src"
      alt=""
      :width="size"
      :height="size"
      decoding="async"
      referrerpolicy="no-referrer"
      @error="failed = true"
    />
    <span v-else class="gc-team-fallback">{{ initials }}</span>
  </span>
</template>
