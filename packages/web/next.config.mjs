/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@trader/db', '@trader/backtest', '@trader/shared', '@trader/llm', '@trader/data'],
}

export default nextConfig
