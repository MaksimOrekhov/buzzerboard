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
  it('maps all thirty canonical IDs and legacy provider aliases to official NBA CDN assets', () => {
    const teams: Record<string, number> = {
      ATL: 1610612737,
      BOS: 1610612738,
      BKN: 1610612751,
      CHA: 1610612766,
      CHI: 1610612741,
      CLE: 1610612739,
      DAL: 1610612742,
      DEN: 1610612743,
      DET: 1610612765,
      GSW: 1610612744,
      HOU: 1610612745,
      IND: 1610612754,
      LAC: 1610612746,
      LAL: 1610612747,
      MEM: 1610612763,
      MIA: 1610612748,
      MIL: 1610612749,
      MIN: 1610612750,
      NOP: 1610612740,
      NYK: 1610612752,
      OKC: 1610612760,
      ORL: 1610612753,
      PHI: 1610612755,
      PHX: 1610612756,
      POR: 1610612757,
      SAC: 1610612758,
      SAS: 1610612759,
      TOR: 1610612761,
      UTA: 1610612762,
      WAS: 1610612764,
    }
    for (const [code, teamId] of Object.entries(teams)) {
      const wrapper = mount(TeamLogo, { props: { team: team(code) } })
      expect(wrapper.find('img').exists()).toBe(true)
      expect(wrapper.get('img').attributes('src')).toBe(
        `https://cdn.nba.com/logos/nba/${teamId}/primary/L/logo.svg`,
      )
      wrapper.unmount()
    }
    expect(
      mount(TeamLogo, { props: { team: team('WSH', 'dunkapi:team:27') } })
        .get('img')
        .attributes('src'),
    ).toBe('https://cdn.nba.com/logos/nba/1610612764/primary/L/logo.svg')
    expect(
      mount(TeamLogo, { props: { team: team('UTAH', 'dunkapi:team:26') } })
        .get('img')
        .attributes('src'),
    ).toBe('https://cdn.nba.com/logos/nba/1610612762/primary/L/logo.svg')
  })
  it('keeps a fixed-size fallback on missing artwork and on image failure', async () => {
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

  it('loads official NBA CDN artwork in production', () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_PRIVATE_TEAM_LOGO_BASE_URL', 'https://assets.invalid/nba')
    const wrapper = mount(TeamLogo, { props: { team: team('BOS') } })

    expect(wrapper.get('img').attributes('src')).toBe(
      'https://cdn.nba.com/logos/nba/1610612738/primary/L/logo.svg',
    )
  })
})
