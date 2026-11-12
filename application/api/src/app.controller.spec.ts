import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return a running MSPACES API status message', () => {
      expect(appController.getHello()).toBe('MSPACES API is running');
    });
  });

  describe('overview', () => {
    it('should expose the centralized MSPACES architecture overview', () => {
      const overview = appController.getOverview();

      expect(overview.system).toBe('MSPACES Centralized Management System');
      expect(overview.modules).toContain('Authentication & User Management');
      expect(overview.phasePlan).toContain('Phase 1 — Foundation');
    });
  });
});
