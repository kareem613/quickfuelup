import type { AppConfig } from './types'

type ShareTokenV1 = {
  v: 1
  i: number // PBKDF2 iterations
  s: string // base64url(salt)
  iv: string // base64url(iv)
  ct: string // base64url(ciphertext)
}

const enc = new TextEncoder()
const dec = new TextDecoder()

export function isShareCryptoSupported() {
  return Boolean(globalThis.crypto?.subtle)
}

function toBase64(bytes: Uint8Array) {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

function fromBase64(b64: string) {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function toBase64Url(bytes: Uint8Array) {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromBase64Url(b64url: string) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
  return fromBase64(b64 + pad)
}

async function deriveAesKey(passcode: string, salt: Uint8Array, iterations: number) {
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(passcode), { name: 'PBKDF2' }, false, [
    'deriveKey',
  ])
  // Copy into an ArrayBuffer-backed view to satisfy DOM lib typing (BufferSource excludes SharedArrayBuffer).
  const saltAb = Uint8Array.from(salt)
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltAb, iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptConfigToToken(cfg: AppConfig, passcode: string) {
  if (!isShareCryptoSupported()) throw new Error('Crypto not supported in this browser.')
  const iterations = 150_000
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveAesKey(passcode, salt, iterations)
  const pt = enc.encode(JSON.stringify(cfg))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: Uint8Array.from(iv) }, key, pt))
  const token: ShareTokenV1 = {
    v: 1,
    i: iterations,
    s: toBase64Url(salt),
    iv: toBase64Url(iv),
    ct: toBase64Url(ct),
  }
  return toBase64Url(enc.encode(JSON.stringify(token)))
}

export async function decryptTokenToConfigJson(tokenB64Url: string, passcode: string): Promise<unknown> {
  if (!isShareCryptoSupported()) throw new Error('Crypto not supported in this browser.')
  let parsed: unknown
  try {
    parsed = JSON.parse(dec.decode(fromBase64Url(tokenB64Url)))
  } catch {
    throw new Error('Invalid share token.')
  }

  const obj = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null
  if (!obj || obj.v !== 1) throw new Error('Unsupported share token version.')
  const i = typeof obj.i === 'number' && Number.isFinite(obj.i) ? obj.i : null
  const s = typeof obj.s === 'string' ? obj.s : null
  const ivStr = typeof obj.iv === 'string' ? obj.iv : null
  const ctStr = typeof obj.ct === 'string' ? obj.ct : null
  if (!i || !s || !ivStr || !ctStr) throw new Error('Invalid share token.')

  const salt = fromBase64Url(s)
  const iv = fromBase64Url(ivStr)
  const ct = fromBase64Url(ctStr)
  const key = await deriveAesKey(passcode, salt, i)
  let pt: Uint8Array
  try {
    pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Uint8Array.from(iv) }, key, ct))
  } catch {
    throw new Error('Incorrect passcode or corrupted link.')
  }
  try {
    return JSON.parse(dec.decode(pt))
  } catch {
    throw new Error('Decrypted data was not valid JSON.')
  }
}
