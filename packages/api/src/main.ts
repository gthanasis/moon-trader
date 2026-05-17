import 'reflect-metadata'
import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap')
  const app = await NestFactory.create(AppModule)
  // Restrict CORS to the dashboard origin. A wide-open policy would let any
  // website the operator visits issue trade-control requests to the loopback
  // API from their browser. Override via WEB_ORIGIN for non-default setups.
  app.enableCors({
    origin: process.env['WEB_ORIGIN'] ?? 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  })
  const port = Number(process.env['API_PORT'] ?? 4000)
  // Bind to loopback by default — no external exposure, no auth boundary.
  // In Docker, set API_HOST=0.0.0.0 so sibling containers can reach it; the
  // compose host-port mapping (127.0.0.1:4000) keeps it private on the host.
  const host = process.env['API_HOST'] ?? '127.0.0.1'
  await app.listen(port, host)
  logger.log(`Listening on http://${host}:${port}`)
}

void bootstrap()
