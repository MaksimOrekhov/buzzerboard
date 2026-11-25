import { useRoute, useRouter } from 'vue-router'
import { useGameCenter } from '@/features/games/composables/useGameCenter'
import { selectableNbaGameDate } from '@/shared/utils/nbaDate'

export function useHomeGameDay() {
  const route = useRoute()
  const router = useRouter()
  const day = useGameCenter()

  function selectDate(value: string) {
    const date = selectableNbaGameDate(value, day.minDate.value, day.maxDate.value)
    if (!date || date === day.selectedDate.value) return
    void router.push({ path: '/', query: { ...route.query, date }, hash: route.hash })
  }

  return { ...day, selectDate }
}
