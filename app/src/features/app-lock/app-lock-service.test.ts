// @vitest-environment node
import type { Clock } from '@/domain/time'
import { NodeSqliteExecutor } from '@/test/node-sqlite-executor'
import { runMigrations } from '@/db/migration-runner'

import { AppLockService } from './app-lock-service'

const clock: Clock = { nowIso: () => '2026-08-03T04:00:00.000Z' }

async function setup(): Promise<{ service: AppLockService; executor: NodeSqliteExecutor }> {
  const executor = new NodeSqliteExecutor()
  await runMigrations(executor)
  const service = new AppLockService(executor, clock)
  return { service, executor }
}

describe('AppLockService', () => {
  it('initial state is disabled with no PIN', async () => {
    const { service } = await setup()
    const state = await service.getState()
    expect(state).toEqual({ enabled: false, hasPin: false })
  })

  it('setupPin enables the lock and stores a hashed PIN', async () => {
    const { service } = await setup()
    await service.setupPin('1234')
    const state = await service.getState()
    expect(state).toEqual({ enabled: true, hasPin: true })
  })

  it('verifyPin returns true for correct PIN and false for wrong PIN', async () => {
    const { service } = await setup()
    await service.setupPin('123456')
    expect(await service.verifyPin('123456')).toBe(true)
    expect(await service.verifyPin('000000')).toBe(false)
  })

  it('setupPin rejects non-digit or wrong-length PIN', async () => {
    const { service } = await setup()
    await expect(service.setupPin('12')).rejects.toThrow()
    await expect(service.setupPin('abcd')).rejects.toThrow()
    await expect(service.setupPin('123456789')).rejects.toThrow()
  })

  it('disable clears the PIN and disables the lock', async () => {
    const { service } = await setup()
    await service.setupPin('1234')
    await service.disable()
    const state = await service.getState()
    expect(state).toEqual({ enabled: false, hasPin: false })
    expect(await service.verifyPin('1234')).toBe(false)
  })

  it('setEnabled(false) disables lock but keeps PIN', async () => {
    const { service } = await setup()
    await service.setupPin('1234')
    await service.setEnabled(false)
    const state = await service.getState()
    expect(state.enabled).toBe(false)
    expect(state.hasPin).toBe(true)
  })

  it('setEnabled(true) without a PIN throws', async () => {
    const { service } = await setup()
    await expect(service.setEnabled(true)).rejects.toThrow('请先设置 PIN 码')
  })

  it('changePin requires correct old PIN', async () => {
    const { service } = await setup()
    await service.setupPin('1234')
    await expect(service.changePin('0000', '5678')).rejects.toThrow('旧 PIN 码错误')
    await service.changePin('1234', '5678')
    expect(await service.verifyPin('5678')).toBe(true)
    expect(await service.verifyPin('1234')).toBe(false)
  })
})
