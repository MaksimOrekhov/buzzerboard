import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MediaAttribution from './MediaAttribution.vue'
import type { TeamMediaAsset } from '@/entities/nba/teamMediaManifest'

const asset: TeamMediaAsset = {
  teamCode: 'CHI',
  originalUrl: 'https://commons.wikimedia.org/wiki/File:Example.jpg',
  author: 'Example author',
  license: 'CC BY-SA 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  sourceUrl: 'https://commons.wikimedia.org/wiki/File:Example.jpg',
  attribution: 'Example author, CC BY-SA 4.0, via Wikimedia Commons',
  checkedAt: '2026-11-19',
  modifications: 'none',
  publicPath: '/media/nba/chi-arena.webp',
  delivery: 'local-static',
  reviewStatus: 'approved',
  width: 1200,
  height: 800,
  bytes: 180_000,
}

describe('MediaAttribution', () => {
  it('renders lazy local media and a reusable license attribution', () => {
    const wrapper = mount(MediaAttribution, { props: { asset } })

    expect(wrapper.get('img').attributes()).toMatchObject({
      src: '/media/nba/chi-arena.webp',
      loading: 'lazy',
      decoding: 'async',
    })
    expect(wrapper.text()).toContain('Example author, CC BY-SA 4.0, via Wikimedia Commons')
    expect(wrapper.get('a').attributes('href')).toBe(
      'https://creativecommons.org/licenses/by-sa/4.0/',
    )
  })

  it('shows a text fallback when a local image fails', async () => {
    const wrapper = mount(MediaAttribution, { props: { asset } })
    await wrapper.get('img').trigger('error')

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.get('[role="img"]').attributes('aria-label')).toBe(asset.attribution)
    expect(wrapper.text()).toContain('Image unavailable')
  })

  it('does not render an unreviewed or remote asset', () => {
    const invalid = {
      ...asset,
      publicPath: 'https://example.com/photo.jpg',
    } as unknown as TeamMediaAsset
    expect(
      mount(MediaAttribution, { props: { asset: invalid } })
        .find('figure')
        .exists(),
    ).toBe(false)
  })
})
