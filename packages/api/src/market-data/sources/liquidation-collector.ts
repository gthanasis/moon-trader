import { Logger, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common'
import WebSocket from 'ws'

/** A single perpetual-futures liquidation. */
export interface LiquidationEvent {
  /** Traded coin pair, e.g. BTC/USDT. */
  coin: string
  /** Side that was liquidated: a forced SELL closes a long, a forced BUY a short. */
  side: 'long' | 'short'
  /** Notional value liquidated, in quote currency (qty × price). */
  notional: number
  timestamp: Date
}

/** Minimal socket surface the collector needs — satisfied by the `ws` package. */
export interface LiquidationSocket {
  on(event: 'open' | 'close' | 'error', listener: () => void): void
  on(event: 'message', listener: (data: unknown) => void): void
  close(): void
}

export type SocketFactory = (url: string) => LiquidationSocket

export interface LiquidationCollectorOptions {
  /** Traded coins to keep liquidations for, e.g. ['BTC/USDT']. */
  coins: string[]
  /** Rolling window kept in memory, in ms. Default: 1 hour. */
  windowMs?: number
  /** Reconnect delay after a dropped connection, in ms. Default: 5000. */
  reconnectMs?: number
  /** Socket factory — defaults to a real `ws` WebSocket; overridden in tests. */
  socketFactory?: SocketFactory
}

const STREAM_URL = 'wss://fstream.binance.com/ws/!forceOrder@arr'

/** Shape of a Binance `forceOrder` websocket event. */
interface ForceOrderMessage {
  e?: string
  E?: number
  o?: { s?: string; S?: string; q?: string; p?: string; ap?: string; T?: number }
}

/**
 * Maintains a rolling in-memory window of perpetual-futures liquidations from
 * the Binance `!forceOrder@arr` websocket stream. Auto-reconnects on a dropped
 * connection; a socket failure degrades to a stale/empty buffer and never
 * crashes the process. Wired as a lifecycle component — `start`/`stop` are
 * idempotent and also driven by Nest's module hooks.
 */
export class LiquidationCollector implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LiquidationCollector.name)
  private readonly windowMs: number
  private readonly reconnectMs: number
  private readonly socketFactory: SocketFactory
  /** Binance symbol (BTCUSDT) → traded coin pair (BTC/USDT). */
  private readonly symbolToCoin: Map<string, string>
  private events: LiquidationEvent[] = []
  private socket: LiquidationSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private started = false
  private stopped = false

  constructor(options: LiquidationCollectorOptions) {
    this.windowMs = options.windowMs ?? 60 * 60 * 1000
    this.reconnectMs = options.reconnectMs ?? 5000
    this.socketFactory = options.socketFactory ?? ((url) => new WebSocket(url) as unknown as LiquidationSocket)
    this.symbolToCoin = new Map(options.coins.map(coin => [coin.replace('/', ''), coin]))
  }

  onModuleInit(): void {
    this.start()
  }

  onModuleDestroy(): void {
    this.stop()
  }

  /** Opens the websocket connection. Idempotent — a second call is a no-op. */
  start(): void {
    if (this.started) return
    this.started = true
    this.stopped = false
    this.connect()
  }

  /** Closes the connection and cancels any pending reconnect. Idempotent. */
  stop(): void {
    this.stopped = true
    this.started = false
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.closeSocket()
  }

  /** Liquidations within the rolling window, newest data pruned on read. */
  getWindow(): LiquidationEvent[] {
    this.prune()
    return [...this.events]
  }

  private connect(): void {
    if (this.stopped) return
    try {
      const socket = this.socketFactory(STREAM_URL)
      this.socket = socket
      socket.on('open', () => this.logger.log('Liquidation stream connected'))
      socket.on('message', (data) => this.handleMessage(data))
      socket.on('error', () => this.logger.warn('Liquidation stream error'))
      socket.on('close', () => this.handleClose())
    } catch (err) {
      this.logger.error(`Liquidation stream connect failed: ${String(err)}`)
      this.scheduleReconnect()
    }
  }

  private handleClose(): void {
    this.socket = null
    if (this.stopped) return
    this.scheduleReconnect()
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, this.reconnectMs)
  }

  private closeSocket(): void {
    try {
      this.socket?.close()
    } catch {
      // A close on an already-dead socket is harmless.
    }
    this.socket = null
  }

  private handleMessage(data: unknown): void {
    try {
      const msg = JSON.parse(String(data)) as ForceOrderMessage
      if (msg.e !== 'forceOrder' || !msg.o?.s) return
      const coin = this.symbolToCoin.get(msg.o.s)
      if (!coin) return // not a coin we trade
      const qty = Number(msg.o.q)
      const price = Number(msg.o.ap ?? msg.o.p)
      if (!Number.isFinite(qty) || !Number.isFinite(price)) return
      this.events.push({
        coin,
        // A forced SELL liquidates a long; a forced BUY liquidates a short.
        side: msg.o.S === 'SELL' ? 'long' : 'short',
        notional: qty * price,
        timestamp: new Date(msg.o.T ?? msg.E ?? Date.now()),
      })
      this.prune()
    } catch {
      // Malformed frame — ignore, never throw out of a socket handler.
    }
  }

  private prune(): void {
    const cutoff = Date.now() - this.windowMs
    this.events = this.events.filter(e => e.timestamp.getTime() >= cutoff)
  }
}
