import { useEffect, useRef, useState, useCallback } from 'react';
import { Search, MapPin, Loader2, Navigation } from 'lucide-react';

export default function LocationPicker({ initialLat = 28.6139, initialLng = 77.2090, onLocationSelect, value }) {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const marker = useRef(null);
  
  const [searchQuery, setSearchQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  // Initialize Map
  useEffect(() => {
    if (!mapContainer.current || map.current || !window.maplibregl) return;

    try {
      map.current = new window.maplibregl.Map({
        container: mapContainer.current,
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
        center: [initialLng, initialLat],
        zoom: 12,
      });

      marker.current = new window.maplibregl.Marker({ draggable: true })
        .setLngLat([initialLng, initialLat])
        .addTo(map.current);

      marker.current.on('dragend', () => {
        if (marker.current) {
          const { lng, lat } = marker.current.getLngLat();
          onLocationSelect({ lat, lng });
        }
      });

      map.current.on('click', (e) => {
        const { lng, lat } = e.lngLat;
        marker.current?.setLngLat([lng, lat]);
        onLocationSelect({ lat, lng });
      });
    } catch (err) {
      console.error('MapLibre init error:', err);
    }

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [initialLat, initialLng]); // Minimal dependencies to prevent re-init

  // Geocode Search (Photon API)
  const fetchSuggestions = useCallback(async (query) => {
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }

    setIsSearching(true);
    try {
      // Prioritize ports and airports by appending keywords if not present, 
      // or just trust Photon which is good at identifying them.
      const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=8`);
      const data = await res.json();
      setSuggestions(data.features || []);
      setShowDropdown(true);
    } catch (err) {
      console.error('Photon search failed:', err);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery && searchQuery !== value) fetchSuggestions(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, fetchSuggestions, value]);

  const handleSelect = useCallback((feature) => {
    const [lng, lat] = feature.geometry.coordinates;
    const p = feature.properties;
    
    // Build a nice address string
    const parts = [
      p.name || p.street,
      p.city || p.locality,
      p.state,
      p.country
    ].filter(Boolean);
    
    const address = parts.join(', ');

    map.current?.flyTo({ center: [lng, lat], zoom: 14 });
    marker.current?.setLngLat([lng, lat]);
    
    onLocationSelect({ lat, lng, address });
    setSearchQuery(address);
    setSuggestions([]);
    setShowDropdown(false);
  }, [onLocationSelect]);

  return (
    <div className="st-location-picker">
      <style>{`
        .st-location-picker { margin-top: 8px; }
        .st-search-wrap { position: relative; margin-bottom: 8px; }
        .st-search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #94a3b8; }
        .st-search-input { width: 100%; padding: 10px 35px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; background: #fff; transition: all 0.2s; }
        .st-search-input:focus { border-color: #6366f1; outline: none; box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1); }
        .st-loader { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); }
        .st-dropdown { position: absolute; z-index: 1000; top: 100%; left: 0; right: 0; margin-top: 5px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; shadow: 0 10px 15px -3px rgba(0,0,0,0.1); max-height: 250px; overflow-y: auto; }
        .st-suggestion-item { width: 100%; text-align: left; padding: 10px 15px; border-bottom: 1px solid #f1f5f9; background: none; display: flex; align-items: start; gap: 10px; cursor: pointer; }
        .st-suggestion-item:hover { background: #f8fafc; }
        .st-suggestion-main { font-weight: 600; color: #1e293b; font-size: 13px; }
        .st-suggestion-sub { font-size: 11px; color: #64748b; }
        .st-map-mini { height: 200px; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; background: #f1f5f9; }
        .st-picker-hint { display: flex; align-items: center; gap: 5px; font-size: 10px; font-weight: bold; text-transform: uppercase; color: #64748b; margin-top: 5px; background: #f8fafc; padding: 4px 8px; border-radius: 4px; }
      `}</style>

      <div className="st-search-wrap">
        <Search size={16} className="st-search-icon" />
        <input
          type="text"
          placeholder="Search Port, Airport or City (Free Precision Search)..."
          className="st-search-input"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
        />
        {isSearching && <Loader2 size={16} className="st-loader animate-spin text-indigo-500" />}
        
        {showDropdown && suggestions.length > 0 && (
          <div className="st-dropdown">
            {suggestions.map((s, i) => {
              const p = s.properties;
              return (
                <button key={i} type="button" className="st-suggestion-item" onClick={() => handleSelect(s)}>
                  <Navigation size={14} className="text-indigo-500 mt-1" />
                  <div>
                    <div className="st-suggestion-main">{p.name || p.street || 'Selected Point'} {p.housenumber || ''}</div>
                    <div className="st-suggestion-sub">{[p.city, p.state, p.country].filter(Boolean).join(', ')}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div ref={mapContainer} className="st-map-mini" />

      <div className="st-picker-hint">
        <MapPin size={12} className="text-indigo-500" />
        Precision Enterprise Search Enabled
      </div>
    </div>
  );
}
