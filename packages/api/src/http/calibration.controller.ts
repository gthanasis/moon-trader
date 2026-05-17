import { Controller, Get } from '@nestjs/common'
import { CalibrationService } from '../llm'

@Controller('calibration')
export class CalibrationController {
  constructor(private readonly calibration: CalibrationService) {}

  /** The bot's confidence-calibration curve — predicted vs realised win rate. */
  @Get()
  curve() {
    return this.calibration.compute()
  }
}
