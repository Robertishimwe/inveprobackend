// src/utils/pick.ts

/**
 * Creates an object composed of the picked object properties.
 * If the source object is null or undefined, an empty object is returned.
 *
 * @template T - The type of the source object.
 * @template K - The keys to pick from the source object.
 * @param {T | null | undefined} object - The source object.
 * @param {K[]} keys - An array of keys (strings or symbols) to pick.
 * @returns {Pick<T, K>} - A new object with properties matching the specified keys.
 */
const pick = <T extends object, K extends keyof T>(object: T | null | undefined, keys: K[]): Pick<T, K> => {
    // Return empty object if source is null or undefined
    if (object === null || object === undefined) {
      return {} as Pick<T, K>;
    }
  
    // Use reduce to build the new object
    return keys.reduce((obj, key) => {
      // Check if the key exists directly on the object (avoids prototype properties)
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        // Assign the value to the new object
        obj[key] = object[key];
      }
      return obj;
    }, {} as Pick<T, K>); // Initialize with an empty object cast to the target type
  };
  
  export default pick;
  