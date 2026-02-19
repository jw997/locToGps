
/*
use intersection files for each county annotate with city and county props
read all street names from intersecitons file
use them to load up fuse
standardize crash report streets and then try to look up the intersections
see how many we get at each stage?

read array of location info and try to add gps

*/

'use strict';
import { count } from 'console';
import fs, { readdir } from 'fs';

import Fuse from 'fuse.js'
import { exit } from 'process';

import ntw from 'number-to-words';  // https://www.npmjs.com/package/number-to-words

const mapNumToString = new Map();

function generateOrdinals() {


	for (let i=100; i>0;i--) {
		const s1 = ntw.toOrdinal(i).toUpperCase();
		const s2 = ntw.toWordsOrdinal(i).toUpperCase();

		
		mapNumToString.set(s1,s2);
		mapNumToString.set(s2,s1);
	}

}
generateOrdinals();

for (let j = 0; j < process.argv.length; j++) {
	console.log(j + ' -> ' + (process.argv[j]));
}

const intersectionsJsonDirectory = process.argv[2] ?? './data/intersection/counties/';

const inputLocationJsonFile = process.argv[3] ?? './input/location.json';
const outputLocationJsonFile = process.argv[4] ?? './output/addedGps.json';

const countyCityJsonFile = process.argv[5] ?? "./data/county_cities.json";

//'intersections_oakland.json'.match(/intersections_(.*).json/)
//Array [ "intersections_oakland.json", "oakland" ]

/* utility functions */
function fileNameIze(str) {
	return str.replaceAll(' ', '_');

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
	const key = s1.toUpperCase().trim() + '/' + s2.toUpperCase().trim();
	return key;
}

function makePairs(array) {
	const retval = [];
	for (var i = 0; i < array.length - 1; i++) {
		for (var j = i + 1; j < array.length; j++) {
			const pair = [array[i], array[j]];
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
				this.streetNames.add(s.toUpperCase().trim()); // stdize on upcase for streets, cities, places
			}
		}

		//console.log("street name count:", this.streetNames.size);

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

	fixPrefix(street) {
		const rules = [
			[/^RT/, 'CA']


		];

		var retval = street;

		for (const [reg, rep] of rules) {
			retval = retval.replace(reg, rep);
		}

		return retval;
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

	getSynonym(street) {
		 // try all the number synonyms
		//return street.replace("9TH", "NINTH");

		for (const [k,v] of mapNumToString) {
			if (street.includes(k)) {
				const retval = street.replace(k,v);
				console.log(street, retval)
				return retval;
			}
		}
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

		const name = '' + arg.toUpperCase().trim();


		if (this.streetNames.has(name)) {
			return name
		}
		const fixedSuffix = this.fixSuffix(name);
		if (this.streetNames.has(fixedSuffix)) {
			return fixedSuffix
		}
		const synonym = this.getSynonym(fixedSuffix)
		if (this.streetNames.has(synonym)) {
			return synonym
		}
		const fixedPrefix = this.fixPrefix(name);
		if (this.streetNames.has(fixedPrefix)) {
			return fixfixedPrefixedSuffix
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
		const a = f.attributes ?? f
		if (missingGps(a)) {
			/*const aLoc = a.Accident_Location;
			const arrStreets = aLoc.split('/');
			if (arrStreets.length != 2)  {
				console.log("Cannot get streets for ", a.CollisionId, 'from', a.Accident_Location);
				return false;
			}*/
			const s1 = this.fixName(a.PrimaryRoad)//?? arrStreets[0]);
			const s2 = this.fixName(a.SecondaryRoad)//?? arrStreets[1]);

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


//const mapCityToIntersections = new Map();

//const arrFileNames = getFilesFromDirectory(intersectionsJsonDirectory, /intersections.*json/);
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
	//console.log('loading intersections for ', countyName, 'from', fileName);;


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

		const a = f.attributes ?? f;;
		total++;
		if (missingGps(a)) {
			missing++;

			// find city
			const city = a.CityName;
			const countyName = a.CountyName;

			const objIntersections = getIntersectionForCity(countyName, city);

			if (!objIntersections) {
				console.log("Intersection not found for", city);
				continue;
			}

			if (objIntersections.updateGPSFromRoads(f)) {
				matched++;
			}
			/*  fuse matcher moved to updateGPSFromRoads
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
	console.log('Total:', total, 'MissingGps:', missing, 'matched:', matched, 'Percent:', 100.0 * (1.0 - 1.0 * (missing - matched) / total));
}


/*
console.log("Loading ccrs data from", ccrsJsonFile);
const ccrsJSON = getJson(ccrsJsonFile)
console.log("ccrs count:", ccrsJSON.features.length);
countMissingGps(ccrsJSON.features);

getGPSFromRoads(ccrsJSON.features);

writeJson(outputCcrsJsonFile, ccrsJSON);
*/
function fileExists(path) {
	return fs.existsSync(path);
}

//const inputfiles = getFilesFromDirectory(ccrsJsonDirectory, 'ccrs.*json')
//for (const file of inputfiles) {
//	const ccrsJsonFile = ccrsJsonDirectory + file
//	const outputCcrsJsonFile = outputCcrsDirectory + file;

// skip existing output files
//	if (fileExists( outputCcrsJsonFile)) {
//console.log("Skipping file that already is in output folder")
//	continue;
//	}

console.log("Loading location data from", inputLocationJsonFile);
const locationJSON = getJson(inputLocationJsonFile)
console.log("location count:", locationJSON.length);
//countMissingGps(locationJSON);

getGPSFromRoads(locationJSON);
writeJson(outputLocationJsonFile, locationJSON);

for (const i of mapCountyCityToIntersections.values()) {
	i.logFuseStats();
}


console.log("bye");