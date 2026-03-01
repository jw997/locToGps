
/*
use intersection files for each county annotate with city and county props
read all street names from intersecitons file
use them to load up fuse
standardize crash report streets and then try to look up the intersections
see how many we get at each stage?

read array of location info and try to add gps

*/

'use strict';

import fs /*, { readdir } */ from 'fs';

import Fuse from 'fuse.js'
import process from 'process';

import ntw from 'number-to-words';  // https://www.npmjs.com/package/number-to-words


import {
	Worker, MessageChannel, MessagePort, isMainThread, parentPort, getEnvironmentData, workerData
} from 'node:worker_threads';


const start = Date.now();


const SEMICOLON = ';'

const mapNumToString = new Map();

function generateOrdinals() {


	for (let i = 20; i > 0; i--) {
		const s1 = ntw.toOrdinal(i).toUpperCase();
		const s2 = ntw.toWordsOrdinal(i).toUpperCase();


		mapNumToString.set(s1, s2);
		mapNumToString.set(s2, s1);
	}

}
generateOrdinals();

for (let j = 0; j < process.argv.length; j++) {
	//	console.log(j + ' -> ' + (process.argv[j]));
}

/* get these commnad line values from the worker env instead of the command line
*/


const intersectionsJsonDirectory = getEnvironmentData('intersectionsJsonDirectory');
const inputLocationJsonFile = getEnvironmentData('inputLocationJsonFile');
const outputLocationJsonFile = getEnvironmentData('outputLocationJsonFile');
const countyCityJsonFile = getEnvironmentData('countyCityJsonFile');


//const intersectionsJsonDirectory = process.argv[2] ?? './data/intersection/counties/';

//const inputLocationJsonFile = process.argv[3] ?? './input/location.json';
//const outputLocationJsonFile = process.argv[4] ?? './output/addedGps.json';

//const countyCityJsonFile = process.argv[5] ?? "./data/county_cities.json";

//'intersections_oakland.json'.match(/intersections_(.*).json/)
//Array [ "intersections_oakland.json", "oakland" ]

/* utility functions */
function fileNameIze(str) {
	return str.replaceAll(' ', '_');

}
/*
function getFilesFromDirectory(dirName, regex) {
	const files = fs.readdirSync(dirName);
	const retval = [];
	for (const f of files) {
		if (!regex || f.match(regex)) {
			retval.push(f);
		}
	}
	return retval;
} */

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

