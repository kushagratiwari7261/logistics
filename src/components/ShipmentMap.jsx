import { useEffect, useRef } from 'react';
import { Anchor, Flag, Ship, Truck, CheckCircle, Navigation, MapPin } from 'lucide-react';
import { renderToString } from 'react-dom/server';
import { STATUS_COLORS, getCoords } from '../constants/shipment';

// ── Maritime Key Waypoints [lng, lat] ──────────────────────────────────────────
// All coordinates are [longitude, latitude] for MapLibre
const WP = {
    // Straits & Canals
    STRAIT_MALACCA_W: [98.0, 5.5],      // West entrance Malacca Strait
    STRAIT_MALACCA_E: [104.2, 1.3],     // East entrance (Singapore side)
    STRAIT_HORMUZ:    [56.5, 24.5],     // Strait of Hormuz
    BAB_EL_MANDEB:    [43.3, 11.6],     // Red Sea entrance
    SUEZ_S:           [32.6, 29.9],     // Suez Canal - South
    SUEZ_N:           [32.3, 31.3],     // Suez Canal - North
    STRAIT_GIBRALTAR: [-5.5, 35.9],     // Gibraltar
    CAPE_GOOD_HOPE:   [18.4, -34.4],    // Cape of Good Hope
    PANAMA_ATL:       [-79.5, 9.4],     // Panama - Atlantic entrance
    PANAMA_PAC:       [-79.5, 8.9],     // Panama - Pacific entrance
    CAPE_HORN:        [-67.3, -55.9],   // Cape Horn

    // Ocean Mid-points (to ensure routes go through open water)
    MED_SEA:          [15.0, 35.5],     // Mediterranean center
    RED_SEA_MID:      [38.5, 20.0],     // Red Sea middle
    ARABIAN_SEA:      [65.0, 15.0],     // Arabian Sea center
    BAY_OF_BENGAL:    [88.0, 10.0],     // Bay of Bengal
    INDIAN_OCEAN:     [75.0, -10.0],    // Indian Ocean center
    SOUTH_ATLANT:     [-20.0, -15.0],   // South Atlantic
    NORTH_ATLANT:     [-35.0, 45.0],    // North Atlantic
    PACIFIC_NORTH:    [-170.0, 40.0],   // North Pacific
    PACIFIC_SOUTH:    [-140.0, -20.0],  // South Pacific
};

