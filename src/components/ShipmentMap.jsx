import { useEffect, useRef } from 'react';
import { STATUS_COLORS, getCoords } from '../constants/shipment';

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

export default function ShipmentMap({ origin, destination, currentLocation, status }) {
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
            zoom: 4,
        });

        mapInstanceRef.current = map;

        const bounds = new window.maplibregl.LngLatBounds();

        const addMarker = (coords, emoji, color, label) => {
            if (!coords) return;
            
            const el = document.createElement('div');
            el.className = 'st-map-marker';
            el.style.cssText = `
                width: 36px; height: 36px; 
                background: ${color}; 
                border-radius: 50%; 
                border: 3px solid #fff;
                box-shadow: 0 2px 10px rgba(0,0,0,0.3);
                display: flex; align-items: center; justify-content: center;
                font-size: 20px; cursor: pointer;
            `;
            el.innerHTML = `<span>${emoji}</span>`;

            new window.maplibregl.Marker({ element: el })
                .setLngLat(coords)
                .setPopup(new window.maplibregl.Popup({ offset: 25 }).setHTML(`<b>${label}</b>`))
                .addTo(map);
            
            bounds.extend(coords);
        };

        if (originInfo.coords) addMarker(originInfo.coords, '🔵', '#3b82f6', 'Origin');
        if (destInfo.coords) addMarker(destInfo.coords, '🏁', STATUS_COLORS[status] || '#6366f1', 'Destination');
        
        if (currentInfo.coords) {
            let emoji = '🚢';
            if (status === 'At Port') emoji = '⚓';
            if (status === 'Out for Delivery' || status === 'Customs') emoji = '🚛';
            if (status === 'Delivered') emoji = '✅';
            
            addMarker(currentInfo.coords, emoji, STATUS_COLORS[status] || '#f59e0b', `Current: ${currentInfo.name}`);
        }

        // Draw Route Line
        map.on('load', () => {
            const pathCoords = [originInfo.coords, currentInfo.coords, destInfo.coords].filter(Boolean);
            
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
                        'line-dasharray': [2, 1]
                    }
                });
            }

            if (!bounds.isEmpty()) {
                map.fitBounds(bounds, { padding: 50, duration: 1000 });
            }
        });

        return () => {
            map.remove();
            mapInstanceRef.current = null;
        };
    }, [origin, destination, currentLocation, status]);

    return (
        <div className="st-map-wrapper">
            <h3 className="st-section-title">🗺️ Enterprise Route Map</h3>
            <div ref={mapRef} style={{ height: '350px', borderRadius: '12px', border: '1px solid #e2e8f0' }} />
        </div>
    );
}
