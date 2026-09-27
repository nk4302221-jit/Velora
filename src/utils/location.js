// src/utils/location.js

/**
 * Velora Location Utility
 *
 * Responsibilities:
 * 1. Get user's current GPS coordinates
 * 2. Reverse geocode coordinates using OpenStreetMap Nominatim
 * 3. Convert Nominatim response into checkout address format
 * 4. Cache reverse-geocoding results
 * 5. Prevent duplicate requests
 *
 * IMPORTANT:
 * - Google Maps is used only for displaying the map.
 * - Google Geocoder is NOT used.
 * - Nominatim is used for address lookup.
 */

// ---------------------------------------------------------
// Constants
// ---------------------------------------------------------

const NOMINATIM_URL =
  'https://nominatim.openstreetmap.org/reverse';

const DEFAULT_COUNTRY = 'India';

const CACHE_PRECISION = 5;
const CACHE_MAX_SIZE = 50;

// ---------------------------------------------------------
// Internal caches
// ---------------------------------------------------------

const reverseGeocodeCache = new Map();
const activeReverseRequests = new Map();

let googleMapsRuntime = null;
let googleGeocoder = null;

// ---------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------

function isValidNumber(value) {
  return (
    typeof value === 'number' &&
    Number.isFinite(value)
  );
}

function normalizeCoordinate(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  return number;
}

function roundCoordinate(value, precision = CACHE_PRECISION) {
  return Number(Number(value).toFixed(precision));
}

function createCoordinateKey(latitude, longitude) {
  const lat = roundCoordinate(latitude);
  const lng = roundCoordinate(longitude);

  return `${lat},${lng}`;
}

function cleanString(value) {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value).trim();
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const cleaned = cleanString(value);

    if (cleaned) {
      return cleaned;
    }
  }

  return '';
}

// ---------------------------------------------------------
// Google Maps runtime compatibility
// ---------------------------------------------------------

/**
 * Returns Google Maps runtime if it exists.
 *
 * This function is kept for compatibility with existing code.
 * We do NOT use Google Geocoder for reverse geocoding.
 */
export function getMapsRuntime() {
  if (typeof window === 'undefined') {
    return null;
  }

  if (
    window.google &&
    window.google.maps
  ) {
    googleMapsRuntime = window.google.maps;
    return window.google.maps;
  }

  return googleMapsRuntime;
}

/**
 * Compatibility helper.
 *
 * IMPORTANT:
 * We intentionally return null because Google Geocoder
 * requires billing in many configurations.
 *
 * Nominatim is used instead.
 */
export async function ensureGeocoder() {
  googleGeocoder = null;
  return null;
}

/**
 * Diagnostics helper.
 */
export function diagnoseMapsRuntime() {
  const maps = getMapsRuntime();

  return {
    available: Boolean(maps),
    hasGoogle: Boolean(
      typeof window !== 'undefined' &&
        window.google
    ),
    hasMaps: Boolean(maps),
    hasGeocoder: false,
    reverseGeocoder: 'Nominatim',
  };
}

// ---------------------------------------------------------
// Current GPS coordinates
// ---------------------------------------------------------

export function getCurrentCoordinates(options = {}) {
  return new Promise((resolve, reject) => {
    if (
      typeof navigator === 'undefined' ||
      !navigator.geolocation
    ) {
      reject(
        new Error(
          'Geolocation is not supported by this browser.'
        )
      );

      return;
    }

    const defaultOptions = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    };

    const finalOptions = {
      ...defaultOptions,
      ...options,
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = normalizeCoordinate(
          position.coords.latitude
        );

        const longitude = normalizeCoordinate(
          position.coords.longitude
        );

        if (
          latitude === null ||
          longitude === null
        ) {
          reject(
            new Error(
              'Invalid GPS coordinates received.'
            )
          );

          return;
        }

        const result = {
          latitude,
          longitude,
          accuracy: position.coords.accuracy ?? null,
          altitude: position.coords.altitude ?? null,
          heading: position.coords.heading ?? null,
          speed: position.coords.speed ?? null,
        };

        console.log(
          '[Location] Detected coordinates:',
          result
        );

        resolve(result);
      },

      (error) => {
        let message =
          'Unable to get your current location.';

        switch (error?.code) {
          case error.PERMISSION_DENIED:
            message =
              'Location permission was denied. Please allow location access in your browser.';
            break;

          case error.POSITION_UNAVAILABLE:
            message =
              'Your current location is unavailable.';
            break;

          case error.TIMEOUT:
            message =
              'Location request timed out. Please try again.';
            break;

          default:
            message =
              error?.message ||
              'Unable to get your current location.';
        }

        console.error(
          '[Location] GPS error:',
          error
        );

        const locationError = new Error(message);

        locationError.code = error?.code;
        locationError.originalError = error;

        reject(locationError);
      },

      finalOptions
    );
  });
}

// ---------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------

