/**
 * Add location markers (pins) on the overview Cesium 2D map with thumbnails and clustering.
 * Uses the viewer from cesium-map.js (window.cesiumViewer). No separate "link" is needed for images:
 * both scripts run on the same page, so image URLs are resolved from the document (same base as
 * <img src="../../assets/..."> on the landing page) and load on the overview map.
 * Loads locations from data/locations.json and from MapData API; pins use project images as thumbnails.
 * KK_OSPREY uses a blank placeholder thumbnail. Clustering groups nearby pins when zoomed out and shows count.
 * Expected locations (10): Kota Kinabalu City Centre, Kota Kinabalu Waterfront, Tanjung Aru Zone, Likas Bay Area,
 * Teluk Likas Coastal Strip, KK Osprey, KB 3DTiles Lite, Kolombong (fisheye test), Wisma Merdeka, PPNS YS.
 * Clustering concept: Split/merge depends on how close pins are (lat/lon → screen distance). Zoom IN = clusters split
 * into smaller groups where pins are farther apart on screen, down to single pins. Zoom OUT = nearby pins merge by
 * screen proximity. The count on each pin (e.g. 10, 7, 4, 2, 1) is whatever the proximity dictates—no fixed sequence.
 */
(function () {
  var API_BASE = (typeof window !== 'undefined' && window.TemaDataPortal_API_BASE) || 'http://localhost:3000';

  // Thumbnail paths: KK_OSPREY = empty; 5 locations use uploaded images (kkCityCentre, kkWaterFront, likasBayArea, tanjungAruBeach, telukLikasCoastalStrip; kotakinabalucity optional for city)
  var THUMBNAIL_BY_ID = {
    'KK_OSPREY': '', // empty preview on map
    'kk-city-centre': '../../assets/img/front-pages/locations/kkCityCentre.jpg',
    'kk-waterfront': '../../assets/img/front-pages/locations/kkWaterFront.jpg',
    'kk-likas-bay': '../../assets/img/front-pages/locations/likasBayArea.jpg',
    'kk-tanjung-aru': '../../assets/img/front-pages/locations/tanjungAruBeach.jpg',
    'kk-teleuk-layang': '../../assets/img/front-pages/locations/telukLikasCoastalStrip.jpg'
  };
  // Optional fallback if primary image fails (e.g. kotakinabalucity.jpg for kk-city-centre)
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

  var DEBUG_IMAGE_URLS = true;

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
  var BLANK_THUMBNAIL_DATAURL = 'data:image/gif;base64,R0lGOODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

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
    thumbNailUrl: '',
    updateDateTime: null
  };

  var ALL_PINS_FALLBACK = [
    { id: 'KK_OSPREY', name: 'KK OSPREY', description: '3D model from GeoSabah 3D Hub (Kota Kinabalu area).', thumbnailUrl: '', longitude: 116.070466, latitude: 5.957839 },
    { id: 'kk-city-centre', name: 'Kota Kinabalu City Centre', description: 'High-resolution drone photogrammetry 3D model of Kota Kinabalu city centre.', thumbnailUrl: '', longitude: 116.0735, latitude: 5.9804 },
    { id: 'kk-waterfront', name: 'Kota Kinabalu Waterfront', description: 'Coastal drone capture of Kota Kinabalu waterfront including marina and shoreline.', thumbnailUrl: '', longitude: 116.0712, latitude: 5.9785 },
    { id: 'kk-likas-bay', name: 'Likas Bay Area', description: 'Drone mapping of Likas Bay including beach zones and coastal vegetation.', thumbnailUrl: '', longitude: 116.0952, latitude: 6.0106 },
    { id: 'kk-tanjung-aru', name: 'Tanjung Aru Zone', description: 'Urban-coastal drone capture of Tanjung Aru including residential zones and resorts.', thumbnailUrl: '', longitude: 116.070466, latitude: 5.957839 },
    { id: 'kk-teleuk-layang', name: 'Teluk Likas Coastal Strip', description: 'Drone survey of Teluk Likas coastline including beach morphology.', thumbnailUrl: '', longitude: 116.0891, latitude: 6.0068 }
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

  /** Normalize to { id, name, description, thumbnailUrl, longitude, latitude } */
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
      var rect = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid);
      var is2D = viewer.scene.mode === C.SceneMode.SCENE2D;
      if (!rect) {
        if (is2D) return getClusterPixelRange2DFallback();
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
          var zoomedOutWidth = 1e6;
          var zoomedInWidth = 1e5;
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
      var probeOffsets = [[0, 0], [15, 0], [-15, 0], [0, 15], [0, -15], [10, 10], [-10, 10]];
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

    // Keep clustering smooth while zooming: just update pixelRange as the camera moves.
    // We do NOT toggle clustering on every moveEnd (that caused brief \"glitches\" where pins regrouped twice).
    viewer.camera.changed.addEventListener(updateClusterPixelRange);
    viewer.camera.moveEnd.addEventListener(updateClusterPixelRange);

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

    function getClusterCountFromEntity(entity) {
      if (!entity) return 0;
      try {
        var labelProp = entity.label && entity.label.text;
        if (labelProp == null) return 0;
        var labelText = typeof labelProp.getValue === 'function'
          ? String(labelProp.getValue(viewer.clock.currentTime) || '')
          : String(labelProp);
        labelText = (labelText || '').trim();
        var n = /^\d+$/.test(labelText) ? parseInt(labelText, 10) : 0;
        return n >= 2 ? n : 0;
      } catch (e) { return 0; }
    }

    function probeClusterAt(screenX, screenY) {
      var probeOffsets = [[0, 0], [20, 0], [-20, 0], [0, 20], [0, -20], [15, 15], [-15, 15], [15, -15], [-15, -15], [40, 0], [-40, 0], [0, 40], [0, -40], [28, 28], [-28, 28], [28, -28], [-28, -28], [50, 0], [0, 50], [-50, 0], [0, -50]];
      for (var i = 0; i < probeOffsets.length; i++) {
        var px = screenX + probeOffsets[i][0], py = screenY + probeOffsets[i][1];
        var probe = viewer.scene.pick(new C.Cartesian2(px, py));
        if (C.defined(probe) && probe.id) {
          if (clusterMap.has(probe.id)) {
            var ids = clusterMap.get(probe.id);
            var count = ids ? ids.length : (getClusterCountFromEntity(probe.id) || 0);
            if (count >= 2) return { count: count, entity: probe.id, ids: ids || null };
          }
          var count = getClusterCountFromEntity(probe.id);
          if (count >= 2) return { count: count, entity: probe.id, ids: null };
        }
      }
      return { count: 0, entity: null, ids: null };
    }
    function probeClusterCountAt(screenX, screenY) {
      var r = probeClusterAt(screenX, screenY);
      return r.count;
    }

    function ensureExactlyNLocs(locs, n) {
      if (!locs || n < 1) return locs || [];
      if (locs.length >= n) return locs.slice(0, n);
      return locs;
    }

    /** Return the cluster (and its canonical location ids) whose screen position is under the cursor.
     *  preferredLocationId: prefer cluster that contains this location.
     *  preferredCount: when set (e.g. from picked cluster), prefer cluster with this many locations so pin "4" shows 4, pin "6" shows 6. */
    var TIGHT_CLUSTER_PX = 32;
    function getClusterUnderCursor(screenX, screenY, maxPx, preferredLocationId, preferredCount) {
      var maxSq = (maxPx || 56) * (maxPx || 56);
      var tightSq = TIGHT_CLUSTER_PX * TIGHT_CLUSTER_PX;
      var scene = viewer.scene;
      var time = viewer.clock.currentTime;
      var best = null;
      var bestDistSq = Infinity;
      var bestInTight = null;
      var bestInTightDistSq = Infinity;
      var preferred = null;
      var preferredDistSq = Infinity;
      var byCount = null;
      var byCountDistSq = Infinity;
      clusterMap.forEach(function (ids, entity) {
        if (!entity || !ids || ids.length < 2) return;
        var pos = entity.position;
        var cartesian = pos && typeof pos.getValue === 'function' ? pos.getValue(time) : pos;
        if (!cartesian) return;
        var screenPos;
        try {
          screenPos = C.SceneTransforms.worldToWindowCoordinates(scene, cartesian);
        } catch (e) { return; }
        if (!screenPos || typeof screenPos.x !== 'number' || typeof screenPos.y !== 'number') return;
        var dx = screenPos.x - screenX, dy = screenPos.y - screenY;
        var dSq = dx * dx + dy * dy;
        if (dSq > maxSq) return;
        if (preferredLocationId && ids.indexOf(preferredLocationId) !== -1) {
          if (dSq < preferredDistSq) {
            preferredDistSq = dSq;
            preferred = { entity: entity, ids: ids };
          }
          return;
        }
        if (preferredCount && ids.length === preferredCount && dSq < byCountDistSq) {
          byCountDistSq = dSq;
          byCount = { entity: entity, ids: ids };
        }
        if (dSq <= tightSq && dSq < bestInTightDistSq) {
          bestInTightDistSq = dSq;
          bestInTight = { entity: entity, ids: ids };
        }
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          best = { entity: entity, ids: ids };
        }
      });
      return preferred || byCount || bestInTight || best;
    }

    function getClusterScreenDistance(entity, screenX, screenY) {
      if (!entity || !entity.position) return Infinity;
      var scene = viewer.scene;
      var time = viewer.clock.currentTime;
      var cartesian = typeof entity.position.getValue === 'function' ? entity.position.getValue(time) : entity.position;
      if (!cartesian) return Infinity;
      try {
        var screenPos = C.SceneTransforms.worldToWindowCoordinates(scene, cartesian);
        if (!screenPos || typeof screenPos.x !== 'number') return Infinity;
        var dx = screenPos.x - screenX, dy = screenPos.y - screenY;
        return Math.sqrt(dx * dx + dy * dy);
      } catch (e) { return Infinity; }
    }

    function getLocationsForHover(screenX, screenY) {
      var CLUSTER_HOVER_RADIUS = 700;
      var TIGHT_PX = 36;
      var PIN_RADIUS_PX = 56 * PIN_SIZE_SCALE;
      var picked = viewer.scene.pick(new C.Cartesian2(screenX, screenY));
      // When the user picks a cluster, always use that cluster's data so the choice box matches the pin number at every zoom level.
      if (C.defined(picked) && picked.id && clusterMap.has(picked.id)) {
        var ids = clusterMap.get(picked.id);
        if (ids && ids.length >= 2) {
          var n = getClusterCountFromEntity(picked.id) || ids.length;
          var list = ids.map(function (id) { return locationById[id]; }).filter(Boolean);
          return ensureExactlyNLocs(list, n);
        }
      }
      var preferredId = null;
      var preferredCount = null;
      if (C.defined(picked) && picked.id) {
        var eid = typeof picked.id.id === 'string' ? picked.id.id : (picked.id.id && picked.id.id.id);
        if (eid && locationById[eid]) preferredId = eid;
        var pickedCount = getClusterCountFromEntity(picked.id);
        if (pickedCount >= 2) preferredCount = pickedCount;
      }
      var under = getClusterUnderCursor(screenX, screenY, PIN_RADIUS_PX, preferredId, preferredCount);
      if (under && under.ids && under.ids.length >= 2) {
        var n = getClusterCountFromEntity(under.entity) || under.ids.length;
        var list = under.ids.map(function (id) { return locationById[id]; }).filter(Boolean);
        return ensureExactlyNLocs(list, n);
      }
      if (C.defined(picked) && picked.id) {
        var entityId = typeof picked.id.id === 'string' ? picked.id.id : (picked.id.id && picked.id.id.id);
        if (entityId && locationById[entityId]) {
          var inRadius = getLocationsInRadiusForHover(screenX, screenY, CLUSTER_HOVER_RADIUS);
          var probed = probeClusterAt(screenX, screenY);
          if (probed.count >= 2) {
            var nProbe = getClusterCountFromEntity(probed.entity) || probed.count;
            if (probed.ids) {
              var listProbe = probed.ids.map(function (id) { return locationById[id]; }).filter(Boolean);
              return ensureExactlyNLocs(listProbe, nProbe);
            }
            var byPos = getClusterUnderCursor(screenX, screenY, PIN_RADIUS_PX, entityId, null);
            if (byPos && byPos.ids && byPos.ids.length >= 2) {
              var nBy = getClusterCountFromEntity(byPos.entity) || byPos.ids.length;
              var listBy = byPos.ids.map(function (id) { return locationById[id]; }).filter(Boolean);
              return ensureExactlyNLocs(listBy, nBy);
            }
            if (getClusterLocs && probed.entity) {
              var locs = getClusterLocs(probed.entity);
              if (locs.length > 0) return ensureExactlyNLocs(locs, nProbe);
            }
            return ensureExactlyNLocs(inRadius, nProbe);
          }
          var n = getClusterCountFromEntity(picked.id);
          if (n >= 2) return ensureExactlyNLocs(inRadius, n);
          if (inRadius.length >= 2) {
            var sumX = 0, sumY = 0, scene = viewer.scene;
            for (var r = 0; r < inRadius.length; r++) {
              try {
                var sc = C.SceneTransforms.wgs84ToWindowCoordinates(scene, C.Cartesian3.fromDegrees(inRadius[r].longitude, inRadius[r].latitude, 0));
                if (sc) { sumX += sc.x; sumY += sc.y; }
              } catch (e) { /* skip */ }
            }
            var cx = sumX / inRadius.length, cy = sumY / inRadius.length;
            probed = probeClusterAt(cx, cy);
            if (probed.count >= 2) {
              var nProbe2 = getClusterCountFromEntity(probed.entity) || probed.count;
              if (probed.ids) {
                var listProbe2 = probed.ids.map(function (id) { return locationById[id]; }).filter(Boolean);
                return ensureExactlyNLocs(listProbe2, nProbe2);
              }
              var byPos2 = getClusterUnderCursor(cx, cy, PIN_RADIUS_PX, entityId, null);
              if (byPos2 && byPos2.ids && byPos2.ids.length >= 2) {
                var nBy2 = getClusterCountFromEntity(byPos2.entity) || byPos2.ids.length;
                var listBy2 = byPos2.ids.map(function (id) { return locationById[id]; }).filter(Boolean);
                return ensureExactlyNLocs(listBy2, nBy2);
              }
              if (getClusterLocs && probed.entity) {
                var locs = getClusterLocs(probed.entity);
                if (locs.length > 0) return ensureExactlyNLocs(locs, nProbe2);
              }
              return ensureExactlyNLocs(inRadius, nProbe2);
            }
          }
          return [locationById[entityId]];
        }
        if (clusterMap.has(picked.id)) {
          var ids = clusterMap.get(picked.id);
          var n = getClusterCountFromEntity(picked.id) || ids.length;
          var list = ids.map(function (id) { return locationById[id]; }).filter(Boolean);
          return ensureExactlyNLocs(list, n);
        }
        var n = getClusterCountFromEntity(picked.id);
        if (n >= 2) {
          var byPos = getClusterUnderCursor(screenX, screenY, PIN_RADIUS_PX, null, n);
          if (byPos && byPos.ids && byPos.ids.length >= 2) {
            var list = byPos.ids.map(function (id) { return locationById[id]; }).filter(Boolean);
            return ensureExactlyNLocs(list, n);
          }
          if (getClusterLocs) {
            var clusterLocs = getClusterLocs(picked.id);
            if (clusterLocs.length > 0) return ensureExactlyNLocs(clusterLocs, n);
          }
          var inRadius = getLocationsInRadiusForHover(screenX, screenY, CLUSTER_HOVER_RADIUS);
          return ensureExactlyNLocs(inRadius, n);
        }
        if (getClusterLocs && picked.id && picked.id.position) {
          var clusterLocs = getClusterLocs(picked.id);
          if (clusterLocs.length >= 2) return clusterLocs;
        }
      }
      var tightRadius = getLocationsInRadiusForHover(screenX, screenY, TIGHT_PX);
      if (tightRadius.length === 0) {
        var singlePinRadius = getLocationsInRadiusForHover(screenX, screenY, 52);
        if (singlePinRadius.length === 1) return [singlePinRadius[0]];
        return [];
      }
      var inRadius700 = getLocationsInRadiusForHover(screenX, screenY, CLUSTER_HOVER_RADIUS);
      if (tightRadius.length === 1) {
        var wider = getLocationsInRadiusForHover(screenX, screenY, 600);
        if (wider.length >= 2) {
          var sumX = 0, sumY = 0, scene = viewer.scene;
          for (var w = 0; w < wider.length; w++) {
            try {
              var sw = C.SceneTransforms.wgs84ToWindowCoordinates(scene, C.Cartesian3.fromDegrees(wider[w].longitude, wider[w].latitude, 0));
              if (sw) { sumX += sw.x; sumY += sw.y; }
            } catch (e) { /* skip */ }
          }
          var probed = probeClusterAt(sumX / wider.length, sumY / wider.length);
          if (probed.count === 0) probed = probeClusterAt(screenX, screenY);
          if (probed.count >= 2) {
            var nProbe3 = getClusterCountFromEntity(probed.entity) || probed.count;
            if (probed.ids) {
              var listProbe3 = probed.ids.map(function (id) { return locationById[id]; }).filter(Boolean);
              return ensureExactlyNLocs(listProbe3, nProbe3);
            }
            var byPos3 = getClusterUnderCursor(screenX, screenY, PIN_RADIUS_PX, null, null);
            if (byPos3 && byPos3.ids && byPos3.ids.length >= 2) {
              var nBy3 = getClusterCountFromEntity(byPos3.entity) || byPos3.ids.length;
              var listBy3 = byPos3.ids.map(function (id) { return locationById[id]; }).filter(Boolean);
              return ensureExactlyNLocs(listBy3, nBy3);
            }
            if (getClusterLocs && probed.entity) {
              var locs = getClusterLocs(probed.entity);
              if (locs.length > 0) return ensureExactlyNLocs(locs, nProbe3);
            }
            return ensureExactlyNLocs(wider, nProbe3);
          }
        }
        return [tightRadius[0]];
      }
      if (tightRadius.length >= 2 && tightRadius.length <= 12) {
        var probed = probeClusterAt(screenX, screenY);
        var count = getClusterCountFromEntity(probed.entity) || probed.count;
        if (count >= 2) {
          if (probed.ids) {
            var listT = probed.ids.map(function (id) { return locationById[id]; }).filter(Boolean);
            return ensureExactlyNLocs(listT, count);
          }
          var byPosT = getClusterUnderCursor(screenX, screenY, PIN_RADIUS_PX, null, null);
          if (byPosT && byPosT.ids && byPosT.ids.length >= 2) {
            var nByT = getClusterCountFromEntity(byPosT.entity) || byPosT.ids.length;
            var listByT = byPosT.ids.map(function (id) { return locationById[id]; }).filter(Boolean);
            return ensureExactlyNLocs(listByT, nByT);
          }
          if (getClusterLocs && probed.entity) {
            var clusterLocs = getClusterLocs(probed.entity);
            if (clusterLocs.length > 0) return ensureExactlyNLocs(clusterLocs, count);
          }
          if (tightRadius.length >= count) return tightRadius.slice(0, count);
          var wider = getLocationsInRadiusForHover(screenX, screenY, CLUSTER_HOVER_RADIUS);
          return ensureExactlyNLocs(wider, count);
        }
        var sumX = 0, sumY = 0, scene = viewer.scene;
        for (var t = 0; t < tightRadius.length; t++) {
          var c = C.Cartesian3.fromDegrees(tightRadius[t].longitude, tightRadius[t].latitude, 0);
          try {
            var sp = C.SceneTransforms.wgs84ToWindowCoordinates(scene, c);
            if (sp) { sumX += sp.x; sumY += sp.y; }
          } catch (e) { /* skip */ }
        }
        if (tightRadius.length > 0) {
          var cx = sumX / tightRadius.length, cy = sumY / tightRadius.length;
          probed = probeClusterAt(cx, cy);
          count = getClusterCountFromEntity(probed.entity) || probed.count;
          if (count >= 2) {
            if (probed.ids) {
              var listT2 = probed.ids.map(function (id) { return locationById[id]; }).filter(Boolean);
              return ensureExactlyNLocs(listT2, count);
            }
            var byPosT2 = getClusterUnderCursor(cx, cy, PIN_RADIUS_PX, null, null);
            if (byPosT2 && byPosT2.ids && byPosT2.ids.length >= 2) {
              var nByT2 = getClusterCountFromEntity(byPosT2.entity) || byPosT2.ids.length;
              var listByT2 = byPosT2.ids.map(function (id) { return locationById[id]; }).filter(Boolean);
              return ensureExactlyNLocs(listByT2, nByT2);
            }
            if (getClusterLocs && probed.entity) {
              clusterLocs = getClusterLocs(probed.entity);
              if (clusterLocs.length > 0) return ensureExactlyNLocs(clusterLocs, count);
            }
            if (tightRadius.length >= count) return tightRadius.slice(0, count);
            var wider2 = getLocationsInRadiusForHover(cx, cy, CLUSTER_HOVER_RADIUS);
            return ensureExactlyNLocs(wider2, count);
          }
        }
        return tightRadius;
      }
      return tightRadius.length ? [tightRadius[0]] : [];
    }

    function getLocationsInRadiusForHover(screenX, screenY, radiusPx) {
      var scene = viewer.scene;
      var radius = radiusPx || 90;
      var radiusSq = radius * radius;
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
          var distSq = dx * dx + dy * dy;
          if (distSq <= radiusSq) nearby.push({ loc: loc, distSq: distSq });
        }
      }
      nearby.sort(function (a, b) { return a.distSq - b.distSq; });
      return nearby.map(function (a) { return a.loc; });
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

    var moveHandler = new Cesium.ScreenSpaceEventHandler(canvas);
    moveHandler.setInputAction(function (movement) {
      canvasRect = canvas.getBoundingClientRect();
      var clientX = canvasRect.left + movement.endPosition.x;
      var clientY = canvasRect.top + movement.endPosition.y;
      var nearby = getLocationsForHover(movement.endPosition.x, movement.endPosition.y);
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
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    mapContainer.addEventListener('mouseleave', function () {
      hideBar();
    });

    document.addEventListener('mousemove', function (e) {
      if (!barVisible) return;
      var clientX = e.clientX;
      var clientY = e.clientY;
      var rect = canvas.getBoundingClientRect();
      var overBar = isMouseOverBar(clientX, clientY);
      var overCanvas = (rect.left <= clientX && clientX <= rect.right && rect.top <= clientY && clientY <= rect.bottom);
      if (overBar) return;
      if (overCanvas) {
        var canvasX = clientX - rect.left;
        var canvasY = clientY - rect.top;
        var nearby = getLocationsForHover(canvasX, canvasY);
        if (nearby.length === 0) hideBar();
      } else {
        hideBar();
      }
    });
  }

  function loadAndAddMarkers() {
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
