<script setup lang="ts">
import { RouterLink } from 'vue-router'

import { comingSoonItems } from '@/app/navigation'
import AppBadge from '@/shared/components/AppBadge.vue'
import AppIcon from '@/shared/components/AppIcon.vue'
import ResourceState from '@/shared/components/ResourceState.vue'

const todayLabel = new Intl.DateTimeFormat('ru-RU', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
}).format(new Date())
</script>

<template>
  <div class="home-view">
    <section class="hero-panel" aria-labelledby="hero-title">
      <div class="hero-grid-lines" aria-hidden="true" />
      <div class="hero-copy">
        <div class="hero-overline">
          <span class="hero-overline-mark" />
          <span>Ваше пространство NBA</span>
        </div>
        <h1 id="hero-title">Игра.<br /><span>В деталях.</span></h1>
        <p>
          Матчи, таблица и истории лиги — собранные в одном месте. Только проверенные данные и ясный
          контекст.
        </p>
        <div class="hero-actions">
          <RouterLink class="button button--primary focus-ring" to="/games">
            Смотреть матчи
            <AppIcon name="arrow-up-right" :size="16" />
          </RouterLink>
          <RouterLink class="button button--secondary focus-ring" to="/standings">
            Турнирная таблица
          </RouterLink>
        </div>
        <div class="hero-trust">
          <AppIcon name="database" :size="14" />
          <span>Неподтверждённые результаты не показываются</span>
        </div>
      </div>

      <div class="hero-art" aria-hidden="true">
        <div class="art-coordinates">BB <span>/</span> NBA</div>
        <div class="court-arc court-arc--one" />
        <div class="court-arc court-arc--two" />
        <div class="court-center-line" />
        <div class="art-ball-shadow" />
        <div class="art-ball"><AppIcon name="basketball" :size="112" /></div>
        <div class="art-stamp">
          <span>ОТ ИГРЫ</span>
          <span class="art-stamp-line" />
          <span>К СЕЗОНУ</span>
        </div>
        <div class="art-side-label">BUZZERBOARD / 01</div>
      </div>
    </section>

    <section class="overview-section" aria-labelledby="overview-title">
      <div class="section-heading">
        <div>
          <p class="eyebrow">{{ todayLabel }}</p>
          <h2 id="overview-title">Ваш обзор</h2>
        </div>
        <span class="section-caption">Матчи и турнирная таблица</span>
      </div>

      <div class="overview-grid">
        <article class="overview-panel overview-panel--games">
          <div class="panel-heading">
            <div class="panel-title-wrap">
              <span class="panel-icon panel-icon--accent"
                ><AppIcon name="calendar" :size="17"
              /></span>
              <div>
                <p class="panel-kicker">Расписание и результаты</p>
                <h3>Матчи</h3>
              </div>
            </div>
            <RouterLink
              class="text-link focus-ring"
              to="/games"
              aria-label="Перейти к расписанию матчей"
            >
              Все матчи <AppIcon name="arrow-up-right" :size="15" />
            </RouterLink>
          </div>
          <ResourceState
            status="empty"
            icon="basketball"
            title="Нет подключённого источника"
            description="Когда появятся проверенные данные, здесь будет календарь лиги."
            compact
          />
        </article>

        <article class="overview-panel overview-panel--standings">
          <div class="panel-heading">
            <div class="panel-title-wrap">
              <span class="panel-icon panel-icon--lime"><AppIcon name="trophy" :size="17" /></span>
              <div>
                <p class="panel-kicker">Восток и Запад</p>
                <h3>Таблица</h3>
              </div>
            </div>
            <RouterLink
              class="text-link focus-ring"
              to="/standings"
              aria-label="Перейти к турнирной таблице"
            >
              Открыть <AppIcon name="arrow-up-right" :size="15" />
            </RouterLink>
          </div>
          <ResourceState
            status="empty"
            icon="trophy"
            title="Позиции пока не загружены"
            description="Позиции появятся только после получения подтверждённого официального ранга."
            compact
          />
        </article>
      </div>
    </section>

    <section class="coming-section" aria-labelledby="coming-title">
      <div class="section-heading section-heading--compact">
        <div>
          <p class="eyebrow">Следующие главы</p>
          <h2 id="coming-title">Хаб будет расти вместе с сезоном</h2>
        </div>
        <AppBadge tone="neutral">План развития</AppBadge>
      </div>

      <div class="coming-grid">
        <article v-for="(item, index) in comingSoonItems" :key="item.id" class="coming-card">
          <div class="coming-card-top">
            <span class="coming-icon"><AppIcon :name="item.icon" :size="18" /></span>
            <span class="coming-index">0{{ index + 1 }}</span>
          </div>
          <div class="coming-card-bottom">
            <h3>{{ item.label }}</h3>
            <span>Скоро</span>
          </div>
        </article>
      </div>
    </section>

    <aside class="data-principle" aria-label="Принцип данных BuzzerBoard">
      <span class="principle-mark"><AppIcon name="sparkles" :size="15" /></span>
      <p>
        <strong>Честно о данных.</strong> Источник и время обновления будут видны рядом с каждым
        матчем и каждой таблицей.
      </p>
      <span class="principle-code">DATA STANDARD · 01</span>
    </aside>
  </div>
