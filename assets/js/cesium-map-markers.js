/**
 * Add location markers (pins) on the overview Cesium 2D map with thumbnails and clustering.
 * Uses the viewer from cesium-map.js (window.cesiumViewer). No separate "link" is needed for images:
 * both scripts run on the same page, so image URLs are resolved from the document (same base as
 * <img src="../../assets/..."> on the landing page) and load on the overview map.
 * Loads locations from data/locations.json and from MapData API; pins use project images as thumbnails.
 * KK_OSPREY uses kkOsprey_pin_image.jpg as pin/choice-bar thumbnail. Clustering groups nearby pins when zoomed out and shows count.
 * Expected locations (5): KK Osprey, KB 3DTiles Lite, Kolombong (fisheye test), Wisma Merdeka, PPNS YS.
 * Clustering concept: The number on each pin is not fixed—it is how many locations are grouped in that cluster.
 * Zoom IN = clusters split into smaller groups (pin number decreases), down to single pins (1). Zoom OUT = nearby
 * locations merge (pin number increases). Only the location choice bar is shown on hover; it must show exactly that many cards.
 */
(function () {
  var API_BASE = (typeof window !== 'undefined' && window.TemaDataPortal_API_BASE) || 'http://localhost:3000';

  // Thumbnail paths: pin images for map and location choice bar (single + cluster hover)
  var THUMBNAIL_BY_ID = {
    'KK_OSPREY': '../../assets/img/front-pages/locations/kkOsprey_pin_image.jpg',
    'kb-3dtiles-lite': '../../assets/img/front-pages/locations/kb 3dtiles lite_pin_image.jpg',
    'kolombong-fisheye': '../../assets/img/front-pages/locations/kolombong_pin_image.jpg',
    'ppns-ys': '../../assets/img/front-pages/locations/ppns ys_pin_image.jpg',
    'wisma-merdeka': '../../assets/img/front-pages/locations/wisma merdeka_pin_image.jpg'
  };
  var THUMBNAIL_FALLBACK = {};

  // Base URL for resolving relative image paths. Prefer script location so ../../ is always project root.
  function getImageBaseUrl() {
    try {
      var script = document.currentScript;
      if (!script && typeof document !== 'undefined') {
        var scripts = document.getElementsByTagName('script');
        for (var i = scripts.length - 1; i >= 0; i--) {
          if (scripts[i].src && scripts[i].src.indexOf('cesium-map-markers') !== -1) {
            script = scripts[i];
            break;
          }
        }
      }
      if (script && script.src) {
        return script.src.replace(/\/[^/]*$/, '/');
      }
      if (typeof window !== 'undefined' && window.location) {
        var origin = window.location.origin;
        var pathname = window.location.pathname || '/';
        var dir = pathname.replace(/\/[^/]*$/, '/') || '/';
        if (origin && origin !== 'null') return origin + dir;
        return window.location.href;
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  var IMAGE_BASE_URL = getImageBaseUrl();

  var DEBUG_IMAGE_URLS = false;

  function resolveLocationImageUrl(relativePath) {
    if (!relativePath || typeof relativePath !== 'string') return null;
    var path = relativePath.trim();
    if (path.indexOf('data:') === 0 || path.indexOf('http') === 0) return path;
    try {
      var base = IMAGE_BASE_URL || (typeof window !== 'undefined' && window.location && window.location.href) || '';
      var resolved = base ? new URL(path, base).href : null;
      return resolved;
    } catch (e) { return null; }
  }

  // 1x1 transparent GIF for blank thumbnail (KK_OSPREY)
  var BLANK_THUMBNAIL_DATAURL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  // Placeholder as inline SVG so it always shows (no external request); displays location name on a dark box
  function getPlaceholderImageUrl(name) {
    var raw = (name || 'Location').trim();
    var label = raw.length > 22 ? raw.substring(0, 20) + '…' : raw;
    label = label.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    if (!label) label = 'Location';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90" viewBox="0 0 160 90">' +
      '<rect width="160" height="90" fill="#1a1a2e"/>' +
      '<text x="80" y="48" text-anchor="middle" fill="#696cff" font-size="11" font-family="sans-serif">' + label + '</text>' +
      '</svg>';
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }

  var MAPDATA_KK_OSPREY_FALLBACK = {
    mapDataID: 'KK_OSPREY',
    title: 'KK OSPREY',
    description: '3D model from GeoSabah 3D Hub (Kota Kinabalu area).',
    xAxis: 116.070466,
    yAxis: 5.957839,
    '3dTiles': 'https://3dhub.geosabah.my/3dmodel/KK_OSPREY/tileset.json',
    thumbNailUrl: '../../assets/img/front-pages/locations/kkOsprey_pin_image.jpg',
    updateDateTime: null
  };

  var ALL_PINS_FALLBACK = [
    { id: 'KK_OSPREY', name: 'KK OSPREY', description: '3D model from GeoSabah 3D Hub (Kota Kinabalu area).', thumbnailUrl: '../../assets/img/front-pages/locations/kkOsprey_pin_image.jpg', longitude: 116.070466, latitude: 5.957839 }
  ];

  function getViewer(cb) {
    if (window.cesiumViewer) {
      cb(window.cesiumViewer);
      return;
    }
    var attempts = 0;
    var t = setInterval(function () {
      attempts++;
      if (window.cesiumViewer) {
        clearInterval(t);
        cb(window.cesiumViewer);
        return;
      }
      if (attempts > 150) clearInterval(t);
    }, 50);
  }

  function truncate(str, maxLen) {
    if (!str || typeof str !== 'string') return '';
    str = str.trim();
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen).trim() + '…';
  }

  /** Resolve thumbnail URL for map/hover: prefer THUMBNAIL_BY_ID (known-good paths) so map always uses location images. */
  function getThumbnailUrl(loc) {
    var url = (THUMBNAIL_BY_ID[loc.id] !== undefined && THUMBNAIL_BY_ID[loc.id] !== null)
      ? (THUMBNAIL_BY_ID[loc.id] || '')
      : (loc.thumbnailUrl && loc.thumbnailUrl.trim()) || '';
    if (loc.id === 'KK_OSPREY' && !url) return BLANK_THUMBNAIL_DATAURL;
    return url;
  }

  /** Normalize to { id, name, description, thumbnailUrl, longitude, latitude }. Only x/y (lon/lat) are used for the overview map; z (height) is for 3D viewer only and is not applied here. */
  function normalizeLocations(locationsJson, mapDataArray) {
    var list = [];
    if (locationsJson && locationsJson.locations && Array.isArray(locationsJson.locations)) {
      locationsJson.locations.forEach(function (loc) {
        list.push({
          id: loc.id,
          name: loc.name || loc.id,
          description: loc.description || '',
          thumbnailUrl: loc.previewImage || loc.thumbNailUrl || '',
          longitude: loc.coordinates && loc.coordinates.longitude != null ? loc.coordinates.longitude : null,
          latitude: loc.coordinates && loc.coordinates.latitude != null ? loc.coordinates.latitude : null
        });
      });
    }
    if (mapDataArray && Array.isArray(mapDataArray)) {
      mapDataArray.forEach(function (row) {
        var id = row.mapDataID || row.id;
        if (!id) return;
        if (list.some(function (l) { return l.id === id; })) return;
        list.push({
          id: id,
          name: row.title || id,
          description: row.description || '',
          thumbnailUrl: row.thumbNailUrl || row.thumbnailUrl || '',
          longitude: row.xAxis != null ? row.xAxis : null,
          latitude: row.yAxis != null ? row.yAxis : null
        });
      });
    }
    return list.filter(function (l) { return l.longitude != null && l.latitude != null; });
  }

  var HOVER_RADIUS_PX = 120; // when hovering cluster (e.g. "6"), include all locations in that group
  var PIN_SIZE_SCALE = 2; // 1 = original size; 2 = 2x larger pins (used for billboard, label, cluster label, choice bar offset)

  function addMarkersWithClustering(viewer, locations) {
    if (!viewer || !locations.length) return;
    var C = Cesium;
    var shortDesc = truncate;
    var labelMaxDesc = 50;

    for (var i = viewer.dataSources.length - 1; i >= 0; i--) {
      var ds = viewer.dataSources.get(i);
      if (ds && ds.name === 'locationMarkers') {
        viewer.dataSources.remove(ds);
        break;
      }
    }

    if (DEBUG_IMAGE_URLS && typeof console !== 'undefined' && console.log) {
      console.log('[TemaDataPortal map images] Base URL for image paths:', IMAGE_BASE_URL || '(none)');
      console.log('[TemaDataPortal map images] Page URL:', typeof window !== 'undefined' && window.location ? window.location.href : 'N/A');
      locations.forEach(function (loc) {
        var rel = getThumbnailUrl(loc) || THUMBNAIL_BY_ID[loc.id];
        if (rel && rel.indexOf('data:') !== 0) {
          var resolved = resolveLocationImageUrl(rel);
          console.log('[TemaDataPortal map images]', loc.id, '->', resolved || '(resolve failed)');
        }
      });
      console.log('[TemaDataPortal map images] If images do not load: open a "resolved" URL above in a new tab. 404 = wrong path or server not serving that path.');
    }

    var dataSource = new C.CustomDataSource('locationMarkers');
    dataSource.clustering.enabled = true;
    dataSource.clustering.minimumClusterSize = 2;
    var clusterToLocationIds = new Map();

    // Clustering concept (remember): Driven by how close pins are on screen (from lat/lon).
    // - Zoom IN: pixelRange shrinks → only pins that are still close on screen stay clustered; others split. Count on each pin = whatever proximity gives (no fixed 10→6→4→1).
    // - Zoom OUT: pixelRange grows → nearby pins merge. One pin = total count of that cluster.
    var INITIAL_PIXEL_RANGE = 9999;
    var MIN_CLUSTER_PX = 10;
    var ZOOMED_OUT_HEIGHT_DEG = 0.06;
    function getClusterPixelRange() {
      var canvas = viewer.scene.canvas;
      if (!canvas || !canvas.clientWidth || !canvas.clientHeight) return INITIAL_PIXEL_RANGE;
      var minDim = Math.min(canvas.clientWidth, canvas.clientHeight);
      var is2D = viewer.scene.mode === C.SceneMode.SCENE2D;
      // In 2D mode, avoid expensive computeViewRectangle and rely only on frustum width.
      if (is2D) return getClusterPixelRange2DFallback();
      var rect = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid);
      if (!rect) {
        return Math.max(INITIAL_PIXEL_RANGE, minDim * 0.9);
      }
      var heightRad = rect.north - rect.south;
      var heightDeg = heightRad * (180 / Math.PI);
      if (heightDeg >= ZOOMED_OUT_HEIGHT_DEG) return Math.max(INITIAL_PIXEL_RANGE, minDim * 0.9);
      var range = Math.max(MIN_CLUSTER_PX, Math.min(INITIAL_PIXEL_RANGE, heightDeg * (INITIAL_PIXEL_RANGE / ZOOMED_OUT_HEIGHT_DEG)));
      return range;
    }
    function getClusterPixelRange2DFallback() {
      try {
        var f = viewer.camera.frustum;
        if (f && typeof f.right === 'number' && typeof f.left === 'number') {
          var width = Math.abs(f.right - f.left);
          // Frustum width in 2D (meters): larger = zoomed out, smaller = zoomed in.
          // Use generous thresholds so zooming in splits clusters into smaller groups or singles.
          var zoomedOutWidth = 2e6;   // fully clustered when view is very wide
          var zoomedInWidth = 4e5;    // split to small/single when view width <= 400km
          if (width >= zoomedOutWidth) return INITIAL_PIXEL_RANGE;
          if (width <= zoomedInWidth) return MIN_CLUSTER_PX;
          var t = (width - zoomedInWidth) / (zoomedOutWidth - zoomedInWidth);
          return Math.max(MIN_CLUSTER_PX, Math.min(INITIAL_PIXEL_RANGE, Math.round(MIN_CLUSTER_PX + t * (INITIAL_PIXEL_RANGE - MIN_CLUSTER_PX))));
        }
      } catch (e) { /* ignore */ }
      return INITIAL_PIXEL_RANGE;
    }
    function updateClusterPixelRange() {
      var pr = getClusterPixelRange();
      if (dataSource.clustering.pixelRange === pr) return;
      dataSource.clustering.pixelRange = pr;
      viewer.scene.requestRender();
    }
    dataSource.clustering.pixelRange = INITIAL_PIXEL_RANGE;
    var clusterRangeThrottle = null;
    function throttledUpdateClusterPixelRange() {
      if (clusterRangeThrottle) return;
      clusterRangeThrottle = setTimeout(function () {
        clusterRangeThrottle = null;
        updateClusterPixelRange();
      }, 180);
    }

    var clusterToBounds = new Map(); // bounding rectangle for each cluster (for click-to-zoom)
    dataSource.clustering.clusterEvent.addEventListener(function (entities, cluster) {
      cluster.label.show = true;
      // Pin number = total locations in this cluster (so hover shows that many choice cards)
      cluster.label.text = entities.length.toString();
      cluster.label.font = 'bold ' + (16 * PIN_SIZE_SCALE) + 'px sans-serif';
      cluster.label.fillColor = C.Color.WHITE;
      cluster.label.outlineColor = C.Color.BLACK;
      cluster.label.outlineWidth = 2;
      cluster.label.style = C.LabelStyle.FILL_AND_OUTLINE;
      cluster.label.disableDepthTestDistance = Number.POSITIVE_INFINITY;
      cluster.label.showBackground = true;
      cluster.label.backgroundColor = new C.Color(0.2, 0.4, 0.7, 0.95);
      cluster.label.backgroundPadding = new C.Cartesian2(10 * PIN_SIZE_SCALE, 8 * PIN_SIZE_SCALE);
      if (cluster.billboard) cluster.billboard.show = false;
      if (cluster.point) cluster.point.show = false;
      var ids = entities.map(function (e) { return e.id; }).filter(Boolean);
      if (ids.length) clusterToLocationIds.set(cluster, ids);
      // Store bounding rectangle so clicking the pin zooms to show this cluster (next level or last pins)
      var lonMin = Infinity, latMin = Infinity, lonMax = -Infinity, latMax = -Infinity;
      var time = viewer.clock.currentTime;
      for (var i = 0; i < entities.length; i++) {
        var pos = entities[i].position;
        var cartesian = pos && typeof pos.getValue === 'function' ? pos.getValue(time) : pos;
        if (cartesian) {
          var carto = C.Cartographic.fromCartesian(cartesian);
          var lon = carto.longitude, lat = carto.latitude;
          if (lon < lonMin) lonMin = lon;
          if (lat < latMin) latMin = lat;
          if (lon > lonMax) lonMax = lon;
          if (lat > latMax) latMax = lat;
        }
      }
      if (lonMin <= lonMax && latMin <= latMax) {
        var pad = 0.15; // expand by 15% so pins aren't at the edge
        var w = Math.max((lonMax - lonMin) * pad, 0.001);
        var h = Math.max((latMax - latMin) * pad, 0.001);
        var rect = C.Rectangle.fromRadians(
          lonMin - w, latMin - h, lonMax + w, latMax + h
        );
        clusterToBounds.set(cluster, rect);
      }
    });

    viewer.dataSources.add(dataSource);

    locations.forEach(function (loc) {
      // Overview map is 2D: use only x/y (longitude, latitude). Height = 0; z is for 3D model view only.
      var position = C.Cartesian3.fromDegrees(loc.longitude, loc.latitude, 0);
      var labelText = loc.name + (loc.description ? '\n' + shortDesc(loc.description, labelMaxDesc) : '');
      var thumbUrl = getThumbnailUrl(loc);

      var entityOpt = {
        position: position,
        name: loc.name,
        description: '<a href="loading-3d.html?id=' + encodeURIComponent(loc.id) + '" target="_blank" rel="noopener">View 3D model (opens in new page)</a>',
        id: loc.id
      };

      var pinW = 48 * PIN_SIZE_SCALE;
      var pinH = 48 * PIN_SIZE_SCALE;
      if (thumbUrl) {
        try {
          var imgUrl = thumbUrl.indexOf('data:') === 0 ? thumbUrl : (resolveLocationImageUrl(thumbUrl) || new URL(thumbUrl.trim(), window.location.href).href);
          entityOpt.billboard = {
            image: imgUrl,
            width: pinW,
            height: pinH,
            verticalOrigin: C.VerticalOrigin.BOTTOM,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          };
        } catch (e) {
          entityOpt.point = {
            pixelSize: 12 * PIN_SIZE_SCALE,
            color: C.Color.CORNFLOWERBLUE,
            outlineColor: C.Color.WHITE,
            outlineWidth: 2,
            heightReference: C.HeightReference.NONE
          };
        }
      } else {
        entityOpt.point = {
          pixelSize: 12 * PIN_SIZE_SCALE,
          color: C.Color.CORNFLOWERBLUE,
          outlineColor: C.Color.WHITE,
          outlineWidth: 2,
          heightReference: C.HeightReference.NONE
        };
      }

      entityOpt.label = {
        text: labelText,
        font: (14 * PIN_SIZE_SCALE) + 'px sans-serif',
        fillColor: C.Color.WHITE,
        outlineColor: C.Color.BLACK,
        outlineWidth: 2,
        style: C.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: C.VerticalOrigin.BOTTOM,
        pixelOffset: new C.Cartesian2(0, entityOpt.billboard ? -pinH - (8 * PIN_SIZE_SCALE) : -18 * PIN_SIZE_SCALE),
        showBackground: true,
        backgroundColor: new C.Color(0.15, 0.15, 0.2, 0.9),
        backgroundPadding: new C.Cartesian2(10 * PIN_SIZE_SCALE, 6 * PIN_SIZE_SCALE),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        show: false
      };

      try {
        dataSource.entities.add(entityOpt);
      } catch (err) {
        console.warn('Map marker add failed for', loc.id, err);
      }
    });

    var locationIds = {};
    locations.forEach(function (loc) { locationIds[loc.id] = true; });

    function getLocationsInRadius(screenX, screenY, radiusPx) {
      var scene = viewer.scene;
      var nearby = [];
      for (var i = 0; i < locations.length; i++) {
        var loc = locations[i];
        var cartesian = C.Cartesian3.fromDegrees(loc.longitude, loc.latitude, 0);
        var screenPos;
        try {
          screenPos = C.SceneTransforms.worldToWindowCoordinates(scene, cartesian);
        } catch (e) {
          continue;
        }
        if (screenPos && typeof screenPos.x === 'number' && typeof screenPos.y === 'number') {
          var dx = screenPos.x - screenX;
          var dy = screenPos.y - screenY;
          if (dx * dx + dy * dy <= (radiusPx || 70) * (radiusPx || 70)) nearby.push(loc);
        }
      }
      return nearby;
    }

    function getCentroidCartesian(locs) {
      if (!locs || !locs.length) return null;
      var sumLon = 0, sumLat = 0;
      for (var i = 0; i < locs.length; i++) {
        sumLon += locs[i].longitude;
        sumLat += locs[i].latitude;
      }
      return C.Cartesian3.fromDegrees(sumLon / locs.length, sumLat / locs.length, 0);
    }

    /** Bounding rectangle (radians) for a list of locations, with padding, for flyTo when cluster is not in clusterToBounds */
    function getBoundsRectForLocations(locs) {
      if (!locs || !locs.length) return null;
      var lonMin = Infinity, latMin = Infinity, lonMax = -Infinity, latMax = -Infinity;
      for (var i = 0; i < locs.length; i++) {
        var loc = locs[i];
        var lon = loc.longitude * (Math.PI / 180), lat = loc.latitude * (Math.PI / 180);
        if (lon < lonMin) lonMin = lon;
        if (lat < latMin) latMin = lat;
        if (lon > lonMax) lonMax = lon;
        if (lat > latMax) latMax = lat;
      }
      if (lonMin > lonMax || latMin > latMax) return null;
      var pad = 0.2;
      var w = Math.max((lonMax - lonMin) * pad, 0.001);
      var h = Math.max((latMax - latMin) * pad, 0.001);
      return C.Rectangle.fromRadians(lonMin - w, latMin - h, lonMax + w, latMax + h);
    }

    /** Get locations within a geographic radius (degrees) of a point - for reliable cluster zoom/hover when screen radius misses */
    function getLocationsNearPoint(lonDeg, latDeg, radiusDeg) {
      var r = (radiusDeg || 0.08) * (Math.PI / 180);
      var centerLon = lonDeg * (Math.PI / 180), centerLat = latDeg * (Math.PI / 180);
      var nearby = [];
      for (var i = 0; i < locations.length; i++) {
        var loc = locations[i];
        var lon = loc.longitude * (Math.PI / 180), lat = loc.latitude * (Math.PI / 180);
        var dy = lat - centerLat, dx = (lon - centerLon) * Math.cos(centerLat);
        if (dx * dx + dy * dy <= r * r) nearby.push(loc);
      }
      return nearby;
    }

    function isClusterEntity(entity) {
      if (!entity) return false;
      var id = typeof entity.id === 'string' ? entity.id : (entity.id && entity.id.id);
      if (id && locationIds[id]) return false;
      if (entity.label && entity.label.text) {
        var t = String(entity.label.text).trim();
        if (t && /^\d+$/.test(t)) return true;
      }
      return !!(entity.position && (!id || !locationIds[id]));
    }

    function zoomInOneStepTowardCluster(clusterPosition) {
      var camera = viewer.camera;
      var scene = viewer.scene;
      try {
        var carto = C.Cartographic.fromCartesian(clusterPosition);
        var rect = camera.computeViewRectangle(scene.globe.ellipsoid);
        if (rect) {
          var west = rect.west, south = rect.south, east = rect.east, north = rect.north;
          var width = (east - west) * 0.5;
          var height = (north - south) * 0.5;
          var halfW = width * 0.5, halfH = height * 0.5;
          var newWest = C.Math.clamp(carto.longitude - halfW, -Math.PI, Math.PI);
          var newEast = C.Math.clamp(carto.longitude + halfW, -Math.PI, Math.PI);
          var newSouth = C.Math.clamp(carto.latitude - halfH, -C.Math.PI_OVER_TWO, C.Math.PI_OVER_TWO);
          var newNorth = C.Math.clamp(carto.latitude + halfH, -C.Math.PI_OVER_TWO, C.Math.PI_OVER_TWO);
          var newRect = new C.Rectangle(newWest, newSouth, newEast, newNorth);
          camera.flyTo({ destination: newRect, duration: 0.35, complete: function () { scene.requestRender(); } });
        } else {
          var lon = C.Math.toDegrees(carto.longitude);
          var lat = C.Math.toDegrees(carto.latitude);
          var span = 0.015;
          var newRect = C.Rectangle.fromDegrees(lon - span, lat - span * 0.6, lon + span, lat + span * 0.6);
          camera.flyTo({ destination: newRect, duration: 0.35, complete: function () { scene.requestRender(); } });
        }
      } catch (e) {
        if (typeof console !== 'undefined' && console.warn) console.warn('Cluster zoom failed', e);
      }
    }

    var locationByIdForZoom = {};
    locations.forEach(function (loc) { locationByIdForZoom[loc.id] = loc; });

    function tryZoomToCluster(entity) {
      var bounds = clusterToBounds.get(entity);
      if (!bounds) {
        var clusterPos = entity.position && (typeof entity.position.getValue === 'function' ? entity.position.getValue(viewer.clock.currentTime) : entity.position);
        if (clusterPos) {
          var carto = C.Cartographic.fromCartesian(clusterPos);
          var lonDeg = carto.longitude * (180 / Math.PI), latDeg = carto.latitude * (180 / Math.PI);
          var locsNear = getLocationsNearPoint(lonDeg, latDeg, 0.12);
          if (locsNear.length > 0) bounds = getBoundsRectForLocations(locsNear);
        }
        if (!bounds) return null;
      }
      try {
        viewer.camera.flyTo({
          destination: bounds,
          duration: 0.45,
          complete: function () { viewer.scene.requestRender(); }
        });
        return true;
      } catch (e) {
        if (typeof console !== 'undefined' && console.warn) console.warn('Cluster flyTo failed', e);
        return false;
      }
    }

    var handler = new C.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction(function (click) {
      var screenX = typeof click.position.x === 'number' ? click.position.x : 0;
      var screenY = typeof click.position.y === 'number' ? click.position.y : 0;
      var locsInRadius = getLocationsInRadius(screenX, screenY, 120);
      var zoomTarget = locsInRadius.length ? getCentroidCartesian(locsInRadius) : null;

      var picked = viewer.scene.pick(click.position);
      var entity = C.defined(picked) && picked.id ? picked.id : null;
      if (entity) {
        var id = typeof entity.id === 'string' ? entity.id : (entity.id && entity.id.id);
        if (id && locationIds[id]) {
          var loc = locationByIdForZoom[id];
          if (loc) {
            zoomInOneStepTowardCluster(C.Cartesian3.fromDegrees(loc.longitude, loc.latitude, 0));
          }
          return;
        }
        if (isClusterEntity(entity)) {
          if (tryZoomToCluster(entity)) return;
          var clusterPos = entity.position && (typeof entity.position.getValue === 'function' ? entity.position.getValue(viewer.clock.currentTime) : entity.position);
          if (clusterPos) {
            zoomInOneStepTowardCluster(clusterPos);
            return;
          }
        }
      }
      var probeOffsets = [[0, 0], [20, 0], [-20, 0], [0, 20], [0, -20], [15, 15], [-15, 15]];
      for (var p = 0; p < probeOffsets.length; p++) {
        var px = screenX + probeOffsets[p][0], py = screenY + probeOffsets[p][1];
        var probe = viewer.scene.pick(new C.Cartesian2(px, py));
        if (C.defined(probe) && probe.id && isClusterEntity(probe.id)) {
          if (tryZoomToCluster(probe.id)) return;
          var pos = probe.id.position && (typeof probe.id.position.getValue === 'function' ? probe.id.position.getValue(viewer.clock.currentTime) : probe.id.position);
          if (pos) {
            zoomInOneStepTowardCluster(pos);
            return;
          }
        }
      }
      if (locsInRadius.length >= 2) {
        var bounds = getBoundsRectForLocations(locsInRadius);
        if (bounds) {
          try {
            viewer.camera.flyTo({
              destination: bounds,
              duration: 0.45,
              complete: function () { viewer.scene.requestRender(); }
            });
            return;
          } catch (e) { /* ignore */ }
        }
      }
      if (zoomTarget && locsInRadius.length >= 1) {
        zoomInOneStepTowardCluster(zoomTarget);
      }
    }, C.ScreenSpaceEventType.LEFT_CLICK);

    function getLocationsForClusterEntity(clusterEntity) {
      if (!clusterEntity || !clusterEntity.position) return [];
      var pos = clusterEntity.position;
      var cartesian = typeof pos.getValue === 'function' ? pos.getValue(viewer.clock.currentTime) : pos;
      if (!cartesian) return [];
      var carto = C.Cartographic.fromCartesian(cartesian);
      var lonDeg = carto.longitude * (180 / Math.PI), latDeg = carto.latitude * (180 / Math.PI);
      return getLocationsNearPoint(lonDeg, latDeg, 0.12);
    }
    setupLocationChoiceBar(viewer, locations, clusterToLocationIds, getLocationsForClusterEntity);

    // Update on moveEnd for final state; throttle during zoom so clusters split as user zooms in (no per-frame lag).
    viewer.camera.moveEnd.addEventListener(updateClusterPixelRange);
    viewer.camera.changed.addEventListener(throttledUpdateClusterPixelRange);

    // Initial render; clustering will re-evaluate automatically as pixelRange changes with zoom.
    viewer.scene.requestRender();
    dataSource.clustering.pixelRange = INITIAL_PIXEL_RANGE;
  }

  function setupLocationChoiceBar(viewer, locations, clusterToLocationIds, getLocationsForClusterEntity) {
    if (!viewer || !locations.length) return;
    var C = Cesium;
    var bar = document.getElementById('locationChoiceBar');
    var cardsContainer = document.getElementById('locationChoiceBarCards');
    var mapContainer = document.getElementById('heroMapContainer');
    if (!bar || !cardsContainer || !mapContainer) return;
    var clusterMap = clusterToLocationIds || new Map();
    var locationById = {};
    locations.forEach(function (loc) { locationById[loc.id] = loc; });
    var cameraIsMoving = false;
    viewer.camera.moveStart.addEventListener(function () {
      cameraIsMoving = true;
      hideBar();
    });
    viewer.camera.moveEnd.addEventListener(function () {
      cameraIsMoving = false;
    });
    var getClusterLocs = typeof getLocationsForClusterEntity === 'function' ? getLocationsForClusterEntity : null;

    function getNearbyLocations(screenX, screenY) {
      var scene = viewer.scene;
      var nearby = [];
      for (var i = 0; i < locations.length; i++) {
        var loc = locations[i];
        var cartesian = C.Cartesian3.fromDegrees(loc.longitude, loc.latitude, 0);
        var screenPos;
        try {
          screenPos = C.SceneTransforms.worldToWindowCoordinates(scene, cartesian);
        } catch (e) {
          continue;
        }
        if (screenPos && typeof screenPos.x === 'number' && typeof screenPos.y === 'number') {
          var dx = screenPos.x - screenX;
          var dy = screenPos.y - screenY;
          if (dx * dx + dy * dy <= HOVER_RADIUS_PX * HOVER_RADIUS_PX) {
            nearby.push(loc);
          }
        }
      }
      return nearby;
    }

    function ensureExactlyNLocs(locs, n) {
      if (!locs || n < 1) return locs || [];
      if (locs.length >= n) return locs.slice(0, n);
      return locs;
    }

    /** Cluster screen position from centroid of its locations (reliable in 2D). */
    function getClusterScreenPositionFromIds(ids) {
      if (!ids || !ids.length) return null;
      var scene = viewer.scene;
      var sumX = 0, sumY = 0, count = 0;
      for (var i = 0; i < ids.length; i++) {
        var loc = locationById[ids[i]];
        if (!loc || loc.longitude == null || loc.latitude == null) continue;
        try {
          var cartesian = C.Cartesian3.fromDegrees(loc.longitude, loc.latitude, 0);
          var screenPos = C.SceneTransforms.worldToWindowCoordinates(scene, cartesian);
          if (screenPos && typeof screenPos.x === 'number' && typeof screenPos.y === 'number') {
            sumX += screenPos.x; sumY += screenPos.y; count++;
          }
        } catch (e) { /* skip */ }
      }
      if (count === 0) return null;
      return { x: sumX / count, y: sumY / count };
    }
    /** Pin box size in pixels for "cursor on cluster" check. Matches the blue cluster label. */
    var PIN_BOX_HALF_W = 60;
    var PIN_BOX_HALF_H = 45;

    /** Show choice bar only when cursor is on the pin box. Single pick first; fallback: one pass over clusters by position. */
    function getLocationsForHover(screenX, screenY) {
      var picked = viewer.scene.pick(new C.Cartesian2(screenX, screenY));
      if (C.defined(picked) && picked.id) {
        if (clusterMap.has(picked.id)) {
          var ids0 = clusterMap.get(picked.id) || [];
          if (ids0.length >= 2) {
            var list0 = ids0.map(function (id) { return locationById[id]; }).filter(Boolean);
            if (list0.length >= 2) return ensureExactlyNLocs(list0, ids0.length);
          }
          return [];
        }
        var eid = typeof picked.id.id === 'string' ? picked.id.id : (picked.id.id && picked.id.id.id);
        if (eid && locationById[eid]) return [locationById[eid]];
      }
      var bestCluster = null;
      var bestCount = Infinity;
      var bestDistSq = Infinity;
      clusterMap.forEach(function (ids, entity) {
        if (!ids || ids.length < 2) return;
        var pos = getClusterScreenPositionFromIds(ids);
        if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') return;
        var dx = Math.abs(screenX - pos.x), dy = Math.abs(screenY - pos.y);
        if (dx <= PIN_BOX_HALF_W && dy <= PIN_BOX_HALF_H) {
          var distSq = (screenX - pos.x) * (screenX - pos.x) + (screenY - pos.y) * (screenY - pos.y);
          if (ids.length < bestCount || (ids.length === bestCount && distSq < bestDistSq)) {
            bestCount = ids.length;
            bestDistSq = distSq;
            var list = ids.map(function (id) { return locationById[id]; }).filter(Boolean);
            if (list.length >= 2) bestCluster = ensureExactlyNLocs(list, ids.length);
          }
        }
      });
      if (bestCluster && bestCluster.length) return bestCluster;
      return [];
    }

    /** Get pin/cluster center in client coordinates. For a single pin with image (bottom-anchored), use visual center so the bar aligns with the image. */
    function getPinCenterClientPosition(nearby) {
      if (!nearby || !nearby.length) return null;
      var scene = viewer.scene;
      var sumX = 0, sumY = 0, count = 0;
      for (var i = 0; i < nearby.length; i++) {
        var loc = nearby[i];
        var cartesian = C.Cartesian3.fromDegrees(loc.longitude, loc.latitude, 0);
        try {
          var screenPos = C.SceneTransforms.worldToWindowCoordinates(scene, cartesian);
          if (screenPos && typeof screenPos.x === 'number' && typeof screenPos.y === 'number') {
            sumX += screenPos.x;
            sumY += screenPos.y;
            count++;
          }
        } catch (e) { /* skip */ }
      }
      if (count === 0) return null;
      var rect = canvas.getBoundingClientRect();
      var centerX = rect.left + (sumX / count);
      var centerY = rect.top + (sumY / count);
      if (count === 1) {
        centerY -= 24 * PIN_SIZE_SCALE;
      }
      return { clientX: centerX, clientY: centerY };
    }

    function resolveImageUrl(relativePath) {
      return resolveLocationImageUrl(relativePath);
    }

    function getImgSrc(loc) {
      var thumbUrl = getThumbnailUrl(loc);
      if (!thumbUrl) return (loc.id === 'KK_OSPREY' ? BLANK_THUMBNAIL_DATAURL : null);
      if (thumbUrl.indexOf('data:') === 0) return thumbUrl;
      return resolveImageUrl(thumbUrl) || resolveImageUrl(THUMBNAIL_BY_ID[loc.id]);
    }

    function getImgFallback(loc) {
      var fallback = THUMBNAIL_FALLBACK && THUMBNAIL_FALLBACK[loc.id];
      if (!fallback) return null;
      return resolveImageUrl(fallback);
    }

    function renderBarCards(nearby) {
      cardsContainer.innerHTML = '';
      if (!nearby.length) return;
      var isSingle = nearby.length === 1;
      if (isSingle) {
        bar.classList.add('location-choice-bar-single');
      } else {
        bar.classList.remove('location-choice-bar-single');
      }
      var blankUrl = BLANK_THUMBNAIL_DATAURL;
      nearby.forEach(function (loc) {
        var imgSrc = getImgSrc(loc);
        var fallbackSrc = getImgFallback(loc);
        var placeholderSrc = getPlaceholderImageUrl(loc.name || loc.id);
        var desc = truncate(loc.description || '', 70);
        var card = document.createElement('div');
        card.className = 'location-choice-card' + (isSingle ? ' location-choice-card-single' : '');
        card.setAttribute('data-location-id', loc.id);
        var wrap = document.createElement('div');
        wrap.className = 'location-choice-card-image-wrap';
        var img = document.createElement('img');
        img.alt = loc.name || '';
        img.src = imgSrc || (loc.id === 'KK_OSPREY' ? blankUrl : placeholderSrc);
        if (fallbackSrc) img.setAttribute('data-fallback', fallbackSrc);
        img.setAttribute('data-placeholder', placeholderSrc);
        img.setAttribute('data-blank-src', blankUrl);
        img.onerror = function () {
          if (this.dataset.fallback) {
            this.src = this.dataset.fallback;
            this.onerror = function () {
              if (this.dataset.placeholder) this.src = this.dataset.placeholder;
            };
          } else if (this.dataset.placeholder) {
            this.src = this.dataset.placeholder;
          } else if (this.dataset.blankSrc) {
            this.src = this.dataset.blankSrc;
          }
        };
        wrap.appendChild(img);
        card.appendChild(wrap);
        var body = document.createElement('div');
        body.className = 'location-choice-card-body';
        body.innerHTML = '<p class="location-choice-card-title">' + (loc.name || loc.id).replace(/</g, '&lt;') + '</p>' +
          '<p class="location-choice-card-desc">' + desc.replace(/</g, '&lt;') + '</p>';
        card.appendChild(body);
        card.addEventListener('click', function () {
          window.open('loading-3d.html?id=' + encodeURIComponent(loc.id), '_blank', 'noopener');
        });
        cardsContainer.appendChild(card);
      });
    }

    function placeFloatingBox(clientX, clientY, singlePin) {
      var pad = 14;
      var pinImageWidth = 48 * PIN_SIZE_SCALE;
      var maxW = window.innerWidth;
      var maxH = window.innerHeight;
      var barW = bar.offsetWidth || 400;
      var barH = bar.offsetHeight || 200;
      var left = clientX + (singlePin ? pinImageWidth + pad : pad);
      var top;
      if (singlePin) {
        top = clientY - barH * 0.5;
        if (top < pad) top = pad;
        if (top + barH > maxH - pad) top = maxH - barH - pad;
      } else {
        top = clientY - barH - pad;
        if (top < pad) top = clientY + pad;
        if (top + barH > maxH - pad) top = maxH - barH - pad;
      }
      if (left + barW > maxW - pad) left = maxW - barW - pad;
      if (left < pad) left = pad;
      bar.style.left = left + 'px';
      bar.style.top = top + 'px';
    }

    var barVisible = false;

    function showBar(nearby, clientX, clientY, reposition) {
      if (reposition !== false) {
        renderBarCards(nearby);
      }
      if (typeof clientX === 'number' && typeof clientY === 'number') {
        bar.classList.add('location-choice-bar-floating');
        bar.classList.add('is-visible');
        bar.setAttribute('aria-hidden', 'false');
        if (reposition !== false) {
          requestAnimationFrame(function () { placeFloatingBox(clientX, clientY, nearby.length === 1); });
        }
      } else {
        bar.classList.add('is-visible');
        bar.setAttribute('aria-hidden', 'false');
      }
      barVisible = true;
    }

    function hideBar() {
      barVisible = false;
      bar.classList.remove('location-choice-bar-single');
      bar.setAttribute('aria-hidden', 'true');
      bar.style.transition = 'none';
      bar.classList.remove('is-visible');
      requestAnimationFrame(function () {
        bar.classList.remove('location-choice-bar-floating');
        bar.removeAttribute('style');
      });
    }

    function isMouseOverBar(clientX, clientY) {
      if (!bar.classList.contains('is-visible')) return false;
      var rect = bar.getBoundingClientRect();
      return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    }

    var canvas = viewer.scene.canvas;
    var canvasRect = canvas.getBoundingClientRect();
    var hoverRaf = null;
    var lastHoverX = -1;
    var lastHoverY = -1;

    function runHoverUpdate(screenX, screenY) {
      canvasRect = canvas.getBoundingClientRect();
      var clientX = canvasRect.left + screenX;
      var clientY = canvasRect.top + screenY;
      var nearby = getLocationsForHover(screenX, screenY);
      if (nearby.length > 0) {
        var anchor = getPinCenterClientPosition(nearby);
        if (anchor) {
          showBar(nearby, anchor.clientX, anchor.clientY, true);
        } else {
          showBar(nearby, clientX, clientY, true);
        }
      } else {
        if (!isMouseOverBar(clientX, clientY)) hideBar();
      }
    }

    //new hover function created to prevent too many hover updates that causes laggy and freeze of map
    var moveHandler = new Cesium.ScreenSpaceEventHandler(canvas);
    var lastHoverTime = 0;
    var HOVER_THROTTLE_MS = 80; // only check hover every 80ms

    moveHandler.setInputAction(function (movement) {
        if (cameraIsMoving) return;
        var x = movement.endPosition.x;
        var y = movement.endPosition.y;
        if (x === lastHoverX && y === lastHoverY) return;
        lastHoverX = x;
        lastHoverY = y;

        var now = Date.now();
        if (now - lastHoverTime < HOVER_THROTTLE_MS) return; // skip if too soon
        lastHoverTime = now;

        if (hoverRaf) cancelAnimationFrame(hoverRaf);
        hoverRaf = requestAnimationFrame(function () {
            hoverRaf = null;
            runHoverUpdate(x, y);
        });
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    mapContainer.addEventListener('mouseleave', function () {
      hideBar();
    });

    document.addEventListener('mousemove', function (e) {
      if (!barVisible || cameraIsMoving) return;
      var clientX = e.clientX;
      var clientY = e.clientY;
      if (isMouseOverBar(clientX, clientY)) return;
      var rect = canvas.getBoundingClientRect();
      var overCanvas = (rect.left <= clientX && clientX <= rect.right && rect.top <= clientY && clientY <= rect.bottom);
      if (!overCanvas) hideBar();
    });
  }

  var markersLoaded = false;
  function loadAndAddMarkers() {
    if (markersLoaded) return;
    getViewer(function (viewer) {
      if (typeof Cesium === 'undefined') return;

      var locationsJson = null;
      var mapDataArray = null;
      var doneCount = 0;

      function maybeDone() {
        doneCount++;
        if (doneCount < 2) return;
        var mapDataToUse = mapDataArray;
        if (!mapDataToUse || !mapDataToUse.length) {
          mapDataToUse = [MAPDATA_KK_OSPREY_FALLBACK];
        }
        var list = normalizeLocations(locationsJson || null, mapDataToUse);
        ALL_PINS_FALLBACK.forEach(function (fallbackLoc) {
          if (!list.some(function (l) { return l.id === fallbackLoc.id; })) {
            var thumb = THUMBNAIL_BY_ID[fallbackLoc.id];
            list.push({
              id: fallbackLoc.id,
              name: fallbackLoc.name,
              description: fallbackLoc.description || '',
              thumbnailUrl: thumb || '',
              longitude: fallbackLoc.longitude,
              latitude: fallbackLoc.latitude
            });
          }
        });
        addMarkersWithClustering(viewer, list);
        markersLoaded = true;
      }

      fetch('../../data/locations.json')
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) { locationsJson = data; maybeDone(); })
        .catch(function () { locationsJson = null; maybeDone(); });

      fetch(API_BASE + '/api/map-data')
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) { mapDataArray = Array.isArray(data) && data.length ? data : [MAPDATA_KK_OSPREY_FALLBACK]; maybeDone(); })
        .catch(function () { mapDataArray = [MAPDATA_KK_OSPREY_FALLBACK]; maybeDone(); });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadAndAddMarkers);
  } else {
    setTimeout(loadAndAddMarkers, 200);
  }
})();
