query for ways for Berkeley, Oakland, Alameda county, California

Berkley by bbox

wget -O ways.json 'https://www.overpass-api.de/api/interpreter?data=[out:json][timeout:25][bbox:37.83975,-122.32538,37.91495,-122.21329];way["highway"~"^(trunk|primary|secondary|tertiary|unclassified|residential)$"]->.streets;.streets out geom;'

wget -O ways.json 'https://www.overpass-api.de/api/interpreter?data=[out:json][timeout:25][bbox:37.83975,-122.32538,37.91495,-122.21329];way["highway"~"^(trunk|primary|secondary|tertiary|unclassified|residential)$"]->.streets;.streets out geom;'

Oakland

wget -O ways_oakland.json 'https://www.overpass-api.de/api/interpreter?data=[out:json][timeout:25][bbox:37.698,-122.345,37.886,-122.116];way["highway"~"^(trunk|primary|secondary|tertiary|unclassified|residential)$"]->.streets;.streets out geom;'


wget -O ways_piedmont.json 'https://www.overpass-api.de/api/interpreter?data=[out:json][timeout:25][bbox:37.698,-122.345,37.886,-122.116];area[name="Alameda County"]->.big;area[name="Piedmont"]->.small;way["highway"~"^(trunk|primary|secondary|tertiary|unclassified|residential)$"]["name"](area.small)(area.big)->.streets;.streets out geom;'

wget -O ways_piedmont.json 'https://www.overpass-api.de/api/interpreter?data=[out:json][timeout:25][bbox:37.4539161,-122.3738200,37.9066896,-121.4690903];area[name="Alameda County"]->.big;area[name="Piedmont"]->.small;way["highway"~"^(trunk|primary|secondary|tertiary|unclassified|residential)$"]["name"](area.small)(area.big)->.streets;.streets out geom;'

wget -O ways_oakland.json 'https://www.overpass-api.de/api/interpreter?data=[out:json][timeout:25][bbox:37.4539161,-122.3738200,37.9066896,-121.4690903];area[name="Alameda County"]->.big;area[name="Oakland"]->.small;way["highway"~"^(trunk|primary|secondary|tertiary|unclassified|residential)$"]["name"](area.small)(area.big)->.streets;.streets out geom;'

wget -O ways_alamedacounty.json 'https://www.overpass-api.de/api/interpreter?data=[out:json][timeout:25][bbox:37.4539161,-122.3738200,37.9066896,-121.4690903];area[name="Alameda County"]->.big;area[name="Oakland"]->.small;way["highway"~"^(trunk|primary|secondary|tertiary|unclassified|residential)$"]["name"](area.big)->.streets;.streets out geom;'

boundarys state 4 county 6 city 8
nwr["admin_level"=8]["name"='Oakland']({{bbox}});

bbox for Alameda County
"37.4539161" minlon="-122.3738200" maxlat="37.9066896" maxlon="-121.4690903"/>
37.4539161,-122.3738200,37.9066896,-121.4690903



wget -O ways_berkeley.json 'https://www.overpass-api.de/api/interpreter?data=[out:json][timeout:25];area[name="California"]->.big;area[name="Berkeley"]->.small;way["highway"~"^(trunk|primary|secondary|tertiary|unclassified|residential)$"]["name"](area.small)(area.big)->.streets;.streets out geom;'

wget -O ways_alpinecounty.json 'https://www.overpass-api.de/api/interpreter?data=[out:json][timeout:25];area[name="California"]->.big;area[name="Alpine County"]->.small;way["highway"~"^(trunk|primary|secondary|tertiary|unclassified|residential)$"]["name"](area.small)(area.big)->.streets;.streets out geom;'

wget -O ways_california.json 'https://www.overpass-api.de/api/interpreter?data=[out:json][timeout:25];area[name="California"]->.big;area[name="Alpine County"]->.small;way["highway"~"^(trunk|primary|secondary|tertiary|unclassified|residential)$"]["name"](area.big)->.streets;.streets out geom;'

City List 

[out:csv ("name")] 
[timeout:45][maxsize:1073741824];
area[name="California"]->.big;
nwr["place"="city"](area.big);
nwr["place"="town"](area.big);
out;


wget -O cities.csv 'https://www.overpass-api.de/api/interpreter?data=[out:csv ("name")][timeout:45][maxsize:1073741824];area[name="California"]->.big;nwr["place"="city"](area.big);out;'


County List 
[out:csv ("county:name")] 
[timeout:45][maxsize:1073741824];
area[name="California"]->.big;
nwr["admin_level"=6]["county:name"](area.big);
out;

wget -O counties.csv 'https://www.overpass-api.de/api/interpreter?data=[out:csv ("county:name")][timeout:45][maxsize:1073741824];area[name="California"]->.big;nwr["admin_level"=6]["county:name"](area.big);out;'

