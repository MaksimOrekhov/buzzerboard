export interface JerseyPilot {
  code: string
  name: string
  base: string
  trim: string
  ink: string
}

export const jerseyPilots: Readonly<Partial<Record<string, JerseyPilot>>> = {
  CHI: { code: 'CHI', name: 'CHICAGO', base: '#c51b3d', trim: '#271b27', ink: '#fff2e5' },
  LAL: { code: 'LAL', name: 'LOS ANGELES', base: '#f2b741', trim: '#4d247a', ink: '#391b62' },
  MIN: { code: 'MIN', name: 'MINNESOTA', base: '#233653', trim: '#527993', ink: '#c6ed84' },
}
