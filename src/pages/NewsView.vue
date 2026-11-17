<script setup lang="ts">
import { RouterLink } from 'vue-router'
import PageHeading from '@/shared/components/PageHeading.vue'
import ResourceState from '@/shared/components/ResourceState.vue'
import AppIcon from '@/shared/components/AppIcon.vue'
import AppPanel from '@/shared/components/AppPanel.vue'
import AppBadge from '@/shared/components/AppBadge.vue'
</script>
<template>
  <div class="news-view">
    <PageHeading
      eyebrow="Вокруг лиги"
      title="Новости"
      description="Истории команд, игроков и событий NBA."
    />
    <div class="news-columns">
      <ResourceState
        status="empty"
        icon="news"
        eyebrow="Следующая глава"
        title="Готовим ленту новостей"
        description="Здесь появятся публикации о лиге. Источник новостей ещё не подключён."
        ><template #action><AppBadge dot>Скоро в BuzzerBoard</AppBadge></template></ResourceState
      ><AppPanel title="Игра продолжается" description="Следите за тем, что происходит на площадке."
        ><RouterLink to="/games" class="news-quick-link"
          ><AppIcon name="basketball" :size="23" />
          <div><strong>Game Center</strong><span>Расписание и результаты</span></div>
          <AppIcon name="arrow" :size="18" /></RouterLink
        ><RouterLink to="/standings" class="news-quick-link"
          ><AppIcon name="trophy" :size="23" />
          <div><strong>Турнирная таблица</strong><span>Восток, Запад и цифры сезона</span></div>
          <AppIcon name="arrow" :size="18" /></RouterLink
      ></AppPanel>
    </div>
  </div>
</template>
