import { useEffect, useRef } from 'react';
import { Map, Anchor, ShieldCheck, Flag, Ship, Truck, CheckCircle, Navigation, MapPin } from 'lucide-react';
import { renderToString } from 'react-dom/server';
import { STATUS_COLORS, getCoords } from '../constants/shipment';

// Global Maritime Waypoints for "Smart" Routing
const MARITIME_WAYPOINTS = {
    SUEZ: [32.3, 29.9],
    PANAMA: [-79.9, 9.1],
    MALACCA: [101.3, 2.5],
    GIBRALTAR: [-5.3, 36.0],
    BAB_EL_MANDEB: [43.3, 12.6],
    HORMUZ: [56.2, 26.5],
    CAPE_COMORIN: [77.5, 8.0], // South of India to avoid land crossing
};

// Helper to parse the custom "Address || lat,lng" format
const parseLocation = (loc) => {
    if (!loc) return { name: '', coords: null };
    if (loc.includes(' || ')) {
        const [name, coordsStr] = loc.split(' || ');
        const [lat, lng] = coordsStr.split(',').map(Number);
        return { name, coords: [lng, lat] }; // MapLibre uses [lng, lat] for coordinates
    }
    // Fallback to existing coordinate map
    const coords = getCoords(loc);
    return { name: loc, coords: coords ? [coords[1], coords[0]] : null };
};

