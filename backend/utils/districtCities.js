/**
 * districtCities.js
 *
 * Maps Texas legislative/congressional districts to their primary city.
 * Used to set realistic `home_city` values for candidates instead of
 * always defaulting to the state capital.
 */

// Congressional districts
const TX_CD = {
  "TX-1": "Tyler, TX", "TX-2": "The Woodlands, TX", "TX-3": "McKinney, TX",
  "TX-4": "Sherman, TX", "TX-5": "Mesquite, TX", "TX-6": "Arlington, TX",
  "TX-7": "Houston, TX", "TX-8": "The Woodlands, TX", "TX-9": "Houston, TX",
  "TX-10": "Austin, TX", "TX-11": "Midland, TX", "TX-12": "Fort Worth, TX",
  "TX-13": "Amarillo, TX", "TX-14": "Galveston, TX", "TX-15": "McAllen, TX",
  "TX-16": "El Paso, TX", "TX-17": "College Station, TX", "TX-18": "Houston, TX",
  "TX-19": "Lubbock, TX", "TX-20": "San Antonio, TX", "TX-21": "San Antonio, TX",
  "TX-22": "Sugar Land, TX", "TX-23": "San Antonio, TX", "TX-24": "Irving, TX",
  "TX-25": "Austin, TX", "TX-26": "Denton, TX", "TX-27": "Corpus Christi, TX",
  "TX-28": "Laredo, TX", "TX-29": "Houston, TX", "TX-30": "Dallas, TX",
  "TX-31": "Temple, TX", "TX-32": "Dallas, TX", "TX-33": "Dallas, TX",
  "TX-34": "Brownsville, TX", "TX-35": "San Antonio, TX", "TX-36": "Beaumont, TX",
  "TX-37": "Houston, TX", "TX-38": "Houston, TX",
};

// State Senate districts
const TX_SD = {
  "SD-1": "Longview, TX", "SD-2": "Houston, TX", "SD-3": "Dallas, TX",
  "SD-4": "Houston, TX", "SD-5": "Beaumont, TX", "SD-6": "Houston, TX",
  "SD-7": "Houston, TX", "SD-8": "Spring, TX", "SD-9": "Plano, TX",
  "SD-10": "San Antonio, TX", "SD-11": "Dallas, TX", "SD-12": "Fort Worth, TX",
  "SD-13": "Wichita Falls, TX", "SD-14": "Corpus Christi, TX",
  "SD-15": "McAllen, TX", "SD-16": "Dallas, TX", "SD-17": "San Angelo, TX",
  "SD-18": "Dallas, TX", "SD-19": "San Antonio, TX", "SD-20": "Corpus Christi, TX",
  "SD-21": "San Antonio, TX", "SD-22": "Round Rock, TX", "SD-23": "Fort Worth, TX",
  "SD-24": "Laredo, TX", "SD-25": "San Antonio, TX", "SD-26": "San Antonio, TX",
  "SD-27": "Brownsville, TX", "SD-28": "Houston, TX", "SD-29": "Lubbock, TX",
  "SD-30": "Dallas, TX", "SD-31": "Amarillo, TX",
};

