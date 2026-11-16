<script setup lang="ts">
import { RouterLink } from 'vue-router'

import AppIcon from '@/shared/components/AppIcon.vue'
import EmptyState from '@/shared/components/EmptyState.vue'
import PageHeading from '@/shared/components/PageHeading.vue'
</script>

<template>
  <div class="not-found-view">
    <PageHeading
      eyebrow="Мимо кольца"
      title="Такой страницы нет."
      description="Возможно, адрес изменился или страницу ещё не создали."
    />
    <EmptyState
      icon="basketball"
      eyebrow="Вернуться в игру"
      title="Начните с главной."
      description="Откройте главную страницу и выберите нужный раздел BuzzerBoard."
    />
    <RouterLink class="home-link focus-ring" to="/">
      <AppIcon name="arrow-up-right" :size="17" />
      На главную
    </RouterLink>
  </div>
</template>

<style scoped>
.home-link {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  margin-top: 1.3rem;
  border: 1px solid rgb(255 112 72 / 32%);
  border-radius: 0.75rem;
  background: rgb(255 112 72 / 8%);
  padding: 0.65rem 0.85rem;
  color: #ffd4c7;
  font-size: 0.82rem;
  font-weight: 700;
  text-decoration: none;
}

.home-link:hover {
  background: rgb(255 112 72 / 15%);
}
</style>
