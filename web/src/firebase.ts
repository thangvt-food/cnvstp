import type { Measurement, MeasurementInput } from './types'

const BASE = 'https://ant05-efa02-default-rtdb.firebaseio.com'
const PATH = '/measurements'

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${BASE}${path}.json`, {
    ...init,
    headers: { 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`Firebase HTTP ${res.status}`)
  return res.json()
}

export async function listMeasurements(): Promise<Measurement[]> {
  // Node chưa tồn tại → trả về null
  const data = (await request(PATH)) as Record<string, MeasurementInput> | null
  if (!data) return []
  return Object.entries(data)
    .map(([id, v]) => ({ ...v, id }))
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
}

export async function addMeasurement(m: MeasurementInput): Promise<string> {
  const res = (await request(PATH, {
    method: 'POST',
    body: JSON.stringify(m),
  })) as { name: string }
  return res.name
}

export async function updateMeasurement(id: string, m: MeasurementInput): Promise<void> {
  await request(`${PATH}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(m),
  })
}

export async function deleteMeasurement(id: string): Promise<void> {
  await request(`${PATH}/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