// State House districts
const TX_HD = {
  "HD-1": "Lufkin, TX", "HD-2": "Huntsville, TX", "HD-3": "Texarkana, TX",
  "HD-4": "Bonham, TX", "HD-5": "Jacksonville, TX", "HD-6": "Tyler, TX",
  "HD-7": "Longview, TX", "HD-8": "Nacogdoches, TX", "HD-9": "Lufkin, TX",
  "HD-10": "Bryan, TX", "HD-11": "Midland, TX", "HD-12": "Galveston, TX",
  "HD-13": "Beaumont, TX", "HD-14": "College Station, TX", "HD-15": "Beaumont, TX",
  "HD-16": "Victoria, TX", "HD-17": "College Station, TX", "HD-18": "Brenham, TX",
  "HD-19": "Waco, TX", "HD-20": "Waco, TX", "HD-21": "Temple, TX",
  "HD-22": "Killeen, TX", "HD-23": "Georgetown, TX", "HD-24": "Pflugerville, TX",
  "HD-25": "Pflugerville, TX", "HD-26": "Katy, TX", "HD-27": "Rosenberg, TX",
  "HD-28": "Hays County, TX", "HD-29": "League City, TX", "HD-30": "South Houston, TX",
  "HD-31": "Wharton, TX", "HD-32": "Lockhart, TX", "HD-33": "Rockwall, TX",
  "HD-34": "Rio Grande Valley, TX", "HD-35": "San Antonio, TX",
  "HD-36": "San Antonio, TX", "HD-37": "Corpus Christi, TX",
  "HD-38": "San Antonio, TX", "HD-39": "San Antonio, TX", "HD-40": "Laredo, TX",
  "HD-41": "Del Rio, TX", "HD-42": "El Paso, TX", "HD-43": "El Paso, TX",
  "HD-44": "San Antonio, TX", "HD-45": "San Marcos, TX", "HD-46": "Austin, TX",
  "HD-47": "Austin, TX", "HD-48": "Austin, TX", "HD-49": "Austin, TX",
  "HD-50": "Austin, TX", "HD-51": "Austin, TX", "HD-52": "Round Rock, TX",
  "HD-53": "Temple, TX", "HD-54": "San Angelo, TX", "HD-55": "Waco, TX",
  "HD-56": "Abilene, TX", "HD-57": "Stephenville, TX", "HD-58": "Granbury, TX",
  "HD-59": "Corsicana, TX", "HD-60": "Burleson, TX", "HD-61": "Fort Worth, TX",
  "HD-62": "Wichita Falls, TX", "HD-63": "North Richland Hills, TX",
  "HD-64": "Denton, TX", "HD-65": "Denton, TX", "HD-66": "Plano, TX",
  "HD-67": "Allen, TX", "HD-68": "Mesquite, TX", "HD-69": "Rowlett, TX",
  "HD-70": "Garland, TX", "HD-71": "Odessa, TX", "HD-72": "San Angelo, TX",
  "HD-73": "Kerrville, TX", "HD-74": "El Paso, TX", "HD-75": "El Paso, TX",
  "HD-76": "El Paso, TX", "HD-77": "El Paso, TX", "HD-78": "San Antonio, TX",
  "HD-79": "El Paso, TX", "HD-80": "Eagle Pass, TX", "HD-81": "Ector County, TX",
  "HD-82": "Midland, TX", "HD-83": "Lubbock, TX", "HD-84": "Lubbock, TX",
  "HD-85": "Amarillo, TX", "HD-86": "Amarillo, TX", "HD-87": "Amarillo, TX",
  "HD-88": "Lubbock, TX", "HD-89": "Big Spring, TX", "HD-90": "Fort Worth, TX",
  "HD-91": "Fort Worth, TX", "HD-92": "Fort Worth, TX", "HD-93": "Fort Worth, TX",
  "HD-94": "Fort Worth, TX", "HD-95": "Fort Worth, TX",
  "HD-96": "Keller, TX", "HD-97": "Fort Worth, TX", "HD-98": "Keller, TX",
  "HD-99": "Fort Worth, TX", "HD-100": "Dallas, TX", "HD-101": "Grand Prairie, TX",
  "HD-102": "Dallas, TX", "HD-103": "Richardson, TX", "HD-104": "Dallas, TX",
  "HD-105": "Irving, TX", "HD-106": "Carrollton, TX", "HD-107": "Dallas, TX",
  "HD-108": "Dallas, TX", "HD-109": "Dallas, TX", "HD-110": "Dallas, TX",
  "HD-111": "DeSoto, TX", "HD-112": "Dallas, TX", "HD-113": "Dallas, TX",
  "HD-114": "Dallas, TX", "HD-115": "Mesquite, TX", "HD-116": "San Antonio, TX",
  "HD-117": "San Antonio, TX", "HD-118": "San Antonio, TX",
  "HD-119": "San Antonio, TX", "HD-120": "San Antonio, TX",
  "HD-121": "San Antonio, TX", "HD-122": "San Antonio, TX",
  "HD-123": "San Antonio, TX", "HD-124": "San Antonio, TX",
  "HD-125": "San Antonio, TX", "HD-126": "Katy, TX", "HD-127": "Houston, TX",
  "HD-128": "Pasadena, TX", "HD-129": "Houston, TX", "HD-130": "Houston, TX",
  "HD-131": "Houston, TX", "HD-132": "Houston, TX", "HD-133": "Houston, TX",
  "HD-134": "Houston, TX", "HD-135": "Houston, TX", "HD-136": "Houston, TX",
  "HD-137": "Houston, TX", "HD-138": "Houston, TX", "HD-139": "Houston, TX",
  "HD-140": "Houston, TX", "HD-141": "Houston, TX", "HD-142": "Houston, TX",
  "HD-143": "Houston, TX", "HD-144": "Pasadena, TX", "HD-145": "Houston, TX",
  "HD-146": "Houston, TX", "HD-147": "Houston, TX", "HD-148": "Houston, TX",
  "HD-149": "Houston, TX", "HD-150": "Houston, TX",
};

/**
 * Resolve a candidate's likely home city from their district.
 * @param {string} district  e.g. "TX-20", "SD-14", "HD-49"
 * @param {string} [stateCode="TX"]
 * @returns {string|null}  e.g. "San Antonio, TX"
 */
export function getDistrictCity(district, stateCode = "TX") {
  if (!district || stateCode !== "TX") return null;
  const d = district.toUpperCase();
  return TX_CD[d] || TX_SD[d] || TX_HD[d] || null;
}
