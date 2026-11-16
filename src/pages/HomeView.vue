<script setup lang="ts">
import { RouterLink } from 'vue-router'

import AppIcon from '@/shared/components/AppIcon.vue'
import PageHeading from '@/shared/components/PageHeading.vue'
import type { AppIconName } from '@/shared/icons'

interface HubSection {
  title: string
  description: string
  to: string
  icon: AppIconName
  index: string
}

const sections: HubSection[] = [
  {
    title: 'Games',
    description: 'Schedules and final scores, when a verified feed is connected.',
    to: '/games',
    icon: 'calendar',
    index: '01',
  },
  {
    title: 'Standings',
    description: 'A clear view of the race across both conferences.',
    to: '/standings',
    icon: 'trophy',
    index: '02',
  },
  {
    title: 'News',
    description: 'A dedicated place for the stories shaping the league.',
    to: '/news',
    icon: 'news',
    index: '03',
  },
  {
    title: 'Favorites',
    description: 'Keep your teams and matchups close at hand.',
    to: '/favorites',
    icon: 'bookmark',
    index: '04',
  },
]
</script>

<template>
  <div class="home-view">
    <PageHeading
      eyebrow="Your NBA workspace"
      title="A better view of the game."
      description="The league, your way: games, standings, stories, and the teams you care about — gathered in one focused home."
    />

    <section class="welcome-panel" aria-labelledby="welcome-title">
      <div class="welcome-copy">
        <div class="welcome-kicker">
          <span class="welcome-kicker-line" />
          <span class="eyebrow">Built around the game</span>
        </div>
        <h2 id="welcome-title">Your seat for<br /><span>the whole season.</span></h2>
        <p>
          Start with the view you need. Schedules, standings, and stories will arrive once their
          data sources are connected.
        </p>
        <RouterLink class="welcome-link focus-ring" to="/games">
          Explore the hub
          <AppIcon name="arrow-up-right" :size="17" />
        </RouterLink>
      </div>

      <div class="welcome-visual" aria-hidden="true">
        <div class="court-lines" />
        <div class="visual-orbit visual-orbit--one" />
        <div class="visual-orbit visual-orbit--two" />
        <div class="hero-ball">
          <svg viewBox="0 0 160 160" fill="none">
            <circle cx="80" cy="80" r="76" />
            <path d="M19 34c34 10 59 50 61 122M141 34c-34 10-59 50-61 122M4 80h152" />
            <path d="M30 13c5 34 53 40 100 7M30 147c5-34 53-40 100-7" />
          </svg>
        </div>
        <div class="visual-label visual-label--top">01 / 05</div>
        <div class="visual-label visual-label--bottom">THE GAME, IN FOCUS</div>
      </div>
    </section>

    <section class="hub-section" aria-labelledby="hub-section-title">
      <div class="hub-section-heading">
        <div>
          <p class="eyebrow">Make it yours</p>
          <h2 id="hub-section-title">Choose your starting five.</h2>
        </div>
        <p>Every section is ready for a real data source.</p>
      </div>

      <div class="hub-grid">
        <RouterLink
          v-for="section in sections"
          :key="section.to"
          class="hub-card focus-ring"
          :to="section.to"
        >
          <div class="hub-card-top">
            <span class="hub-card-icon"><AppIcon :name="section.icon" :size="19" /></span>
            <span class="hub-card-index">{{ section.index }}</span>
          </div>
          <div class="hub-card-bottom">
            <div>
              <h3>{{ section.title }}</h3>
              <p>{{ section.description }}</p>
            </div>
            <AppIcon class="hub-card-arrow" name="arrow-up-right" :size="18" />
          </div>
        </RouterLink>
      </div>
    </section>

    <div class="home-note">
      <span class="home-note-icon"><AppIcon name="sparkles" :size="16" /></span>
      <p><strong>Built around the game.</strong> Live data will arrive when its source is ready.</p>
    </div>
  </div>
</template>

<style scoped>
.home-view {
  animation: content-arrive 420ms ease both;
}

