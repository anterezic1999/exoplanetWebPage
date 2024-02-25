import * as THREE from 'three';
import { OrbitControls } from './three.js-master/examples/jsm/controls/OrbitControls.js';

var clock = new THREE.Clock();
let camera, controls;
let globalSpeed = 1;
let stars = {};
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

let clickStartTime = 0;
const clickDurationThreshold = 200;

function getColorFromSpectralType(spectralType) {
    const spectralColors = {
        'O': '#9bb0ff', // Blue
        'B': '#aabfff', // Blue to blue-white
        'A': '#cad7ff', // White to blue-white
        'F': '#f8f7ff', // White
        'G': '#fff4ea', // Yellow-white to yellow
        'K': '#ffd2a1', // Orange to red-orange
        'M': '#ffcc6f', // Red
        'L': '#ffcc6f', // Cooler than M, but still red.
        'T': '#ffcc6f', // Cooler than L, but still red.
        'W': '#9bb0ff', // Wolf-Rayet stars are extremely hot.
        'D': '#f8f7ff'  // White dwarfs are hot, but visually can appear similar to F-type stars
    };

    const firstLetter = spectralType ? spectralType.charAt(0) : 'G';
    return spectralColors[firstLetter] || spectralColors['G'];
}

function calculateEffectiveTemperature(T_star, R_star, semi_major_axis_m) {
    const sigma = 5.67e-8; // Stefan-Boltzmann constant in W m^-2 K^-4

    // Calculate the luminosity of the star
    const L_star = 4 * Math.PI * R_star**2 * sigma * T_star**4;

    // Calculate effective temperature of the planet
    const T_eff = Math.pow((L_star * (1 - 0.3)) / (16 * Math.PI * sigma * semi_major_axis_m**2), 0.25);

    return T_eff;
}

function getPlanetColor(temperature) {
    const coldThreshold = 180; 
    const habitableLow = 263; 
    const habitableHigh = 353;
    const hotThreshold = 410;
    const scorchingThreshold = 1010;

    const coldColor = { r: 0, g: 0, b: 255 }; // Blue
    const habitableColor = { r: 0, g: 255, b: 0 }; // Green
    const hotColor = { r: 255, g: 0, b: 0 }; // Red
    const warmColor = { r: 255, g: 255, b: 0 }; // Yellow
    const pureheatColor = { r: 255, g: 255, b: 255 }; //White

    function interpolateColor(color1, color2, factor) {
        const result = {
            r: Math.round(color1.r + factor * (color2.r - color1.r)),
            g: Math.round(color1.g + factor * (color2.g - color1.g)),
            b: Math.round(color1.b + factor * (color2.b - color1.b))
        };
        return `rgb(${result.r}, ${result.g}, ${result.b})`;
    }

    // Determine color based on temperature
    if (temperature <= coldThreshold) {
        return `rgb(${coldColor.r}, ${coldColor.g}, ${coldColor.b})`;
    } else if (temperature < habitableLow) {
        let factor = (temperature - coldThreshold) / (habitableLow - coldThreshold);
        return interpolateColor(coldColor, habitableColor, factor);
    } else if (temperature <= habitableHigh) {
        return `rgb(${habitableColor.r}, ${habitableColor.g}, ${habitableColor.b})`;
    } else if (temperature < habitableHigh) {
        let factor = (temperature - habitableHigh) / (hotThreshold - habitableHigh);
        return interpolateColor(habitableColor, warmColor, factor);
    } else if (temperature < hotThreshold){
        let factor = (temperature - habitableHigh) / (hotThreshold - habitableHigh);
        return interpolateColor(warmColor, hotColor, factor);
    } else if (temperature < scorchingThreshold){
        let factor = (temperature - hotThreshold) / (scorchingThreshold - hotThreshold);
        return interpolateColor(hotColor, pureheatColor, factor);
    } else {
        return `rgb(${pureheatColor.r}, ${pureheatColor.g}, ${pureheatColor.b})`
    }
}

function toggleHelpPopup() {
    var popup = document.getElementById('helpPopup');
    popup.style.display = popup.style.display === 'none' ? 'block' : 'none';
}

