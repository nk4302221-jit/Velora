import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  GoogleMap,
  useJsApiLoader,
} from '@react-google-maps/api';

import {
  AlertCircle,
  LocateFixed,
  LoaderCircle,
  MapPin,
} from 'lucide-react';

import {
  getCurrentCoordinates,
  reverseGeocodeWith,
} from '../utils/location';

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const containerStyle = {
  width: '100%',
  height: '350px',
  borderRadius: '12px',
};

const DEFAULT_POSITION = {
  lat: 28.6139,
  lng: 77.209,
};

/*
 * Existing Google Map ID
 *
 * .env:
 * VITE_GOOGLE_MAP_ID=YOUR_EXISTING_MAP_ID
 *
 * Backward compatibility:
 * VITE_GOOGLE_MAPS_MAP_ID=YOUR_EXISTING_MAP_ID
 */
const GOOGLE_MAP_ID =
  import.meta.env.VITE_GOOGLE_MAP_ID ||
  import.meta.env.VITE_GOOGLE_MAPS_MAP_ID ||
  '';

const COORD_PRECISION = 5;
const CLICK_DEBOUNCE_MS = 350;

const STATUS_TONES = {
  idle: {
    background: '#f8fafc',
    color: '#475569',
    border: '#e2e8f0',
  },

  locating: {
    background: '#eff6ff',
    color: '#2563eb',
    border: '#bfdbfe',
  },

  success: {
    background: '#f0fdf4',
    color: '#15803d',
    border: '#bbf7d0',
  },

  error: {
    background: '#fef2f2',
    color: '#dc2626',
    border: '#fecaca',
  },
};

/* -------------------------------------------------------------------------- */
/* Coordinate Helpers                                                         */
/* -------------------------------------------------------------------------- */

function roundCoordinate(value) {
  return Number(
    Number(value).toFixed(COORD_PRECISION)
  );
}

function coordinateKey(latitude, longitude) {
  return `${roundCoordinate(latitude)},${roundCoordinate(
    longitude
  )}`;
}

/* -------------------------------------------------------------------------- */
/* Advanced Marker                                                            */
/* -------------------------------------------------------------------------- */

