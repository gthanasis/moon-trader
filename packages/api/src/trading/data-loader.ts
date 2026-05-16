import { config as loadDotenv } from 'dotenv'
import { resolve } from 'path'
import ccxt from 'ccxt'
import { PrismaClient } from '@prisma/client'
import { BinanceSource, FearAndGreedSource, CryptoPanicSource } from '../market-data'
import { CandleRepository } from '../prisma/repositories/candle.repository'
import { SignalRepository } from '../prisma/repositories/signal.repository'
import type { PrismaService } from '../prisma/prisma.service'

// Standalone backfill CLI — not part of the live loop. Run with:
//   pnpm --filter @trader/api exec tsx src/trading/data-loader.ts --from ... --to ...
loadDotenv({ path: resolve(process.cwd(), '../../.env') })

const prisma = new PrismaClient() as unknown as PrismaService
const candleRepository = new CandleRepository(prisma)
const signalRepository = new SignalRepository(prisma)

function parseArgs(): { coins: string[]; from: Date; to: Date; timeframe: string } {
  const args = process.argv.slice(2)
  const get = (flag: string) => {
    const i = args.indexOf(flag)
    return i !== -1 ? args[i + 1] : undefined
  }

  const fromStr = get('--from')
  const toStr = get('--to')

  if (!fromStr || !toStr) {
    console.error('Usage: data-loader --from YYYY-MM-DD --to YYYY-MM-DD [--coins BTC/USDT,ETH/USDT] [--timeframe 1h]')
    process.exit(1)
  }

  const from = new Date(fromStr)
  const to = new Date(toStr)

  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    console.error('Error: --from and --to must be valid dates (YYYY-MM-DD)')
    process.exit(1)
  }

  if (from >= to) {
    console.error('Error: --from must be before --to')
    process.exit(1)
  }

  const coinsRaw = get('--coins')
  const coins = coinsRaw ? coinsRaw.split(',').map(c => c.trim()) : ['BTC/USDT', 'ETH/USDT']
  const timeframe = get('--timeframe') ?? '1h'

  return { coins, from, to, timeframe }
}

async function loadCandles(coins: string[], timeframe: string, from: Date, to: Date): Promise<number> {
  const exchange = new ccxt.binance()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const source = new BinanceSource(exchange as any)

  let total = 0
  for (const coin of coins) {
    process.stdout.write(`  Fetching ${coin} ${timeframe} candles...`)
    const ohlcv = await source.fetchHistoricalOhlcv([coin], timeframe, from, to)
    const candles = ohlcv[coin] ?? []
    if (candles.length > 0) {
      await candleRepository.saveCandles(coin, timeframe, candles)
    }
    total += candles.length
    console.log(` ${candles.length} candles saved`)
  }
  return total
}

async function loadFearAndGreed(from: Date, to: Date): Promise<number> {
  process.stdout.write('  Fetching Fear & Greed index...')
  const source = new FearAndGreedSource()
  const signals = await source.fetchHistorical(from, to)
  if (signals.length > 0) {
    await signalRepository.saveSignals(signals)
  }
  console.log(` ${signals.length} signals saved`)
  return signals.length
}

async function loadCryptoPanic(from: Date, to: Date): Promise<number> {
  const apiToken = process.env['CRYPTOPANIC_API_KEY']
  if (!apiToken) {
    console.log('  Skipping CryptoPanic (CRYPTOPANIC_API_KEY not set)')
    return 0
  }
  process.stdout.write('  Fetching CryptoPanic news...')
  const source = new CryptoPanicSource({ apiToken })
  const signals = await source.fetchHistorical(from, to)
  if (signals.length > 0) {
    await signalRepository.saveSignals(signals)
  }
  console.log(` ${signals.length} signals saved`)
  return signals.length
}

async function main(): Promise<void> {
  const { coins, from, to, timeframe } = parseArgs()

  console.log(`Data loader: ${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)} | coins=${coins.join(',')} | timeframe=${timeframe}`)
  console.log()

  console.log('Candles:')
  const candleCount = await loadCandles(coins, timeframe, from, to)

  console.log('\nSignals:')
  const fngCount = await loadFearAndGreed(from, to)
  const cpCount = await loadCryptoPanic(from, to)

  console.log(`\nDone. ${candleCount} candles, ${fngCount + cpCount} signals loaded.`)
}

main()
  .catch(err => {
    console.error('Error:', err)
    process.exitCode = 1
  })
  .finally(() => {
    void prisma.$disconnect()
  })
