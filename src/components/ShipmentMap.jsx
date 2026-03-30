import { useEffect, useRef } from 'react';
import { Anchor, Flag, Ship, Truck, CheckCircle, Navigation, MapPin } from 'lucide-react';
import { renderToString } from 'react-dom/server';
import { STATUS_COLORS, getCoords } from '../constants/shipment';

const MARITIME_GRAPH = {
    // Port mappings and key maritime waypoints
    nodes: {
        // Straits & Canals
        'MALACCA_W': [98.0, 5.5],
        'MALACCA_E': [104.2, 1.3],
        'HORMUZ': [56.5, 24.5],
        'BAB_EL_MANDEB': [43.3, 11.6],
        'SUEZ_S': [32.6, 29.9],
        'SUEZ_N': [32.3, 31.3],
        'GIBRALTAR': [-5.5, 35.9],
        'CAPE_GOOD_HOPE': [18.4, -34.4],
        'PANAMA_ATL': [-79.5, 9.4],
        'PANAMA_PAC': [-79.5, 8.9],
        'CAPE_HORN': [-67.3, -55.9],

        // Open Water Nodes
        'MED_SEA': [15.0, 35.5],
        'RED_SEA_MID': [38.5, 20.0],
        'ARABIAN_SEA': [65.0, 15.0],
        'INDIAN_OCEAN': [75.0, -10.0],
        'SRI_LANKA_S': [80.0, 5.0],
        'BAY_OF_BENGAL': [88.0, 10.0],
        'PHILIPPINE_SEA': [125.0, 15.0],
        'PACIFIC_N': [-170.0, 40.0],
        'PACIFIC_S': [-140.0, -20.0],
        'ATLANTIC_N': [-35.0, 45.0],
        'ATLANTIC_S': [-20.0, -15.0],

        // Regional Anchor Regions (for origin/dest snapping)
        'INDIA_W': [71.0, 18.0],
        'INDIA_E': [82.0, 15.0],
        'MID_EAST': [52.0, 25.0],
        'EUROPE_N': [5.0, 50.0],
        'EUROPE_S': [10.0, 40.0],
        'US_EAST': [-75.0, 35.0],
        'US_WEST': [-125.0, 35.0],
        'SE_ASIA': [110.0, 10.0],
        'EAST_ASIA': [125.0, 30.0],
        'AFRICA_W': [-15.0, 0.0],
        'AFRICA_E': [45.0, -5.0]
    },
    // Connections
    edges: [
        ['MALACCA_W', 'MALACCA_E'],
        ['MALACCA_W', 'SRI_LANKA_S'],
        ['MALACCA_W', 'BAY_OF_BENGAL'],
        ['MALACCA_E', 'SE_ASIA'],
        ['SE_ASIA', 'PHILIPPINE_SEA'],
        ['SE_ASIA', 'EAST_ASIA'],
        ['PHILIPPINE_SEA', 'EAST_ASIA'],
        ['PHILIPPINE_SEA', 'PACIFIC_N'],
        ['PHILIPPINE_SEA', 'PACIFIC_S'],
        
        ['SRI_LANKA_S', 'INDIA_E'],
        ['SRI_LANKA_S', 'INDIA_W'],
        ['SRI_LANKA_S', 'INDIAN_OCEAN'],
        ['SRI_LANKA_S', 'ARABIAN_SEA'],
        ['BAY_OF_BENGAL', 'INDIA_E'],
        
        ['INDIA_W', 'ARABIAN_SEA'],
        ['ARABIAN_SEA', 'HORMUZ'],
        ['ARABIAN_SEA', 'BAB_EL_MANDEB'],
        ['ARABIAN_SEA', 'INDIAN_OCEAN'],
        ['HORMUZ', 'MID_EAST'],
        
        ['BAB_EL_MANDEB', 'RED_SEA_MID'],
        ['RED_SEA_MID', 'SUEZ_S'],
        ['SUEZ_S', 'SUEZ_N'],
        ['SUEZ_N', 'MED_SEA'],
        ['MED_SEA', 'EUROPE_S'],
        ['MED_SEA', 'GIBRALTAR'],
        
        ['GIBRALTAR', 'ATLANTIC_N'],
        ['GIBRALTAR', 'AFRICA_W'],
        ['GIBRALTAR', 'EUROPE_N'],
        
        ['ATLANTIC_N', 'EUROPE_N'],
        ['ATLANTIC_N', 'US_EAST'],
        ['ATLANTIC_N', 'PANAMA_ATL'],
        ['ATLANTIC_N', 'ATLANTIC_S'],
        
        ['ATLANTIC_S', 'AFRICA_W'],
        ['ATLANTIC_S', 'CAPE_GOOD_HOPE'],
        ['ATLANTIC_S', 'CAPE_HORN'],
        
        ['PANAMA_ATL', 'PANAMA_PAC'],
        ['PANAMA_ATL', 'US_EAST'],
        ['PANAMA_PAC', 'PACIFIC_N'],
        ['PANAMA_PAC', 'PACIFIC_S'],
        ['PANAMA_PAC', 'US_WEST'],
        
        ['PACIFIC_N', 'US_WEST'],
        ['PACIFIC_N', 'EAST_ASIA'],
        ['PACIFIC_S', 'CAPE_HORN'],
        
        ['INDIAN_OCEAN', 'CAPE_GOOD_HOPE'],
        ['INDIAN_OCEAN', 'AFRICA_E'],
        ['AFRICA_E', 'BAB_EL_MANDEB'],
        ['AFRICA_W', 'CAPE_GOOD_HOPE']
    ]
};

