import { Controller, Get } from '@nestjs/common';
import { AppService, type MSpacesOverview } from './app.service.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('overview')
  getOverview(): MSpacesOverview {
    return this.appService.getOverview();
  }
}
