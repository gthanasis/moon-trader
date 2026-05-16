import 'reflect-metadata'
import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap')
  const app = await NestFactory.create(AppModule)
  // Web (Next.js) calls this API from the same machine — allow localhost origins.
  app.enableCors()
  const port = Number(process.env['API_PORT'] ?? 4000)
  // Bind to localhost only — no external exposure, no auth boundary.
  await app.listen(port, '127.0.0.1')
  logger.log(`Listening on http://127.0.0.1:${port}`)
}

void bootstrap()