function getOrbPeriod(smaAU, starMassSolar) {
    // Constants
    const G = 6.67430e-11; // Gravitational constant in m³ kg⁻¹ s⁻²
    const M_sun = 1.989e30; // Mass of the Sun in kg
    const AU_to_m = 1.496e11; // Conversion factor from AU to meters

    // Convert semi-major axis from AU to meters
    const sma_m = smaAU * AU_to_m;

    // Convert star mass from solar masses to kg
    const M = starMassSolar * M_sun;

    // Calculate orbital period in seconds using Kepler's third law
    const T_seconds = Math.sqrt((4 * Math.PI * Math.PI * Math.pow(sma_m, 3)) / (G * M));

    // Convert orbital period from seconds to days
    const T_days = T_seconds / (60 * 60 * 24);

    return T_days;
}

document.getElementById('helpButton').addEventListener('click', toggleHelpPopup);

function updatePlanetPosition(planet, elapsedTime) {
    // Check if the planet has eccentricity data
    if (typeof planet.userData.ecc !== 'undefined') {
        const a = planet.userData.orbitRadius;
        const e = planet.userData.ecc;
        const b = a * Math.sqrt(1 - e * e);

        const orbitSpeed = planet.userData.orbitSpeed * globalSpeed;
        const angle = elapsedTime * orbitSpeed + (planet.userData.orbitAngle || 0);

        const focalOffset = a * e;
        planet.position.x = (a * Math.cos(angle)) + focalOffset;
        planet.position.z = b * Math.sin(angle);
    } else {
        //fallback
        var orbitRadius = planet.userData.orbitRadius;
        var orbitSpeed = planet.userData.orbitSpeed * globalSpeed;
        var orbitAngle = planet.userData.orbitAngle || 0;

        var angle = elapsedTime * orbitSpeed + orbitAngle;

        planet.position.x = Math.cos(angle) * orbitRadius;
        planet.position.z = Math.sin(angle) * orbitRadius;
    }
}

function checkIntersections(camera, scene, controls) {
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true).filter(intersect => !intersect.object.isText);

    if (intersects.length > 0) {
        const firstIntersectedObject = intersects[0].object;

        if (firstIntersectedObject.userData.isStar) {
            controls.target.copy(firstIntersectedObject.position);
        }
    }
}

function createTextLabel(text, fontSize = 32) {
    var canvas = document.createElement('canvas');
    var context = canvas.getContext('2d');
    context.font = `${fontSize}px Arial`;
    context.fillStyle = '#FFFFFF';
    context.fillText(text, 0, 50);

    var texture = new THREE.CanvasTexture(canvas); 
    texture.needsUpdate = true;

    var spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    var sprite = new THREE.Sprite(spriteMaterial);
    sprite.isText = true;
    sprite.scale.set(0.5, 0.25, 1.0);

    return sprite;
}

function createPlanet(size, color, orbitRadius, orbitSpeed) {
    var geometry = new THREE.SphereGeometry(size, 32, 32);
    var material = new THREE.MeshBasicMaterial({ color: color });
    var planetMesh = new THREE.Mesh(geometry, material);

    planetMesh.userData = {
        orbitRadius: orbitRadius,
        orbitSpeed: orbitSpeed,
        orbitAngle: orbitRadius*Math.random()/Math.random()
    };
    return planetMesh;
}

