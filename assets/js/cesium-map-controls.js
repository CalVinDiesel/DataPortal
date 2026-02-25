/**
 * Wire map control bar (reset, zoom in/out, fullscreen) to Cesium viewer.
 * Depends on cesium-map.js exposing window.cesiumViewer after init.
 */
(function () {
  var defaultDestination =
    typeof Cesium !== 'undefined'
      ? Cesium.Cartesian3.fromDegrees(116.46905, 5.63444, 710000)
      : null;

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
      if (attempts > 100) clearInterval(t);
    }, 50);
  }

  function initControls() {
    var resetBtn = document.getElementById('resetViewBtn');
    var zoomInBtn = document.getElementById('zoomInBtn');
    var zoomOutBtn = document.getElementById('zoomOutBtn');
    var fullscreenBtn = document.getElementById('fullscreenBtn');
    var mapContainer = document.getElementById('heroMapContainer');

    if (!resetBtn && !zoomInBtn && !zoomOutBtn && !fullscreenBtn) return;

    getViewer(function (viewer) {
      if (resetBtn && defaultDestination) {
        resetBtn.addEventListener('click', function () {
          try {
            viewer.camera.setView({ destination: defaultDestination });
            viewer.scene.requestRender();
          } catch (e) {}
        });
      }
      if (zoomInBtn) {
        zoomInBtn.addEventListener('click', function () {
          try {
            var h = viewer.camera.positionCartographic.height;
            viewer.camera.zoomIn(h * 0.4);
            viewer.scene.requestRender();
          } catch (e) {}
        });
      }
      if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', function () {
          try {
            var h = viewer.camera.positionCartographic.height;
            viewer.camera.zoomOut(h * 0.4);
            viewer.scene.requestRender();
          } catch (e) {}
        });
      }
      if (fullscreenBtn && mapContainer) {
        function onFullscreenChange() {
          var isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
          if (viewer && viewer.canvas) {
            viewer.resize();
            viewer.scene.requestRender();
          }
        }
        document.addEventListener('fullscreenchange', onFullscreenChange);
        document.addEventListener('webkitfullscreenchange', onFullscreenChange);
        fullscreenBtn.addEventListener('click', function () {
          try {
            if (!document.fullscreenElement && !document.webkitFullscreenElement) {
              if (mapContainer.requestFullscreen) mapContainer.requestFullscreen();
              else if (mapContainer.webkitRequestFullscreen) mapContainer.webkitRequestFullscreen();
            } else {
              if (document.exitFullscreen) document.exitFullscreen();
              else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
            }
          } catch (e) {}
        });
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initControls);
  } else {
    setTimeout(initControls, 100);
  }
})();