.welcome-panel {
  position: relative;
  display: grid;
  min-height: 22rem;
  grid-template-columns: minmax(0, 1.08fr) minmax(18rem, 0.92fr);
  overflow: hidden;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 1.5rem;
  background:
    radial-gradient(ellipse at 78% 42%, rgb(255 112 72 / 14%), transparent 36%),
    linear-gradient(135deg, #15181c, #101216 62%, #0d1013);
  box-shadow: 0 1.5rem 5rem rgb(0 0 0 / 20%);
}

.welcome-copy {
  position: relative;
  z-index: 1;
  align-self: center;
  padding: clamp(1.6rem, 5vw, 3.6rem);
}

.welcome-kicker {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.welcome-kicker-line {
  width: 1.5rem;
  height: 1px;
  background: var(--accent);
}

.welcome-copy h2 {
  margin: 1.15rem 0 0;
  color: var(--ink);
  font-size: clamp(2.2rem, 5vw, 3.8rem);
  font-weight: 720;
  letter-spacing: -0.065em;
  line-height: 0.98;
}

.welcome-copy h2 span {
  color: #b8b8b3;
  font-weight: 480;
}

.welcome-copy > p {
  max-width: 33rem;
  margin: 1.1rem 0 0;
  color: #a4a9ae;
  font-size: 0.93rem;
  line-height: 1.7;
}

.welcome-link {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  margin-top: 1.6rem;
  border: 1px solid rgb(255 112 72 / 40%);
  border-radius: 0.8rem;
  background: rgb(255 112 72 / 10%);
  padding: 0.7rem 0.9rem;
  color: #ffd4c7;
  font-size: 0.82rem;
  font-weight: 700;
  text-decoration: none;
  transition:
    background-color 150ms ease,
    border-color 150ms ease;
}

.welcome-link:hover {
  border-color: var(--accent);
  background: rgb(255 112 72 / 17%);
}

.welcome-visual {
  position: relative;
  min-height: 22rem;
  overflow: hidden;
}

.court-lines {
  position: absolute;
  inset: 14% 5% 13% 0;
  border: 1px solid rgb(255 255 255 / 6%);
  border-radius: 50% 0 0 50%;
  opacity: 0.75;
}

.court-lines::before,
.court-lines::after {
  position: absolute;
  top: 50%;
  left: 0;
  border: 1px solid rgb(255 255 255 / 6%);
  border-radius: 50%;
  content: '';
  transform: translate(-50%, -50%);
}

.court-lines::before {
  width: 58%;
  aspect-ratio: 1;
}

.court-lines::after {
  width: 18%;
  aspect-ratio: 1;
}

.visual-orbit {
  position: absolute;
  top: 50%;
  left: 52%;
  border: 1px solid rgb(255 112 72 / 16%);
  border-radius: 50%;
  transform: translate(-50%, -50%) rotate(-26deg);
}

.visual-orbit--one {
  width: 19rem;
  height: 9rem;
}

.visual-orbit--two {
  width: 24rem;
  height: 12rem;
  border-color: rgb(255 255 255 / 7%);
  transform: translate(-50%, -50%) rotate(28deg);
}

.hero-ball {
  position: absolute;
  top: 50%;
  left: 53%;
  display: grid;
  width: clamp(11rem, 23vw, 17rem);
  aspect-ratio: 1;
  place-items: center;
  border: 1px solid rgb(255 178 126 / 36%);
  border-radius: 50%;
  background: radial-gradient(circle at 32% 23%, #ffa66f, #e76537 54%, #87371f 100%);
  box-shadow:
    inset -1.2rem -1.4rem 2rem rgb(37 15 9 / 32%),
    0 1.2rem 5rem rgb(255 112 72 / 20%);
  transform: translate(-50%, -50%) rotate(-10deg);
}

.hero-ball svg {
  width: 100%;
  height: 100%;
  overflow: visible;
  stroke: rgb(47 23 16 / 78%);
  stroke-width: 2.4;
}

.visual-label {
  position: absolute;
  color: #7f858a;
  font-size: 0.56rem;
  font-weight: 700;
  letter-spacing: 0.18em;
}

.visual-label--top {
  top: 1.7rem;
  right: 1.7rem;
}

.visual-label--bottom {
  right: 1.7rem;
  bottom: 1.7rem;
}

.hub-section {
  margin-top: clamp(3rem, 6vw, 5rem);
}

.hub-section-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1.5rem;
  margin-bottom: 1.2rem;
}

.hub-section-heading h2 {
  margin: 0.45rem 0 0;
  color: var(--ink);
  font-size: clamp(1.3rem, 3vw, 1.8rem);
  font-weight: 660;
  letter-spacing: -0.045em;
}

.hub-section-heading > p {
  margin: 0 0 0.15rem;
  color: var(--muted);
  font-size: 0.74rem;
}

.hub-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.8rem;
}

.hub-card {
  display: flex;
  min-height: 12.2rem;
  flex-direction: column;
  justify-content: space-between;
  border: 1px solid var(--line);
  border-radius: 1.1rem;
  background: linear-gradient(150deg, rgb(255 255 255 / 3.4%), rgb(255 255 255 / 1%));
  padding: 1.1rem;
  color: inherit;
  text-decoration: none;
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    background-color 180ms ease;
}

.hub-card:hover {
  transform: translateY(-3px);
  border-color: rgb(255 112 72 / 34%);
  background-color: rgb(255 112 72 / 3%);
}

.hub-card-top,
.hub-card-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
}