function getCachedReverseGeocode(
  latitude,
  longitude
) {
  const key = createCoordinateKey(
    latitude,
    longitude
  );

  return reverseGeocodeCache.get(key) || null;
}

function setCachedReverseGeocode(
  latitude,
  longitude,
  result
) {
  const key = createCoordinateKey(
    latitude,
    longitude
  );

  // Prevent cache from growing forever.
  if (
    reverseGeocodeCache.size >=
    CACHE_MAX_SIZE
  ) {
    const firstKey =
      reverseGeocodeCache.keys().next().value;

    if (firstKey) {
      reverseGeocodeCache.delete(firstKey);
    }
  }

  reverseGeocodeCache.set(key, result);
}

export function clearLocationCache() {
  reverseGeocodeCache.clear();
  activeReverseRequests.clear();
}

// ---------------------------------------------------------
// Nominatim request
// ---------------------------------------------------------

async function fetchNominatimAddress(
  latitude,
  longitude,
  options = {}
) {
  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    format: 'jsonv2',
    addressdetails: '1',
    zoom: String(options.zoom || 18),
    'accept-language':
      options.language || 'en',
  });

  const url =
    `${NOMINATIM_URL}?${params.toString()}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept:
        'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(
      `Nominatim request failed: ${response.status}`
    );
  }

  const data = await response.json();

  if (!data) {
    throw new Error(
      'Nominatim returned an empty response.'
    );
  }

  return data;
}

// ---------------------------------------------------------
// Address mapping
// ---------------------------------------------------------

function mapNominatimResult(
  data,
  latitude,
  longitude
) {
  const address = data?.address || {};

  // -------------------------------------------------------
  // House / Street
  // -------------------------------------------------------

  const houseNumber = firstNonEmpty(
    address.house_number
  );

  const street = firstNonEmpty(
    address.road,
    address.residential,
    address.street,
    address.pedestrian,
    address.footway,
    address.path
  );

  let addressLine1 = [
    houseNumber,
    street,
  ]
    .filter(Boolean)
    .join(', ');

  // -------------------------------------------------------
  // Area
  // -------------------------------------------------------

  const area = firstNonEmpty(
    address.neighbourhood,
    address.suburb,
    address.quarter,
    address.hamlet
  );

  // -------------------------------------------------------
  // Apartment / Suite / Unit
  // -------------------------------------------------------

  const apartment = firstNonEmpty(
    address.apartment,
    address.unit,
    address.flats,
    address.room
  );

  const building = firstNonEmpty(
    address.building
  );

  const entrance = firstNonEmpty(
    address.entrance
  );

  const level = firstNonEmpty(
    address.level
  );

  const apartmentParts = [
    apartment,
    building,
    entrance
      ? `Entrance ${entrance}`
      : '',
    level
      ? `Floor ${level}`
      : '',
  ].filter(Boolean);

  let addressLine2 =
    apartmentParts.join(', ');

  // If apartment/unit information does not exist,
  // use locality/area as Address Line 2.
  if (!addressLine2 && area) {
    addressLine2 = area;
  }

  // -------------------------------------------------------
  // City
  // -------------------------------------------------------

  const city = firstNonEmpty(
    address.city,
    address.town,
    address.village,
    address.municipality,
    address.city_district,
    address.county
  );

  // -------------------------------------------------------
  // State
  // -------------------------------------------------------

  const state = firstNonEmpty(
    address.state,
    address.state_district,
    address.region
  );

  // -------------------------------------------------------
  // Postal Code
  // -------------------------------------------------------

  const postalCode = firstNonEmpty(
    address.postcode
  );

  // -------------------------------------------------------
  // Country
  // -------------------------------------------------------

  const country = firstNonEmpty(
    address.country,
    DEFAULT_COUNTRY
  );

  // -------------------------------------------------------
  // Fallback for Address Line 1
  // -------------------------------------------------------

  /**
   * Sometimes Nominatim does not return:
   *
   * house_number
   * road
   *
   * and only returns city/locality.
   *
   * We still need something useful for checkout.
   */
  if (!addressLine1) {
    addressLine1 = firstNonEmpty(
      area,
      city
    );
  }

  // -------------------------------------------------------
  // Final formatted address
  // -------------------------------------------------------

  const formattedAddress = firstNonEmpty(
    data?.display_name,
    [
      addressLine1,
      addressLine2,
      city,
      state,
      postalCode,
      country,
    ]
      .filter(Boolean)
      .join(', ')
  );

  // -------------------------------------------------------
  // Result
  // -------------------------------------------------------

  return {
    addressLine1,
    addressLine2,

    city,
    state,
    postalCode,
    country,

    latitude,
    longitude,

    formattedAddress,

    // Keep original Nominatim data available
    // for debugging/future requirements.
    displayName:
      cleanString(data?.display_name),

    placeId:
      data?.place_id ?? null,

    osmType:
      data?.osm_type ?? null,

    osmId:
      data?.osm_id ?? null,

    raw: data,
  };
}

// ---------------------------------------------------------
// Reverse Geocode
// ---------------------------------------------------------

/**
 * Reverse geocode coordinates using Nominatim.
 *
 * Signature intentionally supports:
 *
 * reverseGeocodeWith(null, latitude, longitude)
 *
 * because existing GoogleMapsPicker.jsx uses this format.
 *
 * It also supports:
 *
 * reverseGeocodeWith(latitude, longitude)
 */
export async function reverseGeocodeWith(
  geocoderOrLatitude,
  latitudeOrLongitude,
  maybeLongitude,
  options = {}
) {
  let latitude;
  let longitude;

  // -------------------------------------------------------
  // Existing compatibility format:
  //
  // reverseGeocodeWith(null, latitude, longitude)
  // -------------------------------------------------------

  if (
    typeof geocoderOrLatitude !== 'number' &&
    typeof latitudeOrLongitude === 'number' &&
    typeof maybeLongitude === 'number'
  ) {
    latitude = latitudeOrLongitude;
    longitude = maybeLongitude;
  }

  // -------------------------------------------------------
  // Direct format:
  //
  // reverseGeocodeWith(latitude, longitude)
  // -------------------------------------------------------

  else if (
    typeof geocoderOrLatitude === 'number' &&
    typeof latitudeOrLongitude === 'number' &&
    maybeLongitude === undefined
  ) {
    latitude = geocoderOrLatitude;
    longitude = latitudeOrLongitude;
  }

  // -------------------------------------------------------
  // Object format:
  //
  // reverseGeocodeWith({ latitude, longitude })
  // -------------------------------------------------------

  else if (
    geocoderOrLatitude &&
    typeof geocoderOrLatitude === 'object'
  ) {
    latitude = geocoderOrLatitude.latitude;
    longitude = geocoderOrLatitude.longitude;

    if (
      latitudeOrLongitude &&
      typeof latitudeOrLongitude === 'object'
    ) {
      options = latitudeOrLongitude;
    }
  }

  // -------------------------------------------------------
  // Validate coordinates
  // -------------------------------------------------------

  latitude = normalizeCoordinate(latitude);
  longitude = normalizeCoordinate(longitude);

  if (
    latitude === null ||
    longitude === null
  ) {
    throw new Error(
      'Valid latitude and longitude are required for reverse geocoding.'
    );
  }

  // -------------------------------------------------------
  // Cache
  // -------------------------------------------------------

  const cachedResult =
    getCachedReverseGeocode(
      latitude,
      longitude
    );

  if (cachedResult) {
    console.log(
      '[Location] Using cached address:',
      cachedResult
    );

    return cachedResult;
  }

  // -------------------------------------------------------
  // Request key
  // -------------------------------------------------------

  const requestKey =
    createCoordinateKey(
      latitude,
      longitude
    );

  // -------------------------------------------------------
  // Duplicate request protection
  // -------------------------------------------------------

  if (
    activeReverseRequests.has(requestKey)
  ) {
    console.log(
      '[Location] Reusing active reverse-geocoding request.'
    );

    return activeReverseRequests.get(
      requestKey
    );
  }

  // -------------------------------------------------------
  // Request
  // -------------------------------------------------------

  console.log(
    '[Location] Reverse geocoding with Nominatim:',
    {
      latitude,
      longitude,
    }
  );

  const requestPromise = (async () => {
    try {
      const data =
        await fetchNominatimAddress(
          latitude,
          longitude,
          options
        );

      const result =
        mapNominatimResult(
          data,
          latitude,
          longitude
        );

      setCachedReverseGeocode(
        latitude,
        longitude,
        result
      );

      console.log(
        '[Location] Address detected successfully:',
        result
      );

      return result;
    } catch (error) {
      console.error(
        '[Location] Nominatim reverse geocoding failed:',
        error
      );

      throw error;
    } finally {
      activeReverseRequests.delete(
        requestKey
      );
    }
  })();

  activeReverseRequests.set(
    requestKey,
    requestPromise
  );

  return requestPromise;
}

// ---------------------------------------------------------
// Simple helper
// ---------------------------------------------------------

/**
 * Get current location AND address.
 *
 * Useful when you want one function to perform:
 *
 * GPS → Nominatim → Address
 */
export async function getCurrentLocationWithAddress(
  options = {}
) {
  const coordinates =
    await getCurrentCoordinates(
      options.geolocation
    );

  const address =
    await reverseGeocodeWith(
      null,
      coordinates.latitude,
      coordinates.longitude,
      options.reverseGeocode
    );

  return {
    ...coordinates,
    ...address,
  };
}

// ---------------------------------------------------------
// Default export
// ---------------------------------------------------------

const locationUtils = {
  getCurrentCoordinates,
  getCurrentLocationWithAddress,
  reverseGeocodeWith,
  getMapsRuntime,
  ensureGeocoder,
  diagnoseMapsRuntime,
  clearLocationCache,
};

export default locationUtils;