</template>

<style scoped>
.home-view {
  display: grid;
  gap: clamp(2.2rem, 4vw, 3.3rem);
  animation: page-arrive 340ms ease both;
}

.hero-panel {
  position: relative;
  display: grid;
  min-height: 22rem;
  grid-template-columns: minmax(0, 1.08fr) minmax(17rem, 0.92fr);
  overflow: hidden;
  border: 1px solid rgb(233 240 235 / 11%);
  border-radius: var(--radius-xl);
  background:
    radial-gradient(ellipse at 79% 39%, rgb(242 122 86 / 12%), transparent 36%),
    linear-gradient(117deg, #171b1d 0%, #101416 55%, #0d1112 100%);
  box-shadow: var(--shadow-panel);
}

.hero-grid-lines {
  position: absolute;
  inset: 0;
  background-image: linear-gradient(rgb(255 255 255 / 2.5%) 1px, transparent 1px);
  background-size: 100% 4.4rem;
  mask-image: linear-gradient(90deg, #000 0%, transparent 82%);
  pointer-events: none;
}

.hero-copy {
  position: relative;
  z-index: 2;
  align-self: center;
  padding: clamp(1.5rem, 4.5vw, 3.4rem);
}

.hero-overline {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  color: var(--lime);
  font-size: var(--font-size-caption);
  font-weight: 770;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.hero-overline-mark {
  width: 1.1rem;
  height: 1px;
  background: var(--lime);
  box-shadow: 0 0 10px rgb(217 236 121 / 55%);
}

.hero-copy h1 {
  margin: 1rem 0 0;
  color: var(--ink);
  font-size: clamp(3rem, 6.4vw, 5.55rem);
  font-weight: 790;
  letter-spacing: -0.09em;
  line-height: 0.9;
}

.hero-copy h1 span {
  color: var(--accent-bright);
}

.hero-copy > p {
  max-width: 29rem;
  margin: 1.15rem 0 0;
  color: #a5aeac;
  font-size: clamp(0.83rem, 1.4vw, 0.96rem);
  line-height: 1.65;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: 1.45rem;
}

.hero-trust {
  display: flex;
  align-items: center;
  gap: 0.43rem;
  margin-top: 1.35rem;
  color: #7d8988;
  font-size: var(--font-size-caption);
}

.hero-trust :deep(svg) {
  color: var(--lime);
}

.hero-art {
  position: relative;
  min-height: 22rem;
  overflow: hidden;
  isolation: isolate;
}

.hero-art::before {
  position: absolute;
  inset: 8% 6% 7% 0;
  border: 1px solid rgb(241 239 223 / 11%);
  border-radius: 50%;
  transform: rotate(-19deg) scaleY(0.77);
  content: '';
}

.hero-art::after {
  position: absolute;
  top: 50%;
  left: 0;
  width: 92%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgb(241 239 223 / 12%), transparent);
  content: '';
}

.art-coordinates {
  position: absolute;
  z-index: 2;
  top: 1.3rem;
  right: 1.5rem;
  color: #818a87;
  font-size: var(--font-size-caption);
  font-weight: 760;
  letter-spacing: 0.17em;
}

.art-coordinates span {
  padding: 0 0.22rem;
  color: var(--accent);
}

.court-arc {
  position: absolute;
  z-index: -1;
  top: 50%;
  left: 46%;
  width: 22rem;
  height: 22rem;
  border: 1px solid rgb(217 236 121 / 17%);
  border-radius: 50%;
  transform: translate(-50%, -50%);
}

.court-arc--two {
  width: 14rem;
  height: 14rem;
  border-color: rgb(242 122 86 / 26%);
  border-style: dashed;
  animation: slow-spin 40s linear infinite;
}

.court-center-line {
  position: absolute;
  top: 0;
  left: 46%;
  width: 1px;
  height: 100%;
  background: linear-gradient(transparent, rgb(217 236 121 / 18%), transparent);
}

.art-ball-shadow {
  position: absolute;
  top: 54%;
  left: 46%;
  width: 12rem;
  height: 12rem;
  border-radius: 50%;
  background: rgb(0 0 0 / 38%);
  filter: blur(27px);
  transform: translate(-42%, -34%) scale(0.78);
}

.art-ball {
  position: absolute;
  top: 50%;
  left: 46%;
  display: grid;
  width: 12rem;
  height: 12rem;
  place-items: center;
  border: 1px solid rgb(255 206 168 / 26%);
  border-radius: 50%;
  background:
    radial-gradient(circle at 33% 25%, rgb(255 198 148 / 30%), transparent 35%),
    radial-gradient(circle at 68% 78%, rgb(84 27 18 / 35%), transparent 47%),
    linear-gradient(145deg, #c65a38, #77331f 82%);
  box-shadow:
    inset -12px -15px 26px rgb(0 0 0 / 25%),
    inset 8px 8px 14px rgb(255 202 160 / 16%),
    0 23px 55px rgb(0 0 0 / 38%);
  color: rgb(250 208 175 / 72%);
  transform: translate(-44%, -50%) rotate(-18deg);
}

.art-stamp {
  position: absolute;
  z-index: 2;
  right: 7%;
  bottom: 20%;
  display: grid;
  justify-items: start;
  gap: 0.35rem;
  color: #e6e7d7;
  font-size: var(--font-size-caption);
  font-weight: 800;
  letter-spacing: 0.16em;
}

.art-stamp-line {
  width: 2.4rem;
  height: 1px;
  background: var(--lime);
}

.art-side-label {
  position: absolute;
  right: 1.5rem;
  bottom: 1.3rem;
  color: var(--subtle);
  font-size: var(--font-size-caption);
  font-weight: 750;
  letter-spacing: 0.14em;
  writing-mode: vertical-rl;
}

.overview-section,
.coming-section {
  min-width: 0;
}

.section-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.85rem;
}

.section-heading h2 {
  margin: 0.34rem 0 0;
  color: var(--ink);
  font-size: clamp(1.35rem, 2.3vw, 1.8rem);
  font-weight: 730;
  letter-spacing: -0.055em;
}

.section-caption {
  padding-bottom: 0.15rem;
  color: var(--muted);
  font-size: var(--font-size-caption);
}

.overview-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(17rem, 0.9fr);
  gap: 0.9rem;
}

.overview-panel {
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: linear-gradient(155deg, rgb(255 255 255 / 2.2%), rgb(255 255 255 / 0.7%));
  padding: 1rem;
}

.panel-heading,
.panel-title-wrap {
  display: flex;
  align-items: center;
}

.panel-heading {
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.8rem;
}

.panel-title-wrap {
  min-width: 0;
  gap: 0.65rem;
}

.panel-icon,
.coming-icon {
  display: grid;
  width: 2.25rem;
  height: 2.25rem;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 0.73rem;
  background: var(--surface-2);
  color: var(--ink-soft);
}

.panel-icon--accent {
  border-color: rgb(242 122 86 / 23%);
  background: var(--accent-soft);
  color: var(--accent-bright);
}

.panel-icon--lime {
  border-color: rgb(217 236 121 / 22%);
  background: var(--lime-soft);
  color: var(--lime);
}

.panel-kicker {
  margin: 0 0 0.13rem;
  color: var(--muted);
  font-size: var(--font-size-caption);
}

.panel-heading h3 {
  overflow: hidden;
  margin: 0;
  color: var(--ink);
  font-size: 0.95rem;
  font-weight: 720;
  letter-spacing: -0.025em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.text-link {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  border-radius: 0.35rem;
  color: #aeb6b1;
  font-size: var(--font-size-caption);
  font-weight: 680;
  text-decoration: none;
  white-space: nowrap;
}

.text-link:hover {
  color: var(--lime);
}

.section-heading--compact {
  margin-bottom: 0.75rem;
}

.section-heading--compact h2 {
  font-size: clamp(1.13rem, 2vw, 1.45rem);
}

.coming-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.7rem;
}

.coming-card {
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: linear-gradient(150deg, rgb(255 255 255 / 2.5%), rgb(255 255 255 / 0.6%));
  padding: 0.85rem;
  transition:
    border-color 150ms ease,
    background-color 150ms ease;
}

.coming-card:hover {
  border-color: var(--line-strong);
  background-color: rgb(255 255 255 / 1%);
}

.coming-card-top,
.coming-card-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
}

