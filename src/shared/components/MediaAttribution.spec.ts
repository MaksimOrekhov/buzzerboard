import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { TEAM_MEDIA_ASSETS, type TeamMediaAsset } from '@/entities/nba/teamMediaManifest'
import MediaAttribution from './MediaAttribution.vue'

describe('MediaAttribution', () => {
  it('renders every reviewed asset with full Russian attribution and intrinsic dimensions', () => {
    for (const asset of TEAM_MEDIA_ASSETS) {
      const wrapper = mount(MediaAttribution, { props: { asset } })
      const image = wrapper.get('img')

      expect(image.attributes()).toMatchObject({
        src: asset.publicPath,
        alt: asset.alt,
        width: String(asset.width),
        height: String(asset.height),
        loading: 'lazy',
        decoding: 'async',
      })
      expect(wrapper.text()).toContain(asset.title)
      expect(wrapper.text()).toContain(asset.description)
      expect(wrapper.text()).toContain(`Снято: ${asset.capturedAt}`)
      expect(wrapper.text()).toContain(`Автор: ${asset.author}`)
      expect(wrapper.text()).toContain(`Изменения: ${asset.modifications}`)
      expect(wrapper.get(`a[href="${asset.sourceUrl}"]`).text()).toBe('Файл на Wikimedia Commons')
      expect(wrapper.get(`a[href="${asset.licenseUrl}"]`).text()).toBe(asset.license)
    }
  })

  it('keeps the author, license and crop notice in compact arena captions', () => {
    const asset = TEAM_MEDIA_ASSETS.find(
      ({ assetId }) => assetId === 'commons:file:united-center-interior',
    )!
    const wrapper = mount(MediaAttribution, { props: { asset, compact: true } })

    expect(wrapper.text()).toContain(asset.author)
    expect(wrapper.get(`a[href="${asset.sourceUrl}"]`).text()).toBe('Файл на Wikimedia Commons')
    expect(wrapper.get(`a[href="${asset.licenseUrl}"]`).text()).toBe(asset.license)
    expect(wrapper.text()).toContain(asset.modifications)
    expect(wrapper.find('.media-attribution__description').exists()).toBe(false)
  })

  it('displays the exact credit required by the photographer of United Center', () => {
    const asset = TEAM_MEDIA_ASSETS.find(
      ({ assetId }) => assetId === 'commons:file:united-center-exterior',
    )!
    const wrapper = mount(MediaAttribution, { props: { asset } })

    expect(wrapper.get('figcaption .media-attribution__links span').text()).toBe(
      'Автор: © Jeremy Atherton, 2006',
    )
    expect(
      wrapper
        .get('a[href="https://commons.wikimedia.org/wiki/File:United_Center_060716.jpg"]')
        .text(),
    ).toBe('Файл на Wikimedia Commons')
    expect(wrapper.get('a[href="https://creativecommons.org/licenses/by-sa/2.5/"]').text()).toBe(
      'CC BY-SA 2.5',
    )
  })

  it('shows a Russian fallback when a local image fails', async () => {
    const asset = TEAM_MEDIA_ASSETS[0]!
    const wrapper = mount(MediaAttribution, { props: { asset } })
    await wrapper.get('img').trigger('error')

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.get('[role="img"]').attributes('aria-label')).toBe(asset.alt)
    expect(wrapper.text()).toContain('Изображение временно недоступно')
    expect(wrapper.get('figcaption').text()).toContain('CC BY-SA 4.0')
  })

  it('does not show an unreviewed asset and explains the fallback in Russian', () => {
    const reviewedAsset = TEAM_MEDIA_ASSETS[0]!
    const unreviewed = {
      ...reviewedAsset,
      publicPath: 'https://example.com/photo.jpg',
      reviewStatus: 'pending',
    } as unknown as TeamMediaAsset
    const wrapper = mount(MediaAttribution, { props: { asset: unreviewed } })

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.get('[role="img"]').attributes('aria-label')).toBe(
      'Медиа не прошло проверку лицензии и источника',
    )
    expect(wrapper.text()).toContain('Изображение не прошло проверку')
    expect(wrapper.text()).toContain('Медиа не показано')
  })
})