function addPlanetsToStar(star, scene, planetData, minDistance, maxDistance, useSpecialOrdering) {
    // Ensure planetData is always an array
    if (!Array.isArray(planetData)) {
        console.error('planetData is not an array:', planetData);
        planetData = [planetData]; 
    }
    star.planets = [];
    var planets = [];
    planetData.forEach(planetInfo => {

        var orbitRadius = 0;

        if(useSpecialOrdering) {
            orbitRadius = mapRange(planetInfo.pl_orbsmax, minDistance, maxDistance, 0.08, 0.4);
        }
        else {
            orbitRadius = (0.08 + 0.33*(Math.log(parseFloat(planetInfo.pl_orbsmax+1)))) || 0.2;
            if (orbitRadius > 0.4) {
                orbitRadius = 0.4;
            }
        }

        if (planetInfo.pl_period){
            var orbitalPeriod = planetInfo.pl_period;
        } else if (planetInfo.st_mass && planetInfo.pl_orbsmax) {
            var orbitalPeriod = getOrbPeriod(planetInfo.pl_orbsmax, planetInfo.st_mass);
        } else {
            var orbitalPeriod = 365;
        }

        var orbitSpeed = (365/orbitalPeriod)/10*0.6 || 0.06;
        var planetSize = (0.005 + 0.005*(Math.log(parseFloat(planetInfo.pl_rade)) / Math.log(5))) || 0.005; 

        var discYear = planetInfo.disc_year;
        var discoveryMethod = planetInfo.discoverymethod || "NA" ;
        var discoveryFacility = planetInfo.disc_facility || "NA" ;
        var sma = planetInfo.pl_orbsmax*149600000000 || 10000000 ;
        var starRadius = planetInfo.st_rad*695700000 || 6957000 ;
        var starTemp = planetInfo.st_teff || 5780 ;
        var planetTemperature = planetInfo.pl_eqt || calculateEffectiveTemperature(starTemp, starRadius, sma);
        var planetColor = getPlanetColor(planetTemperature);

        var planet = createPlanet(planetSize, planetColor, orbitRadius, orbitSpeed);
        planet.userData.discYear = discYear;
        planet.userData.orbitalPeriod = orbitalPeriod;
        planet.userData.discoveryMethod = discoveryMethod;
        planet.userData.discoveryFacility = discoveryFacility;
        planet.userData.planetTemperature = planetTemperature;
        planet.userData.ecc = planetInfo.pl_orbeccen || 0;
        star.planets.push(planet);
        planets.push(planet);
        star.add(planet);

        // text label
        var planetName = planetInfo.pl_name || "Unnamed Planet";
        var textSprite = createTextLabel(planetName, 14);
        textSprite.position.set(0, 0, 0);
        planet.add(textSprite);
    });
    return planets;
}

function focusOnStar(hostname) {
    hostname = hostname.toLowerCase(); 
    const starData = stars[hostname];
    if (starData) {
        controls.target.copy(starData.mesh.position);
        camera.position.set(starData.mesh.position.x, starData.mesh.position.y + 1, starData.mesh.position.z + 1);
        controls.update();
    } else {
        console.log("Star not found:", hostname);
    }
}

function populateDiscoveryMethodsMenu(data) {
    const discoveryMethods = new Set();
    data.forEach(item => {
        if (item.discoverymethod && !discoveryMethods.has(item.discoverymethod)) {
            discoveryMethods.add(item.discoverymethod);
        }
    });

    const menuContainer = document.getElementById('menuContainer');
    discoveryMethods.forEach(method => {
        const container = document.createElement('div');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = method;
        checkbox.checked = true;
        checkbox.name = "discoveryMethod";
        const label = document.createElement('label');
        label.htmlFor = method;
        label.textContent = method;

        container.appendChild(checkbox);
        container.appendChild(label);
        menuContainer.appendChild(container);
    });

    document.querySelectorAll('input[name="discoveryMethod"]').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            filterByDiscoveryMethod();
        });
    });
}

function populateDiscoveryFacilityMenu(data) {
    const discoveryFacilities = new Set();
    data.forEach(item => {
        if (item.disc_facility && !discoveryFacilities.has(item.disc_facility)) {
            discoveryFacilities.add(item.disc_facility);
        }
    });

    const menuFacilityContainer = document.getElementById('menuDisckFacilContainer');
    
    // Set maxheight and enable scrolling
    menuFacilityContainer.style.maxHeight = "400px"; 
    menuFacilityContainer.style.overflowY = "scroll";
    menuFacilityContainer.style.width = "250px";

    discoveryFacilities.forEach(facility => {
        const container = document.createElement('div');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = facility;
        checkbox.checked = true;
        checkbox.name = "discoveryFacility";
        const label = document.createElement('label');
        label.htmlFor = facility;
        label.textContent = facility;

        container.appendChild(checkbox);
        container.appendChild(label);
        menuFacilityContainer.appendChild(container);
    });

    document.querySelectorAll('input[name="discoveryFacility"]').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            filterByDiscoveryFacility();
        });
    });
}

