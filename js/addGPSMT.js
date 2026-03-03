import process from 'process';


import {
	Worker, MessageChannel, MessagePort, isMainThread, parentPort, setEnvironmentData
} from 'node:worker_threads';

import fs /*, { readdir } */ from 'fs';
import { count } from 'console';
const start = Date.now();

const inputLocationJsonFile = process.argv[2] ?? './test/addOneGps/location.json';  // 10 things
const outputLocationJsonFile = process.argv[3] ?? './output/addedGpsMT.json';
const intersectionsJsonDirectory = process.argv[4] ?? '../gpsaddr/data/intersections/';
const countyCityJsonFile = process.argv[5] ?? "./data/county_cities.json";

if (isMainThread) {
	setEnvironmentData('intersectionsJsonDirectory', intersectionsJsonDirectory);
	setEnvironmentData('inputLocationJsonFile', inputLocationJsonFile);
	setEnvironmentData('outputLocationJsonFile', outputLocationJsonFile);
	setEnvironmentData('countyCityJsonFile', countyCityJsonFile);
}

function writeJson(file, obj) {
	const str = JSON.stringify(obj, null, 2);

	fs.writeFileSync(file, str);
}
function getJson(filename) {
	const str = fs.readFileSync(filename).toString();
	const obj = JSON.parse(str);
	return obj;
}
const countyJSON = getJson(countyCityJsonFile)
const arrCounties = [];
for (const obj of countyJSON) {
	const countyName = obj.countyName;
	arrCounties.push(countyName);
}

function chunkArray(arr, chunkSize) {

	const n = Math.ceil(arr.length / chunkSize)

	if (n > 1) {
		console.log("chunking")
	}

	let start = 0
	let end = chunkSize;

	const arrChunks = []
	while (start < arr.length) {
		arrChunks.push( arr.slice(start, end));
		start += chunkSize;
		end += chunkSize
	}
	return arrChunks;
	
}
// Function to create a new worker
function runWorker(countyData) {

	const countyName = countyData.countyName;
	if (!arrCounties.includes(countyName)) {
		throw "unexpected county", countyName
	}

	const locations = countyData.locations;
	const chunk = countyData.chunk;

	return new Promise((resolve, reject) => {
		// Create a new worker
		console.log("Starting worker for ", countyName, 'chunk', chunk, 'locations:', locations.length);
		const worker = new Worker('./js/workerCounty.js', { name: countyName, workerData: countyData });

		function handleMessage(result) {

			// start new worker for another county
			const nextCounty = arrStartOrder.shift();
			if (nextCounty) {
				arrWorkers.push(runWorker(nextCounty));
			}
			resolve(result)
		}

		// Listen for messages from the worker
		//worker.on('message', resolve);
		worker.on('message', handleMessage);

		// Listen for errors
		worker.on('error', reject);

		// Listen for worker exit
		worker.on('exit', (code) => {
			if (code !== 0) {
				reject(new Error(`Worker stopped with exit code ${code}`));
			}
		});
	});
}


// Run the worker
/*
async function run() {
	try {
		// Send data to the worker and get the result
		const result = await runWorker('Alameda County;Contra Costa County;San Francisco;Los Angeles County');  // could send list of county names??
		console.log('Worker result:', result);
	} catch (err) {
		console.error('Worker error:', err);
	}
}

run().catch(err => console.error(err));
*/
const MAXWORKERS = 4;
// fill an array with county names
// start up to MAXWORKERS
// as they finish, in alphabetical order, start another
// when they have all finished, exit
//let done=false;

const arrWorkers = [];

// read the location.json, group by county and order the counties by amouunt of data
// start with Los angelees....

const locationJSON = getJson(inputLocationJsonFile);
let groups = Object.groupBy(locationJSON, (x) => x.CountyName);

const chunkSize = Math.ceil(Math.max(locationJSON.length / 10, 100))



// put them in a map
//const mapCountyToLocationArray = new Map();
const arrCountyLocations = [];

for (const county of Object.getOwnPropertyNames(groups).sort()) {
	const chunks = chunkArray( groups[county], chunkSize);

	//mapCountyToLocationArray.set(county, groups[county])

	for (let n=0; n< chunks.length; n++) {
		arrCountyLocations.push({ countyName: county, chunk:n, locations:chunks[n] })
	}
}
const arrStartOrder = arrCountyLocations //.sort((a, b) => (b.locations.length - a.locations.length));

// make sure all county names are  real
for (const o of arrStartOrder) {
	if (!arrCounties.includes(o.countyName)) {
		throw "Unexpected County in location data ", o.countyName
	}
}

// start MAXWORKERS
let nWorkers = 0;
while (nWorkers < Math.min(MAXWORKERS, arrStartOrder.length)) {
	const prom = runWorker(arrStartOrder.shift());
	arrWorkers.push(prom);
	nWorkers++;
}

const arrWorkerData = [] // collect worker responses

while (arrWorkers.length > 0) {
	const prom = arrWorkers.shift();

	const result = await prom;
	arrWorkerData.push(result)
	console.log("Finished county:", result.countyName, 'chunk:', result.chunk, result.locations.length)
	/*
		const nextCounty = arrCounties.shift();
		if (nextCounty) {
			arrWorkers.push(runWorker(nextCounty));
		}
	*/
}
/*
function stringCompare(a, b) {
	if (a < b) return -1;
	if (a > b) return 1;
	return 0;
}
function resultCompare(a,b) {
	// compare by countyName string, chunk number

	const s = stringCompare(a.countyName, b.countyName);
	if (s!=0) {
		return s;
	}
	return a.chunk - b.chunk;
}
// now sort it by county names and chunk numbers and join it
arrWorkerData.sort(
	(a, b) =>
		resultCompare(a, b))

*/
// accumulate data in original file order
const arrOutput = []
for (const arr of arrWorkerData) {
	arrOutput.push( ...arr.locations)
}
console.log("All workers done")


/*
const arrWorkers = [];
for (const obj of countyJSON) {
	const countyName = obj.countyName;
	// start worker for this county
	const prom = runWorker(countyName);
	arrWorkers.push(prom);
}

// wait for all workers, and assemble all their results in an array
const arrWorkerData = []
for (const prom of arrWorkers) {
	const result = await prom;
	arrWorkerData.push( ...result.locations)
	console.log( "Finished county:", result.receivedData, result.locations.length)
}
*/

writeJson(outputLocationJsonFile, arrOutput)

// count missing gps
let missing = 0;
for (const arr of arrOutput) {
	if (!arr.Latitude && !arr.Longitude) {
		missing++;
	}
}
const total = arrOutput.length
console.log('Total:', total, 'MissingGps:', missing, 'Percent:', 100.0 * ( (total - missing) / total));

// compute some stats


const msElepase = Date.now() - start;
const secondsElapsed = msElepase / 1000.0
console.log(`Time elapsed: ${secondsElapsed} seconds`);