// MapLibre shortest path dateline helper
function distWrap(p1, p2) {
    let dx = p2[0] - p1[0];
    while (dx > 180) dx -= 360;
    while (dx < -180) dx += 360;
    const dy = p2[1] - p1[1];
    return Math.sqrt(dx*dx + dy*dy);
}

// Compute shortest maritime route using Dijkstra's Algorithm
function getMaritimeRoute(origin, dest) {
    const nodes = Object.keys(MARITIME_GRAPH.nodes);
    
    // Find closest anchor nodes to origin and dest
    let startNode = nodes[0], endNode = nodes[0];
    let minDistO = Infinity, minDistD = Infinity;

    nodes.forEach(n => {
        const coords = MARITIME_GRAPH.nodes[n];
        const doP = distWrap(origin, coords);
        if (doP < minDistO) { minDistO = doP; startNode = n; }
        const ddP = distWrap(dest, coords);
        if (ddP < minDistD) { minDistD = ddP; endNode = n; }
    });

    // If extremely close, straight line is fine
    if (distWrap(origin, dest) < 20 && startNode === endNode) {
        return [];
    }

    // Build Adjacency List
    const adj = {};
    nodes.forEach(n => adj[n] = []);
    MARITIME_GRAPH.edges.forEach(([u, v]) => {
        const d = distWrap(MARITIME_GRAPH.nodes[u], MARITIME_GRAPH.nodes[v]);
        adj[u].push({ node: v, weight: d });
        adj[v].push({ node: u, weight: d });
    });

    // Dijkstra
    const dists = {};
    const prev = {};
    const unvisited = new Set(nodes);
    
    nodes.forEach(n => { dists[n] = Infinity; prev[n] = null; });
    dists[startNode] = 0;

    while (unvisited.size > 0) {
        let u = null;
        for (const n of unvisited) {
            if (u === null || dists[n] < dists[u]) u = n;
        }
        
        if (dists[u] === Infinity || u === endNode) break;
        unvisited.delete(u);

        for (const neighbor of adj[u]) {
            const alt = dists[u] + neighbor.weight;
            if (alt < dists[neighbor.node]) {
                dists[neighbor.node] = alt;
                prev[neighbor.node] = u;
            }
        }
    }

    // Reconstruct path
    const path = [];
    let curr = endNode;
    while (curr) {
        path.unshift(MARITIME_GRAPH.nodes[curr]);
        curr = prev[curr];
    }
    
    return path;
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
                        
                    // Full path points (clone coords to prevent mutating state)
                    const allPoints = [originInfo.coords, ...smartWaypoints, destInfo.coords].map(p => [...p]);
                    
                    // Fix MapLibre Dateline Crossing (ensures Pacific routes go across the ocean, not back across land)
                    for (let i = 1; i < allPoints.length; i++) {
                        let prev = allPoints[i-1];
                        let curr = allPoints[i];
                        while (curr[0] - prev[0] < -180) curr[0] += 360;
                        while (curr[0] - prev[0] > 180) curr[0] -= 360;
                    }

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