// ── Compute maritime route waypoints ─────────────────────────────────────────
function getMaritimeRoute(origin, dest) {
    const [oLng, oLat] = origin;
    const [dLng, dLat] = dest;
    const waypoints = [];

    // Helper: is a point in a rough "region"
    const inRegion = (lng, lat, lngMin, lngMax, latMin, latMax) =>
        lng >= lngMin && lng <= lngMax && lat >= latMin && lat <= latMax;

    const isEurope   = (lng, lat) => inRegion(lng, lat, -10, 40, 35, 72);
    const isRedSea   = (lng, lat) => inRegion(lng, lat, 32, 50, 10, 30);
    const isMidEast  = (lng, lat) => inRegion(lng, lat, 35, 65, 10, 35);
    const isIndian   = (lng, lat) => inRegion(lng, lat, 65, 90, 5, 30); // India subcontinent
    const isSEAsia   = (lng, lat) => inRegion(lng, lat, 95, 140, -10, 25);
    const isEAsia    = (lng, lat) => inRegion(lng, lat, 100, 150, 20, 50);
    const isAfrica   = (lng, lat) => inRegion(lng, lat, -20, 52, -40, 38);
    const isAtlantic  = (lng, lat) => lng < -10 && lng > -80 && lat > -60;
    const isPacificW = (lng, lat) => lng > 140 || lng < -120;
    const isAmerica  = (lng, lat) => lng < -50;
    const isNAmerica = (lng, lat) => lng < -50 && lat > 15;
    const isSAmerica = (lng, lat) => lng < -34 && lat < 15;

    // ── Route Decision Logic ───────────────────────────────────────────────

    // 1. Indian subcontinent ↔ Middle East / Persian Gulf
    if ((isIndian(oLng, oLat) && isMidEast(dLng, dLat)) ||
        (isMidEast(oLng, oLat) && isIndian(dLng, dLat))) {
        waypoints.push(WP.STRAIT_HORMUZ);
        waypoints.push(WP.ARABIAN_SEA);
    }

    // 2. Indian subcontinent / Middle East → Europe (via Suez)
    if ((isIndian(oLng, oLat) || isMidEast(oLng, oLat)) && isEurope(dLng, dLat)) {
        if (isIndian(oLng, oLat)) waypoints.push(WP.ARABIAN_SEA);
        waypoints.push(WP.BAB_EL_MANDEB);
        waypoints.push(WP.RED_SEA_MID);
        waypoints.push(WP.SUEZ_S);
        waypoints.push(WP.SUEZ_N);
        waypoints.push(WP.MED_SEA);
        waypoints.push(WP.STRAIT_GIBRALTAR);
    }

    // 3. Europe → Indian Subcontinent / Middle East (reverse Suez)
    if (isEurope(oLng, oLat) && (isIndian(dLng, dLat) || isMidEast(dLng, dLat))) {
        waypoints.push(WP.STRAIT_GIBRALTAR);
        waypoints.push(WP.MED_SEA);
        waypoints.push(WP.SUEZ_N);
        waypoints.push(WP.SUEZ_S);
        waypoints.push(WP.RED_SEA_MID);
        waypoints.push(WP.BAB_EL_MANDEB);
        if (isIndian(dLng, dLat)) waypoints.push(WP.ARABIAN_SEA);
    }

    // 4. Indian subcontinent / Middle East → SE Asia (via Cape Comorin + Malacca)
    if ((isIndian(oLng, oLat) || isMidEast(oLng, oLat)) && isSEAsia(dLng, dLat)) {
        if (isMidEast(oLng, oLat)) {
            waypoints.push(WP.STRAIT_HORMUZ);
            waypoints.push(WP.ARABIAN_SEA);
        }
        // Go south of India
        waypoints.push([80.0, 5.0]); // South of Sri Lanka
        waypoints.push(WP.STRAIT_MALACCA_W);
        waypoints.push(WP.STRAIT_MALACCA_E);
    }

    // 5. SE Asia → Indian / Middle East (reverse Malacca)
    if (isSEAsia(oLng, oLat) && (isIndian(dLng, dLat) || isMidEast(dLng, dLat))) {
        waypoints.push(WP.STRAIT_MALACCA_E);
        waypoints.push(WP.STRAIT_MALACCA_W);
        waypoints.push([80.0, 5.0]); // South of Sri Lanka
        if (isMidEast(dLng, dLat)) {
            waypoints.push(WP.ARABIAN_SEA);
            waypoints.push(WP.STRAIT_HORMUZ);
        }
    }

    // 6. SE Asia / East Asia → Europe (via Malacca + Suez)
    if ((isSEAsia(oLng, oLat) || isEAsia(oLng, oLat)) && isEurope(dLng, dLat)) {
        if (isEAsia(oLng, oLat)) {
            waypoints.push([125.0, 15.0]); // Philippine Sea
        }
        waypoints.push(WP.STRAIT_MALACCA_E);
        waypoints.push(WP.STRAIT_MALACCA_W);
        waypoints.push([80.0, 5.0]);
        waypoints.push(WP.ARABIAN_SEA);
        waypoints.push(WP.BAB_EL_MANDEB);
        waypoints.push(WP.RED_SEA_MID);
        waypoints.push(WP.SUEZ_S);
        waypoints.push(WP.SUEZ_N);
        waypoints.push(WP.MED_SEA);
        waypoints.push(WP.STRAIT_GIBRALTAR);
    }

    // 7. Europe → SE Asia / East Asia (reverse)
    if (isEurope(oLng, oLat) && (isSEAsia(dLng, dLat) || isEAsia(dLng, dLat))) {
        waypoints.push(WP.STRAIT_GIBRALTAR);
        waypoints.push(WP.MED_SEA);
        waypoints.push(WP.SUEZ_N);
        waypoints.push(WP.SUEZ_S);
        waypoints.push(WP.RED_SEA_MID);
        waypoints.push(WP.BAB_EL_MANDEB);
        waypoints.push(WP.ARABIAN_SEA);
        waypoints.push([80.0, 5.0]);
        waypoints.push(WP.STRAIT_MALACCA_W);
        waypoints.push(WP.STRAIT_MALACCA_E);
        if (isEAsia(dLng, dLat)) {
            waypoints.push([125.0, 15.0]);
        }
    }

    // 8. East Asia → Americas West Coast (Pacific route)
    if (isEAsia(oLng, oLat) && isAmerica(dLng, dLat) && dLng > -120) {
        waypoints.push(WP.PACIFIC_NORTH);
    }

    // 9. Americas → East Asia (Pacific reverse)
    if (isAmerica(oLng, oLat) && isEAsia(dLng, dLat) && oLng > -120) {
        waypoints.push(WP.PACIFIC_NORTH);
    }

    // 10. Americas (Atlantic) ↔ Europe (Atlantic crossing)
    if (isNAmerica(oLng, oLat) && isEurope(dLng, dLat)) {
        waypoints.push(WP.NORTH_ATLANT);
    }
    if (isEurope(oLng, oLat) && isNAmerica(dLng, dLat)) {
        waypoints.push(WP.NORTH_ATLANT);
    }

    // 11. Americas East Coast ↔ SE Asia / India (via Panama + Pacific or Suez)
    if (isNAmerica(oLng, oLat) && (isSEAsia(dLng, dLat) || isIndian(dLng, dLat))) {
        waypoints.push(WP.PANAMA_ATL);
        waypoints.push(WP.PANAMA_PAC);
        waypoints.push(WP.PACIFIC_NORTH);
    }

    // 12. Africa routes (if both points cross Africa, route via Cape of Good Hope)
    if (oLng < 52 && dLng < 52 && ((oLat < -10 && dLat > 10) || (oLat > 10 && dLat < -10))) {
        if (oLat > dLat) {
            waypoints.push(WP.CAPE_GOOD_HOPE);
        } else {
            waypoints.unshift(WP.CAPE_GOOD_HOPE);
        }
    }

    return waypoints;
}