.hub-card-icon {
  display: grid;
  width: 2.5rem;
  height: 2.5rem;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 0.8rem;
  background: rgb(255 255 255 / 3%);
  color: #d2d0ca;
}

.hub-card-index {
  color: #636970;
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.12em;
}

.hub-card-bottom h3 {
  margin: 0;
  color: #efeee9;
  font-size: 0.93rem;
  font-weight: 650;
}

.hub-card-bottom p {
  max-width: 15rem;
  margin: 0.35rem 0 0;
  color: var(--muted);
  font-size: 0.7rem;
  line-height: 1.5;
}

.hub-card-arrow {
  flex: 0 0 auto;
  color: #737981;
  transition:
    color 160ms ease,
    transform 160ms ease;
}

.hub-card:hover .hub-card-arrow {
  transform: translate(2px, -2px);
  color: var(--accent);
}

.home-note {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  margin-top: 1.4rem;
  color: #878c92;
  font-size: 0.72rem;
}

.home-note p {
  margin: 0;
}

.home-note strong {
  color: #c5c2bb;
  font-weight: 650;
}

.home-note-icon {
  display: grid;
  width: 1.75rem;
  height: 1.75rem;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgb(255 112 72 / 20%);
  border-radius: 50%;
  color: var(--accent);
}

@keyframes content-arrive {
  from {
    transform: translateY(0.4rem);
    opacity: 0;
  }

  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@media (max-width: 1020px) {
  .hub-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .welcome-panel {
    grid-template-columns: minmax(0, 1fr) minmax(12rem, 0.75fr);
  }

  .welcome-visual {
    min-height: 20rem;
  }

  .hero-ball {
    width: 12rem;
  }
}

@media (max-width: 560px) {
  .welcome-panel {
    grid-template-columns: 1fr;
  }

  .welcome-copy {
    padding-bottom: 0.8rem;
  }

  .welcome-visual {
    min-height: 14rem;
  }

  .hero-ball {
    left: 50%;
    width: 10.5rem;
  }

  .visual-label--top {
    top: 1rem;
    right: 1rem;
  }

  .visual-label--bottom {
    right: 1rem;
    bottom: 1rem;
  }

  .hub-section-heading {
    display: block;
  }

  .hub-section-heading > p {
    margin-top: 0.5rem;
  }

  .hub-grid {
    grid-template-columns: 1fr;
  }

  .hub-card {
    min-height: 9rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .home-view,
  .hub-card,
  .hub-card-arrow {
    animation: none;
    transition: none;
  }
}
</style>
