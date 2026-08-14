import { scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)

export async function hashAdminPassword(password: string, saltHex: string): Promise<string> {
  const derived = await scrypt(password, Buffer.from(saltHex, 'hex'), 64)
  return Buffer.from(derived).toString('hex')
}

export async function verifyAdminPassword(password: string, saltHex: string, expectedHashHex: string): Promise<boolean> {
  const actual = Buffer.from(await hashAdminPassword(password, saltHex), 'hex')
  const expected = Buffer.from(expectedHashHex, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
