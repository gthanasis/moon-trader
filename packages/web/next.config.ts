import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@trader/db', '@trader/backtest', '@trader/shared', '@trader/llm', '@trader/data'],
}

export default nextConfig
