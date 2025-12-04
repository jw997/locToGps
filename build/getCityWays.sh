#!/bin/bash
set -e
echo "Removing downloaded and generated files"
mkdir -p temp/output || true
mkdir output || true
rm temp/urls temp/toc.html || true
rm temp/*.csv || true;
rm temp/output/* || true;

#read city names from cities.csv
readarray -t my_array < 'cities.csv'

for CITY in "${my_array[@]}"; do
  # process the line
  echo $CITY

  
  url="'https://www.overpass-api.de/api/interpreter?data=[out:json][timeout:25];area[name=%27California%27]->.big;area[name=%27${CITY}%27]->.small;way[%27highway%27~%27^(trunk|primary|secondary|tertiary|unclassified|residential)$%27][%27name%27](area.small)(area.big)->.streets;.streets out geom;'"
  cmd="wget -O temp/city_${CITY// /_}_ways.json $url"
  echo $cmd
  eval $cmd

done
exit 0


#urlTemplate='https://services7.arcgis.com/vIHhVXjE1ToSg0Fz/arcgis/rest/services/cleaned_traffic_data/FeatureServer/0/query?f=json&maxRecordCountFactor=5&cacheHint=true&outFields=*&returnDistinctValues=true&returnGeometry=false&spatialRel=esriSpatialRelIntersects&where=(DateTime>=timestamp %27YYYY-01-01 00:00:00%27AND DateTime<timestamp %27YYYYNEXT-01-01 00:00:00%27)'
for YYYY in {2016..2025}; do
	url="'https://services7.arcgis.com/vIHhVXjE1ToSg0Fz/arcgis/rest/services/cleaned_traffic_data/FeatureServer/0/query?f=json&maxRecordCountFactor=5&cacheHint=true&outFields=*&orderByFields=DateTime&returnDistinctValues=true&returnGeometry=false&spatialRel=esriSpatialRelIntersects&where=(Date%20like%20%27${YYYY}%%%27)'"
	
	cmd="wget -O temp/tp_${YYYY}.json %27$url%27"
	echo $cmd
	#eval $cmd
done