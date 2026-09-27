// Must be the first import: it installs the stub Maps runtime before
// GoogleMapsPicker's module body is evaluated and rendered.
import './_maps_stub.js';
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleMapsPicker } from '/src/components/GoogleMapsPicker.jsx';

window.__addresses = [];
window.__locations = [];
window.__renders = 0;

const GPS = { latitude: 28.6139, longitude: 77.209 };

function Harness() {
  window.__renders += 1;
  const [form, setForm] = useState({
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
    country: '',
  });

  return (
    <div>
      <GoogleMapsPicker
        latitude={GPS.latitude}
        longitude={GPS.longitude}
        onLocationSelect={(loc) => window.__locations.push(loc)}
        onAddressDetected={(address) => {
          window.__addresses.push(address);
          setForm((prev) => ({ ...prev, ...address }));
        }}
      />
      <pre id="out">{JSON.stringify(form)}</pre>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
