import type { University } from '@uniitalia/shared';

export interface MapPoint {
  university: University & { latitude: number; longitude: number };
  programs: number;
}

export interface UniversityMapProps {
  points: MapPoint[];
  focusId?: string | null;
  onOpen: (slug: string) => void;
}

export const ITALY = { latitude: 42.4, longitude: 12.6, latitudeDelta: 10.5, longitudeDelta: 10.5 };

export const osmLink = (lat: number, lon: number) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`;
