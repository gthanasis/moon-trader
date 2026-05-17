import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { timingSafeEqual } from 'crypto'
import type { Request } from 'express'

/** HTTP methods that change state — the only ones this guard protects. */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * Optional shared-secret guard for state-changing HTTP routes.
 *
 * The API binds to 127.0.0.1 by default, so this guard is dormant for the
 * standard local setup. Set `API_AUTH_TOKEN` in `.env` to require an
 * `Authorization: Bearer <token>` header on every mutating request (POST/PUT/
 * PATCH/DELETE) — do this whenever the API is reachable beyond loopback
 * (reverse proxy, container, LAN).
 *
 * GET routes are intentionally left open: they are read-only, and SSE streams
 * (`/events`, `/backtest/stream`) are consumed by `EventSource`, which cannot
 * send an Authorization header.
 */
@Injectable()
export class ApiTokenGuard implements CanActivate {
  private readonly logger = new Logger(ApiTokenGuard.name)
  private readonly token: string | undefined

  constructor(config: ConfigService) {
    this.token = config.get<string>('API_AUTH_TOKEN')?.trim() || undefined
    if (!this.token) {
      this.logger.warn(
        'API_AUTH_TOKEN is not set — state-changing HTTP routes are unauthenticated. ' +
          'This is fine for a loopback-only deployment; set API_AUTH_TOKEN before exposing the API.',
      )
    }
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.token) return true

    const req = context.switchToHttp().getRequest<Request>()
    if (!MUTATING_METHODS.has(req.method)) return true

    const header = req.headers['authorization']
    const provided =
      typeof header === 'string' && header.startsWith('Bearer ')
        ? header.slice(7)
        : ''

    if (!this.matches(provided)) {
      throw new UnauthorizedException('Missing or invalid API token')
    }
    return true
  }

  /** Length-safe constant-time comparison against the configured token. */
  private matches(provided: string): boolean {
    const a = Buffer.from(provided)
    const b = Buffer.from(this.token ?? '')
    return a.length === b.length && timingSafeEqual(a, b)
  }
}
