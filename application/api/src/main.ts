import { NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module.js';
import { AuthMiddleware } from './foundation/auth/auth.middleware.js';
import { AuthService } from './foundation/auth/auth.service.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use('/public/booking/reservations',json({limit:'15mb'}));
  app.use('/reservations/payment-accounts',json({limit:'2mb'}));
  app.use(json({limit:'256kb'}));
  app.use(urlencoded({extended:false,limit:'256kb'}));

  app.enableCors({ origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:3005').split(',').map(value => value.trim()), credentials: true });
  const authService = app.get(AuthService);
  app.use((req: Request, res: Response, next: NextFunction) => {
    const middleware = new AuthMiddleware(authService);
    void middleware.use(req as any, res as any, next).catch(next);
  });

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
