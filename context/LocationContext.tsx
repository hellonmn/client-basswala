/**
 * context/LocationContext.tsx
 *
 * Lazy / Zepto-style location flow:
 *  - App boots with a cached or default city — no permission prompt at launch.
 *  - User sees the home screen immediately (location pill at the top shows the
 *    current city or "Set location").
 *  - GPS permission is only requested when the user taps "Use my location" or
 *    a flow needs precise coordinates (e.g. delivery address picker).
 *  - Last-known location is persisted in AsyncStorage so subsequent launches
 *    open even faster.
 */

import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import * as Location from 'expo-location';
import { Platform } from 'react-native';

// ─── Persistence helpers ────────────────────────────────────────────────────
// AsyncStorage on native, localStorage on web. We only cache the LocationData
// shape — small, safe, lazy-loaded.
const CACHE_KEY = 'basswala:last-location-v1';
const isWeb = Platform.OS === 'web';

async function readCache(): Promise<LocationData | null> {
  try {
    if (isWeb) {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(CACHE_KEY) : null;
      return raw ? JSON.parse(raw) : null;
    }
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function writeCache(loc: LocationData | null) {
  try {
    const raw = loc ? JSON.stringify(loc) : null;
    if (isWeb) {
      if (typeof localStorage === 'undefined') return;
      if (raw) localStorage.setItem(CACHE_KEY, raw);
      else localStorage.removeItem(CACHE_KEY);
      return;
    }
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    if (raw) await AsyncStorage.setItem(CACHE_KEY, raw);
    else await AsyncStorage.removeItem(CACHE_KEY);
  } catch {
    /* silent */
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────
interface LocationData {
  latitude: number;
  longitude: number;
  address?: string;
  city?: string;
  area?: string;
}

interface LocationContextType {
  location: LocationData | null;
  /** True only while the user explicitly triggered a GPS lookup. Never true on launch. */
  isLoadingLocation: boolean;
  locationError: string | null;
  /** True iff we've never shown a city to the user (fresh install, no cache). */
  isUsingDefault: boolean;
  /** Ask for GPS permission (used by the manual "Use my location" CTA). */
  requestLocationPermission: () => Promise<boolean>;
  /** Triggers permission + GPS read. Returns the new location or null. */
  getCurrentLocation: () => Promise<LocationData | null>;
  /** User picks a city from the bottom sheet. */
  setManualLocation: (location: LocationData) => void;
}

const LocationContext = createContext<LocationContextType | undefined>(undefined);

// ─── Default fallback (Jaipur — adjust if your launch city is different) ───
const DEFAULT_LOCATION: LocationData = {
  latitude: 26.9124,
  longitude: 75.7873,
  address: 'Jaipur, Rajasthan',
  city: 'Jaipur',
  area: 'Rajasthan',
};

// ─── Provider ───────────────────────────────────────────────────────────────
export const LocationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Start with the default — the home tab can render immediately without
  // waiting on AsyncStorage. The cache (if any) overrides this within ~1ms.
  const [location, setLocation] = useState<LocationData | null>(DEFAULT_LOCATION);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isUsingDefault, setIsUsingDefault] = useState(true);
  const inFlight = useRef(false);

  // Hydrate from cache once on mount — no GPS, no prompts.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await readCache();
      if (cancelled) return;
      if (cached?.latitude && cached?.longitude) {
        setLocation(cached);
        setIsUsingDefault(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const requestLocationPermission = async (): Promise<boolean> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError('Location permission denied');
        return false;
      }
      return true;
    } catch (error) {
      setLocationError('Error requesting location permission');
      return false;
    }
  };

  const reverseGeocodeWithTimeout = async (
    latitude: number,
    longitude: number,
    timeoutMs: number = 3000
  ): Promise<Location.LocationGeocodedAddress[] | null> => {
    try {
      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('Geocoding timeout')), timeoutMs)
      );
      const result = await Promise.race([
        Location.reverseGeocodeAsync({ latitude, longitude }),
        timeoutPromise,
      ]);
      return result as Location.LocationGeocodedAddress[];
    } catch {
      return null;
    }
  };

  const getCurrentLocation = async (): Promise<LocationData | null> => {
    if (inFlight.current) return null;
    inFlight.current = true;

    try {
      setIsLoadingLocation(true);
      setLocationError(null);

      const ok = await requestLocationPermission();
      if (!ok) return null;

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 5000,
        distanceInterval: 0,
      });

      const { latitude, longitude } = position.coords;
      const addresses = await reverseGeocodeWithTimeout(latitude, longitude, 3000);

      let next: LocationData;
      if (addresses && addresses.length > 0) {
        const a = addresses[0];
        next = {
          latitude,
          longitude,
          address: `${a.name || ''} ${a.street || ''}`.trim() || 'Current Location',
          city: a.city || a.subregion || 'Unknown City',
          area: a.district || a.subregion || a.city || 'Unknown Area',
        };
      } else {
        next = {
          latitude,
          longitude,
          address: 'Current Location',
          city: 'Your Location',
          area: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
        };
      }

      setLocation(next);
      setIsUsingDefault(false);
      writeCache(next);
      return next;
    } catch (error) {
      setLocationError('Failed to get your location');
      return null;
    } finally {
      setIsLoadingLocation(false);
      inFlight.current = false;
    }
  };

  const setManualLocation = (newLocation: LocationData) => {
    setLocation(newLocation);
    setIsUsingDefault(false);
    setLocationError(null);
    writeCache(newLocation);
  };

  const value: LocationContextType = {
    location,
    isLoadingLocation,
    locationError,
    isUsingDefault,
    requestLocationPermission,
    getCurrentLocation,
    setManualLocation,
  };

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
};

export const useLocation = () => {
  const context = useContext(LocationContext);
  if (context === undefined) {
    throw new Error('useLocation must be used within a LocationProvider');
  }
  return context;
};
