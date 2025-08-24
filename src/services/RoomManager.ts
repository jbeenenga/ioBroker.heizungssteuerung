import type { RoomsEnumResult, RoomEnum } from "../models/roomEnum";

/**
 * Manager for room-related operations and data access
 */
export class RoomManager {
	/**
	 * Create new RoomManager
	 *
	 * @param rooms Room enumeration result from ioBroker
	 */
	constructor(private rooms: RoomsEnumResult) {}

	/**
	 * Convert long room name to short room name
	 *
	 * @param room full room identifier
	 * @returns short room name
	 */
	convertToShortRoomName(room: string): string {
		const shortRoomNameParts = room.split(".");
		return shortRoomNameParts[shortRoomNameParts.length - 1];
	}

	/**
	 * Build array of short room names from rooms enum
	 *
	 * @returns array of short room names
	 */
	buildRoomNames(): string[] {
		const longRoomNames = Object.keys(this.rooms.result);
		const shortRoomNames: string[] = [];

		for (let i = 0; i < longRoomNames.length; i++) {
			shortRoomNames.push(this.convertToShortRoomName(longRoomNames[i]));
		}

		return shortRoomNames;
	}

	/**
	 * Get all room identifiers
	 *
	 * @returns array of full room identifiers
	 */
	getAllRoomIds(): string[] {
		return Object.keys(this.rooms.result);
	}

	/**
	 * Check if a room exists
	 *
	 * @param roomName short room name to check
	 * @returns true if room exists
	 */
	roomExists(roomName: string): boolean {
		const roomId = `enum.rooms.${roomName}`;
		return roomId in this.rooms.result;
	}

	/**
	 * Get room object by short name
	 *
	 * @param roomName short room name
	 * @returns room object or undefined if not found
	 */
	getRoomById(roomName: string): RoomEnum | undefined {
		const roomId = `enum.rooms.${roomName}`;
		return this.rooms.result[roomId];
	}

	/**
	 * Update rooms data
	 *
	 * @param newRooms new rooms enum result
	 */
	updateRooms(newRooms: RoomsEnumResult): void {
		this.rooms = newRooms;
	}
}
