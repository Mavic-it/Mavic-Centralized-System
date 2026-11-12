import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Public } from '../foundation/auth/auth.decorators.js';

@Controller('health')
export class DatabaseHealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get('db')
  @Public()
  async database(): Promise<{ status: 'ok'; database: string }> {
    await this.dataSource.query('SELECT 1');
    return {
      status: 'ok',
      database: this.dataSource.options.database as string,
    };
  }
}