function filterByDiscoveryFacility() {
    console.log("Filtering by discovery facility");

    const checkedFacilities = new Set();
    document.querySelectorAll('input[name="discoveryFacility"]:checked').forEach(input => {
        checkedFacilities.add(input.id);
    });
    console.log("Checked Facilities:", Array.from(checkedFacilities));
    Object.keys(stars).forEach(hostname => {
        const star = stars[hostname];
        let hasVisiblePlanet = false;
        star.planets.forEach(planet => {
            if (checkedFacilities.has(planet.userData.discoveryFacility)) {
                planet.visible = true;
                hasVisiblePlanet = true;
            } else {
                planet.visible = false;
            }
        });

        star.mesh.visible = hasVisiblePlanet;
        star.label.visible = hasVisiblePlanet
    });

    console.log("Filtering completed");
}

function filterByDiscoveryMethod() {
    console.log("Filtering by discovery method");

    const checkedMethods = new Set();
    document.querySelectorAll('input[name="discoveryMethod"]:checked').forEach(input => {
        checkedMethods.add(input.id);
    });
    console.log("Checked Methods:", Array.from(checkedMethods));
    Object.keys(stars).forEach(hostname => {
        const star = stars[hostname];
        let hasVisiblePlanet = false;
        star.planets.forEach(planet => {
            if (checkedMethods.has(planet.userData.discoveryMethod)) {
                planet.visible = true;
                hasVisiblePlanet = true;
            } else {
                planet.visible = false;
            }
        });

        star.mesh.visible = hasVisiblePlanet;
        star.label.visible = hasVisiblePlanet
    });

    console.log("Filtering completed");
}

function filterByDiscoveryYear() {
    const minYear = parseInt(document.getElementById('minYear').value, 10) || -Infinity;
    const maxYear = parseInt(document.getElementById('maxYear').value, 10) || Infinity;

    Object.keys(stars).forEach(hostname => {
        const star = stars[hostname];
        let starVisible = false;

        star.planets.forEach(planet => {
            const discYear = planet.userData.discYear;
            if (discYear === "NA" || (discYear >= minYear && discYear <= maxYear)) {
                planet.visible = true;
                starVisible = true;
            } else {
                planet.visible = false;
            }
        });

        star.mesh.visible = starVisible;
        star.label.visible = starVisible;
    });
}

function mapRange(x, a, b, minToMapTo, maxToMapTo) {
    // Check if x is outside the range [a, b]
    if (x < a) {
        x = a;
    } else if (x > b) {
        x = b;
    }
    
    // Compute the proportion of x's position relative to the range [a, b]
    const proportion = (x - a) / (b - a);
    
    // Map the proportion to the range [c, d]
    const result = proportion * (maxToMapTo - minToMapTo) + minToMapTo;
    
    return result;
}

document.getElementById('menuToggle').addEventListener('click', () => {
    const menuContainer = document.getElementById('menuContainer');
    menuContainer.style.display = menuContainer.style.display === 'none' ? 'block' : 'none';
});

document.getElementById('menuDisckFacilToggle').addEventListener('click', () => {
    const menuContainer = document.getElementById('menuDisckFacilContainer');
    menuContainer.style.display = menuContainer.style.display === 'none' ? 'block' : 'none';
});

document.addEventListener('keydown', function(event) {
    if (event.key === "Home") {
        camera.position.set(0, 1, 1);
        controls.target.set(0, 0, 0);
        controls.update();
    }
});

