import { Controller } from '@nestjs/common';
import { RoomRecord, RoomService } from './room.service.js';

@Controller('rooms')
export class RoomController {
  constructor(private readonly service: RoomService) {}

  create(input: RoomRecord): RoomRecord {
    return this.service.create(input);
  }

  list(branchId?: string): RoomRecord[] {
    return this.service.list(branchId);
  }

  get(id: string): RoomRecord | undefined {
    return this.service.findById(id);
  }
}
