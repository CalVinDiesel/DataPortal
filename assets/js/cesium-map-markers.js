/**
 * Add location markers (pins) on the overview Cesium 2D map with thumbnails and clustering.
 * Uses the viewer from cesium-map.js (window.cesiumViewer). No separate "link" is needed for images:
 * both scripts run on the same page, so image URLs are resolved from the document (same base as
 * <img src="../../assets/..."> on the landing page) and load on the overview map.
 * Loads locations from data/locations.json and from MapData API; pins use project images as thumbnails.
 * KK_OSPREY uses a blank placeholder thumbnail. Clustering groups nearby pins when zoomed out and shows count.
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
    dataSource.clustering.pixelRange = 55;
    dataSource.clustering.minimumClusterSize = 2;
    var clusterToLocationIds = new Map();
    dataSource.clustering.clusterEvent.addEventListener(function (entities, cluster) {
      cluster.label.show = true;
      cluster.label.text = entities.length.toString();
      cluster.label.font = 'bold 16px sans-serif';
      cluster.label.fillColor = C.Color.WHITE;
      cluster.label.outlineColor = C.Color.BLACK;
      cluster.label.outlineWidth = 2;
      cluster.label.style = C.LabelStyle.FILL_AND_OUTLINE;
      cluster.label.disableDepthTestDistance = Number.POSITIVE_INFINITY;
      cluster.label.showBackground = true;
      cluster.label.backgroundColor = new C.Color(0.2, 0.4, 0.7, 0.95);
      cluster.label.backgroundPadding = new C.Cartesian2(10, 8);
      if (cluster.billboard) cluster.billboard.show = false;
      if (cluster.point) cluster.point.show = false;
      var ids = entities.map(function (e) { return e.id; }).filter(Boolean);
      if (ids.length) clusterToLocationIds.set(cluster, ids);
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

      if (thumbUrl) {
        try {
          var imgUrl = thumbUrl.indexOf('data:') === 0 ? thumbUrl : (resolveLocationImageUrl(thumbUrl) || new URL(thumbUrl.trim(), window.location.href).href);
          entityOpt.billboard = {
            image: imgUrl,
            width: 48,
            height: 48,
            verticalOrigin: C.VerticalOrigin.BOTTOM,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          };
        } catch (e) {
          entityOpt.point = {
            pixelSize: 12,
            color: C.Color.CORNFLOWERBLUE,
            outlineColor: C.Color.WHITE,
            outlineWidth: 2,
            heightReference: C.HeightReference.NONE
          };
        }
      } else {
        entityOpt.point = {
          pixelSize: 12,
          color: C.Color.CORNFLOWERBLUE,
          outlineColor: C.Color.WHITE,
          outlineWidth: 2,
          heightReference: C.HeightReference.NONE
        };
      }

      entityOpt.label = {
        text: labelText,
        font: '14px sans-serif',
        fillColor: C.Color.WHITE,
        outlineColor: C.Color.BLACK,
        outlineWidth: 2,
        style: C.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: C.VerticalOrigin.BOTTOM,
        pixelOffset: new C.Cartesian2(0, entityOpt.billboard ? -56 : -18),
        showBackground: true,
        backgroundColor: new C.Color(0.15, 0.15, 0.2, 0.9),
        backgroundPadding: new C.Cartesian2(10, 6),
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

    var handler = new C.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction(function (click) {
      var screenX = typeof click.position.x === 'number' ? click.position.x : 0;
      var screenY = typeof click.position.y === 'number' ? click.position.y : 0;
      var locsInRadius = getLocationsInRadius(screenX, screenY, 100);
      var zoomTarget = locsInRadius.length ? getCentroidCartesian(locsInRadius) : null;

      var picked = viewer.scene.pick(click.position);
      if (C.defined(picked) && picked.id) {
        var entity = picked.id;
        var id = typeof entity.id === 'string' ? entity.id : (entity.id && entity.id.id);
        if (id && locationIds[id]) {
          var loc = locationByIdForZoom[id];
          if (loc) {
            zoomInOneStepTowardCluster(C.Cartesian3.fromDegrees(loc.longitude, loc.latitude, 0));
          }
          return;
        }
        if (isClusterEntity(entity)) {
          var clusterPos = null;
          if (entity.position) {
            var pos = entity.position;
            clusterPos = typeof pos.getValue === 'function' ? pos.getValue(viewer.clock.currentTime) : pos;
          }
          if (clusterPos) {
            zoomInOneStepTowardCluster(clusterPos);
            return;
          }
        }
      }
      if (zoomTarget && locsInRadius.length >= 1) {
        zoomInOneStepTowardCluster(zoomTarget);
      }
    }, C.ScreenSpaceEventType.LEFT_CLICK);

    setupLocationChoiceBar(viewer, locations, clusterToLocationIds);
    viewer.scene.requestRender();
  }

  function setupLocationChoiceBar(viewer, locations, clusterToLocationIds) {
    if (!viewer || !locations.length) return;
    var C = Cesium;
    var bar = document.getElementById('locationChoiceBar');
    var cardsContainer = document.getElementById('locationChoiceBarCards');
    var mapContainer = document.getElementById('heroMapContainer');
    if (!bar || !cardsContainer || !mapContainer) return;
    var clusterMap = clusterToLocationIds || new Map();
    var locationById = {};
    locations.forEach(function (loc) { locationById[loc.id] = loc; });

    var throttleMs = 80;
    var lastRun = 0;

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

    function getLocationsForHover(screenX, screenY) {
      var picked = viewer.scene.pick(new C.Cartesian2(screenX, screenY));
      if (C.defined(picked) && picked.id) {
        var entityId = typeof picked.id.id === 'string' ? picked.id.id : (picked.id.id && picked.id.id.id);
        if (entityId && locationById[entityId]) {
          return [locationById[entityId]];
        }
        if (clusterMap.has(picked.id)) {
          var ids = clusterMap.get(picked.id);
          return ids.map(function (id) { return locationById[id]; }).filter(Boolean);
        }
        var labelProp = picked.id.label && picked.id.label.text;
        var labelText = labelProp != null && typeof labelProp.getValue === 'function'
          ? labelProp.getValue(viewer.clock.currentTime)
          : labelProp;
        labelText = labelText != null ? String(labelText).trim() : '';
        var n = /^\d+$/.test(labelText) ? parseInt(labelText, 10) : 0;
        if (n >= 2) {
          var inRadius = getLocationsInRadiusForHover(screenX, screenY, 115);
          return inRadius.slice(0, n);
        }
      }
      var tightRadius = getLocationsInRadiusForHover(screenX, screenY, 95);
      if (tightRadius.length >= 2 && tightRadius.length <= 6) {
        return tightRadius;
      }
      var closestOnly = getLocationsInRadiusForHover(screenX, screenY, HOVER_RADIUS_PX);
      return closestOnly.length ? [closestOnly[0]] : [];
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

    /** Get pin/cluster center in client coordinates. For a single pin with image (48px tall, bottom-anchored), use visual center so the bar aligns with the image. */
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
        centerY -= 24;
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
      var pinImageWidth = 48;
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
      var now = Date.now();
      if (now - lastRun < throttleMs) return;
      lastRun = now;
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
      } else if (!isMouseOverBar(clientX, clientY)) {
        hideBar();
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
