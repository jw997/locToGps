
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

const intersectionsJsonFile = process.argv[2] ?? './data/intersections_oakland.json';
const ccrsJsonFile = process.argv[3] ?? './data/ccrs2024.json';
const outputCcrsJsonFile = process.argv[4] ?? './ouput/ccrs2024.json';

function getJson(filename) {
	const str = fs.readFileSync(filename).toString();
	const obj = JSON.parse(str);
	return obj;
}

const ccrsJSON = getJson(ccrsJsonFile)
const intersectionJSON = getJson(intersectionsJsonFile);
/*
{
 "type": "FeatureCollection",
 "features": [
  {
   "type": "Feature",
   "geometry": {
	"type": "Point",
	"coordinates": [
	 -122.2427622,
	 37.8665279
	]
   },
   "properties": {
	"streets": [
	 "Dwight Way",
	 "Panoramic Way"
	]
   }
  },
  */

function truncateFloat(f,fractionDigits) {
	return parseFloat(f.toFixed(fractionDigits))
}

const mapStreetPairToGPS = new Map();
function makeKey(s1, s2) {
	const key = s1.toUpperCase().trim() + '/' + s2.toUpperCase().trim();
	return key;
}
for (const i of intersectionJSON.features) {
	const sts = i.properties.streets;
	const key = makeKey(sts[0], sts[1])
	mapStreetPairToGPS.set(key, i.geometry.coordinates);
}
const streetNames = new Set();

function addStreets(json) {
	for (const f of json.features) {
		const streets = f.properties.streets;
		for (const s of streets) {
			streetNames.add(s.toUpperCase().trim()); // stdize on upcase

		}
	}
}
addStreets(intersectionJSON);
console.log("street name count:", streetNames.size);


// create a fuse matcher for the intersections names

const options = {
	// isCaseSensitive: false,
	includeScore: true
};

// ignoreDiacritics: false,
// shouldSort: true,
// includeMatches: false,
// findAllMatches: false,
// minMatchCharLength: 1,
// location: 0,
// threshold: 0.6,
//distance: 10,
// useExtendedSearch: false,
// ignoreLocation: false,
// ignoreFieldNorm: false,
// fieldNormWeight: 1,
/*keys: [
	"title",
	"author.firstName"
]
};*/

const fuseStreetMatcher = new Fuse(Array.from(streetNames), options);

// osm streetnames do not use abbreviations like AVE, ST WY BLVD RT etc
console.log("ccrs count:", ccrsJSON.features.length);
/*
for (const s of streetNames) {
	console.log(s)
}
*/


/*

{
  "features": [
	{
	  "attributes": {
		"CollisionId": 2296060,
		"Case_ID": 2296060,
		"Primary_Collision_Factor_Code": "VC 22350",
		"Local_Report_Number": "9370-2024-00100",
		"CityName": "Oakland",
		"CCRSDateTime": "1/11/2024 4:35:00 PM",
		"NumberInjured": 2,
		"NumberKilled": 0,
		"PrimaryRoad": "I-880 N/B FROM HEGENBERGER ROAD",
		"SecondaryRoad": "HEGENBERGER ROAD OVERCROSSING",
		"Accident_Location_Offset": "175 F N",
		"Latitude": 37.741761,
		"Longitude": -122.196815,
		"Accident_Location": "I-880 N/B FROM HEGENBERGER ROAD/HEGENBERGER ROAD OVERCROSSING",
		"Hour": 16,
		"Year": 2024,
		"Date": "2024-01-11",
		"Time": "16:35:00",
		"Involved_Objects": "Police Car/Car",
		"Injury_Severity": "Possible Injury",
		"Party_at_Fault": "Driver",
		"Injury_Ages": "17/16"
	  }
	},

	*/
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
countMissingGps(ccrsJSON.features);

