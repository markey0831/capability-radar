export interface ApiConfig {
  appEnv: 'development' | 'test' | 'production'
  allowedOrigins: ReadonlySet<string>
  maxJsonBodyBytes: number
}

export interface RuntimeSecrets {
  taskTokenSigningKey: string
  adminPasswordSalt: string
  adminPasswordHash: string
  sessionSigningKey: string
}

export function loadConfig(environment: Record<string, string | undefined> = process.env): ApiConfig {
  const rawEnv = environment.APP_ENV ?? 'development'
  if (!['development', 'test', 'production'].includes(rawEnv)) throw new Error(`不支持的 APP_ENV：${rawEnv}`)
  const origins = (environment.ALLOWED_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
  if (rawEnv === 'production' && origins.length === 0) throw new Error('生产环境必须配置 ALLOWED_ORIGINS')
  return {
    appEnv: rawEnv as ApiConfig['appEnv'],
    allowedOrigins: new Set(origins),
    maxJsonBodyBytes: Number(environment.MAX_JSON_BODY_BYTES ?? 1_048_576),
  }
}

export function loadRuntimeSecrets(environment: Record<string, string | undefined> = process.env): RuntimeSecrets {
  const taskTokenSigningKey = environment.TASK_TOKEN_SIGNING_KEY ?? ''
  const adminPasswordSalt = environment.ADMIN_PASSWORD_SALT ?? ''
  const adminPasswordHash = environment.ADMIN_PASSWORD_HASH ?? ''
  const sessionSigningKey = environment.SESSION_SIGNING_KEY ?? ''
  if (Buffer.byteLength(taskTokenSigningKey, 'utf8') < 32) {
    throw new Error('TASK_TOKEN_SIGNING_KEY 必须至少为32字节')
  }
  if (!/^[a-f0-9]{32,}$/i.test(adminPasswordSalt)) throw new Error('ADMIN_PASSWORD_SALT 格式无效')
  if (!/^[a-f0-9]{128}$/i.test(adminPasswordHash)) throw new Error('ADMIN_PASSWORD_HASH 必须是64字节 scrypt 摘要')
  if (Buffer.byteLength(sessionSigningKey, 'utf8') < 32) throw new Error('SESSION_SIGNING_KEY 必须至少为32字节')
  return { taskTokenSigningKey, adminPasswordSalt, adminPasswordHash, sessionSigningKey }
}
