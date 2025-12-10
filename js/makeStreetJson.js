
/*
use intersection files for each county annotated with city and county props
read all street names from intersecitons file
write them out to data/steets county and city files  streets_County.json  streets_County_City.json 

street files are used by ccrsViewer for the select street drop down
*/

'use strict';
import { count } from 'console';
import fs, { readdir } from 'fs';

import Fuse from 'fuse.js'
import { exit } from 'process';


for (let j = 0; j < process.argv.length; j++) {
	console.log(j + ' -> ' + (process.argv[j]));
}

const intersectionsJsonDirectory = process.argv[2] ?? './data/intersection/counties/';

const streetJsonDirectory = process.argv[3] ?? './output/streets/';

const countyCityJsonFile = "./data/county_cities.json";

//'intersections_oakland.json'.match(/intersections_(.*).json/)
//Array [ "intersections_oakland.json", "oakland" ]

/* utility functions */
function fileNameIze(str) {
	return str.replaceAll(' ', '_').replaceAll('/','_');

}

function getFilesFromDirectory(dirName, regex) {
	const files = fs.readdirSync(dirName);
	const retval = [];
	for (const f of files) {
		if (!regex || f.match(regex)) {
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
	const key = s1.trim() + '/' + s2.trim();
	return key;
}

function makePairs(array) {
	const retval = [];
	for (var i=0;i<array.length -1;i++) {
		for (var j=i+1; j<array.length;j++ ) {
			const pair = [array[i],array[j]];
			retval.push(pair)
		}
	}

	return retval;

}

class clsIntersection {
	fileName; // not used
	cityName;
	countyName;
	streetNames = new Set();  // filled in after all calls to addIntersection
	mapStreetPairToGPS = new Map();
	intersectionJSON; // filled in by calling addIntersection repeatedly

	addIntersection(f) {
		this.intersectionJSON.features.push(f);
	}

	fuseStreetMatcher;
	fuseMemo = new Map();

	init() { // call after adding all intersections

		for (const i of this.intersectionJSON.features) {
			const streets = i.properties.streets;
			const pairs = makePairs(streets);
			for (const p of pairs) {
			const key = makeKey(p[0], p[1])
			this.mapStreetPairToGPS.set(key, i.geometry.coordinates);
			}
			for (const s of streets) {
				this.streetNames.add(s.trim()); // stdize on upcase for streets, cities, places
			}
		}

		console.log("street name count:", this.streetNames.size);

		const options = {
			// isCaseSensitive: false,
			includeScore: true
		};

		this.fuseStreetMatcher = new Fuse(Array.from(this.streetNames), options);
	}

	constructor(countyname, cityname) {
		this.countyName = countyname;
		this.cityName = cityname;
		this.intersectionJSON = { features: [] }; // start with empty feature list
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

	fusetries = 0;
	fusematches = 0;
	fusememohits = 0;

	logFuseStats() {
		if (this.fusetries > 0) {
			console.log("Fuse stats for ", this.countyName, this.cityName, 'tries', this.fusetries, 'matches', this.fusematches, 'memo hits', this.fusememohits)
		}
	}

	fixName(arg) {
		if (!arg) {
			return arg;
		}
		if ("string" != typeof (arg)) {
			arg = '' + arg;
		}

		const name = '' + arg.trim();


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

	getStreets() {
		const arrStreetNames = Array.from(this.streetNames).sort();
		const obj = {countyName: this.countyName,
			 	     cityName: this.cityName,
					 streets: arrStreetNames};
		return obj;
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
				console.log("gps not found for ", a.CollisionId, a.CityName, a.PrimaryRoad, a.SecondaryRoad, s1, '/', s2)
				return false;
			}
		}
	}
}

console.log("Loading county list from ", countyCityJsonFile);
const countyJSON = getJson(countyCityJsonFile)


const mapCountyCityToIntersections = new Map();  // use county/city as key

function getIntersection(countyName, cityName) {
	const k = makeKey(countyName, cityName);

	if (!mapCountyCityToIntersections.has(k)) {
		mapCountyCityToIntersections.set(k, new clsIntersection(countyName, cityName));
	}

	const retval = mapCountyCityToIntersections.get(k)
	return retval
}
for (const obj of countyJSON) {
	const countyName = obj.countyName;

	// get the city name from it
	const fileName = 'intersections_' + fileNameIze(countyName) + '.json';
	console.log('loading intersections for ', countyName, 'from', fileName);;


	const json = getJson(intersectionsJsonDirectory + fileName);

	for (const f of json.features) {
		const cityName = f.properties.City ?? 'Unincorporated'
		const objIntersection = getIntersection(countyName, cityName);
		objIntersection.addIntersection(f);
	}
}

// now init them all

for (const [k, v] of mapCountyCityToIntersections.entries()) {
	v.init();
}

function getIntersectionForCity(countyName, cityName) {
	const k = makeKey(countyName, cityName);
	const retval = mapCountyCityToIntersections.get(k);
	return retval;
}

for (const [k, v] of mapCountyCityToIntersections.entries()) {
	console.log(k);
	// make a file name out oof k
	const locName = fileNameIze(k);
	const fileName = streetJsonDirectory + 'streets_' + locName + '.json';
	const obj = v.getStreets();
	console.log("Writing streets file ", fileName, obj.streets.length)

	writeJson(fileName, obj);

}
















console.log("bye");