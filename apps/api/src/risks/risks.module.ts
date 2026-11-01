import { Module } from '@nestjs/common';
import { RiskAssessmentsService } from './risk-assessments.service';
import { RiskCriteriaService } from './risk-criteria.service';
import {
  RiskAssessmentsController,
  RiskCriteriaController,
  RisksController,
} from './risks.controller';
import { RisksService } from './risks.service';

@Module({
  controllers: [RisksController, RiskCriteriaController, RiskAssessmentsController],
  providers: [RisksService, RiskCriteriaService, RiskAssessmentsService],
  exports: [RisksService],
})
export class RisksModule {}