// Helper to parse the custom "Address || lat,lng" format
const parseLocation = (loc) => {
    if (!loc) return { name: '', coords: null };
    if (loc.includes(' || ')) {
        const [name, coordsStr] = loc.split(' || ');
        const [lat, lng] = coordsStr.split(',').map(Number);
        return { name, coords: [lng, lat] }; // MapLibre uses [lng, lat]
    }
    // Fallback to existing coordinate map
    const coords = getCoords(loc);
    return { name: loc, coords: coords ? [coords[1], coords[0]] : null };
};

// Generate a gentle curve (Bezier arc) between two points
function generateArc(start, end, numPoints = 30, bend = 0.15) {
    const coords = [];
    const [x1, y1] = start;
    const [x2, y2] = end;
    
    // midpoint
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    
    // distance vector
    const dx = x2 - x1;
    const dy = y2 - y1;
    
    // Check if the path crosses the 180th meridian (Pacific ocean crossing)
    // If dx is very large, we should probably wrap, but MapLibre handles simple wraparounds mostly ok
    // To keep it simple, we just apply the bend
    
    // perpendicular control point to create the curve
    const cx = mx - dy * bend;
    const cy = my + dx * bend;

    for (let i = 0; i <= numPoints; i++) {
        const t = i / numPoints;
        const x = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * cx + t * t * x2;
        const y = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * cy + t * t * y2;
        coords.push([x, y]);
    }
    return coords;
}

