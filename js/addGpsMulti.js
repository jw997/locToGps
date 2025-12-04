
/*
read all street names from intersecitons file
use them to load up fuse
standardize crash repoert streets and then try to look up the intersections
see how many we get at each stage?


read ccrsjson
*/

'use strict';
import { count } from 'console';
import fs from 'fs';

import Fuse from 'fuse.js'
import { exit } from 'process';


for (let j = 0; j < process.argv.length; j++) {
	console.log(j + ' -> ' + (process.argv[j]));
}

const intersectionsJsonDirectory = process.argv[2] ?? './data/intersection/';
const ccrsJsonFile = process.argv[3] ?? './input/ccrs2024.json';
const outputCcrsJsonFile = process.argv[4] ?? './output/ccrs2024.json';

//'intersections_oakland.json'.match(/intersections_(.*).json/)
//Array [ "intersections_oakland.json", "oakland" ]

/* utility functions */

function getFilesFromDirectory( dirName, regex) {
	const files = fs.readdirSync(dirName);
	const retval = [];
	for (const f of files) {
		if (!regex || f.match(regex))	 {
			retval.push(f);
		}
	}
	return retval;
}


var lastTime = 0;
function getMS(msg) {
	const thisTime = Date.now();
	const diff = thisTime - lastTime;
	lastTime = thisTime;

	if (msg) {
		console.log(msg, ':', diff, ' ms')
	}
	return diff;
}

function dumpSet(name, set) {
	console.log("Set: ", name);
	for (const e of set) {
		console.log(e);
	}
}

function missingGps(attr) {

	if (!attr.Latitude || !attr.Longitude) {
		return true;
	}
	return false;
}
function countMissingGps(features) {
	var ct = 0, missing = 0;
	for (const f of features) {
		ct++;
		if (missingGps(f.attributes)) {
			missing++;
		}
	}
	console.log("Ct: ", ct, " MissingGps:", missing);
}

function getJson(filename) {
	const str = fs.readFileSync(filename).toString();
	const obj = JSON.parse(str);
	return obj;
}

// write out fixed file
function writeJson(file, obj) {
	const str = JSON.stringify(obj, null, 2);

	fs.writeFileSync(file, str);
}

function truncateFloat(f, fractionDigits) {
	return parseFloat(f.toFixed(fractionDigits))
}

//const mapStreetPairToGPS = new Map();
function makeKey(s1, s2) {
	const key = s1.toUpperCase().trim() + '/' + s2.toUpperCase().trim();
	return key;
}

class clsIntersection {
	fileName;
	cityName;
	streetNames = new Set();
	mapStreetPairToGPS = new Map();
	intersectionJSON;
	fuseStreetMatcher;
	fuseMemo = new Map();

	constructor(cityname, json) {
		this.cityName = cityname;
		this.intersectionJSON = json;

		for (const i of this.intersectionJSON.features) {
			const streets = i.properties.streets;
			const key = makeKey(streets[0], streets[1])
			this.mapStreetPairToGPS.set(key, i.geometry.coordinates);

			for (const s of streets) {
				this.streetNames.add(s.toUpperCase().trim()); // stdize on upcase for streets, cities, places
			}
		}

		console.log("street name count:", this.streetNames.size);

		const options = {
		   // isCaseSensitive: false,
			includeScore: true
		};

		this.fuseStreetMatcher = new Fuse(Array.from(this.streetNames), options);

	}


	fixSuffix(street) {
		/*
		ST -> STREET
		AVE -> AVENUE
		*/
		const rules = [
			[/ AVE$/, ' AVENUE'],
			[/ AV$/, ' AVENUE'],
			[/ ST$/, ' STREET'],
			[/ RD$/, ' ROAD'],
			[/ BL$/, ' BOULEVARD'],
			[/ DR$/, ' DRIVE'],
			[/ WY$/, ' WAY'],
			[/ CT$/, ' COURT'],
			[/ PKWY$/, ' PARKWAY'],


		];

		var retval = street;

		for (const [reg, rep] of rules) {
			retval = retval.replace(reg, rep);
		}

		return retval;
	}

	fusetries=0;
	fusematches=0;
	fusememohits=0;

	logFuseStats() {
		console.log("Fuse stats for ", this.cityName, 'tries', this.fusetries, 'matches', this.fusematches, 'memo hits', this.fusememohits)
	}

	fixName(arg) {
		if (!arg) {
			return arg;
		}
		if ("string" != typeof (arg)) {
			arg = '' + arg;
		}

		const name = '' + arg.toUpperCase().trim();


		if (this.streetNames.has(name)) {
			return name
		}
		const fixed = this.fixSuffix(name);
		if (this.streetNames.has(fixed)) {
			return fixed
		}
		this.fusetries++;

		// try the memo first
		const mem = this.fuseMemo.get(name);
		if (mem != undefined) {
			this.fusememohits++;
			return mem;
		}
		const results = this.fuseStreetMatcher.search(name, { limit: 5 });
		const FUSELIMIT = 0.5;
		if ((results.length >= 1) && (results[0].score <= FUSELIMIT)) {
			const fuseMatch = results[0].item;

			if (this.streetNames.has(fuseMatch)) {
				this.fusematches++;
				this.fuseMemo.set(name, fuseMatch)
				return fuseMatch;
			} 
		}
		this.fuseMemo.set(name, null);
		return null;

	}

