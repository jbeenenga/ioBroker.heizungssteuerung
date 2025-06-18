/**
 * Interface representing a room enum object in ioBroker
 */
export interface RoomEnum {
	/** The ioBroker object type */
	type: "enum";
	/** Common properties of the room */
	common: {
		/** Display name of the room */
		name: string;
		/** Array of object IDs that belong to this room */
		members: string[];
	};
	/** Native properties (adapter-specific) */
	native: Record<string, unknown>;
	/** The object ID */
	_id: string;
}

/**
 * Interface representing the result of getEnumAsync("rooms")
 */
export interface RoomsEnumResult {
	/** Result object containing all rooms indexed by their enum ID */
	result: Record<string, RoomEnum>;
}
