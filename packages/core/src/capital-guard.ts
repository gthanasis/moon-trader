interface CapitalGuardConfig {
  totalCapital: number
}

export class CapitalGuard {
  private readonly total: number
  private deployed = 0

  constructor(config: CapitalGuardConfig) {
    if (config.totalCapital <= 0) {
      throw new Error('Total capital must be positive')
    }
    this.total = config.totalCapital
  }

  canTrade(size: number): boolean {
    if (size <= 0) return false
    return size <= this.total - this.deployed
  }

  reserve(size: number): void {
    if (size <= 0) throw new Error('Reserve size must be positive')
    this.deployed = Math.min(this.deployed + size, this.total)
  }

  release(size: number): void {
    if (size <= 0) throw new Error('Release size must be positive')
    this.deployed = Math.max(0, this.deployed - size)
  }

  availableCapital(): number {
    return this.total - this.deployed
  }

  deployedCapital(): number {
    return this.deployed
  }
}
