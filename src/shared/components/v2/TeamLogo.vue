<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import type { Team } from '@/entities/nba/model'
const props = withDefaults(defineProps<{ team: Team; size?: number }>(), { size: 40 })
// CDN aliases are identifiers, not bundled team artwork. Public builds use the fallback.
const aliases: Record<string, string> = {
  atl: 'atl',
  bos: 'bos',
  bkn: 'bkn',
  cha: 'cha',
  chi: 'chi',
  cle: 'cle',
  dal: 'dal',
  den: 'den',
  det: 'det',
  gsw: 'gs',
  hou: 'hou',
  ind: 'ind',
  lac: 'lac',
  lal: 'lal',
  mem: 'mem',
  mia: 'mia',
  mil: 'mil',
  min: 'min',
  nop: 'no',
  nyk: 'ny',
  okc: 'okc',
  orl: 'orl',
  phi: 'phi',
  phx: 'phx',
  por: 'por',
  sac: 'sac',
  sas: 'sa',
  tor: 'tor',
  uta: 'utah',
  was: 'wsh',
  wsh: 'wsh',
  utah: 'utah',
  gs: 'gs',
  ny: 'ny',
  no: 'no',
  sa: 'sa',
}
const key = computed(() =>
  props.team.id.startsWith('nba:team:')
    ? props.team.id.slice(9).toLowerCase()
    : props.team.abbreviation?.toLowerCase(),
)
const alias = computed(() => (key.value ? aliases[key.value] : undefined))
const failed = shallowRef(false)
const base = import.meta.env.DEV ? import.meta.env.VITE_PRIVATE_TEAM_LOGO_BASE_URL : undefined
const src = computed(() =>
  base && alias.value ? `${base.replace(/\/$/, '')}/${alias.value}.png` : null,
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
