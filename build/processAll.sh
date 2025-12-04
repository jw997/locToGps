#!/bin/bash
set -e
echo "Removing  generated files"
mkdir -p output

#rm temp/urls temp/toc.html || true
#rm temp/*.csv || true;
rm temp/output/*json || true;

for year in {2016..2025}; do
  echo "check files for year ${year}"
  filename=ccrs${year}.json;
  if [ ! -f input/${filename} ]; then
    echo "Expected file input/${filename} not found" 
  fi   
done

for year in {2016..2025}; do
  echo "Processing year ${year}"
  filename=ccrs${year}.json;
  cmd="node ../js/addGps.js ../data/intersections_oakland.geojson  input/${filename}  output/${filename}"
  eval $cmd
done

echo "look for output in ouput/"
echo "bye"

