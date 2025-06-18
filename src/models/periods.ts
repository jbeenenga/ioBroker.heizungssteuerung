/**
 * Interface representing a heating period configuration
 */
export interface Period {
	/** Room identifier (e.g., "enum.rooms.livingroom") */
	room: string;
	/** Start time of the period in HH:MM format */
	from: string;
	/** End time of the period in HH:MM format */
	until: string;
	/** Whether this period is for heating (true) or cooling (false) */
	heating: boolean;
	/** Target temperature for this period */
	temp: number;
	/** Monday - whether the period is active on this day */
	0: boolean;
	/** Tuesday - whether the period is active on this day */
	1: boolean;
	/** Wednesday - whether the period is active on this day */
	2: boolean;
	/** Thursday - whether the period is active on this day */
	3: boolean;
	/** Friday - whether the period is active on this day */
	4: boolean;
	/** Saturday - whether the period is active on this day */
	5: boolean;
	/** Sunday - whether the period is active on this day */
	6: boolean;
}
