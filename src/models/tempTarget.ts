/**
 * Interface representing a target temperature configuration
 */
export interface TempTarget {
	/** Target temperature in degrees */
	temp: number;
	/** Time until which this temperature is valid (HH:MM format or "boost"/"pause") */
	until: string;
}
