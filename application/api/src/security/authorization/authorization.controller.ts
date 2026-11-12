import { Controller } from '@nestjs/common';
import {
  AuthorizationDecision,
  AuthorizationRequest,
  AuthorizationService,
} from './authorization.service.js';

@Controller('authorization')
export class AuthorizationController {
  constructor(private readonly service: AuthorizationService) {}

  authorize(request: AuthorizationRequest): AuthorizationDecision {
    return this.service.authorize(request);
  }
}
