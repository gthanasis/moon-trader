import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)
  const port = Number(process.env['API_PORT'] ?? 4000)
  // Bind to localhost only — no external exposure, no auth boundary.
  await app.listen(port, '127.0.0.1')
  console.log(`[api] listening on http://127.0.0.1:${port}`)
}

void bootstrap()
