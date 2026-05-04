interface CapitalGuardConfig {
  totalCapital: number
}

export class CapitalGuard {
  private readonly total: number
  private deployed = 0

  constructor(config: CapitalGuardConfig) {
    this.total = config.totalCapital
  }

  canTrade(size: number): boolean {
    return size <= this.total - this.deployed
  }

  reserve(size: number): void {
    this.deployed = Math.min(this.deployed + size, this.total)
  }

  release(size: number): void {
    this.deployed = Math.max(0, this.deployed - size)
  }

  availableCapital(): number {
    return this.total - this.deployed
  }

  deployedCapital(): number {
    return this.deployed
  }
}
