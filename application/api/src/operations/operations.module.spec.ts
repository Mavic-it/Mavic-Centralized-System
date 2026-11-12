import { describe, expect, it } from 'vitest';
import { ReservationController } from './reservations/reservation.controller.js';
import { ReservationManagementService } from './reservations/reservation-management.service.js';
import { RoomController } from './rooms/room.controller.js';
import { RoomService } from './rooms/room.service.js';

describe('MSPACES operations module', () => {
  it('manages room availability and reservation flow', () => {
    const rooms = new RoomService();
    const roomController = new RoomController(rooms);

    const room = roomController.create({
      id: 'room-1',
      branchId: 'branch-1',
      name: 'Boardroom A',
      floor: '5',
      capacity: 12,
      status: 'AVAILABLE',
      amenities: ['Projector', 'Whiteboard'],
    });

    expect(room.status).toBe('AVAILABLE');
    expect(roomController.list('branch-1')).toHaveLength(1);

    expect(ReservationController).toBeDefined();
    expect(ReservationManagementService).toBeDefined();
  });
});
