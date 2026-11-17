<script setup lang="ts">
import { RouterLink } from 'vue-router'
import PageHeading from '@/shared/components/PageHeading.vue'
import EmptyState from '@/shared/components/EmptyState.vue'
import AppIcon from '@/shared/components/AppIcon.vue'
</script>
<template>
  <div class="not-found-view">
    <PageHeading
      eyebrow="Ошибка 404"
      title="Страница не найдена"
      description="Возможно, адрес изменился или страницу ещё не создали."
    /><EmptyState
      icon="basketball"
      eyebrow="Вернуться в игру"
      title="Мы вышли за пределы площадки"
      description="Начните с обзора или откройте расписание матчей."
      ><div class="ui-inline-actions">
        <RouterLink to="/" class="gc-control ui-button--primary"
          >На главную<AppIcon name="arrow" :size="16" /></RouterLink
        ><RouterLink to="/games" class="gc-control">К матчам</RouterLink>
      </div></EmptyState
    >
  </div>
</template>
