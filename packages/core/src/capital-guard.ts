interface CapitalGuardConfig {
  totalCapital: number
}

export class CapitalGuard {
  private readonly total: number
  private deployed = 0
  private realisedPnl = 0

  constructor(config: CapitalGuardConfig) {
    if (config.totalCapital <= 0) {
      throw new Error('Total capital must be positive')
    }
    this.total = config.totalCapital
  }

  canTrade(size: number): boolean {
    if (size <= 0) return false
    return size <= this.availableCapital()
  }

  reserve(size: number): void {
    if (size <= 0) throw new Error('Reserve size must be positive')
    this.deployed += size
  }

  release(size: number): void {
    if (size <= 0) throw new Error('Release size must be positive')
    this.deployed = Math.max(0, this.deployed - size)
  }

  /** Close a position: un-deploy the reserved amount and record the P&L delta. */
  releaseWithProceeds(reserved: number, proceeds: number): void {
    this.deployed = Math.max(0, this.deployed - reserved)
    this.realisedPnl += proceeds - reserved
  }

  availableCapital(): number {
    return this.total + this.realisedPnl - this.deployed
  }

  deployedCapital(): number {
    return this.deployed
  }
}