function fileExists(path) {
	return fs.existsSync(path);
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
function makeOrderedKey(s1Arg, s2Arg) {
	const s1 = s1Arg.toUpperCase().trim();
	const s2 = s2Arg.toUpperCase().trim();

	if (s1 <= s2) {
		const key = s1 + '/' + s2;
		return key;
	} else {

		const key = s2 + '/' + s1;
		return key;

	}
}
/* TODO hangle semicolon separated streets
"streets": [
	"Lincoln Street",
	"Oroville Dam Boulevard East;CA 162"
   ],
   */
function makePairs(array) {
	const retval = [];
	for (var i = 0; i < array.length - 1; i++) {
		for (var j = i + 1; j < array.length; j++) {

			for (const s1 of array[i].split(SEMICOLON)) {
				for (const s2 of array[j].split(SEMICOLON)) {
					const pair = [s1, s2];
					retval.push(pair)
				}
			}

		}
	}

	return retval;

}

function memoGet(map, key) {
	return map.get(key)
}

function memoSave(map, key, val) {
	map.set(key, val)
}
// GLOBAL STATS

var ngetIntersectionApprox = 0;
var ngetIntersection = 0;

class clsIntersection {
	fileName; // not used
	cityName;
	countyName;
	streetNames = new Set();  // filled in after all calls to addIntersection
	mapStreetPairToGPS = new Map();  // key is a/b where a <= b alphabetically
	intersectionJSON; // filled in by calling addIntersection repeatedly
	initDone = false;

	addIntersection(f) {
		this.intersectionJSON.features.push(f);
	}

	fuseStreetMatcher;
	fuseMemo = new Map();

	init() { // call after adding all intersections
		if (this.initDone) {
			return;
		}
		this.initDone = true;
		for (const i of this.intersectionJSON.features) {
			const streets = i.properties.streets;
			const pairs = makePairs(streets);  // streets may have more than 2 entries
			for (const p of pairs) {
				const key = makeOrderedKey(p[0], p[1])
				this.mapStreetPairToGPS.set(key, i.geometry.coordinates);
			}
			for (const s of streets) {
				for (const sp of s.split(SEMICOLON)) { // todo 1ST NAME IS REAL, OTHERS ARE SYNONYMS  	Second Street;2nd Street
					this.streetNames.add(sp.toUpperCase().trim()); // stdize on upcase for streets, cities, places
				}
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

	fixPrefix(street) {  // for SR RT CA highways??
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
			[/ PKWY$/, ' PARKWAY'],  // TODO add PL PLACE? LN LANE


		];

		var retval = street;

		for (const [reg, rep] of rules) {
			retval = retval.replace(reg, rep);
		}

		return retval;
	}

	addPrefixes(street) {
		// remove any suffix
		// add all possible
		// filter for in street list for this city
		// if unique, return that
		const rules = [
			[/^NORTH /, ''],
			[/^SOUTH /, ''],
			[/^EAST /, ''],
			[/^WEST /, ''],


		];
		var baseName = street;
		for (const [reg, rep] of rules) {
			if (street.match(reg)) {
				baseName = street.replace(reg, rep);
				break;
			}
		}
		const retval = []

		const prefixes = [
			'NORTH ',
			'SOUTH ',
			'EAST ',
			'WEST '
		]

		for (const prefix of prefixes) {
			retval.push(prefix + baseName)
		}
		return retval;

	}

	addSuffixes(street) {
		// remove any suffix
		// add all possible
		// filter for in street list for this city
		// if unique, return that
		const rules = [
			[/ AVE$/, ''],
			[/ AV$/, ''],
			[/ AVENUE$/, ''],
			[/ ST$/, ''],
			[/ STREET$/, ''],
			[/ RD$/, ''],
			[/ ROAD$/, ''],
			[/ BL$/, ''],
			[/ BOULEVARD$/, ''],
			[/ DR$/, ''],
			[/ DRIVE$/, ''],
			[/ WY$/, ''],
			[/ WAY$/, ''],
			[/ CT$/, ''],
			[/ COURT$/, ''],
			[/ PKWY$/, ''],
			[/ PARKWAY$/, ''],

		];
		var baseName = street;
		for (const [reg, rep] of rules) {
			if (street.match(reg)) {
				baseName = street.replace(reg, rep);
				break;
			}
		}
		const retval = []

		const suffixes = [
			' AVENUE',
			' STREET',
			' ROAD',
			' BOULEVARD',
			' DRIVE',
			' COURT',
			' PARKWAY',
			' PLACE'
		]

		for (const suffix of suffixes) {
			retval.push(baseName + suffix)
		}
		return retval;
	}

	getSynonym(street) {
		// try all the number synonyms
		// only match at word break to avoid 35TH -> 3FIFTH 
		//return street.replace("9TH", "NINTH");

		for (const [k, v] of mapNumToString) {
			if (street.includes(k)) {
				const rk = RegExp('\\b' + k)
				const retval = street.replace(rk, v);
				//console.log(street, retval)
				return retval;
			}
		}
	}

	fusetries = 0;
	fusematches = 0;
	fusememohits = 0;

	logFuseStats() {
		if (this.fusetries > 0) {
			//console.log("Fuse stats for ", this.countyName, this.cityName, 'tries', this.fusetries, 'matches', this.fusematches, 'memo hits', this.fusememohits)
		}
	}

	arrPush(arr, item) {
		if (!arr.includes(item)) {
			arr.push(item)
		}
	}

	fixName(arg) { // return an array of possible equivalent names in this city
		if (!arg) {
			return arg;
		}

		if ("string" != typeof (arg)) {
			arg = '' + arg;
		}

		const name = '' + arg.toUpperCase().trim();

		const retval = [];

		if (this.streetNames.has(name)) {
			//retval.push(name)
			this.arrPush(retval, name)
		}
		const fixedSuffix = this.fixSuffix(name);
		if (this.streetNames.has(fixedSuffix)) {
			//retval.push(fixedSuffix);
			this.arrPush(retval, fixedSuffix)
		}
		const synonym = this.getSynonym(fixedSuffix) // TODO after putting the right synonyms, try the right suffixes??
		if (this.streetNames.has(synonym)) {
			//retval.push(synonym);
			this.arrPush(retval, synonym)

		}
		const fixedPrefix = this.fixPrefix(name);
		if (this.streetNames.has(fixedPrefix)) {
			//retval.push(fixedPrefix);
			this.arrPush(retval, fixedPrefix)
		}

		const allSuffixes = this.addSuffixes(name).filter((x) => this.streetNames.has(x));
		for (const s of allSuffixes) {
			//retval.push(s)
			this.arrPush(retval, s)

		}

		const allPrefixes = this.addPrefixes(name).filter((x) => this.streetNames.has(x));
		for (const s of allPrefixes) {
			//retval.push(s)
			this.arrPush(retval, s)
		}

		/* TURN OFF FUSE */
		if (retval.length == 0) {
			this.fusetries++;

			// try the memo first
			const mem = this.fuseMemo.get(name);
			if (mem != undefined) {
				this.fusememohits++;
				// retval.push(mem);
				this.arrPush(retval, mem)
			} else {

				const allresults = this.fuseStreetMatcher.search(name, { limit: 5 });
				const FUSELIMIT = 0.5;

				const results = allresults.filter((r) => (r.score <= FUSELIMIT));

				for (const res of results) {
					const fuseMatch = res.item;

					if (this.streetNames.has(fuseMatch)) {
						this.fusematches++;

						//retval.push(fuseMatch);
						this.arrPush(retval, fuseMatch)

						if (results.length == 1) {
							this.fuseMemo.set(name, fuseMatch)
						}
					}
				}
				if (results.length == 0) {
					this.fuseMemo.set(name, null)
				}

			}
		}

		return retval;

	}

	getIntersection(s1, s2) {
		const k1 = makeOrderedKey(s1, s2);
		const i1 = this.mapStreetPairToGPS.get(k1);

		if (i1) {
			return i1;
		}
		/*	const k2 = makeKey(s2, s1);
			const i2 = this.mapStreetPairToGPS.get(k2);
	
			if (i2) {
				return i2;
			}*/
		return null;
	}

	getIntersectionApprox(b1Arg, b2Arg) {

		// they are upcase and trimed, figure out which is first
		// alphabawetical order of base name might be wrong if there are prefixes
		const [b1, b2] = (b1Arg < b2Arg) ? [b1Arg, b2Arg] : [b2Arg, b1Arg];


		// const re = /(b1.*\/.*b2)|(b2.*\/.*b1)/
		//const regExpSTr = `(${b1}.*\/${b2})|(${b2}.*\/${b1})`


		const reb1 = RegExp.escape(b1); //    b1.replaceAll(reSpecChar, '.')   //('(','.').replaceAll(')','.').replaceAll('+','.');
		const reb2 = RegExp.escape(b2);//b2.replaceAll(reSpecChar, '.') // '(','.').replaceAll(')','.').replaceAll('+','.');

		//	const regExpStr = '((\\b' + reb1 + '.*\/.*\\b' + reb2 + ')|(.*\\b' + reb2 + '.*\/.*\\b' + reb1 + '))';
		const regExpStr = '((\\b' + reb1 + '.*/.*\\b' + reb2 + '))';

		// const regExpStrReverse = '((\\b' + reb2 + '.*/.*\\b' + reb1 + '))';

		const re = new RegExp(regExpStr);
		//console.log(re)

		let matchingKeysIter = this.mapStreetPairToGPS.keys().filter((k) => k.match(re))
		let result = matchingKeysIter.next();

		// if first match gets nothign, try reverser order
		if (result.done) {
			const regExpStrReverse = '((\\b' + reb2 + '.*/.*\\b' + reb1 + '))';
			const reRev = new RegExp(regExpStrReverse);
			matchingKeysIter = this.mapStreetPairToGPS.keys().filter((k) => k.match(reRev))
			result = matchingKeysIter.next();
		}
		let matchCount = 0;
		let mat;
		while (!result.done) {
			matchCount++;
			mat = result.value;
			//console.log(mat)
			//console.log('Match', matchingKeys.length, 'First Match:', this.mapStreetPairToGPS.get(matchingKeys[0]))
			result = matchingKeysIter.next();
		}
		if (matchCount == 1) {
			return this.mapStreetPairToGPS.get(mat);
		}
		if (matchCount > 1) {
			//console.log("Too many matches:", matchCount)
		}
	}

	mapMemoBaseName = new Map();

	baseName(streetArg) {
		/(^NORTH |^SOUTH |^EAST |^WEST |^N |^S |^E |^W )?(.+?)\b(STREET$|ST$|ROAD$)?/

		const street = streetArg.toUpperCase().trim();

		const memoVal = memoGet(this.mapMemoBaseName, street);
		if (memoVal) {
			return memoVal;
		}

		// prefix is news
		// suffix is road type
		// base name is in middle
		//const re = /(^NORTH |^SOUTH |^EAST |^WEST )?(.+?)\b(STREET$|ST$|ROAD$)?/;
		//const re=/^(NORTH\b|SOUTH\b|EAST\b|WEST\b)?(\w+?)\b(AVE|AV|AVENUE|STREET|ST|RD|ROAD|BL|BLVD|BOULEVARD|DR|DRIVE|WY|WAY|CT|COURT|PKWY|PARKWAY)?$/
		const re = /^(NORTH\b|SOUTH\b|EAST\b|WEST\b|N\b|S\b|E\b|W\b)?([\w/\- ]+?)\b(AVE|AV|AVENUE|LN|LANE|PL|PLACE|STREET|ST|RD|ROAD|BL|BLVD|BOULEVARD|DR|DRIVE|WY|WAY|CT|COURT|HWY|HIGHWAY|PKWY|PARKWAY)?$/
		//re=/^(NORTH\b|SOUTH\b|EAST\b|WEST\b)?(.+?)\b(AVE|AV|AVENUE|STREET|ST|RD|ROAD|BL|BLVD|BOULEVARD|DR|DRIVE|WY|WAY|CT|COURT|PKWY|PARKWAY)?$/

		const parts = street.trim().toUpperCase().match(re);
		if (!parts || parts[2].trim() == '') {
			//console.log('Street:', street, 'No base name reg ex match', street.toUpperCase());
			memoSave(this.mapMemoBaseName, street)

			return street;

		}

		if (parts.length == 4) {
			//console.log('Street:', street, 'Prefix:', parts[1], 'Base:', parts[2], 'Suffix:', parts[3])
			// did we find a base name?
			if (parts[2]) {
				const retval = parts[2].trim();
				memoSave(this.mapMemoBaseName, retval)

				return retval;


			}
		} else {
			//console.log(parts);
		}




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
			const bp = this.baseName(a.PrimaryRoad);
			const bs = this.baseName(a.SecondaryRoad);

			let gps = this.getIntersectionApprox(bp, bs)

			if (gps) {
				ngetIntersectionApprox++;
				//matched++;
				//a.Latitude = gps[1]
				//a.Longitude = gps[2];

				[a.Longitude, a.Latitude] = gps;
				a.Longitude = truncateFloat(a.Longitude, 6);
				a.Latitude = truncateFloat(a.Latitude, 6);
				return true;

				//	console.log( "found gps",gps, 'for' ,  s1,'/',s2)
			}
			gps = this.getIntersectionApprox(bp.slice(0, 5), bs.slice(0, 5));
			if (gps) {
				ngetIntersectionApprox++;
				//matched++;
				//a.Latitude = gps[1]
				//a.Longitude = gps[2];

				[a.Longitude, a.Latitude] = gps;
				a.Longitude = truncateFloat(a.Longitude, 6);
				a.Latitude = truncateFloat(a.Latitude, 6);
				return true;

				//	console.log( "found gps",gps, 'for' ,  s1,'/',s2)
			}


			const arr1 = this.fixName(a.PrimaryRoad)//?? arrStreets[0]);
			const arr2 = this.fixName(a.SecondaryRoad)//?? arrStreets[1]);

			if ((arr1.length == 0) || (arr2.length == 0)) {
				//console.log("cant fix road names ", a.PrimaryRoad, ' ' , a.SecondaryRoad);
				return false;
			}
			for (const s1 of arr1) {
				for (const s2 of arr2) {
					const gps = this.getIntersection(s1, s2)
					if (gps) {
						ngetIntersection++;
						//matched++;
						//a.Latitude = gps[1]
						//a.Longitude = gps[2];

						[a.Longitude, a.Latitude] = gps;
						a.Longitude = truncateFloat(a.Longitude, 6);
						a.Latitude = truncateFloat(a.Latitude, 6);
						return true;

						//	console.log( "found gps",gps, 'for' ,  s1,'/',s2)
					}
				}
				// try to find matching intersection
			}

			//console.log("gps not found for ", a.CityName, a.PrimaryRoad, a.SecondaryRoad, arr1, '/', arr2)
			return false;

		}
	}
}

//console.log("Loading county list from ", countyCityJsonFile);
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


/* Only init counties when needed

for (const obj of countyJSON) {
	const countyName = obj.countyName;

	// get the city name from it
	const fileName = 'intersections_' + fileNameIze(countyName) + '.json';
	//console.log('loading intersections for ', countyName, 'from', fileName);;

	const json = getJson(intersectionsJsonDirectory + fileName);

	for (const f of json.features) {
		// newer intersection format is from osm-intersections is using cityName instead of City
		const cityName = f.properties.City ?? f.properties.cityName ?? 'Unincorporated'
		const objIntersection = getIntersection(countyName, cityName);
		objIntersection.addIntersection(f);
	}
}

 */

const setCountiesInited = new Set(); // of county names
function initCounty(countyName) {
	if (setCountiesInited.has(countyName)) {
		return;
	}

	// get the city name from it
	const fileName = 'intersections_' + fileNameIze(countyName) + '.json';
	//console.log('loading intersections for ', countyName, 'from', fileName);;

	const json = getJson(intersectionsJsonDirectory + fileName);

	const setObjsToInit = new Set();

	for (const f of json.features) {
		// newer intersection format is from osm-intersections is using cityName instead of City
		const cityName = f.properties.City ?? f.properties.cityName ?? 'Unincorporated'
		const objIntersection = getIntersection(countyName, cityName);
		setObjsToInit.add(objIntersection);
		objIntersection.addIntersection(f);
	}

	for (const obj of setObjsToInit) {
		obj.init();
	}
	setCountiesInited.add(countyName);  // only init this county one time
}



function getIntersectionForCity(countyName, cityName) {
	const k = makeKey(countyName, cityName);
	const retval = mapCountyCityToIntersections.get(k);
	return retval;
}

function getGPSFromRoads(features) {
	var total = 0, missing = 0, matched = 0;
	let itemCount = 0;
	for (const f of features) {
		itemCount++;
		const a = f.attributes ?? f;;
		total++;
		if (missingGps(a)) {
			missing++;

			// find city
			const city = a.CityName;
			const countyName = a.CountyName;

			a.PrimaryRoad = '' + a.PrimaryRoad;
			a.SecondaryRoad = '' + a.SecondaryRoad;

			const objIntersections = getIntersectionForCity(countyName, city);

			if (!objIntersections) {
				//console.log("Intersection not found for ", city);
				continue;
			}

			if (objIntersections.updateGPSFromRoads(f)) {
				matched++;
			} else {
				//console.log("Item ", itemCount, ' not matched', a)
			}


		}
	}
	//	console.log('Total:', total, 'MissingGps:', missing, 'matched:', matched, 'Percent:', 100.0 * (1.0 - 1.0 * (missing - matched) / total));
	//	console.log('match type:', ngetIntersectionApprox, ngetIntersection);
}



// now init them all

//for (const [k, v] of mapCountyCityToIntersections.entries()) {
/*	for (const v of mapCountyCityToIntersections.values()) {
		v.init();
	}
*/
/* when the main thread sends a message saying what county to process
init that county
read thruoght the location json and for each entry that has that countyName
process it
when done, send the results back in a message to the main thread
*/

function handleMessageCounty(countyName) {

}

console.log("worker started for "  , workerData.CountyName);
const arrCountyName = workerData.CountyName.split(SEMICOLON);
for (const countyName of arrCountyName) {
	initCounty(countyName);
}

//console.log("Loading location data from", inputLocationJsonFile);

function getLocationsForCounty(inputLocationJsonFile, arrCountyName) {
	const locationJSON = getJson(inputLocationJsonFile)
	//console.log("location count:", locationJSON.length);

	// filter matching counties
	const setCounties = new Set(arrCountyName);

	const locations = locationJSON.filter((x) => (setCounties.has(x.CountyName)));
	return locations;

}
// const locations = getLocationsForCounty(inputLocationJsonFile,  arrCountyName)
const locations = workerData.locations;
//const locationJSON = getJson(inputLocationJsonFile)
//console.log("location count:", locationJSON.length);

// filter matching counties
//const setCounties = new Set(arrCountyName);

//const locations = locationJSON.filter( (x) => (setCounties.has( x.CountyName)));




//countMissingGps(locationJSON);



getGPSFromRoads(locations);

// Send the result back to the main thread
parentPort.postMessage({
	receivedData: workerData.CountyName,
	locations: locations
});


// send updated locations to main thread

//writeJson(outputLocationJsonFile, locationJSON);

for (const i of mapCountyCityToIntersections.values()) {
	//	i.logFuseStats();
}


//console.log("bye");

//console.log(`Time elapsed: ${Date.now() - start} ms`);