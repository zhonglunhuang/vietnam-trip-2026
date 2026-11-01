/* 3D 地圖（MapLibre）：底圖 OpenFreeMap、地形 AWS Terrain Tiles，都不用金鑰。
   地圖只建立一次，掛在同一個元素上；換頁或重畫時把元素搬回新的 slot，不重開 WebGL。
   手機上單指拖移、雙指縮放旋轉、雙指上下滑改傾斜。 */
(function () {
  const STYLE = 'https://tiles.openfreemap.org/styles/liberty';
  const DEM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
  const LIB = 'vendor/maplibre-gl-5.24.0';
  const CAM = { all: { pitch: 50, bearing: 0 }, hanoi: { pitch: 60, bearing: -20 }, sapa: { pitch: 68, bearing: 35 }, ninhbinh: { pitch: 62, bearing: -30 }, transit: { pitch: 50, bearing: 0 } };
  const LINES = { train: { color: '#33429A' }, bus: { color: '#B4552D', dash: [2, 1.5] }, car: { color: '#157365', dash: [0.5, 1.5] }, flight: { color: '#5B6270', dash: [0.5, 2] } };

  let el = null, map = null, ready = false, failed = false, loading = null, opts = null, shownRegion = null, tourId = 0;
  const still = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function canWebGL() {
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
  }
  function loadLib() {
    if (window.maplibregl) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = LIB + '.css'; document.head.appendChild(css);
      const js = document.createElement('script'); js.src = LIB + '.js'; js.onload = resolve;
      js.onerror = () => { loading = null; reject(new Error('map library')); };
      document.head.appendChild(js);
    });
    return loading;
  }
  function fail() {
    failed = true;
    if (opts && opts.onFail) opts.onFail();
  }

  const placeList = () => opts.places.filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number');
  const placesGeo = () => ({ type: 'FeatureCollection', features: placeList().map((p) => ({ type: 'Feature',
    geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: { id: p.id, name: p.name, region: p.region, color: opts.colors[p.region] || opts.colors.transit } })) });
  const routesGeo = () => ({ type: 'FeatureCollection', features: opts.links.map((l) => ({ type: 'Feature',
    geometry: { type: 'LineString', coordinates: l.coords }, properties: { kind: l.kind } })) });

  function regionFilter(region) { return region === 'all' ? ['has', 'id'] : ['==', ['get', 'region'], region]; }

  function frame(region, animate) {
    const pts = placeList().filter((p) => region === 'all' || p.region === region);
    if (!pts.length) return;
    const b = new maplibregl.LngLatBounds();
    pts.forEach((p) => b.extend([p.lng, p.lat]));
    const cam = CAM[region] || CAM.all;
    const w = el.clientWidth, pad = Math.min(60, w / 7);
    map.fitBounds(b, { padding: { top: pad + 30, bottom: pad, left: pad, right: pad }, maxZoom: 14, pitch: cam.pitch, bearing: cam.bearing,
      duration: animate && !still() ? 2400 : 0, essential: true });
  }
  function applyRegion(animate) {
    shownRegion = opts.region;
    map.setFilter('trip-dots', regionFilter(opts.region));
    map.setFilter('trip-labels', regionFilter(opts.region));
    frame(opts.region, animate);
  }

  function addTripLayers() {
    map.addSource('dem', { type: 'raster-dem', tiles: [DEM], tileSize: 256, maxzoom: 13, encoding: 'terrarium', attribution: 'Terrain Tiles (Mapzen, AWS)' });
    const firstSymbol = (map.getStyle().layers.find((l) => l.type === 'symbol') || {}).id;
    map.addLayer({ id: 'hillshade', type: 'hillshade', source: 'dem', paint: { 'hillshade-exaggeration': 0.45, 'hillshade-shadow-color': '#3b4a52' } }, firstSymbol);
    map.setTerrain({ source: 'dem', exaggeration: 1.6 });
    map.setSky({ 'sky-color': '#9fc6e4', 'horizon-color': '#e8eef0', 'fog-color': '#f2f3ee', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.75, 'atmosphere-blend': 0.6 });

    map.addSource('trip-routes', { type: 'geojson', data: routesGeo() });
    Object.keys(LINES).forEach((k) => {
      const s = LINES[k], paint = { 'line-color': s.color, 'line-width': 3.5, 'line-opacity': 0.9 };
      if (s.dash) paint['line-dasharray'] = s.dash;
      map.addLayer({ id: 'route-' + k, type: 'line', source: 'trip-routes', filter: ['==', ['get', 'kind'], k], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint });
    });
    map.addSource('trip-places', { type: 'geojson', data: placesGeo() });
    map.addLayer({ id: 'trip-dots', type: 'circle', source: 'trip-places', paint: { 'circle-radius': 7, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2, 'circle-pitch-alignment': 'viewport' } });
    // 中文字沒有對應字型，由 localIdeographFontFamily 用手機內建字型畫；放不下的標籤會自動隱藏
    map.addLayer({ id: 'trip-labels', type: 'symbol', source: 'trip-places',
      layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 12.5, 'text-max-width': 8, 'text-anchor': 'top', 'text-offset': [0, 0.8], 'text-optional': true },
      paint: { 'text-color': '#1d2230', 'text-halo-color': '#fff', 'text-halo-width': 1.6 } });

    map.on('click', (e) => {
      const r = 16, q = [[e.point.x - r, e.point.y - r], [e.point.x + r, e.point.y + r]];
      const hit = map.queryRenderedFeatures(q, { layers: ['trip-dots'] })[0];
      if (hit && opts.onPlace) opts.onPlace(hit.properties.id);
    });
  }

  function create() {
    map = new maplibregl.Map({ container: el, style: STYLE, center: [105.3, 21.2], zoom: 6.4, pitch: 0, maxPitch: 78,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2), attributionControl: { compact: true }, localIdeographFontFamily: 'sans-serif', fadeDuration: 150 });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false }), 'top-right');
    const stop = () => { tourId++; setCaption(''); setTourBtn(false); };
    map.on('dragstart', stop);
    map.on('zoomstart', (e) => { if (e.originalEvent) stop(); });
    const timer = setTimeout(() => { if (!ready) fail(); }, 15000);
    map.once('load', () => {
      clearTimeout(timer); ready = true;
      // 窄螢幕預設展開的版權文字會蓋住按鈕，收起來（點 i 可以打開）
      el.querySelectorAll('.maplibregl-compact-show').forEach((n) => n.classList.remove('maplibregl-compact-show'));
      addTripLayers();
      applyRegion(true);
    });
  }

  function setCaption(text) {
    const c = el && el.parentNode && el.parentNode.parentNode ? el.parentNode.parentNode.querySelector('.map3d-caption') : null;
    if (c) { c.textContent = text; c.hidden = !text; }
  }
  function setTourBtn(on) {
    const b = document.querySelector('[data-map3d="tour"]');
    if (b) b.setAttribute('aria-pressed', String(on));
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function tour() {
    if (!ready) return;
    const id = ++tourId;
    setTourBtn(true);
    for (let i = 0; i < opts.tour.length && id === tourId; i++) {
      const s = opts.tour[i];
      setCaption(s.label);
      const ms = still() ? 0 : 3600;
      map.flyTo({ center: [s.lng, s.lat], zoom: s.zoom || 13, pitch: 66, bearing: (i * 47) % 360 - 180, speed: 0.7, duration: ms, essential: true });
      await wait(ms + 1100);
    }
    if (id !== tourId) return;
    setCaption(''); setTourBtn(false); tourId++;
    frame(opts.region, true);
  }

  window.Map3D = {
    show(slot, o) {
      opts = o;
      if (failed && navigator.onLine !== false) failed = false;
      if (failed || navigator.onLine === false && !map || !canWebGL()) { fail(); return; }
      if (!el) { el = document.createElement('div'); el.className = 'map3d-canvas'; }
      slot.appendChild(el);
      if (map) {
        map.resize();
        if (ready) {
          map.getSource('trip-places').setData(placesGeo());
          map.getSource('trip-routes').setData(routesGeo());
          if (o.region !== shownRegion) { tourId++; setTourBtn(false); applyRegion(true); }
        }
        return;
      }
      loadLib().then(() => { if (!map) create(); }).catch(fail);
    },
    hide() { tourId++; if (ready) map.stop(); },
    tour() { if (document.querySelector('[data-map3d="tour"]').getAttribute('aria-pressed') === 'true') { tourId++; setCaption(''); setTourBtn(false); if (ready) map.stop(); } else tour(); },
    toggleTilt() {
      if (!ready) return;
      const flat = map.getPitch() < 5, cam = CAM[opts.region] || CAM.all;
      map.easeTo({ pitch: flat ? cam.pitch : 0, bearing: flat ? cam.bearing : 0, duration: still() ? 0 : 900, essential: true });
    },
  };
})();