	getIntersection(s1, s2) {
		const k1 = makeKey(s1, s2);		
		const i1 = this.mapStreetPairToGPS.get(k1);
		
		if (i1) {
			return i1;
		}
		const k2 = makeKey(s2, s1);
		const i2 = this.mapStreetPairToGPS.get(k2);

		if (i2) {
			return i2;
		}
		return null;
	}
	updateGPSFromRoads(f) {
		const a = f.attributes
		if (missingGps(a)) {
			const s1 = this.fixName(a.PrimaryRoad);
			const s2 = this.fixName(a.SecondaryRoad);

			if (!(s1 && s2)) {
				//console.log("cant fix road names ", a.PrimaryRoad, ' ' , a.SecondaryRoad);
				return false;
			}
			// try to find matching intersection
			const gps = this.getIntersection(s1, s2)
			if (gps) {
				//matched++;
				//a.Latitude = gps[1]
				//a.Longitude = gps[2];

				[a.Longitude, a.Latitude] = gps;
				a.Longitude = truncateFloat(a.Longitude, 6);
				a.Latitude = truncateFloat(a.Latitude, 6);
				return true;

				//	console.log( "found gps",gps, 'for' ,  s1,'/',s2)
			} else {
					console.log( "gps not found for ", a.CollisionId, a.CityName, a.PrimaryRoad, a.SecondaryRoad,  s1,'/',s2)
					return false;
			}
		} 
	}
}

console.log("Loadding ccrs data from", ccrsJsonFile);
const ccrsJSON = getJson(ccrsJsonFile)

const mapCityToIntersections = new Map();

const arrFileNames = getFilesFromDirectory(intersectionsJsonDirectory, /intersections.*json/);
for (const fileName of arrFileNames) {
	// get the city name from it
	console.log('loading intersections from ', fileName);
	const matches = fileName.match(/intersections_(.*).json$/);
	const city = matches[1].trim().toUpperCase();
	const json = getJson(intersectionsJsonDirectory + fileName);

	const objIntersection = new clsIntersection(city, json);

	mapCityToIntersections.set(city,objIntersection);

}

function getIntersectionForCity (city) {
	const retval = mapCityToIntersections.get(city.replaceAll(' ','').trim().toUpperCase());
	return retval;
}









console.log("ccrs count:", ccrsJSON.features.length);


countMissingGps(ccrsJSON.features);
/*
function fixSuffix(street) {

	const rules = [
		[/ AVE$/, ' AVENUE'],
		[/ AV$/, ' AVENUE'],
		[/ ST$/, ' STREET'],
		[/ RD$/, ' ROAD'],
		[/ BL$/, ' BOULEVARD'],
		[/ DR$/, ' DRIVE'],
		[/ WY$/, ' WAY'],
		[/ CT$/, ' COURT'],
		[/ PKWY$/, ' PARKWAY'],


	];

	var retval = street;

	for (const [reg, rep] of rules) {
		retval = retval.replace(reg, rep);
	}

	return retval;
}*/



function getGPSFromRoads(features) {
	var total = 0, missing = 0, matched = 0;
	for (const f of features) {

		const a = f.attributes
		total++;
		if (missingGps(a)) {
			missing++;

			// find city
			const city = a.CityName;

			const objIntersections = getIntersectionForCity(city);

			if (!objIntersections) {
				console.log("Intersection not found for", city);
				continue;
			}

			if (objIntersections.updateGPSFromRoads(f)) {
				matched++;
			}
			/*
			const s1 = fixName(a.PrimaryRoad);
			const s2 = fixName(a.SecondaryRoad);

			if (!(s1 && s2)) {
				//console.log("cant fix road names ", a.PrimaryRoad, ' ' , a.SecondaryRoad);
				continue;
			}
			// try to find matching intersection
			const gps = objIntersections.getIntersection(s1, s2)
			if (gps) {
				//matched++;
				//a.Latitude = gps[1]
				//a.Longitude = gps[2];

				[a.Longitude, a.Latitude] = gps;
				a.Longitude = truncateFloat(a.Longitude, 6);
				a.Latitude = truncateFloat(a.Latitude, 6);
				matched++;

				//	console.log( "found gps",gps, 'for' ,  s1,'/',s2)
			} else {
				//	console.log( "gps not found for ", a.CollisionId, a.PrimaryRoad, a.SecondaryRoad,  s1,'/',s2)
			}
			*/

		}
	}
	console.log('Total:', total, 'MissingGps:', missing, 'matched:', matched);
}

getGPSFromRoads(ccrsJSON.features);


writeJson(outputCcrsJsonFile, ccrsJSON);

for (const i of mapCityToIntersections.values()) {
	i.logFuseStats();
}


console.log("bye");