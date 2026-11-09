// The resident's room for a fault report (PB-005). POST /reporting/tickets needs `roomId`, and
// the server checks it against the resident's current occupancy. There is no "my room" endpoint
// yet, so the resident picks from the hall's rooms (GET /properties/mine), pre-filled with:
//   1. the room they picked last time on this device, else
//   2. the room of their most recent ticket.
// TODO(PB-005): pre-fill from a GET /properties/my-room (Amabe) once it exists.
import { useMemo, useState } from 'react';
import { useApi } from './useApi';

const KEY = 'resifix.roomId';

export interface RoomOption {
  id: string;
  label: string; // "Block A, Room 101"
  block: string;
}

interface PropertyResponse {
  property: { blocks: { name: string; rooms: { id: string; number: string }[] }[] };
}
interface TicketsResponse {
  tickets: { roomId: string; createdAt: string }[];
}

function remembered(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function rememberRoom(roomId: string) {
  try {
    localStorage.setItem(KEY, roomId);
  } catch {
    // storage unavailable (private mode): the picker just won't be pre-filled next time
  }
}

export function useMyRoom() {
  const property = useApi<PropertyResponse>('/properties/mine');
  const tickets = useApi<TicketsResponse>('/tickets');
  const [picked, setPicked] = useState<string | null>(null);

  const rooms = useMemo<RoomOption[]>(
    () =>
      property.data?.property.blocks.flatMap((b) =>
        b.rooms.map((r) => ({ id: r.id, block: b.name, label: `${b.name}, Room ${r.number}` })),
      ) ?? [],
    [property.data],
  );

  const guess = useMemo(() => {
    const known = new Set(rooms.map((r) => r.id));
    const saved = remembered();
    if (saved && known.has(saved)) return saved;
    const latest = tickets.data?.tickets.find((t) => known.has(t.roomId));
    return latest?.roomId ?? '';
  }, [rooms, tickets.data]);

  const roomId = picked ?? guess;
  return {
    rooms,
    roomId,
    room: rooms.find((r) => r.id === roomId),
    setRoomId: setPicked,
    loading: property.loading,
    error: property.error,
  };
}
