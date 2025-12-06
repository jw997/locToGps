
/*
read boundaries of California counties and citys downloaded from osm-boundaries
and figure out which cities are in which counties
*/

'use strict';
import { count } from 'console';
import fs from 'fs';
import turf from '@turf/turf';

import { exit } from 'process';

//const result = turf.pointsWithinPolygon();

for (let j = 0; j < process.argv.length; j++) {
	console.log(j + ' -> ' + (process.argv[j]));
}

const osmboundaryFile = './data/osm-boundaries/CaliforniaAndCountiesAndCities.geojson';


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



console.log("Loadding boundary data from", osmboundaryFile);
const boundaryJSON = getJson(osmboundaryFile);

// put all the counties and sf in a map


function makeTurfFromFeature(geometry) {

	var pt = turf.point([-122.2788, 37.847100]);

	var feature = turf.feature(geometry);


	const bInside = turf.inside(pt, feature);

	if (bInside) {
		console.log("Contains Berkeley");
	}

	return feature;
}
const mapCountyToBoundary = new Map();
const mapCountyToCities = new Map();

for (const b of boundaryJSON.features) {
	const name = b.properties.name;
	
	if (name.includes("County") || name=='San Francisco') {
		console.log( "Found county ", name)
		
		const turfFeature = makeTurfFromFeature(b.geometry)
		mapCountyToBoundary.set(name, turfFeature);
		mapCountyToCities.set(name, new Set());
	}
}

for (const b of boundaryJSON.features) {
	const name = b.properties.name;
	
	if (!name.includes("County") &&  name!='San Francisco') {
		console.log( "Found city ", name)
		const cityFeature = makeTurfFromFeature(b.geometry);

		var center = turf.centerOfMass(cityFeature);
		var found = false
		for ( const [k,v] of mapCountyToBoundary.entries()) {

			const bInside = turf.inside(center, v);

			if (bInside) {
				console.log('',k,'contains',name);
				found=true
				const s = mapCountyToCities.get(k);
				s.add(name);
			}
		}
		if (!found) {
			console.log("no county found for", name)
		}
		
	}
}

class CountyCities {
	countyName; // string
	cityNames; // array of strings
}

const countyArray = [];
for (const [k,v] of mapCountyToCities.entries()) {
	const obj = new CountyCities;
	obj.countyName = k;
	obj.cityNames = Array.from( mapCountyToCities.get(k));
	countyArray.push(obj)
}

// write to file

writeJson( './data/county_cities.json', countyArray);

console.log("bye");