import process from 'process';


import {
	Worker, MessageChannel, MessagePort, isMainThread, parentPort, setEnvironmentData
} from 'node:worker_threads';

import fs /*, { readdir } */ from 'fs';
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

function rfunc(arg) {
	console.log ("rfunc called", arg)
}
// Function to create a new worker
function runWorker(workerData) {
	return new Promise((resolve, reject) => {
		// Create a new worker
		const worker = new Worker('./js/workerCounty.js', { workerData });

		function handleMessage(result) {
			
			// start new worker for another county
			const nextCounty = arrCounties.shift();
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
const arrCounties = [];
const arrWorkers = [];

for (const obj of countyJSON) {
	const countyName = obj.countyName;
	arrCounties.push(countyName);
}

// start MAXWORKERS
let nWorkers = 0;
while (nWorkers < Math.min(MAXWORKERS, arrCounties.length)) {
	const prom = runWorker(arrCounties.shift());
	arrWorkers.push(prom);
	nWorkers++;
}

const arrWorkerData = [] // collect worker responses

while (arrWorkers.length > 0) { 
	const prom = arrWorkers.shift();

	const result = await prom;
	arrWorkerData.push(...result.locations)
	console.log("Finished county:", result.receivedData, result.locations.length)
/*
	const nextCounty = arrCounties.shift();
	if (nextCounty) {
	    arrWorkers.push(runWorker(nextCounty));
	}*/
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

writeJson(outputLocationJsonFile, arrWorkerData)

const msElepase = Date.now() - start;
const secondsElapsed = msElepase / 1000.0
console.log(`Time elapsed: ${secondsElapsed} seconds`);
