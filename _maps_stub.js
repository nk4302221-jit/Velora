// Test-only stub of the Google Maps JS runtime. Imported by harness.jsx BEFORE
// GoogleMapsPicker so the real component code runs unmodified against a
// predictable, countable Geocoder. Never imported by the app itself.
window.__stubExecuted = true;
window.__geocodeCalls = [];
window.__listeners = {};

(function () {
  const noop = function () {};
  function LatLng(a, b) {
    this.lat = () => a;
    this.lng = () => b;
  }

  function Geocoder() {
    this.geocode = function (req) {
      const loc = req.location;
      window.__geocodeCalls.push({ lat: loc.lat, lng: loc.lng });
      const lat = loc.lat;
      const lng = loc.lng;
      return new Promise(function (resolve) {
        // First call is fast, later calls are slow: this exposes whether a
        // second request is fired while an earlier one is still in flight.
        setTimeout(
          function () {
            resolve({
              status: 'OK',
              results: [
                {
                  formatted_address: `Test Addr ${lat.toFixed(3)}, ${lng.toFixed(3)}`,
                  address_components: [
                    { long_name: '12', types: ['street_number'] },
                    { long_name: 'Test Road', types: ['route'] },
                    { long_name: 'Test City', types: ['locality'] },
                    { long_name: 'Test State', types: ['administrative_area_level_1'] },
                    { long_name: '110001', types: ['postal_code'] },
                    { long_name: 'Testland', types: ['country'] },
                  ],
                },
              ],
            });
          },
          window.__geocodeCalls.length === 1 ? 10 : 150
        );
      });
    };
  }

  function Map(div, opts) {
    this.div = div;
    this.opts = opts;
    this.setCenter = noop;
    this.setZoom = noop;
    this.getZoom = () => 15;
    this.getCenter = () => new LatLng(28.6139, 77.209);
  }
  function Marker() {
    this.setMap = noop;
  }

  const maps = {
    Map,
    Marker,
    LatLng,
    LatLngBounds: function () {},
    Geocoder,
    marker: {},
    event: {
      addListener(instance, name, handler) {
        (window.__listeners[name] = window.__listeners[name] || []).push(handler);
        return { remove: noop };
      },
      removeListener: noop,
      clearInstanceListeners: noop,
    },
    importLibrary(name) {
      return Promise.resolve(name === 'geocoding' ? { Geocoder } : {});
    },
  };

  // Anything the maps library probes that is not modelled above becomes a
  // harmless no-op constructor.
  const autoStub = new Proxy(maps, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop !== 'string') return undefined;
      return function Stub() {
        return {};
      };
    },
  });

  window.google = { maps: autoStub };

  // Deterministic GPS position for the "Use Current Location" button.
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (ok) =>
        ok({ coords: { latitude: 28.6139, longitude: 77.209 }, timestamp: Date.now() }),
      watchPosition: () => 0,
      clearWatch: noop,
    },
  });
})();