export default function ShipmentMap({ origin, destination, currentLocation, status, shipmentType }) {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);

    const originInfo = parseLocation(origin);
    const destInfo = parseLocation(destination);
    const currentInfo = parseLocation(currentLocation);

    useEffect(() => {
        if (!window.maplibregl || !mapRef.current) return;
        
        if (mapInstanceRef.current) {
            mapInstanceRef.current.remove();
            mapInstanceRef.current = null;
        }

        const center = currentInfo.coords || destInfo.coords || originInfo.coords || [78.9629, 20.5937];
        
        // Custom Theme for MapLibre
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
                layers: [
                    { id: 'osm', type: 'raster', source: 'osm' }
                ],
            },
            center: center,
            zoom: 4,
        });

        mapInstanceRef.current = map;

        const bounds = new window.maplibregl.LngLatBounds();

        const addMarker = (coords, IconComp, color, label) => {
            if (!coords) return;
            
            const el = document.createElement('div');
            el.className = 'st-map-marker';
            el.style.cssText = `
                width: 32px; height: 32px; 
                background: ${color}; 
                border-radius: 50%; 
                border: 2px solid #fff;
                box-shadow: 0 4px 12px rgba(0,0,0,0.4);
                display: flex; align-items: center; justify-content: center;
                cursor: pointer;
                color: #fff;
                transition: transform 0.2s;
            `;
            
            el.innerHTML = renderToString(<IconComp size={18} strokeWidth={2.5} />);

            new window.maplibregl.Marker({ element: el })
                .setLngLat(coords)
                .setPopup(new window.maplibregl.Popup({ offset: 25 }).setHTML(`<b>${label}</b>`))
                .addTo(map);
            
            bounds.extend(coords);
        };

        // Origin Marker
        if (originInfo.coords) addMarker(originInfo.coords, MapPin, '#3b82f6', `Origin: ${originInfo.name}`);
        
        // Destination Marker
        if (destInfo.coords) addMarker(destInfo.coords, Flag, STATUS_COLORS[status] || '#6366f1', `Destination: ${destInfo.name}`);
        
        // Current/Shipment Marker
        if (currentInfo.coords) {
            let Icon = Ship;
            const mode = (shipmentType || '').toUpperCase();
            
            if (status === 'At Port') Icon = Anchor;
            else if (mode === 'AIR FREIGHT') Icon = Navigation;
            else if (mode === 'TRANSPORT') Icon = Truck;
            else if (status === 'Delivered') Icon = CheckCircle;
            
            addMarker(currentInfo.coords, Icon, STATUS_COLORS[status] || '#f59e0b', `Current: ${currentInfo.name}`);
        }

        map.on('load', () => {
            let pathCoords = [];
            const mode = (shipmentType || '').toUpperCase();

            if (originInfo.coords && destInfo.coords) {
                pathCoords.push(originInfo.coords);

                // Smart Maritime Routing Waypoints
                if (mode === 'SEA FREIGHT') {
                    const [oLng, oLat] = originInfo.coords;
                    const [dLng, dLat] = destInfo.coords;

                    // 1. India to UAE/Persian Gulf (avoid land crossing)
                    if (oLng > 68 && dLng < 60 && oLng < 90) {
                        pathCoords.push(MARITIME_WAYPOINTS.HORMUZ);
                    }
                    // 2. India/Middle East to Europe (Suez Canal)
                    if (oLng > 35 && dLng < 10) {
                        pathCoords.push(MARITIME_WAYPOINTS.BAB_EL_MANDEB);
                        pathCoords.push(MARITIME_WAYPOINTS.SUEZ);
                        pathCoords.push(MARITIME_WAYPOINTS.GIBRALTAR);
                    }
                    // 3. Indian Ocean to SE Asia (Malacca Strait)
                    if (oLng < 90 && dLng > 100) {
                        pathCoords.push(MARITIME_WAYPOINTS.CAPE_COMORIN);
                        pathCoords.push(MARITIME_WAYPOINTS.MALACCA);
                    }
                    // 4. UAE to India/Singapore (avoid land crossing South India)
                    if (oLng < 60 && dLng > 75) {
                        pathCoords.push(MARITIME_WAYPOINTS.CAPE_COMORIN);
                        if (dLng > 95) pathCoords.push(MARITIME_WAYPOINTS.MALACCA);
                    }
                    // 5. Asia to US East Coast (Panama)
                    if (oLng > 100 && dLng < -70) {
                        pathCoords.push(MARITIME_WAYPOINTS.PANAMA);
                    }
                }

                if (currentInfo.coords) pathCoords.push(currentInfo.coords);
                pathCoords.push(destInfo.coords);
            }

            if (pathCoords.length > 1) {
                map.addSource('route', {
                    type: 'geojson',
                    data: {
                        type: 'Feature',
                        geometry: {
                            type: 'LineString',
                            coordinates: pathCoords
                        }
                    }
                });

                map.addLayer({
                    id: 'route-line',
                    type: 'line',
                    source: 'route',
                    layout: { 'line-join': 'round', 'line-cap': 'round' },
                    paint: {
                        'line-color': STATUS_COLORS[status] || '#6366f1',
                        'line-width': 4,
                        'line-dasharray': (mode === 'SEA FREIGHT' || mode === 'AIR FREIGHT') ? [3, 1.5] : [1, 0]
                    }
                });
            }

            if (!bounds.isEmpty()) {
                map.fitBounds(bounds, { padding: 80, duration: 2000 });
            }
        });

        return () => {
            map.remove();
            mapInstanceRef.current = null;
        };
    }, [origin, destination, currentLocation, status, shipmentType]); // Fix: Added shipmentType to dependencies

    return (
        <div className="st-map-container" style={{ position: 'relative' }}>
            <div ref={mapRef} style={{ height: '500px', width: '100%', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }} />
            <div className="map-badge" style={{ position: 'absolute', top: '20px', left: '20px', background: 'rgba(15,23,42,0.9)', backdropFilter: 'blur(10px)', color: '#fff', padding: '10px 18px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', fontWeight: '600', zIndex: 10 }}>
                {shipmentType === 'SEA FREIGHT' ? <Ship size={16} color="#0ea5e9" /> : shipmentType === 'AIR FREIGHT' ? <Navigation size={16} color="#c084fc" /> : <Truck size={16} color="#fbbf24" />}
                <span>SMART MARINER TRACKING</span>
            </div>
        </div>
    );
}