.coming-icon {
  width: 2rem;
  height: 2rem;
  border-radius: 0.66rem;
  color: var(--muted);
}

.coming-index {
  color: var(--subtle);
  font-size: var(--font-size-caption);
  font-weight: 760;
  letter-spacing: 0.12em;
}

.coming-card-bottom {
  margin-top: 0.9rem;
}

.coming-card-bottom h3 {
  overflow: hidden;
  margin: 0;
  color: var(--ink-soft);
  font-size: var(--font-size-caption);
  font-weight: 690;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.coming-card-bottom > span {
  flex: 0 0 auto;
  color: var(--subtle);
  font-size: var(--font-size-caption);
}

.data-principle {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  border-top: 1px solid var(--line);
  padding-top: 0.95rem;
}

.principle-mark {
  display: grid;
  width: 1.75rem;
  height: 1.75rem;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgb(217 236 121 / 20%);
  border-radius: 0.58rem;
  background: var(--lime-soft);
  color: var(--lime);
}

.data-principle p {
  margin: 0;
  color: var(--muted);
  font-size: var(--font-size-caption);
  line-height: 1.5;
}

.data-principle strong {
  color: var(--ink-soft);
}

.principle-code {
  flex: 0 0 auto;
  margin-left: auto;
  color: var(--subtle);
  font-size: var(--font-size-caption);
  font-weight: 760;
  letter-spacing: 0.12em;
  white-space: nowrap;
}

@keyframes page-arrive {
  from {
    transform: translateY(0.25rem);
    opacity: 0;
  }

  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes slow-spin {
  to {
    transform: translate(-50%, -50%) rotate(342deg) scale(0.98);
  }
}

@media (max-width: 1100px) {
  .art-side-label {
    display: none;
  }

  .hero-copy h1 {
    font-size: clamp(3rem, 6.7vw, 4.6rem);
  }

  .overview-grid {
    grid-template-columns: minmax(0, 1fr) minmax(0, 0.95fr);
  }

  .section-caption {
    display: none;
  }
}

@media (max-width: 760px) {
  .home-view {
    gap: 2rem;
  }

  .hero-panel {
    min-height: 0;
    grid-template-columns: minmax(0, 1fr);
    border-radius: var(--radius-lg);
  }

  .hero-copy {
    padding: 1.5rem 1.3rem 0.5rem;
  }

  .hero-copy h1 {
    font-size: clamp(3.1rem, 12vw, 4.55rem);
  }

  .hero-copy > p {
    max-width: 28rem;
    font-size: 0.84rem;
  }

  .hero-art {
    min-height: 13rem;
  }

  .hero-art::before {
    inset: -8% 12% -50% 7%;
  }

  .art-coordinates {
    top: 0.75rem;
    right: 0.9rem;
  }

  .court-arc {
    top: 58%;
    left: 44%;
    width: 15rem;
    height: 15rem;
  }

  .court-arc--two {
    width: 10rem;
    height: 10rem;
  }

  .court-center-line {
    left: 44%;
  }

  .art-ball,
  .art-ball-shadow {
    top: 58%;
    left: 44%;
    width: 8.4rem;
    height: 8.4rem;
  }

  .art-ball :deep(svg) {
    width: 5.5rem;
    height: 5.5rem;
  }

  .art-stamp {
    right: 11%;
    bottom: 16%;
    font-size: var(--font-size-caption);
  }

  .art-side-label {
    display: none;
  }

  .overview-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .coming-grid {
    gap: 0.5rem;
  }

  .coming-card {
    padding: 0.65rem;
  }

  .coming-card-bottom {
    align-items: flex-start;
    flex-direction: column;
    gap: 0.25rem;
  }

  .coming-card-bottom h3 {
    font-size: var(--font-size-caption);
  }

  .data-principle {
    align-items: flex-start;
  }

  .principle-code {
    display: none;
  }
}

@media (max-width: 420px) {
  .hero-copy {
    padding-inline: 1.05rem;
  }

  .hero-copy h1 {
    font-size: 3rem;
  }

  .hero-actions {
    gap: 0.45rem;
  }

  .hero-actions .button {
    min-height: 2.65rem;
    padding: 0.6rem 0.7rem;
    font-size: var(--font-size-caption);
  }

  .panel-heading {
    align-items: flex-start;
  }

  .panel-heading h3 {
    font-size: 0.89rem;
  }

  .text-link {
    font-size: var(--font-size-caption);
  }

  .coming-card-bottom h3 {
    font-size: var(--font-size-caption);
  }
}

@media (prefers-reduced-motion: reduce) {
  .home-view,
  .court-arc--two {
    animation: none;
  }
}
</style>