function MapContent({
  position,
  onLocationSelect,
  onMapReady,
  onMapUnmount,
}) {
  const [mapInstance, setMapInstance] = useState(null);
  const markerRef = useRef(null);

  /*
   * Create / update Advanced Marker.
   *
   * IMPORTANT:
   * Advanced Marker requires a valid Google Map ID.
   */
  useEffect(() => {
    if (
      !mapInstance ||
      typeof window === 'undefined' ||
      !window.google?.maps?.importLibrary ||
      !position
    ) {
      return undefined;
    }

    let cancelled = false;

    const setupMarker = async () => {
      try {
        const markerLibrary =
          await window.google.maps.importLibrary(
            'marker'
          );

        if (cancelled) {
          return;
        }

        const AdvancedMarkerElement =
          markerLibrary?.AdvancedMarkerElement;

        if (!AdvancedMarkerElement) {
          console.warn(
            '[GoogleMaps] AdvancedMarkerElement unavailable.'
          );
          return;
        }

        const markerPosition = {
          lat: Number(position.lat),
          lng: Number(position.lng),
        };

        if (
          !Number.isFinite(markerPosition.lat) ||
          !Number.isFinite(markerPosition.lng)
        ) {
          return;
        }

        /*
         * Create marker.
         */
        if (!markerRef.current) {
          markerRef.current =
            new AdvancedMarkerElement({
              map: mapInstance,
              position: markerPosition,
              title: 'Selected location',
            });
        } else {
          /*
           * Update marker.
           */
          markerRef.current.map = mapInstance;
          markerRef.current.position =
            markerPosition;
        }
      } catch (error) {
        console.error(
          '[GoogleMaps] Advanced marker failed:',
          error
        );
      }
    };

    setupMarker();

    return () => {
      cancelled = true;
    };
  }, [mapInstance, position]);

  /*
   * Cleanup marker.
   */
  useEffect(() => {
    return () => {
      if (markerRef.current) {
        markerRef.current.map = null;
        markerRef.current = null;
      }
    };
  }, []);

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={position}
      zoom={15}
      options={{
        /*
         * IMPORTANT FIX:
         *
         * Map ID goes inside options.
         *
         * This is required for AdvancedMarkerElement.
         */
        mapId: GOOGLE_MAP_ID || undefined,

        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: true,
        clickableIcons: false,
        zoomControl: true,
      }}
      onLoad={(map) => {
        setMapInstance(map);
        onMapReady?.(map);
      }}
      onUnmount={() => {
        setMapInstance(null);
        onMapUnmount?.();
      }}
      onClick={(event) => {
        const latitude = event.latLng?.lat?.();
        const longitude = event.latLng?.lng?.();

        if (
          Number.isFinite(latitude) &&
          Number.isFinite(longitude)
        ) {
          onLocationSelect?.({
            latitude,
            longitude,
          });
        }
      }}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Map Loader                                                                 */
/* -------------------------------------------------------------------------- */

function MapLoader({
  apiKey,
  position,
  onLocationSelect,
  onMapReady,
  onMapUnmount,
}) {
  /*
   * Google Maps is used only for:
   *
   * - Map display
   * - Map click
   * - Advanced Marker
   *
   * Reverse geocoding is handled by Nominatim.
   */
  const {
    isLoaded,
    loadError,
  } = useJsApiLoader({
    id: 'velora-google-maps',
    googleMapsApiKey: apiKey,
  });

  /* ---------------------------------------------------------------------- */
  /* Map Error                                                               */
  /* ---------------------------------------------------------------------- */

  if (loadError) {
    return (
      <div
        style={{
          ...containerStyle,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
          boxSizing: 'border-box',
          background: '#fef2f2',
          color: '#b91c1c',
          border: '1px solid #fecaca',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            textAlign: 'center',
          }}
        >
          <AlertCircle size={20} />

          <span>
            Google Maps could not be loaded.
          </span>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Map Loading                                                             */
  /* ---------------------------------------------------------------------- */

  if (!isLoaded) {
    return (
      <>
        <div
          style={{
            ...containerStyle,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#f8fafc',
            color: '#475569',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <LoaderCircle
              size={20}
              style={{
                animation:
                  'velora-map-spin 1s linear infinite',
              }}
            />

            <span>Loading map...</span>
          </div>
        </div>

        <style>
          {`
            @keyframes velora-map-spin {
              from {
                transform: rotate(0deg);
              }

              to {
                transform: rotate(360deg);
              }
            }
          `}
        </style>
      </>
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Loaded Map                                                              */
  /* ---------------------------------------------------------------------- */

  return (
    <>
      <MapContent
        position={position}
        onLocationSelect={onLocationSelect}
        onMapReady={onMapReady}
        onMapUnmount={onMapUnmount}
      />

      <style>
        {`
          @keyframes velora-map-spin {
            from {
              transform: rotate(0deg);
            }

            to {
              transform: rotate(360deg);
            }
          }
        `}
      </style>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* GoogleMapsPicker                                                           */
/* -------------------------------------------------------------------------- */

function GoogleMapsPicker({
  latitude,
  longitude,
  onLocationSelect,
  onAddressDetected,
  onMapsReady,
  className = '',
}) {
  const apiKey =
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  /* ---------------------------------------------------------------------- */
  /* Initial Position                                                        */
  /* ---------------------------------------------------------------------- */

  const initialPosition = useMemo(() => {
    const parsedLatitude = Number(latitude);
    const parsedLongitude = Number(longitude);

    if (
      Number.isFinite(parsedLatitude) &&
      Number.isFinite(parsedLongitude)
    ) {
      return {
        lat: parsedLatitude,
        lng: parsedLongitude,
      };
    }

    return DEFAULT_POSITION;
  }, [latitude, longitude]);

  const [position, setPosition] =
    useState(initialPosition);

  const [isLocating, setIsLocating] =
    useState(false);

  const [status, setStatus] = useState({
    type: 'idle',
    message: '',
  });

  /* ---------------------------------------------------------------------- */
  /* Nominatim Request State                                                 */
  /* ---------------------------------------------------------------------- */

  const geocodePromiseRef = useRef(null);
  const lastResolvedKeyRef = useRef(null);
  const pendingGeocodeRef = useRef(null);
  const busyRef = useRef(false);

  /* ---------------------------------------------------------------------- */
  /* Click Debounce                                                          */
  /* ---------------------------------------------------------------------- */

  const clickTimerRef = useRef(null);

  /* ---------------------------------------------------------------------- */
  /* Mounted State                                                           */
  /* ---------------------------------------------------------------------- */

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;

      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
    };
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Sync External Coordinates                                               */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    const parsedLatitude = Number(latitude);
    const parsedLongitude = Number(longitude);

    if (
      Number.isFinite(parsedLatitude) &&
      Number.isFinite(parsedLongitude)
    ) {
      setPosition({
        lat: parsedLatitude,
        lng: parsedLongitude,
      });
    }
  }, [latitude, longitude]);

  /* ---------------------------------------------------------------------- */
  /* Maps Ready                                                              */
  /* ---------------------------------------------------------------------- */

  const handleMapsReady = useCallback(
    (map) => {
      onMapsReady?.(map);
    },
    [onMapsReady]
  );

  /* ---------------------------------------------------------------------- */
  /* Apply Position                                                          */
  /* ---------------------------------------------------------------------- */

  const applyPosition = useCallback(
    (nextPosition) => {
      if (!nextPosition) {
        return;
      }

      const nextLatitude = Number(
        nextPosition.latitude
      );

      const nextLongitude = Number(
        nextPosition.longitude
      );

      if (
        !Number.isFinite(nextLatitude) ||
        !Number.isFinite(nextLongitude)
      ) {
        return;
      }

      const normalizedPosition = {
        lat: nextLatitude,
        lng: nextLongitude,
      };

      /*
       * Move map + marker.
       */
      setPosition(normalizedPosition);

      /*
       * Notify parent.
       */
      onLocationSelect?.({
        latitude: nextLatitude,
        longitude: nextLongitude,
      });
    },
    [onLocationSelect]
  );

  /* ---------------------------------------------------------------------- */
  /* Nominatim Reverse Geocoding                                             */
  /* ---------------------------------------------------------------------- */

  const geocodeOnce = useCallback(
    async (nextPosition) => {
      const nextLatitude = Number(
        nextPosition.latitude
      );

      const nextLongitude = Number(
        nextPosition.longitude
      );

      if (
        !Number.isFinite(nextLatitude) ||
        !Number.isFinite(nextLongitude)
      ) {
        return;
      }

      const key = coordinateKey(
        nextLatitude,
        nextLongitude
      );

      /*
       * Already resolved.
       */
      if (lastResolvedKeyRef.current === key) {
        return;
      }

      /*
       * Same request already running.
       */
      if (
        geocodePromiseRef.current?.key === key
      ) {
        return geocodePromiseRef.current.promise;
      }

      const promise = (async () => {
        try {
          console.log(
            '[Location] Reverse geocoding with Nominatim:',
            {
              latitude: nextLatitude,
              longitude: nextLongitude,
            }
          );

          /*
           * ONLY Nominatim is used for reverse geocoding.
           */
          const address =
            await reverseGeocodeWith(
              null,
              nextLatitude,
              nextLongitude
            );

          if (!mountedRef.current) {
            return address;
          }

          lastResolvedKeyRef.current = key;

          console.log(
            '[Location] Address detected successfully:',
            address
          );

          setStatus({
            type: 'success',
            message:
              'Address detected successfully.',
          });

          onAddressDetected?.(address);

          return address;
        } catch (error) {
          console.error(
            '[Location] Nominatim reverse geocoding failed:',
            error
          );

          if (mountedRef.current) {
            setStatus({
              type: 'error',
              message:
                'We could not detect the address for this location. Please enter it manually.',
            });
          }

          throw error;
        } finally {
          if (
            geocodePromiseRef.current?.key === key
          ) {
            geocodePromiseRef.current = null;
          }
        }
      })();

      geocodePromiseRef.current = {
        key,
        promise,
      };

      return promise;
    },
    [onAddressDetected]
  );

  /* ---------------------------------------------------------------------- */
  /* Request Geocode                                                         */
  /* ---------------------------------------------------------------------- */

  const requestGeocode = useCallback(
    (nextPosition) => {
      if (!nextPosition) {
        return;
      }

      const nextLatitude = Number(
        nextPosition.latitude
      );

      const nextLongitude = Number(
        nextPosition.longitude
      );

      if (
        !Number.isFinite(nextLatitude) ||
        !Number.isFinite(nextLongitude)
      ) {
        return;
      }

      const normalizedPosition = {
        latitude: nextLatitude,
        longitude: nextLongitude,
      };

      const key = coordinateKey(
        nextLatitude,
        nextLongitude
      );

      /*
       * Already resolved.
       */
      if (
        lastResolvedKeyRef.current === key
      ) {
        return;
      }

      /*
       * Same request already running.
       */
      if (
        geocodePromiseRef.current?.key === key
      ) {
        return;
      }

      /*
       * Another request is running.
       */
      if (busyRef.current) {
        pendingGeocodeRef.current =
          normalizedPosition;

        return;
      }

      busyRef.current = true;

      geocodeOnce(normalizedPosition)
        .catch(() => {
          /*
           * Error handled inside geocodeOnce().
           */
        })
        .finally(() => {
          busyRef.current = false;

          if (!mountedRef.current) {
            return;
          }

          const pending =
            pendingGeocodeRef.current;

          pendingGeocodeRef.current = null;

          if (pending) {
            requestGeocode(pending);
          }
        });
    },
    [geocodeOnce]
  );

  /* ---------------------------------------------------------------------- */
  /* Map Location Select                                                     */
  /* ---------------------------------------------------------------------- */

  const handleLocationSelect = useCallback(
    (nextPosition) => {
      /*
       * Immediately move marker.
       */
      applyPosition(nextPosition);

      /*
       * Debounce Nominatim request.
       */
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
      }

      clickTimerRef.current = setTimeout(() => {
        requestGeocode(nextPosition);
      }, CLICK_DEBOUNCE_MS);
    },
    [applyPosition, requestGeocode]
  );

  /* ---------------------------------------------------------------------- */
  /* Use Current Location                                                    */
  /* ---------------------------------------------------------------------- */

  const handleUseCurrentLocation =
    useCallback(async () => {
      if (isLocating) {
        return;
      }

      if (!apiKey) {
        setStatus({
          type: 'error',
          message:
            'Google Maps API key is not configured. You can enter the address manually.',
        });

        return;
      }

      setIsLocating(true);

      setStatus({
        type: 'locating',
        message:
          'Detecting your current location...',
      });

      try {
        /*
         * Browser GPS.
         */
        const coordinates =
          await getCurrentCoordinates();

        if (!mountedRef.current) {
          return;
        }

        const nextPosition = {
          latitude: Number(
            coordinates.latitude
          ),
          longitude: Number(
            coordinates.longitude
          ),
        };

        console.log(
          '[Location] Detected coordinates:',
          nextPosition
        );

        /*
         * Move map + marker.
         */
        applyPosition(nextPosition);

        setStatus({
          type: 'locating',
          message:
            'Location found. Looking up your address...',
        });

        /*
         * Nominatim reverse geocoding.
         */
        requestGeocode(nextPosition);
      } catch (error) {
        console.error(
          '[Location] Current location failed:',
          error
        );

        if (!mountedRef.current) {
          return;
        }

        setStatus({
          type: 'error',
          message:
            error?.message ||
            'Unable to get your current location. Please enter the address manually.',
        });
      } finally {
        if (mountedRef.current) {
          setIsLocating(false);
        }
      }
    }, [
      apiKey,
      applyPosition,
      isLocating,
      requestGeocode,
    ]);

  /* ---------------------------------------------------------------------- */
  /* Missing Google Maps API Key                                             */
  /* ---------------------------------------------------------------------- */

  if (!apiKey) {
    return (
      <div
        className={className}
        style={{
          width: '100%',
        }}
      >
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
          }}
        >
          <AlertCircle
            size={20}
            style={{
              flexShrink: 0,
              marginTop: 2,
            }}
          />

          <div>
            <strong>
              Google Maps configuration missing
            </strong>

            <div
              style={{
                marginTop: 4,
                fontSize: 14,
              }}
            >
              Please enter your address manually.
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Status Tone                                                             */
  /* ---------------------------------------------------------------------- */

  const tone =
    STATUS_TONES[status.type] ||
    STATUS_TONES.idle;

  /* ---------------------------------------------------------------------- */
  /* UI                                                                      */
  /* ---------------------------------------------------------------------- */

  return (
    <div
      className={className}
      style={{
        width: '100%',
      }}
    >
      {/* Current Location */}

      <button
        type="button"
        onClick={handleUseCurrentLocation}
        disabled={isLocating}
        style={{
          width: '100%',
          minHeight: 46,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          borderRadius: 10,
          border: '1px solid #dbeafe',
          background: isLocating
            ? '#eff6ff'
            : '#ffffff',
          color: '#2563eb',
          cursor: isLocating
            ? 'not-allowed'
            : 'pointer',
          fontSize: 14,
          fontWeight: 600,
          opacity: isLocating ? 0.75 : 1,
          marginBottom: 12,
        }}
      >
        {isLocating ? (
          <LoaderCircle
            size={18}
            style={{
              animation:
                'velora-map-spin 1s linear infinite',
            }}
          />
        ) : (
          <LocateFixed size={18} />
        )}

        {isLocating
          ? 'Detecting Location...'
          : 'Use Current Location'}
      </button>

      {/* Status */}

      {status.message && (
        <div
          style={{
            marginBottom: 12,
            padding: '10px 12px',
            borderRadius: 10,
            background: tone.background,
            color: tone.color,
            border: `1px solid ${tone.border}`,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            fontSize: 13,
            lineHeight: 1.4,
          }}
        >
          {status.type === 'error' ? (
            <AlertCircle
              size={17}
              style={{
                flexShrink: 0,
                marginTop: 1,
              }}
            />
          ) : (
            <MapPin
              size={17}
              style={{
                flexShrink: 0,
                marginTop: 1,
              }}
            />
          )}

          <span>
            {status.message}
          </span>
        </div>
      )}

      {/* Google Map */}

      <MapLoader
        apiKey={apiKey}
        position={position}
        onLocationSelect={handleLocationSelect}
        onMapReady={handleMapsReady}
        onMapUnmount={() => {}}
      />

      {/* Helper */}

      <div
        style={{
          marginTop: 8,
          fontSize: 12,
          color: '#64748b',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <MapPin size={14} />

        <span>
          Click on the map to select a location
          or use your current location.
        </span>
      </div>

      {/* Spinner Animation */}

      <style>
        {`
          @keyframes velora-map-spin {
            from {
              transform: rotate(0deg);
            }

            to {
              transform: rotate(360deg);
            }
          }
        `}
      </style>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Exports                                                                    */
/* -------------------------------------------------------------------------- */

export { GoogleMapsPicker };

export default GoogleMapsPicker;