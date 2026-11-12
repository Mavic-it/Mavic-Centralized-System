export type RoomStatus =
  'AVAILABLE' | 'RESERVED' | 'OCCUPIED' | 'MAINTENANCE' | 'INACTIVE';

export type RoomRecord = {
  id: string;
  branchId: string;
  name: string;
  floor: string;
  capacity: number;
  status: RoomStatus;
  amenities: string[];
};

export class RoomService {
  private rooms = new Map<string, RoomRecord>();

  create(input: RoomRecord): RoomRecord {
    this.rooms.set(input.id, input);
    return input;
  }

  list(branchId?: string): RoomRecord[] {
    const rooms = Array.from(this.rooms.values());
    return branchId
      ? rooms.filter((room) => room.branchId === branchId)
      : rooms;
  }

  findById(id: string): RoomRecord | undefined {
    return this.rooms.get(id);
  }
}