export default function ShipmentMap({ origin, destination, currentLocation, status, shipmentType }) {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);

    const originInfo = parseLocation(origin);
    const destInfo = parseLocation(destination);
    const currentInfo = parseLocation(currentLocation);

    useEffect(() => {
        let retryTimer = null;

        const initMap = () => {
            if (!window.maplibregl || !mapRef.current) {
                // Retry until maplibre-gl is loaded
                retryTimer = setTimeout(initMap, 300);
                return;
            }

            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }

            const center = currentInfo.coords || destInfo.coords || originInfo.coords || [78.9629, 20.5937];
            const mode = (shipmentType || '').toUpperCase();

            const map = new window.maplibregl.Map({
                container: mapRef.current,
                style: {
                    version: 8,
                    sources: {
                        osm: {
                            type: 'raster',
                            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
                            tileSize: 256,
                            attribution: '© OpenStreetMap',
                        },
                    },
                    layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
                },
                center: center,
                zoom: 3,
                pitchWithRotate: false,
                dragRotate: false,
                touchZoomRotate: false,
            });

            mapInstanceRef.current = map;

            // Build route coordinates (always draw a path if 2+ points exist)
            let pathCoords = [];
            if (originInfo.coords && destInfo.coords) {
                if (mode === 'SEA FREIGHT' || mode === 'AIR FREIGHT') {
                    // Get waypoints (only SEA FREIGHT uses smart waypoints to avoid land)
                    const smartWaypoints = mode === 'SEA FREIGHT' 
                        ? getMaritimeRoute(originInfo.coords, destInfo.coords) 
                        : [];
                        
                    // Full path points
                    const allPoints = [originInfo.coords, ...smartWaypoints, destInfo.coords];
                    
                    // Generate smooth curves between each segment
                    for (let i = 0; i < allPoints.length - 1; i++) {
                        // For short segments, bend less
                        const p1 = allPoints[i];
                        const p2 = allPoints[i+1];
                        const dist = Math.sqrt(Math.pow(p2[0]-p1[0], 2) + Math.pow(p2[1]-p1[1], 2));
                        const bendAmount = dist > 40 ? 0.2 : 0.05; 
                        
                        const arc = generateArc(p1, p2, 40, bendAmount);
                        pathCoords = pathCoords.concat(arc);
                    }
                } else {
                    // Straight line for Transport/Ground
                    pathCoords.push(originInfo.coords);
                    pathCoords.push(destInfo.coords);
                }
            } else if (originInfo.coords && currentInfo.coords) {
                pathCoords.push(originInfo.coords);
                pathCoords.push(currentInfo.coords);
            }

            // Calculate bounds from key points only (not waypoints to avoid distortion)
            const boundsCoords = [originInfo.coords, destInfo.coords, currentInfo.coords].filter(Boolean);

            map.on('load', () => {
                // Add route line (all modes get a path)
                if (pathCoords.length > 1) {
                    map.addSource('route', {
                        type: 'geojson',
                        data: {
                            type: 'Feature',
                            geometry: {
                                type: 'LineString',
                                coordinates: pathCoords,
                            },
                        },
                    });

                    // Shadow / glow line underneath
                    map.addLayer({
                        id: 'route-glow',
                        type: 'line',
                        source: 'route',
                        layout: { 'line-join': 'round', 'line-cap': 'round' },
                        paint: {
                            'line-color': STATUS_COLORS[status] || '#6366f1',
                            'line-width': 8,
                            'line-opacity': 0.2,
                        },
                    });

                    // Main route line
                    map.addLayer({
                        id: 'route-line',
                        type: 'line',
                        source: 'route',
                        layout: { 'line-join': 'round', 'line-cap': 'round' },
                        paint: {
                            'line-color': STATUS_COLORS[status] || '#6366f1',
                            'line-width': 3.5,
                            ...(mode === 'SEA FREIGHT'
                                ? { 'line-dasharray': [6, 3] }
                                : mode === 'AIR FREIGHT'
                                ? { 'line-dasharray': [3, 3] }
                                : {}),
                        },
                    });
                }

                // Fit bounds AFTER adding layers (prevents shake)
                if (boundsCoords.length > 0) {
                    const bounds = new window.maplibregl.LngLatBounds();
                    boundsCoords.forEach(c => bounds.extend(c));
                    map.fitBounds(bounds, {
                        padding: { top: 80, bottom: 80, left: 80, right: 80 },
                        duration: 1200,
                        maxZoom: 8,
                    });
                }
            });

            // Add markers AFTER map is initialised (but they don't need 'load')
            const addMarker = (coords, IconComp, color, label) => {
                if (!coords) return;
                const el = document.createElement('div');
                el.className = 'st-map-marker';
                el.style.cssText = `
                    width: 34px; height: 34px;
                    background: ${color};
                    border-radius: 50%;
                    border: 2.5px solid #fff;
                    box-shadow: 0 4px 14px rgba(0,0,0,0.35);
                    display: flex; align-items: center; justify-content: center;
                    cursor: pointer;
                    color: #fff;
                    flex-shrink: 0;
                    will-change: transform;
                `;
                el.innerHTML = renderToString(<IconComp size={17} strokeWidth={2.5} />);

                new window.maplibregl.Marker({ element: el, anchor: 'center' })
                    .setLngLat(coords)
                    .setPopup(new window.maplibregl.Popup({ offset: 20 }).setHTML(`<b>${label}</b>`))
                    .addTo(map);
            };

            if (originInfo.coords)  addMarker(originInfo.coords, MapPin, '#3b82f6', `Origin: ${originInfo.name}`);
            if (destInfo.coords)    addMarker(destInfo.coords, Flag, STATUS_COLORS[status] || '#6366f1', `Destination: ${destInfo.name}`);

            if (currentInfo.coords) {
                let Icon = Ship;
                if (status === 'At Port') Icon = Anchor;
                else if (mode === 'AIR FREIGHT') Icon = Navigation;
                else if (mode === 'TRANSPORT') Icon = Truck;
                else if (status === 'Delivered') Icon = CheckCircle;
                addMarker(currentInfo.coords, Icon, STATUS_COLORS[status] || '#f59e0b', `Current: ${currentInfo.name}`);
            }
        };

        initMap();

        return () => {
            if (retryTimer) clearTimeout(retryTimer);
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }
        };
    }, [origin, destination, currentLocation, status, shipmentType]);

    const mode = (shipmentType || '').toUpperCase();

    return (
        <div style={{ position: 'relative', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <div
                ref={mapRef}
                style={{ height: '420px', width: '100%' }}
            />
            {/* Mode badge */}
            <div style={{
                position: 'absolute', top: '14px', left: '14px',
                background: 'rgba(10,15,30,0.85)', backdropFilter: 'blur(8px)',
                color: '#fff', padding: '8px 16px', borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.15)',
                display: 'flex', alignItems: 'center', gap: '8px',
                fontSize: '12px', fontWeight: 700, zIndex: 10,
                letterSpacing: '0.5px',
            }}>
                {mode === 'SEA FREIGHT'
                    ? <Ship size={15} color="#38bdf8" />
                    : mode === 'AIR FREIGHT'
                    ? <Navigation size={15} color="#c084fc" />
                    : <Truck size={15} color="#fbbf24" />}
                <span>
                    {mode === 'SEA FREIGHT' ? 'SEA ROUTE' :
                     mode === 'AIR FREIGHT' ? 'AIR ROUTE' : 'GROUND ROUTE'}
                </span>
            </div>

            {/* Legend */}
            <div style={{
                position: 'absolute', bottom: '14px', right: '14px',
                background: 'rgba(10,15,30,0.82)', backdropFilter: 'blur(8px)',
                color: '#fff', padding: '8px 14px', borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.12)',
                display: 'flex', flexDirection: 'column', gap: '5px',
                fontSize: '11px', zIndex: 10,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#3b82f6', display: 'inline-block' }} />
                    Origin
                </div>
                {currentInfo.coords && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: STATUS_COLORS[status] || '#f59e0b', display: 'inline-block' }} />
                        Current
                    </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: STATUS_COLORS[status] || '#6366f1', display: 'inline-block' }} />
                    Destination
                </div>
            </div>
        </div>
    );
}
