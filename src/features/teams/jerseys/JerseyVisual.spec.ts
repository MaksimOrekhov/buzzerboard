import { mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import * as directory from '@/entities/nba/jerseyDirectory'
import { TEAM_MEDIA_ASSETS } from '@/entities/nba/teamMediaManifest'
import JerseyVisual from './JerseyVisual.vue'

const jersey = directory.getTeamJerseys('CHI').find(({ palette }) => palette.length)!

it('uses neutral color samples and labels a missing palette without inventing an image', () => {
  const samples = mount(JerseyVisual, { props: { jersey } })
  expect(samples.find('img').exists()).toBe(false)
  expect(samples.findAll('.jersey-swatches span')).toHaveLength(jersey.palette.length)
  expect(samples.text()).toContain('Палитра')
  const missing = mount(JerseyVisual, { props: { jersey: { ...jersey, palette: [] } } })
  expect(missing.text()).toContain('Палитра не подтверждена')
  expect(missing.find('img').exists()).toBe(false)
})

it('keeps the attribution visible when a reviewed image fails to load', async () => {
  const asset = TEAM_MEDIA_ASSETS[0]!
  const media = vi.spyOn(directory, 'getClearedJerseyMedia').mockReturnValue(asset)
  try {
    const wrapper = mount(JerseyVisual, { props: { jersey } })
    const image = wrapper.get('img')
    expect(image.attributes('alt')).toBe(asset.alt)
    expect(image.attributes('loading')).toBe('lazy')
    await image.trigger('error')
    expect(wrapper.text()).toContain('Изображение временно недоступно')
    expect(wrapper.get('figcaption').text()).toContain(asset.author)
    expect(wrapper.get(`a[href="${asset.licenseUrl}"]`).text()).toBe(asset.license)
  } finally {
    media.mockRestore()
  }
})
