import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TeamLogo from './TeamLogo.vue'
import type { Team, TeamId } from '@/entities/nba/model'
const team = (code: string, id = `nba:team:${code}`): Team => ({
  id: id as TeamId,
  providerId: null,
  displayName: `Synthetic ${code}`,
  abbreviation: code,
})
afterEach(() => vi.unstubAllEnvs())
describe('TeamLogo', () => {
  it('maps all thirty canonical IDs and provider aliases in the private development mode', () => {
    vi.stubEnv('VITE_PRIVATE_TEAM_LOGO_BASE_URL', 'https://assets.invalid/nba')
    const codes = [
      'ATL',
      'BOS',
      'BKN',
      'CHA',
      'CHI',
      'CLE',
      'DAL',
      'DEN',
      'DET',
      'GSW',
      'HOU',
      'IND',
      'LAC',
      'LAL',
      'MEM',
      'MIA',
      'MIL',
      'MIN',
      'NOP',
      'NYK',
      'OKC',
      'ORL',
      'PHI',
      'PHX',
      'POR',
      'SAC',
      'SAS',
      'TOR',
      'UTA',
      'WAS',
    ]
    for (const code of codes) {
      const wrapper = mount(TeamLogo, { props: { team: team(code) } })
      expect(wrapper.find('img').exists()).toBe(true)
      wrapper.unmount()
    }
    expect(
      mount(TeamLogo, { props: { team: team('WSH', 'dunkapi:team:27') } })
        .get('img')
        .attributes('src'),
    ).toBe('https://assets.invalid/nba/wsh.png')
    expect(
      mount(TeamLogo, { props: { team: team('UTAH', 'dunkapi:team:26') } })
        .get('img')
        .attributes('src'),
    ).toBe('https://assets.invalid/nba/utah.png')
  })
  it('keeps a fixed-size fallback on missing artwork and on image failure', async () => {
    vi.stubEnv('VITE_PRIVATE_TEAM_LOGO_BASE_URL', 'https://assets.invalid/nba')
    const wrapper = mount(TeamLogo, { props: { team: team('BOS'), size: 40 } })
    await wrapper.get('img').trigger('error')
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toBe('BOS')
    expect(wrapper.attributes('style')).toContain('width: 40px')
    expect(wrapper.attributes('style')).toContain('height: 40px')
    const unknown = mount(TeamLogo, { props: { team: team('XYZ', 'test:unknown') } })
    expect(unknown.find('img').exists()).toBe(false)
    expect(unknown.text()).toBe('XYZ')
  })
})
