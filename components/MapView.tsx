
import React, { useEffect, useRef } from 'react';
import { Recommendation } from '../types';

interface MapViewProps {
  places: Recommendation[];
  center?: { lat: number; lng: number };
  onMarkerClick?: (place: Recommendation) => void;
}

const MapView: React.FC<MapViewProps> = ({ places, center, onMarkerClick }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    const initialCenter = center || { lat: 37.5665, lng: 126.9780 }; 
    if (!mapInstanceRef.current) {
      // @ts-ignore
      mapInstanceRef.current = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false,
        tap: true
      }).setView([initialCenter.lat, initialCenter.lng], 12);

      // @ts-ignore
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19
      }).addTo(mapInstanceRef.current);
      
      // @ts-ignore
      L.control.zoom({ position: 'bottomright' }).addTo(mapInstanceRef.current);
    } else if (center) {
      mapInstanceRef.current.setView([center.lat, center.lng], 13);
    }

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    places.forEach(place => {
      if (place.lat && place.lng) {
        // 'rental' 타입을 포함하도록 확장하고 타입 안전성 확보를 위해 객체 인덱스 타입 정의
        const colors: Record<string, string> = {
          hotel: '#4F46E5',
          restaurant: '#EA580C',
          golf: '#10B981',
          attraction: '#7C3AED',
          flight: '#000000',
          rental: '#059669'
        };
        const color = colors[place.type] || '#64748B';
        const emojis: Record<string, string> = { 
          hotel: '🏨', 
          restaurant: '🍴', 
          golf: '⛳', 
          attraction: '🎡', 
          flight: '✈️',
          rental: '🚗'
        };
        const emoji = emojis[place.type] || '📍';

        const iconHtml = `
          <div style="
            background-color: ${color};
            width: 32px;
            height: 32px;
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2px solid white;
            box-shadow: 0 8px 16px rgba(0,0,0,0.15);
          ">
            <div style="transform: rotate(45deg); font-size: 14px; margin-top: -2px;">${emoji}</div>
          </div>
        `;

        // @ts-ignore
        const customIcon = L.divIcon({
          html: iconHtml,
          className: 'custom-div-icon',
          iconSize: [32, 32],
          iconAnchor: [16, 32]
        });

        const formattedPrice = new Intl.NumberFormat('ko-KR').format(place.price);

        // @ts-ignore
        const marker = L.marker([place.lat, place.lng], { icon: customIcon })
          .addTo(mapInstanceRef.current)
          .bindPopup(`
            <div style="min-width: 180px; font-family: 'Inter', sans-serif; padding: 4px;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                <span style="font-size: 10px; font-weight: 900; color: ${color}; text-transform: uppercase; letter-spacing: 0.1em;">${place.type}</span>
                <span style="background: ${color}15; color: ${color}; font-size: 10px; font-weight: 800; padding: 2px 6px; border-radius: 6px;">₩${formattedPrice}</span>
              </div>
              <h4 style="font-weight: 900; font-size: 14px; color: #1E293B; margin: 0 0 6px 0; line-height: 1.3;">${place.name}</h4>
              <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 8px;">
                <span style="color: #FBBF24; font-size: 12px;">★</span>
                <span style="font-weight: 800; font-size: 12px; color: #475569;">${place.rating.toFixed(1)}</span>
                <span style="font-size: 10px; color: #94A3B8; font-weight: 500;">/ 5.0</span>
              </div>
              <p style="font-size: 11px; color: #64748B; line-height: 1.5; margin-bottom: 12px; font-weight: 500;">${place.reviews || place.description}</p>
              <a href="${place.bookingUrl}" target="_blank" style="
                display: block;
                text-align: center;
                background: #1E293B;
                color: white;
                padding: 8px;
                border-radius: 10px;
                font-weight: 800;
                font-size: 10px;
                text-decoration: none;
                transition: all 0.2s;
              ">구글 맵에서 보기</a>
            </div>
          `, {
            maxWidth: 240,
            className: 'custom-leaflet-popup'
          });
        
        markersRef.current.push(marker);
      }
    });

    if (markersRef.current.length > 0) {
      // @ts-ignore
      const group = L.featureGroup(markersRef.current);
      mapInstanceRef.current.fitBounds(group.getBounds().pad(0.2));
    }
  }, [places, center]);

  return (
    <div 
      ref={mapContainerRef} 
      className="w-full h-full rounded-[32px] overflow-hidden border-2 border-slate-100 shadow-inner bg-slate-50 relative"
    >
    </div>
  );
};

export default MapView;
