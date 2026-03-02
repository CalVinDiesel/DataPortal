let cesiumViewer = null;

// --- Initialize Cesium viewer (2D only) ---
// Exposes window.cesiumViewer for cesium-map-markers.js (pins, thumbnails, hover cards).
// Markers script uses the same document to resolve image URLs, so no extra link is needed.
function initializeCesium(containerId = 'cesiumContainer') {
    if (typeof Cesium === 'undefined') {
        console.error('Cesium is not loaded');
        return null;
    }
    if (cesiumViewer && cesiumViewer.scene) {
        return cesiumViewer;
    }

    cesiumViewer = new Cesium.Viewer(containerId, {
        animation: false,
        baseLayerPicker: false,
        fullscreenButton: false,
        vrButton: false,
        geocoder: false,
        homeButton: false,
        infoBox: false,
        sceneModePicker: false,
        selectionIndicator: false,
        timeline: false,
        navigationHelpButton: false,
        navigationInstructionsInitiallyVisible: false,
        sceneMode: Cesium.SceneMode.SCENE2D
    });

    cesiumViewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(116.46905, 5.63444, 710000)
    });

    cesiumViewer.scene.requestRenderMode = true;
    cesiumViewer.scene.maximumRenderTimeChange = Infinity;

    window.cesiumViewer = cesiumViewer;
    return cesiumViewer;
}

window.onload = function () {
    initializeCesium();
};

