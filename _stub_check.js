
window.__stubExecuted = true;
(function () {
try {
  window.__listeners = {};
  function noop() {}
  function LatLng(a, b) { this._a = a; this._b = b; this.lat = function(){return a;}; this.lng = function(){return b;}; this.toString = function(){return a+','+b;}; }

  function Geocoder() {
    this.geocode = function (req) {
      var loc = req.location;
      window.__geocodeCalls.push({ lat: loc.lat, lng: loc.lng });
      var lat = loc.lat, lng = loc.lng;
      return new Promise(function (resolve) {
        setTimeout(function () {
          // Second and later calls are slow, to expose overlapping requests.
          resolve({
            status: 'OK',
            results: [{
              formatted_address: 'Test Addr ' + lat.toFixed(3) + ', ' + lng.toFixed(3),
              address_components: [
                { long_name: '12', types: ['street_number'] },
                { long_name: 'Test Road', types: ['route'] },
                { long_name: 'Test City', types: ['locality'] },
                { long_name: 'Test State', types: ['administrative_area_level_1'] },
                { long_name: '110001', types: ['postal_code'] },
                { long_name: 'Testland', types: ['country'] }
              ]
            }]
          });
        }, window.__geocodeCalls.length === 1 ? 10 : 120);
      });
    };
  }

  function Map(div, opts) { this.div = div; this.opts = opts; this.setCenter = noop; this.setZoom = noop; this.getZoom = function(){return 15;}; this.getCenter = function(){return new LatLng(28.6139,77.209);}; }
  function Marker() { this.setMap = noop; }
  function MarkerAdvanced() { this.position = null; this.map = null; }

  var maps = {
    Map: Map,
    Marker: Marker,
    LatLng: LatLng,
    LatLngBounds: function(){},
    Geocoder: Geocoder,
    marker: {},
    event: {
      addListener: function (instance, name, handler) {
        (window.__listeners[name] = window.__listeners[name] || []).push(handler);
        return { remove: noop };
      },
      removeListener: noop,
      clearInstanceListeners: noop,
      trigger: function (name, ev) {
        (window.__listeners[name] || []).forEach(function (h) { h(ev); });
      }
    },
    importLibrary: function (name) {
      return Promise.resolve(name === 'geocoding' ? { Geocoder: Geocoder } : {});
    }
  };

  var autoStub = new Proxy(maps, {
    get: function (target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop !== 'string') return undefined;
      return function Stub(){ return {}; };
    }
  });

  window.google = { maps: autoStub };
  // Signal readiness the way the real bootstrap does.
  if (window.google.maps.importLibrary) {
    window.google.maps.importLibrary('maps');
  }
} catch (e) { window.__stubError = String(e && e.message || e); }
})();