function fixSuffix(street) {
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

const setUnMatched = new Set();

function fixName(arg) {
	if (!arg)
	{
		return arg;
	}
	if ("string" != typeof(arg)) {
		arg = ''+arg;
	}
	
	const name = ''+arg.toUpperCase().trim();


	if (streetNames.has(name)) {
		return name
	}
	const fixed = fixSuffix(name);
	if (streetNames.has(fixed)) {
		return fixed
	}
	const results = fuseStreetMatcher.search(name, { limit: 5 });
	const FUSELIMIT = 0.5;
	if ((results.length >= 1) && (results[0].score <= FUSELIMIT)) {
		const fuseMatch = results[0].item;

		if (streetNames.has(fuseMatch)) {
			return fuseMatch;
		}
	}
	return null;

}

function getIntersection(s1, s2) {

	const k1 = makeKey(s1, s2);
	const k2 = makeKey(s2, s1);
	const i1 = mapStreetPairToGPS.get(k1);
	const i2 = mapStreetPairToGPS.get(k2);

	if (i1) {
		return i1;
	}
	if (i2) {
		return i2;
	}
	return null;
}
function getGPSFromRoads(features) {
	var total = 0, missing = 0, matched = 0;
	for (const f of features) {

		const a = f.attributes
		total++;
		if (missingGps(a)) {
			missing++;
			const s1 = fixName(a.PrimaryRoad);
			const s2 = fixName(a.SecondaryRoad);

			if (!(s1 && s2)) {
				//console.log("cant fix road names ", a.PrimaryRoad, ' ' , a.SecondaryRoad);
				continue;
			}
			// try to find matching intersection
			const gps = getIntersection(s1, s2)
			if (gps) {
				//matched++;
				//a.Latitude = gps[1]
				//a.Longitude = gps[2];

				[a.Longitude, a.Latitude] = gps;
				a.Longitude = truncateFloat( a.Longitude,6);
				a.Latitude = truncateFloat( a.Latitude,6);
				matched++;

				//	console.log( "found gps",gps, 'for' ,  s1,'/',s2)
			} else {
				//	console.log( "gps not found for ", a.CollisionId, a.PrimaryRoad, a.SecondaryRoad,  s1,'/',s2)
			}

		}
	}
	console.log('Total:', total, 'MissingGps:', missing, 'matched:', matched);
}

getGPSFromRoads(ccrsJSON.features);


// write out fixed file
function writeJson( file, obj) {
	const str = JSON.stringify(obj,null,2);

	fs.writeFileSync(file,str);
}

writeJson( outputCcrsJsonFile, ccrsJSON);


//const f1 = fixName('MARTIN LUTHER KING JR WY');

function fixNames(features) {
	var missing = 0, matched = 0;
	for (const f of features) {

		const a = f.attributes
		if (missingGps(a)) {
			missing++;
			const primary = a.SecondaryRoad.toUpperCase().trim();
			const fixed = fixName(primary);
			if (fixed) {
				matched++;
			} else {

				console.log("FAILED MATCH ", primary);
			}
		}
	}
	console.log("MissingGps:", missing, " matched:", matched);
}


//fixNames(ccrsJSON.features);

function lookupNames(features) {
	var missing = 0, matched = 0;
	for (const f of features) {

		const a = f.attributes
		if (missingGps(a)) {
			missing++;
			const primary = a.PrimaryRoad.toUpperCase().trim();
			const fixed = fixSuffix(primary);

			if (streetNames.has(primary)) {
				matched++;
				continue;
			}
			if (streetNames.has(fixed)) {
				matched++;
				continue;
			}
			const results = fuseStreetMatcher.search(primary, { limit: 5 });
			const FUSELIMIT = 0.5;
			if (results[0].score <= FUSELIMIT) {
				matched++;
			}
			else {
				setUnMatched.add(primary);

				/// try fuse fuzzy match
				//const results = fuseStreetMatcher.search(primary, { limit: 5 });
				//console.log("", pattern, " ", results[0].item, results[0].score);
				console.log("FAILED MATCH ", primary, ' ', fixed, ' ', results[0].item, ' ', results[0].score);
			}
		}
	}
	console.log("MissingGps:", missing, " matched:", matched);
}
//lookupNames(ccrsJSON.features)

function dumpSet(name, set) {
	console.log("Set: ", name);
	for (const e of set) {
		console.log(e);
	}
}
//dumpSet("unmatched", setUnMatched)