document.addEventListener('DOMContentLoaded', function() {
    var scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
    var renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    camera.position.set(0, 1, 1); 
    controls.target.set(0, 0, 0);

    const speedSlider = document.getElementById('speedSlider');
    const speedValueDisplay = document.getElementById('speedValue');
    const searchBox = document.getElementById('searchBox');

    searchBox.addEventListener('keypress', function(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            focusOnStar(searchBox.value.trim());
        }
    });    

    renderer.domElement.addEventListener('mousedown', (event) => {
        clickStartTime = new Date().getTime();
    });
    
    renderer.domElement.addEventListener('mouseup', (event) => {
        const clickEndTime = new Date().getTime();
        const clickDuration = clickEndTime - clickStartTime;
    
        if (clickDuration < clickDurationThreshold) {
            mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
            checkIntersections(camera, scene, controls);
        }
    });
    
    var parseStars = function(data) {
        var uniqueHostnames = new Set(data.map(item => item.hostname));
    
        uniqueHostnames.forEach(hostname => {
            var star = data.find(item => item.hostname === hostname);
            var planetsDataForStar = data.filter(item => item.hostname === hostname);

            var sizeOfStar = mapRange(star.st_mass, 0.1, 30, 0.025, 0.04)
            var geometry = new THREE.SphereGeometry(sizeOfStar, 32, 32);

            var color = getColorFromSpectralType(star.st_spectype);
            var material = new THREE.MeshBasicMaterial({ color: color });
            var sphere = new THREE.Mesh(geometry, material);
            hostname = hostname ? hostname : "Missing";
            sphere.userData = { isStar: true, hostname: hostname.toLowerCase() };
    
            var x, y, z;
            x = star.sy_dist * Math.cos(star.dec) * Math.cos(star.ra);
            y = star.sy_dist * Math.cos(star.dec) * Math.sin(star.ra);
            z = star.sy_dist * Math.sin(star.dec);
    
            sphere.position.set(x, y, z);
            scene.add(sphere);
            stars[hostname.toLowerCase()] = { mesh: sphere, label: textSprite };

            var distanceModifier = planetsDataForStar.map(planet => planet.pl_orbsmax);
            const minDistance = Math.min(...distanceModifier);
            const maxDistance = Math.max(...distanceModifier);
            var useSpecialOrdering = 0;
            if (distanceModifier.length != 1) {
                useSpecialOrdering = 1;
            }

            var planets = addPlanetsToStar(sphere, scene, planetsDataForStar, minDistance, maxDistance, useSpecialOrdering);

            sphere.planets = planets;
            stars[hostname.toLowerCase()].planets = planets;
    
            var textSprite = createTextLabel(hostname);
            textSprite.position.set(x, y, z);
            scene.add(textSprite);
            sphere.label = textSprite;
            stars[hostname.toLowerCase()].label = textSprite;
        });

    };

    function updateSimulationSpeed() {
        const minLog = Math.log(0.01);
        const maxLog = Math.log(1000);
        const scale = (maxLog - minLog) / 100;
        const speed = Math.exp(minLog + scale * speedSlider.value);
        
        globalSpeed = speed;

        let normalizedSpeed = speed / 125;
        let displayValue, unit;
    
        if (normalizedSpeed > 1) {
            displayValue = normalizedSpeed;
            unit = 'years/s';
        } else {
            displayValue = normalizedSpeed * 365;
            if(displayValue < 1){
                displayValue = displayValue * 24;
                unit = 'hours/s';
            } else {
                unit = 'days/s';
            } 
        }

        speedValueDisplay.textContent = `${displayValue.toFixed(2)} ${unit}`;
    }

    updateSimulationSpeed();
    speedSlider.addEventListener('input', updateSimulationSpeed);

    var animate = function() {
        requestAnimationFrame(animate);
        controls.update();

        var delta = clock.getDelta();
        var elapsedTime = clock.getElapsedTime();

        scene.traverse(function(object) {
            if (object.userData && object.userData.orbitRadius !== undefined) {
                updatePlanetPosition(object, elapsedTime);
            }
        });

        renderer.render(scene, camera);
    };

    document.getElementById('filterButton').addEventListener('click', filterByDiscoveryYear);    

    Papa.parse("./complete_data.csv", {
        download: true,
        header: true,
        dynamicTyping: true,
        complete: function(results) {
            const data = results.data;
            parseStars(data);
            populateDiscoveryMethodsMenu(data);
            populateDiscoveryFacilityMenu(data);

            var loading = document.getElementById('loadingText');
            loading.style.display = 'none';

            animate();
        }
    });
});
