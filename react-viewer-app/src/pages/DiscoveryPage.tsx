import { useEffect, useRef, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import CesiumNavigation from 'cesium-navigation-es6';
import {
    Viewer,
    Ion,
    ScreenSpaceEventHandler,
    ScreenSpaceEventType,
    Cartesian3,
    Cartesian2,
    Color,
    Entity,
    PointGraphics,
    PolylineGraphics,
    PolygonGraphics,
    LabelGraphics,
    EllipseGraphics,
    HorizontalOrigin,
    VerticalOrigin,
    Cartographic,
    SceneTransforms,
    CameraEventType,
    PolylineDashMaterialProperty,
    CallbackProperty,
    PolygonHierarchy,
    ClassificationType,
    HeadingPitchRange,
    Math as CesiumMath,
} from 'cesium';
import { ArrowLeft } from 'lucide-react';
import { api } from '../services/api';
import Sidebar from '../components/Sidebar';
// ... rest of imports

// Helper: Convert Cartesian3 to [lon, lat, alt] (degrees)
const cartesianToCoords = (cartesian: Cartesian3) => {
    const cartographic = Cartographic.fromCartesian(cartesian);
    return [
        (cartographic.longitude * 180) / Math.PI,
        (cartographic.latitude * 180) / Math.PI,
        cartographic.height
    ];
};

// Helper: Convert positions to GeoJSON Geometry
const toGeoJSON = (type: string, positions: Cartesian3[]) => {
    const coords = positions.map(cartesianToCoords);

    if (type === 'marker') {
        return { type: 'Point', coordinates: coords[0] };
    }
    // Circle needs center and radius (or a point on perimeter). 
    // For simplicity in GeoJSON, we can store it as a LineString of [center, perimeterPoint] 
    // which allows us to reconstruct the radius.
    if (type === 'circle') {
        return { type: 'LineString', coordinates: coords };
    }
    if (type === 'line' || type === 'length' || type === 'height') {
        return { type: 'LineString', coordinates: coords };
    }
    if (type === 'polygon' || type === 'area' || type === 'triangle') {
        // Close the polygon if not closed
        if (coords.length > 0 &&
            (coords[0][0] !== coords[coords.length - 1][0] ||
                coords[0][1] !== coords[coords.length - 1][1])) {
            coords.push(coords[0]);
        }
        return { type: 'Polygon', coordinates: [coords] };
    }
    return null;
};

import MeasurementToolbar from '../components/MeasurementToolbar';
import AnnotationToolbar from '../components/AnnotationToolbar';
import UnitToggle from '../components/UnitToggle';
import EditEntityModal from '../components/EditEntityModal';
import EntityPopup from '../components/EntityPopup';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import './DiscoveryPage.css';

// Set your Cesium Ion access token
Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJhMmNhMWY0OC01MjM5LTQwNGUtYTFmOC0zYzVmMWVkODViMDUiLCJpZCI6MzgzNzg2LCJpYXQiOjE3Njk0OTY5NjV9.U79i-pR2pWdCE6AtHaw0zu7Y3fqnMG1D2pPJeJCSEuk';

// Supervisor's Tilesets Data removed, using dynamic fetching instead

interface DrawnMeasurements {
    length: Entity[];
    height: Entity[];
    triangle: Entity[];
    area: Entity[];
    circle: Entity[];
}

interface UserAnnotations {
    markers: Entity[];
    lines: Entity[];
    polygons: Entity[];
}

export default function DiscoveryPageWrapper() {
    const location = useLocation();
    const queryParams = new URLSearchParams(location.search);
    const modelId = queryParams.get('model');

    const stateSiteTitle = (location.state as { siteTitle?: string })?.siteTitle;

    const [locationData, setLocationData] = useState<{ name: string, description: string, tileset: string | undefined, fromApi?: boolean } | null>(null);
    const [loadingData, setLoadingData] = useState(true);
    const [dataError, setDataError] = useState<string | null>(null);

    // Fetch map data logic
    useEffect(() => {
        if (!modelId) {
            setDataError("No ID parameter provided");
            setLoadingData(false);
            return;
        }

        const fetchLocationData = async () => {
            const API_BASE = (window as any).TemaDataPortal_API_BASE || 'http://localhost:3000';

            try {
                // 1) Try MapData API
                const apiRes = await fetch(`${API_BASE}/api/map-data/${encodeURIComponent(modelId)}`);
                if (apiRes.ok) {
                    const mapData = await apiRes.json();
                    setLocationData({
                        name: mapData.title,
                        description: mapData.description || '',
                        tileset: mapData['3dTiles'],
                        fromApi: true
                    });
                    setLoadingData(false);
                    return;
                }
            } catch (err) {
                console.warn('MapData API not available, falling back to locations.json', err);
            }

            // 2) Fallback to locations.json
            try {
                // Now running from inside /html/cesium-viewer/, so locations.json is at ../../data/locations.json
                const res = await fetch('../../data/locations.json');
                if (!res.ok) throw new Error('Failed to load locations.json');
                const data = await res.json();
                const loc = data.locations.find((l: any) => l.id === modelId);

                if (loc) {
                    setLocationData({
                        name: loc.name,
                        description: loc.description,
                        tileset: loc.dataPaths?.tileset
                    });
                } else {
                    setDataError(`Location not found: ${modelId}`);
                }
            } catch (err: any) {
                console.error("Error loading location data:", err);
                setDataError(`Failed to load data: ${err.message}`);
            }

            setLoadingData(false);
        };

        fetchLocationData();

    }, [modelId]);

    // Check if loading or error
    if (loadingData) {
        return (
            <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }}>
                <div style={{ color: 'white', fontSize: '1.2rem', fontFamily: 'monospace' }}>
                    Loading 3D Model Data...
                </div>
            </div>
        );
    }

    if (dataError) {
        return (
            <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }}>
                <div style={{ padding: '20px', backgroundColor: 'rgba(255,0,0,0.7)', color: 'white', borderRadius: '8px', fontSize: '1.2rem', fontFamily: 'monospace' }}>
                    Error: {dataError}
                </div>
            </div>
        );
    }

    return <DiscoveryPage locationData={locationData!} modelId={modelId} stateSiteTitle={stateSiteTitle} />;
}

function DiscoveryPage({ locationData, modelId, stateSiteTitle }: {
    locationData: { name: string, description: string, tileset: string | undefined, fromApi?: boolean },
    modelId: string | null,
    stateSiteTitle: string | undefined
}) {
    const tilesetUrl: string | undefined = locationData.tileset;
    const siteTitle = locationData.name || stateSiteTitle || modelId;
    const cesiumContainer = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<Viewer | null>(null);
    const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [isViewerReady, setIsViewerReady] = useState(false);
    const [activeTool, setActiveTool] = useState<string | null>(null);
    const [loadedTileset, setLoadedTileset] = useState<any | null>(null); // Use any to avoid importing Cesium3DTileset type explicitly if it causes issues, or we can use Cesium3DTileset since we export it from cesium
    const [, setDrawingPoints] = useState<Cartesian3[]>([]);
    const drawingPointsRef = useRef<Cartesian3[]>([]); // Ref to avoid dependency loop in effect
    const [drawnMeasurements, setDrawnMeasurements] = useState<DrawnMeasurements>({
        length: [],
        height: [],
        triangle: [],
        area: [],
        circle: [],
    });
    const [unitSystem, setUnitSystem] = useState<'metric' | 'imperial'>('metric');

    // Annotation state
    const [activeAnnotationTool, setActiveAnnotationTool] = useState<string | null>(null);
    const annotationPointsRef = useRef<Cartesian3[]>([]);
    const [userAnnotations, setUserAnnotations] = useState<UserAnnotations>({
        markers: [],
        lines: [],
        polygons: [],
    });

    const tempEntitiesRef = useRef<Entity[]>([]);

    // Counters for persistent measurement numbering
    // Counters for persistent measurement numbering
    const measurementCounters = useRef({
        length: 1, // Sample is 1
        height: 1, // Sample is 1
        triangle: 1, // Sample is 1
        area: 1, // No sample
        circle: 1, // No sample
        markers: 1, // Annotation counters
        lines: 1,
        polygons: 1,
    });

    // Sample data visibility/existence state - REMOVED
    // const [sampleMeasurements, setSampleMeasurements] = useState...

    // Removed handleDeleteSampleMeasurement


    const [selectedEntity, setSelectedEntity] = useState<{
        id: string;
        type: string; // 'measurement' or 'annotation'
        subtype: string;
        index: number;
        position: Cartesian3;
        screenCoords: Cartesian2;
        name: string;
        description: string;
    } | null>(null);

    const [editingItem, setEditingItem] = useState<{
        type: string; // 'measurement' or 'annotation'
        subtype: string;
        index: number;
        currentName: string;
        currentDescription: string;
    } | null>(null);

    // Delete confirmation state
    const [deleteConfirmation, setDeleteConfirmation] = useState<{
        show: boolean;
        type: string;
        index: number;
        name: string;
    } | null>(null);

    // Debug State
    const [debugStatus, setDebugStatus] = useState<string>("Initializing...");
    const [lastFetchCount, setLastFetchCount] = useState<number | null>(null);

    // Load features on mount
    useEffect(() => {
        let isMounted = true;

        const fetchFeatures = async () => {
            setDebugStatus("Fetching...");
            try {
                const features = await api.getFeatures();
                console.log("Fetched features from API:", features);
                setLastFetchCount(features.length);
                setDebugStatus(`Loaded ${features.length} items.`);

                if (!isMounted) return;
                if (!viewerRef.current) {
                    setDebugStatus("Loaded items but viewer not ready.");
                    return;
                }
                const viewer = viewerRef.current;

                // Clear existing entities from state-tracked lists to be safe? 
                // Better to assume we are initializing.
                // But if this runs twice, we might duplicate.
                // Ideally we should clear the entities we previously added?
                // Since this only runs on mount (or viewer ready), just proceeding with isMounted should prevent the double-add from the async gap.

                const newDrawn: DrawnMeasurements = { length: [], height: [], triangle: [], area: [], circle: [] };
                const newAnnotations: UserAnnotations = { markers: [], lines: [], polygons: [] };

                // Track max counters - Reset to 1 so if all deleted, next is 1
                const counters = {
                    length: 1,
                    height: 1,
                    triangle: 1,
                    area: 1,
                    circle: 1,
                    markers: 1,
                    lines: 1,
                    polygons: 1,
                };

                features.forEach(f => {
                    try {
                        if (!isMounted) return;
                        // ... (existing parsing logic) ...
                        // GeoJSON parsing depends on type
                        let entity: Entity | null = null;
                        let parsedPositions: Cartesian3[] = [];

                        if (f.geom.type === 'Point') {
                            const [lon, lat, alt] = f.geom.coordinates;
                            parsedPositions = [Cartesian3.fromDegrees(lon, lat, alt)];
                        } else if (f.geom.type === 'LineString') {
                            parsedPositions = f.geom.coordinates.map((c: number[]) => Cartesian3.fromDegrees(c[0], c[1], c[2]));
                        } else if (f.geom.type === 'Polygon') {
                            parsedPositions = f.geom.coordinates[0].map((c: number[]) => Cartesian3.fromDegrees(c[0], c[1], c[2]));
                            // Remove last point (closure) for Cesium which accepts open array for polygon hierarchy? 
                            // Cesium PolygonHierarchy handles it, but let's keep it safe.
                            parsedPositions.pop();
                        }

                        // Create Entity based on type
                        if (f.type === 'length') {
                            // ... (existing length creation) ...
                            const distance = Cartesian3.distance(parsedPositions[0], parsedPositions[1]);
                            const midpoint = Cartesian3.midpoint(parsedPositions[0], parsedPositions[1], new Cartesian3());
                            entity = viewer.entities.add({
                                polyline: new PolylineGraphics({
                                    positions: parsedPositions,
                                    width: 3,
                                    material: Color.ORANGE,
                                    clampToGround: true,
                                }),
                                label: new LabelGraphics({
                                    text: convertDistance(distance),
                                    font: '14px sans-serif',
                                    fillColor: Color.BLACK,
                                    showBackground: true,
                                    backgroundColor: Color.WHITE,
                                    backgroundPadding: new Cartesian2(7, 5),
                                    style: 0,
                                    pixelOffset: new Cartesian2(0, -10),
                                    horizontalOrigin: HorizontalOrigin.CENTER,
                                    verticalOrigin: VerticalOrigin.BOTTOM,
                                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                                }),
                                position: midpoint,
                            });
                            newDrawn.length.push(entity);
                        }
                        // ... (other types omitted for brevity in this replace block, need to be careful not to overwrite them if I don't include them) ...
                        // WAIT: replace_file_content must be exact. I cannot omit lines.
                        // I will target a smaller block to add the log, or use multi_replace.
                        // Actually, let's just add the log at the top of fetchFeatures and inside the loop.
                        else if (f.type === 'height') {
                            const cartographic1 = Cartographic.fromCartesian(parsedPositions[0]);
                            const cartographic2 = Cartographic.fromCartesian(parsedPositions[1]);
                            const heightDiff = Math.abs(cartographic1.height - cartographic2.height);
                            const midpoint = Cartesian3.midpoint(parsedPositions[0], parsedPositions[1], new Cartesian3());
                            entity = viewer.entities.add({
                                polyline: new PolylineGraphics({
                                    positions: parsedPositions,
                                    width: 3,
                                    material: Color.PURPLE,
                                }),
                                label: new LabelGraphics({
                                    text: convertDistance(heightDiff),
                                    font: '14px sans-serif',
                                    fillColor: Color.BLACK,
                                    showBackground: true,
                                    backgroundColor: Color.WHITE,
                                    backgroundPadding: new Cartesian2(7, 5),
                                    style: 0,
                                    pixelOffset: new Cartesian3(10, 0, 0),
                                    horizontalOrigin: HorizontalOrigin.LEFT,
                                    verticalOrigin: VerticalOrigin.CENTER,
                                }),
                                position: midpoint,
                            });
                            newDrawn.height.push(entity);
                        } else if (f.type === 'triangle') {
                        } else if (f.type === 'triangle') {
                            if (parsedPositions.length < 2) return;
                            const p1 = parsedPositions[0];
                            const p2 = parsedPositions[1];

                            const carto1 = Cartographic.fromCartesian(p1);
                            const carto2 = Cartographic.fromCartesian(p2);
                            const cartoRight = new Cartographic(carto2.longitude, carto2.latitude, carto1.height);
                            const p3 = Cartesian3.fromRadians(cartoRight.longitude, cartoRight.latitude, cartoRight.height);

                            const slantDist = Cartesian3.distance(p1, p2);
                            const vertDist = Math.abs(carto2.height - carto1.height);
                            const horizDist = Cartesian3.distance(p1, p3);

                            const midSlant = Cartesian3.midpoint(p1, p2, new Cartesian3());
                            const midVert = Cartesian3.midpoint(p2, p3, new Cartesian3());
                            const midHoriz = Cartesian3.midpoint(p1, p3, new Cartesian3());

                            const labelStyle: Partial<LabelGraphics.ConstructorOptions> = {
                                font: '13px sans-serif',
                                fillColor: Color.BLACK,
                                showBackground: true,
                                backgroundColor: Color.WHITE,
                                backgroundPadding: new Cartesian2(7, 5),
                                style: 0,
                                horizontalOrigin: HorizontalOrigin.CENTER,
                                verticalOrigin: VerticalOrigin.BOTTOM,
                                pixelOffset: new Cartesian2(0, -6),
                                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                            };

                            const slantEntity = viewer.entities.add({
                                polyline: new PolylineGraphics({ positions: [p1, p2], width: 3, material: Color.WHITE }),
                                position: midSlant,
                                label: new LabelGraphics({ ...labelStyle, text: convertDistance(slantDist) }),
                            });

                            const vertEntity = viewer.entities.add({
                                polyline: new PolylineGraphics({ positions: [p2, p3], width: 3, material: Color.WHITE }),
                                position: midVert,
                                label: new LabelGraphics({ ...labelStyle, text: convertDistance(vertDist) }),
                            });

                            const horizEntity = viewer.entities.add({
                                polyline: new PolylineGraphics({
                                    positions: [p1, p3],
                                    width: 3,
                                    material: new PolylineDashMaterialProperty({ color: Color.WHITE, dashLength: 16 }),
                                }),
                                position: midHoriz,
                                label: new LabelGraphics({ ...labelStyle, text: convertDistance(horizDist) }),
                            });

                            const dot = (pos: Cartesian3) => viewer.entities.add({
                                position: pos,
                                point: new PointGraphics({
                                    pixelSize: 10,
                                    color: Color.WHITE,
                                    outlineColor: Color.BLACK,
                                    outlineWidth: 1,
                                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                                }),
                            });
                            const d1 = dot(p1);
                            const d2 = dot(p2);
                            const d3 = dot(p3);

                            entity = slantEntity;
                            (entity as any).subEntities = [vertEntity, horizEntity, d1, d2, d3];
                            newDrawn.triangle.push(entity);
                        } else if (f.type === 'area') {
                            let perimeter = 0;
                            for (let i = 0; i < parsedPositions.length; i++) {
                                const j = (i + 1) % parsedPositions.length;
                                perimeter += Cartesian3.distance(parsedPositions[i], parsedPositions[j]);
                            }
                            const area = perimeter * perimeter / 16; // Approx
                            let lonSum = 0;
                            let latSum = 0;
                            let minHeight = Number.POSITIVE_INFINITY;
                            const cartos = parsedPositions.map(p => Cartographic.fromCartesian(p));
                            cartos.forEach(c => {
                                lonSum += c.longitude;
                                latSum += c.latitude;
                                if (c.height < minHeight) minHeight = c.height;
                            });
                            const centroid = Cartesian3.fromRadians(
                                lonSum / cartos.length,
                                latSum / cartos.length,
                                minHeight
                            );

                            entity = viewer.entities.add({
                                polygon: new PolygonGraphics({
                                    hierarchy: parsedPositions,
                                    material: Color.CYAN.withAlpha(0.5),
                                    outline: true,
                                    outlineColor: Color.CYAN,
                                    outlineWidth: 2,
                                    classificationType: ClassificationType.CESIUM_3D_TILE,
                                }),
                                label: new LabelGraphics({
                                    text: `Area: ${convertArea(area)}\nPerimeter: ${convertDistance(perimeter)}`,
                                    font: '14px sans-serif',
                                    fillColor: Color.BLACK,
                                    showBackground: true,
                                    backgroundColor: Color.WHITE,
                                    backgroundPadding: new Cartesian2(7, 5),
                                    style: 0,
                                    horizontalOrigin: HorizontalOrigin.CENTER,
                                    verticalOrigin: VerticalOrigin.CENTER,
                                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                                }),
                                position: centroid,
                            });
                            newDrawn.area.push(entity);
                        } else if (f.type === 'circle') {
                            if (parsedPositions.length < 2) {
                                console.warn("Skipping invalid circle with < 2 points:", f);
                                return; // Skip this item
                            }
                            const radius = Cartesian3.distance(parsedPositions[0], parsedPositions[1]);
                            const area = Math.PI * radius * radius;
                            entity = viewer.entities.add({
                                position: parsedPositions[0],
                                ellipse: new EllipseGraphics({
                                    semiMajorAxis: radius,
                                    semiMinorAxis: radius,
                                    material: Color.GREEN.withAlpha(0.5),
                                    outline: true,
                                    outlineColor: Color.GREEN,
                                    outlineWidth: 2,
                                    classificationType: ClassificationType.CESIUM_3D_TILE,
                                }),
                                label: new LabelGraphics({
                                    text: `Radius: ${convertDistance(radius)}\nArea: ${convertArea(area)}`,
                                    font: '14px sans-serif',
                                    fillColor: Color.BLACK,
                                    showBackground: true,
                                    backgroundColor: Color.WHITE,
                                    backgroundPadding: new Cartesian2(7, 5),
                                    style: 0,
                                    pixelOffset: new Cartesian2(0, -10),
                                    horizontalOrigin: HorizontalOrigin.CENTER,
                                    verticalOrigin: VerticalOrigin.CENTER,
                                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                                }),
                            });
                            newDrawn.circle.push(entity);
                        } else if (f.type === 'marker') {
                            entity = viewer.entities.add({
                                position: parsedPositions[0],
                                point: new PointGraphics({
                                    pixelSize: 12,
                                    color: Color.RED,
                                    outlineColor: Color.WHITE,
                                    outlineWidth: 2,
                                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                                }),
                                label: new LabelGraphics({
                                    text: f.name,
                                    font: '14px sans-serif',
                                    fillColor: Color.BLACK,
                                    showBackground: true,
                                    backgroundColor: Color.WHITE,
                                    backgroundPadding: new Cartesian2(7, 5),
                                    style: 0,
                                    pixelOffset: new Cartesian2(0, -20),
                                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                                }),
                            });
                            newAnnotations.markers.push(entity);
                        } else if (f.type === 'line') {
                            entity = viewer.entities.add({
                                polyline: new PolylineGraphics({
                                    positions: parsedPositions,
                                    width: 3,
                                    material: Color.ORANGE,
                                    clampToGround: true,
                                }),
                            });
                            newAnnotations.lines.push(entity);
                        } else if (f.type === 'polygon') {
                            entity = viewer.entities.add({
                                polygon: new PolygonGraphics({
                                    hierarchy: parsedPositions,
                                    material: Color.PURPLE.withAlpha(0.5),
                                    outline: true,
                                    outlineColor: Color.PURPLE,
                                    outlineWidth: 2,
                                    classificationType: ClassificationType.CESIUM_3D_TILE,
                                }),
                            });
                            newAnnotations.polygons.push(entity);
                        }

                        if (entity) {
                            // (entity as any).id = f.id; // REMOVED: Entity.id is read-only
                            (entity as any).dbId = f.id;
                            (entity as any).measurementName = f.name;
                            (entity as any).measurementDescription = f.description;
                            (entity as any).measurementType = f.type;
                            if (f.category === 'annotation') {
                                (entity as any).annotationName = f.name;
                                (entity as any).annotationDescription = f.description;
                                (entity as any).annotationType = f.type;
                            }

                            // Update counter
                            // Name format assumption: "Type N"
                            const match = f.name.match(/(\d+)$/);
                            if (match) {
                                const num = parseInt(match[1]);
                                // Map type to counter key
                                let key = f.type;
                                if (f.type === 'marker') key = 'markers';
                                if (f.type === 'line') key = 'lines';
                                if (f.type === 'polygon' && f.category === 'annotation') key = 'polygons';

                                if ((counters as any)[key] <= num) {
                                    (counters as any)[key] = num + 1;
                                }
                            }
                        }
                    } catch (e) {
                        console.error("Error processing feature", f, e);
                    }
                });

                // Sort entities by their number suffix to ensure correct order
                const sortByNumber = (a: Entity, b: Entity) => {
                    const nameA = (a as any).measurementName || (a as any).annotationName || '';
                    const nameB = (b as any).measurementName || (b as any).annotationName || '';
                    const numA = parseInt(nameA.match(/(\d+)$/)?.[1] || '0');
                    const numB = parseInt(nameB.match(/(\d+)$/)?.[1] || '0');
                    return numA - numB;
                };

                newDrawn.length.sort(sortByNumber);
                newDrawn.height.sort(sortByNumber);
                newDrawn.triangle.sort(sortByNumber);
                newDrawn.area.sort(sortByNumber);
                newDrawn.circle.sort(sortByNumber);

                newAnnotations.markers.sort(sortByNumber);
                newAnnotations.lines.sort(sortByNumber);
                newAnnotations.polygons.sort(sortByNumber);

                setDrawnMeasurements(newDrawn);
                setUserAnnotations(newAnnotations);
                measurementCounters.current = counters;

                // alert(`Loaded ${features.length} features from database.`); // Removed alert

            } catch (err: any) {
                console.error("Failed to load features:", err);
                setDebugStatus(`Error: ${err.message}`);
                // alert("Failed to load features: " + err.message); // Removed alert
            }
        };

        if (isViewerReady && viewerRef.current) {
            fetchFeatures();
        }

        return () => {
            isMounted = false;
        };
    }, [isViewerReady]); // Run when viewer is ready

    // Handle click events for selection
    useEffect(() => {
        if (!viewerRef.current) return;
        const viewer = viewerRef.current;
        const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);

        handler.setInputAction((click: any) => {
            // If drawing, ignore selection
            if (activeTool || activeAnnotationTool) return;

            const pickedObject = viewer.scene.pick(click.position);

            if (pickedObject && pickedObject.id instanceof Entity) {
                const entity = pickedObject.id;
                // Check if it's one of ours
                const measurementType = (entity as any).measurementType;
                const annotationType = (entity as any).annotationType;

                let entityPosition: Cartesian3 | undefined;
                if (entity.position) {
                    entityPosition = entity.position.getValue(viewer.clock.currentTime);
                }

                // Fallback if entity has no position (shouldn't happen for our entities but good safety)
                if (!entityPosition) {
                    // Try to pick position from depth buffer
                    entityPosition = viewer.scene.pickPosition(click.position);
                }

                if (!entityPosition) return; // Can't select if we don't know where it is

                if (measurementType) {
                    // Find index in drawnMeasurements
                    let index = -1;
                    const items = drawnMeasurements[measurementType as keyof DrawnMeasurements];
                    if (items) {
                        index = items.findIndex(e => e.id === entity.id);
                    }

                    if (index !== -1) {
                        setSelectedEntity({
                            id: entity.id,
                            type: 'measurement',
                            subtype: measurementType,
                            index: index,
                            position: entityPosition,
                            screenCoords: click.position,
                            name: (entity as any).measurementName || 'Measurement',
                            description: (entity as any).measurementDescription || ''
                        });
                    }

                } else if (annotationType) {
                    // Find index in userAnnotations
                    let index = -1;
                    // Use a mapped type or simple check
                    let key: keyof UserAnnotations | null = null;
                    if (annotationType === 'marker') key = 'markers';
                    else if (annotationType === 'line') key = 'lines';
                    else if (annotationType === 'polygon') key = 'polygons';

                    if (key && userAnnotations[key]) {
                        index = userAnnotations[key].findIndex(e => e.id === entity.id);
                    }

                    if (index !== -1) {
                        setSelectedEntity({
                            id: entity.id,
                            type: 'annotation',
                            subtype: annotationType,
                            index: index,
                            position: entityPosition,
                            screenCoords: click.position,
                            name: (entity as any).annotationName || 'Annotation',
                            description: (entity as any).annotationDescription || ''
                        });
                    }
                }
            } else {
                setSelectedEntity(null);
            }
        }, ScreenSpaceEventType.LEFT_CLICK);

        return () => {
            if (!handler.isDestroyed()) {
                handler.destroy();
            }
        };
    }, [activeTool, activeAnnotationTool, drawnMeasurements, userAnnotations]);

    // Ref for the popup container to update position without re-renders
    const popupContainerRef = useRef<HTMLDivElement>(null);

    // Effect to track selected entity position
    useEffect(() => {
        if (!selectedEntity || !viewerRef.current) return;

        const viewer = viewerRef.current;

        const updatePosition = () => {
            if (!selectedEntity || !popupContainerRef.current) return;

            // Convert 3D position to screen coordinates
            const screenPos = SceneTransforms.worldToWindowCoordinates(
                viewer.scene,
                selectedEntity.position
            );

            if (screenPos) {
                // Check if the position is effectively behind the camera (though wgs84ToWindowCoordinates usually handles clipping, 
                // sometimes we might want to hide it if it's too close to the edge or behind global horizon, 
                // but standard function returns undefined if behind camera usually? Actually it returns coords, strictly.)
                // Actually SceneTransforms.wgs84ToWindowCoordinates returns undefined if the point is behind the camera in some versions, 
                // or we rely on depth check. 

                // Keep it simple: update position
                popupContainerRef.current.style.display = 'block';
                popupContainerRef.current.style.transform = `translate(${screenPos.x}px, ${screenPos.y}px)`;
            } else {
                popupContainerRef.current.style.display = 'none';
            }
        };

        // Add listener
        const removeListener = viewer.scene.postRender.addEventListener(updatePosition);

        // Initial update
        updatePosition();

        return () => {
            removeListener();
        };
    }, [selectedEntity]);

    const handleUpdateEntityMetadata = (name: string, description: string) => {
        if (!editingItem) return;

        const { type, subtype, index } = editingItem;

        // DB ID lookup
        let dbId: string | undefined;

        if (type === 'measurement') {
            setDrawnMeasurements(prev => {
                const key = subtype as keyof DrawnMeasurements;
                const newArray = [...prev[key]];
                const entity = newArray[index];
                if (entity) {
                    (entity as any).measurementName = name;
                    (entity as any).measurementDescription = description;
                    dbId = (entity as any).dbId;
                }
                return {
                    ...prev,
                    [key]: newArray
                };
            });
        } else if (type === 'annotation') {
            setUserAnnotations(prev => {
                let key: keyof UserAnnotations;
                if (subtype === 'marker') key = 'markers';
                else if (subtype === 'line') key = 'lines';
                else key = 'polygons';

                const newArray = [...prev[key]];
                const entity = newArray[index];
                if (entity) {
                    (entity as any).annotationName = name;
                    (entity as any).annotationDescription = description;
                    dbId = (entity as any).dbId;
                }
                return {
                    ...prev,
                    [key]: newArray
                };
            });
        }

        // Call API
        if (dbId) {
            api.updateFeature(dbId, { name, description }).catch(e => {
                console.error("Update failed", e);
                alert("Update failed: " + e.message);
            });
        }

        // Update selectedEntity ...
        if (selectedEntity &&
            selectedEntity.type === type &&
            selectedEntity.subtype === subtype &&
            selectedEntity.index === index) {

            setSelectedEntity(prev => prev ? ({
                ...prev,
                name: name,
                description: description
            }) : null);
        }
    };

    // ... createCircleMeasurement (omitted for brevity, skipped persistence for now for circle as discussed) ...

    const executeDeleteMeasurement = (type: 'length' | 'height' | 'triangle' | 'area' | 'circle', index: number) => {
        if (!viewerRef.current) return;

        const entity = drawnMeasurements[type][index];
        if (entity) {
            // API Delete
            if ((entity as any).dbId) {
                api.deleteFeature((entity as any).dbId).catch(e => console.error("Delete failed", e));
            }

            // Remove from Cesium viewer
            viewerRef.current.entities.remove(entity);
            if ((entity as any).subEntities) {
                (entity as any).subEntities.forEach((subEntity: Entity) => {
                    viewerRef.current?.entities.remove(subEntity);
                });
            }

            // Update state
            setDrawnMeasurements(prev => {
                // Just filter out the deleted item
                const newArray = prev[type].filter((_, i) => i !== index);

                // Do NOT renumber existing items. 
                // Do NOT decrement measurementCounters.
                // This ensures "Length 1, Length 3" is persisted if "Length 2" is deleted,
                // and next one will be "Length 4".

                return {
                    ...prev,
                    [type]: newArray,
                };
            });

            // If we deleted the one being edited, close modal
            if (editingItem && editingItem.type === 'measurement' && editingItem.subtype === type && editingItem.index === index) {
                setEditingItem(null);
            }
            // If we deleted the selected one, close popup
            if (selectedEntity && selectedEntity.type === 'measurement' && selectedEntity.subtype === type && selectedEntity.index === index) {
                setSelectedEntity(null);
            }
        }
    };

    const executeDeleteAnnotation = (type: 'marker' | 'line' | 'polygon', index: number) => {
        if (!viewerRef.current) return;

        const annotationType = type === 'marker' ? 'markers' : type === 'line' ? 'lines' : 'polygons';
        const entity = userAnnotations[annotationType][index];
        if (entity) {
            // API Delete
            if ((entity as any).dbId) {
                api.deleteFeature((entity as any).dbId).catch(e => console.error("Delete failed", e));
            }

            viewerRef.current.entities.remove(entity);

            setUserAnnotations(prev => {
                const newArray = prev[annotationType].filter((_, i) => i !== index);

                return {
                    ...prev,
                    [annotationType]: newArray,
                };
            });
        }
    };



    // ... existing code ...

    // ... render return ...


    // Unit conversion utility functions
    const convertDistance = (meters: number): string => {
        if (unitSystem === 'imperial') {
            const feet = meters * 3.28084;
            if (feet > 5280) {
                return `${(feet / 5280).toFixed(2)} mi`;
            }
            return `${feet.toFixed(2)} ft`;
        }
        if (meters > 1000) {
            return `${(meters / 1000).toFixed(2)} km`;
        }
        return `${meters.toFixed(2)} m`;
    };

    const convertArea = (sqMeters: number): string => {
        if (unitSystem === 'imperial') {
            const acres = sqMeters / 4046.86;
            return `${acres.toFixed(2)} acres`;
        }
        if (sqMeters > 1000000) {
            return `${(sqMeters / 1000000).toFixed(2)} km²`;
        }
        return `${sqMeters.toFixed(2)} m²`;
    };

    useEffect(() => {
        if (!cesiumContainer.current) return;

        // Initialize Cesium Viewer
        const viewer = new Viewer(cesiumContainer.current, {
            terrainProvider: undefined,
            animation: false,
            timeline: false,
            baseLayerPicker: false,
            geocoder: false,
            homeButton: false,
            sceneModePicker: false,
            navigationHelpButton: false,
            fullscreenButton: false,
            selectionIndicator: false,
            infoBox: false,
        });

        viewerRef.current = viewer;
        setIsViewerReady(true);

        // Remove Earth imagery — pure black background, 3D model only
        viewer.imageryLayers.removeAll();
        viewer.scene.backgroundColor = Color.BLACK;
        viewer.scene.globe.show = false;
        if (viewer.scene.skyBox) viewer.scene.skyBox.show = false;
        if (viewer.scene.sun) viewer.scene.sun.show = false;
        if (viewer.scene.moon) viewer.scene.moon.show = false;
        if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;

        // Remap camera controls: right-click drag = free-look (orbit angle), scroll = zoom
        const camCtrl = viewer.scene.screenSpaceCameraController;
        camCtrl.tiltEventTypes = [{ eventType: CameraEventType.RIGHT_DRAG }];
        camCtrl.zoomEventTypes = [CameraEventType.WHEEL, CameraEventType.PINCH];
        camCtrl.minimumZoomDistance = 10.0;
        camCtrl.maximumZoomDistance = 2500.0;

        // Apply pitch constraints supported by CesiumNavigation-es6
        const minPitch = CesiumMath.toRadians(-90); // Straight down
        const maxPitch = CesiumMath.toRadians(-5); // 5 degrees below horizontal (prevents going under)

        (camCtrl as any).minimumPitch = minPitch;
        (camCtrl as any).maximumPitch = maxPitch;

        // Force camera to stay above model with pre-render position tracking
        let lastValidPosition = new Cartesian3();
        let lastValidOrientation = { heading: 0, pitch: 0, roll: 0 };
        let hasInitialized = false;

        const removePitchConstraint = viewer.scene.preRender.addEventListener(() => {
            const camera = viewer.camera;
            if (camera.pitch <= maxPitch) {
                // Valid state, cache it
                Cartesian3.clone(camera.position, lastValidPosition);
                lastValidOrientation.heading = camera.heading;
                lastValidOrientation.pitch = camera.pitch;
                lastValidOrientation.roll = camera.roll;
                hasInitialized = true;
            } else if (hasInitialized) {
                // Exceeded constraints, aggressively snap both position and pitch back
                camera.setView({
                    destination: lastValidPosition,
                    orientation: lastValidOrientation
                });
            }
        });

        // Initialize CesiumNavigation plugin
        try {
            new CesiumNavigation(viewer, {
                enableCompass: true,
                enableZoomControls: false,
                enableDistanceLegend: false,
                enableCompassOuterRing: false,
            });

            // Move the generated compass into the navigation container
            setTimeout(() => {
                const compass = document.querySelector('.compass');
                const navigationContainer = document.querySelector('.navigation-container');
                if (compass && navigationContainer) {
                    navigationContainer.appendChild(compass);
                }
            }, 100);
        } catch (error) {
            console.error('Failed to initialize CesiumNavigation:', error);
        }

        // Set initial camera position for 3D building view
        viewer.camera.setView({
            destination: Cartesian3.fromDegrees(-75.59, 40.04, 1500), // Philadelphia area, 1500m altitude
            orientation: {
                heading: 0.0, // North
                pitch: -0.5, // Tilt down 30 degrees (in radians, negative is down)
                roll: 0.0
            }
        });

        // Cleanup on unmount
        return () => {
            removePitchConstraint();
            if (viewerRef.current) {
                viewerRef.current.destroy();
                viewerRef.current = null;
            }
        };
    }, []);

    // Handle click events for drawing
    useEffect(() => {
        if (!viewerRef.current || !activeTool) {
            // Clean up handler if no active tool
            if (handlerRef.current) {
                handlerRef.current.destroy();
                handlerRef.current = null;
            }
            // Clear temporary entities
            tempEntitiesRef.current.forEach(entity => {
                if (viewerRef.current) {
                    viewerRef.current.entities.remove(entity);
                }
            });
            tempEntitiesRef.current = [];
            setDrawingPoints([]);
            drawingPointsRef.current = [];

            return;
        }

        const viewer = viewerRef.current;
        const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
        handlerRef.current = handler;

        // Keep track of current mouse position for live previews
        let currentMousePosition: Cartesian3 | null = null;
        const dynamicPositions = new CallbackProperty(() => {
            const pts = [...drawingPointsRef.current];
            if (currentMousePosition && pts.length > 0) {
                pts.push(currentMousePosition);
            }
            return pts;
        }, false);

        handler.setInputAction((movement: any) => {
            currentMousePosition = viewer.scene.pickPosition(movement.endPosition);
        }, ScreenSpaceEventType.MOUSE_MOVE);

        handler.setInputAction((click: any) => {
            const pickedPosition = viewer.scene.pickPosition(click.position);
            if (!pickedPosition) return;

            const currentPoints = drawingPointsRef.current;
            const newPoints = [...currentPoints, pickedPosition];

            // Update both state (for UI) and ref (for logic)
            setDrawingPoints(newPoints);
            drawingPointsRef.current = newPoints;

            // Add temporary point marker
            const pointEntity = viewer.entities.add({
                position: pickedPosition,
                point: new PointGraphics({
                    pixelSize: 8,
                    color: Color.YELLOW,
                    outlineColor: Color.WHITE,
                    outlineWidth: 2,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY, // Ensure points are always visible over the model
                }),
            });
            tempEntitiesRef.current.push(pointEntity);

            // On the very first click, set up the live preview entity
            if (newPoints.length === 1) {
                let previewEntity: Entity | null = null;

                if (activeTool === 'length' || activeTool === 'height') {
                    // Polyline preview
                    previewEntity = viewer.entities.add({
                        polyline: new PolylineGraphics({
                            positions: dynamicPositions,
                            width: 3,
                            material: activeTool === 'height' ? Color.PURPLE : Color.ORANGE,
                            clampToGround: activeTool !== 'height',
                        })
                    });
                } else if (activeTool === 'area') {
                    previewEntity = viewer.entities.add({
                        polyline: new PolylineGraphics({
                            positions: dynamicPositions,
                            width: 3,
                            material: Color.CYAN.withAlpha(0.8),
                            clampToGround: true,
                        }),
                        polygon: new PolygonGraphics({
                            hierarchy: new CallbackProperty(() => {
                                const pts = [...drawingPointsRef.current];
                                if (currentMousePosition) pts.push(currentMousePosition);
                                return pts.length >= 3 ? new PolygonHierarchy(pts) : undefined;
                            }, false),
                            material: Color.CYAN.withAlpha(0.5),
                            classificationType: ClassificationType.CESIUM_3D_TILE,
                        })
                    });
                } else if (activeTool === 'circle') {
                    // Circle preview (ellipse with dynamic axis)
                    previewEntity = viewer.entities.add({
                        position: pickedPosition,
                        ellipse: new EllipseGraphics({
                            semiMajorAxis: new CallbackProperty(() => {
                                if (currentMousePosition) {
                                    const dist = Cartesian3.distance(pickedPosition, currentMousePosition);
                                    return dist > 0.1 ? dist : 0.1;
                                }
                                return 0.1;
                            }, false),
                            semiMinorAxis: new CallbackProperty(() => {
                                if (currentMousePosition) {
                                    const dist = Cartesian3.distance(pickedPosition, currentMousePosition);
                                    return dist > 0.1 ? dist : 0.1;
                                }
                                return 0.1;
                            }, false),
                            material: Color.YELLOW.withAlpha(0.3),
                            outline: true,
                            outlineColor: Color.YELLOW,
                        })
                    });
                } else if (activeTool === 'triangle') {
                    // Triangle preview (solid line to mouse)
                    previewEntity = viewer.entities.add({
                        polyline: new PolylineGraphics({
                            positions: dynamicPositions,
                            width: 3,
                            material: Color.WHITE,
                        })
                    });
                }

                if (previewEntity) {
                    tempEntitiesRef.current.push(previewEntity);
                }
            }

            // Check if we have enough points to complete the measurement
            if (activeTool === 'length' && newPoints.length === 2) {
                createLengthMeasurement(newPoints);
                resetDrawing();
            } else if (activeTool === 'height' && newPoints.length === 2) {
                createHeightMeasurement(newPoints);
                resetDrawing();
            } else if (activeTool === 'triangle' && newPoints.length === 2) {
                createTriangleMeasurement(newPoints);
                resetDrawing();
            } else if (activeTool === 'circle' && newPoints.length === 2) {
                createCircleMeasurement(newPoints);
                resetDrawing();
            }
        }, ScreenSpaceEventType.LEFT_CLICK);

        // For area tool, allow double-click to finish
        if (activeTool === 'area') {
            handler.setInputAction(() => {
                const currentPoints = drawingPointsRef.current;
                if (currentPoints.length >= 3) {
                    // Fill the area on completion
                    createAreaMeasurement(currentPoints);
                    resetDrawing();
                }
            }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
        }

        // Escape key to cancel
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                resetDrawing();
            }
        };
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            if (handlerRef.current) {
                handlerRef.current.destroy();
                handlerRef.current = null;
            }
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [activeTool]); // Remove drawingPoints from dependency array

    const resetDrawing = () => {
        setDrawingPoints([]);
        drawingPointsRef.current = [];
        setActiveTool(null);
        // Clear temporary entities
        tempEntitiesRef.current.forEach(entity => {
            if (viewerRef.current) {
                viewerRef.current.entities.remove(entity);
            }
        });
        tempEntitiesRef.current = [];
    };

    // Annotation drawing handler
    useEffect(() => {
        if (!viewerRef.current || !activeAnnotationTool) return;

        const viewer = viewerRef.current;
        const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);

        let currentMousePosition: Cartesian3 | null = null;
        const dynamicPositions = new CallbackProperty(() => {
            const pts = [...annotationPointsRef.current];
            if (currentMousePosition && pts.length > 0) {
                pts.push(currentMousePosition);
            }
            return pts;
        }, false);

        handler.setInputAction((movement: any) => {
            currentMousePosition = viewer.scene.pickPosition(movement.endPosition);
        }, ScreenSpaceEventType.MOUSE_MOVE);

        handler.setInputAction((click: any) => {
            const pickedPosition = viewer.scene.pickPosition(click.position);
            if (!pickedPosition) return;

            if (activeAnnotationTool === 'marker') {
                // Marker: single click
                createMarker(pickedPosition);
                setActiveAnnotationTool(null); // Deactivate after placing
            } else if (activeAnnotationTool === 'line' || activeAnnotationTool === 'polygon') {
                // Line/Polygon: multi-click
                const currentPoints = annotationPointsRef.current;
                const newPoints = [...currentPoints, pickedPosition];
                annotationPointsRef.current = newPoints;

                // Add temporary point marker
                const pointEntity = viewer.entities.add({
                    position: pickedPosition,
                    point: new PointGraphics({
                        pixelSize: 8,
                        color: Color.YELLOW,
                        outlineColor: Color.WHITE,
                        outlineWidth: 2,
                        disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    }),
                });
                tempEntitiesRef.current.push(pointEntity);

                // Add live preview entity on first click
                if (newPoints.length === 1) {
                    const previewEntity = viewer.entities.add({
                        polyline: new PolylineGraphics({
                            positions: dynamicPositions,
                            width: 3,
                            material: activeAnnotationTool === 'line' ? Color.ORANGE : Color.PURPLE.withAlpha(0.8),
                            clampToGround: true,
                        }),
                        polygon: activeAnnotationTool === 'polygon' ? new PolygonGraphics({
                            hierarchy: new CallbackProperty(() => {
                                const pts = [...annotationPointsRef.current];
                                if (currentMousePosition) pts.push(currentMousePosition);
                                return pts.length >= 3 ? new PolygonHierarchy(pts) : undefined;
                            }, false),
                            material: Color.PURPLE.withAlpha(0.5),
                            classificationType: ClassificationType.CESIUM_3D_TILE,
                        }) : undefined
                    });
                    tempEntitiesRef.current.push(previewEntity);
                }
            }
        }, ScreenSpaceEventType.LEFT_CLICK);

        // Double-click to finish line/polygon
        if (activeAnnotationTool === 'line' || activeAnnotationTool === 'polygon') {
            handler.setInputAction(() => {
                const currentPoints = annotationPointsRef.current;
                if (activeAnnotationTool === 'line' && currentPoints.length >= 2) {
                    createLine(currentPoints);
                    resetAnnotationDrawing();
                } else if (activeAnnotationTool === 'polygon' && currentPoints.length >= 3) {
                    createPolygon(currentPoints);
                    resetAnnotationDrawing();
                }
            }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
        }

        // Escape key to cancel
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                resetAnnotationDrawing();
            }
        };
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            handler.destroy();
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [activeAnnotationTool]);

    const createLengthMeasurement = (points: Cartesian3[]) => {
        if (!viewerRef.current || points.length !== 2) return;

        const distance = Cartesian3.distance(points[0], points[1]);

        const midpoint = Cartesian3.midpoint(points[0], points[1], new Cartesian3());

        // Calculate name using persistent counter
        const nextNumber = measurementCounters.current.length;
        const name = `Length ${nextNumber}`;

        const entity = viewerRef.current.entities.add({
            polyline: new PolylineGraphics({
                positions: points,
                width: 3,
                material: Color.ORANGE,
                clampToGround: true,
            }),
            label: new LabelGraphics({
                text: convertDistance(distance),
                font: '14px sans-serif',
                fillColor: Color.BLACK,
                showBackground: true,
                backgroundColor: Color.WHITE,
                backgroundPadding: new Cartesian2(7, 5),
                style: 0,
                pixelOffset: new Cartesian2(0, -10),
                horizontalOrigin: HorizontalOrigin.CENTER,
                verticalOrigin: VerticalOrigin.BOTTOM,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            }),
            position: midpoint,
        });

        (entity as any).measurementType = 'length';
        (entity as any).measurementName = name;

        // SAVE TO API
        api.createFeature({
            name: name,
            description: '',
            type: 'length',
            category: 'measurement',
            geom: toGeoJSON('length', points)
        }).then(saved => {
            (entity as any).dbId = saved.id;
        }).catch(e => {
            console.error("Failed to save", e);
            alert("Failed to save measurement: " + e.message);
        });

        // Optimistic update
        setDrawnMeasurements(prev => {
            // Create new array with entity
            const newArray = [...prev.length, entity];
            return {
                ...prev,
                length: newArray,
            };
        });

        // Increment persistent counter
        measurementCounters.current.length++;
    };

    const createHeightMeasurement = (points: Cartesian3[]) => {
        if (!viewerRef.current || points.length !== 2) return;

        const cartographic1 = Cartographic.fromCartesian(points[0]);
        const cartographic2 = Cartographic.fromCartesian(points[1]);
        const heightDiff = Math.abs(cartographic1.height - cartographic2.height);

        const midpoint = Cartesian3.midpoint(points[0], points[1], new Cartesian3());

        const entity = viewerRef.current.entities.add({
            polyline: new PolylineGraphics({
                positions: points,
                width: 3,
                material: Color.PURPLE,
            }),
            label: new LabelGraphics({
                text: convertDistance(heightDiff),
                font: '14px sans-serif',
                fillColor: Color.BLACK,
                showBackground: true,
                backgroundColor: Color.WHITE,
                backgroundPadding: new Cartesian2(7, 5),
                style: 0,
                pixelOffset: new Cartesian3(10, 0, 0),
                horizontalOrigin: HorizontalOrigin.LEFT,
                verticalOrigin: VerticalOrigin.CENTER,
            }),
            position: midpoint,
        });

        // Calculate name using persistent counter
        const nextNumber = measurementCounters.current.height;
        const name = `Height ${nextNumber}`;

        (entity as any).measurementType = 'height';
        (entity as any).measurementName = name;

        // SAVE TO API
        api.createFeature({
            name: name,
            description: '',
            type: 'height',
            category: 'measurement',
            geom: toGeoJSON('height', points)
        }).then(saved => {
            (entity as any).dbId = saved.id;
        }).catch(e => {
            console.error("Failed to save", e);
            alert("Failed to save measurement: " + e.message);
        });

        setDrawnMeasurements(prev => {
            const newArray = [...prev.height, entity];
            return {
                ...prev,
                height: newArray,
            };
        });

        // Increment persistent counter
        measurementCounters.current.height++;
    };

    const createTriangleMeasurement = (points: Cartesian3[]) => {
        if (!viewerRef.current || points.length !== 2) return;

        const viewer = viewerRef.current;
        const p1 = points[0]; // bottom point (first click)
        const p2 = points[1]; // top point (second click)

        // Convert to geographic coords
        const carto1 = Cartographic.fromCartesian(p1);
        const carto2 = Cartographic.fromCartesian(p2);

        // Right-angle point: same lon/lat as p2, but same altitude as p1 (horizontal ground point)
        const cartoRight = new Cartographic(carto2.longitude, carto2.latitude, carto1.height);
        const p3 = Cartesian3.fromRadians(cartoRight.longitude, cartoRight.latitude, cartoRight.height);

        // Distances
        const slantDist = Cartesian3.distance(p1, p2);             // hypotenuse (3D diagonal)
        const vertDist = Math.abs(carto2.height - carto1.height); // vertical height
        const horizDist = Cartesian3.distance(p1, p3);             // horizontal ground distance

        // Midpoints for labels
        const midSlant = Cartesian3.midpoint(p1, p2, new Cartesian3());
        const midVert = Cartesian3.midpoint(p2, p3, new Cartesian3());
        const midHoriz = Cartesian3.midpoint(p1, p3, new Cartesian3());

        const name = `Triangle ${measurementCounters.current.triangle}`;

        const labelStyle: Partial<LabelGraphics.ConstructorOptions> = {
            font: '13px sans-serif',
            fillColor: Color.BLACK,
            showBackground: true,
            backgroundColor: Color.WHITE,
            backgroundPadding: new Cartesian2(7, 5),
            style: 0,
            horizontalOrigin: HorizontalOrigin.CENTER,
            verticalOrigin: VerticalOrigin.BOTTOM,
            pixelOffset: new Cartesian2(0, -6),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
        };

        // Hypotenuse — solid white line
        const slantEntity = viewer.entities.add({
            polyline: new PolylineGraphics({
                positions: [p1, p2],
                width: 3,
                material: Color.WHITE,
            }),
            position: midSlant,
            label: new LabelGraphics({ ...labelStyle, text: convertDistance(slantDist) }),
        });

        // Vertical — solid white line
        const vertEntity = viewer.entities.add({
            polyline: new PolylineGraphics({
                positions: [p2, p3],
                width: 3,
                material: Color.WHITE,
            }),
            position: midVert,
            label: new LabelGraphics({ ...labelStyle, text: convertDistance(vertDist) }),
        });

        // Horizontal — dashed white line
        const horizEntity = viewer.entities.add({
            polyline: new PolylineGraphics({
                positions: [p1, p3],
                width: 3,
                material: new PolylineDashMaterialProperty({
                    color: Color.WHITE,
                    dashLength: 16,
                }),
            }),
            position: midHoriz,
            label: new LabelGraphics({ ...labelStyle, text: convertDistance(horizDist) }),
        });

        // Corner point markers
        const dot = (pos: Cartesian3) => viewer.entities.add({
            position: pos,
            point: new PointGraphics({
                pixelSize: 10,
                color: Color.WHITE,
                outlineColor: Color.BLACK,
                outlineWidth: 1,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            }),
        });
        const d1 = dot(p1);
        const d2 = dot(p2);
        const d3 = dot(p3);

        // Use slantEntity as the primary tracked entity
        const entity = slantEntity;
        (entity as any).measurementType = 'triangle';
        (entity as any).measurementName = name;
        // Keep references to sub-entities for deletion
        (entity as any).subEntities = [vertEntity, horizEntity, d1, d2, d3];

        // SAVE TO API
        api.createFeature({
            name,
            description: '',
            type: 'triangle',
            category: 'measurement',
            geom: toGeoJSON('line', [p1, p2]),
        }).then(saved => {
            (entity as any).dbId = saved.id;
        }).catch(e => {
            console.error('Failed to save', e);
        });

        setDrawnMeasurements(prev => ({
            ...prev,
            triangle: [...prev.triangle, entity],
        }));

        measurementCounters.current.triangle++;
    };

    const createAreaMeasurement = (points: Cartesian3[]) => {
        if (!viewerRef.current || points.length < 3) return;

        // Calculate perimeter
        let perimeter = 0;
        for (let i = 0; i < points.length; i++) {
            const j = (i + 1) % points.length;
            perimeter += Cartesian3.distance(points[i], points[j]);
        }

        // Simple area calculation (approximation using perimeter squared)
        const area = perimeter * perimeter / 16;

        // Calculate centroid using lowest geographic point
        let lonSum = 0;
        let latSum = 0;
        let minHeight = Number.POSITIVE_INFINITY;
        const cartos = points.map(p => Cartographic.fromCartesian(p));
        cartos.forEach(c => {
            lonSum += c.longitude;
            latSum += c.latitude;
            if (c.height < minHeight) minHeight = c.height;
        });
        const centroid = Cartesian3.fromRadians(
            lonSum / cartos.length,
            latSum / cartos.length,
            minHeight
        );

        // Calculate name using persistent counter
        const nextNumber = measurementCounters.current.area;
        const name = `Area ${nextNumber}`;

        const entity = viewerRef.current.entities.add({
            polygon: new PolygonGraphics({
                hierarchy: points,
                material: Color.CYAN.withAlpha(0.5),
                outline: true,
                outlineColor: Color.CYAN,
                outlineWidth: 2,
                classificationType: ClassificationType.CESIUM_3D_TILE,
            }),
            label: new LabelGraphics({
                text: `Area: ${convertArea(area)}\nPerimeter: ${convertDistance(perimeter)}`,
                font: '14px sans-serif',
                fillColor: Color.BLACK,
                showBackground: true,
                backgroundColor: Color.WHITE,
                backgroundPadding: new Cartesian2(7, 5),
                style: 0,
                horizontalOrigin: HorizontalOrigin.CENTER,
                verticalOrigin: VerticalOrigin.CENTER,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            }),
            position: centroid,
        });

        (entity as any).measurementType = 'area';
        (entity as any).measurementName = name;

        // SAVE TO API
        api.createFeature({
            name: name,
            description: '',
            type: 'area',
            category: 'measurement',
            geom: toGeoJSON('area', points)
        }).then(saved => {
            (entity as any).dbId = saved.id;
        }).catch(e => {
            console.error("Failed to save", e);
            alert("Failed to save measurement: " + e.message);
        });

        setDrawnMeasurements(prev => {
            const newArray = [...prev.area, entity];
            return {
                ...prev,
                area: newArray,
            };
        });

        // Increment persistent counter
        measurementCounters.current.area++;
    };

    // Annotation creation functions
    const createMarker = (position: Cartesian3) => {
        if (!viewerRef.current) return;

        const viewer = viewerRef.current;
        const entity = viewer.entities.add({
            position: position,
            point: new PointGraphics({
                pixelSize: 12,
                color: Color.RED,
                outlineColor: Color.WHITE,
                outlineWidth: 2,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            }),
            label: new LabelGraphics({
                text: `Point ${measurementCounters.current.markers}`,
                font: '14px sans-serif',
                fillColor: Color.BLACK,
                showBackground: true,
                backgroundColor: Color.WHITE,
                backgroundPadding: new Cartesian2(7, 5),
                style: 0,
                pixelOffset: new Cartesian2(0, -20),
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            }),
        });

        const counter = measurementCounters.current.markers++;
        const name = `Point ${counter}`;
        (entity as any).annotationType = 'marker';
        (entity as any).annotationName = name;

        // SAVE TO API
        api.createFeature({
            name: name,
            description: '',
            type: 'marker',
            category: 'annotation',
            geom: toGeoJSON('marker', [position])
        }).then(saved => {
            (entity as any).dbId = saved.id;
        }).catch(e => {
            console.error("Failed to save", e);
            alert("Failed to save measurement: " + e.message);
        });

        setUserAnnotations(prev => ({
            ...prev,
            markers: [...prev.markers, entity],
        }));
    };

    const createLine = (points: Cartesian3[]) => {
        if (!viewerRef.current) return;

        const viewer = viewerRef.current;
        const entity = viewer.entities.add({
            polyline: new PolylineGraphics({
                positions: points,
                width: 3,
                material: Color.ORANGE,
                clampToGround: true,
            }),
        });

        const counter = measurementCounters.current.lines++;
        const name = `Line ${counter}`;
        (entity as any).annotationType = 'line';
        (entity as any).annotationName = name;

        // SAVE TO API
        api.createFeature({
            name: name,
            description: '',
            type: 'line',
            category: 'annotation',
            geom: toGeoJSON('line', points)
        }).then(saved => {
            (entity as any).dbId = saved.id;
        }).catch(e => {
            console.error("Failed to save", e);
            alert("Failed to save measurement: " + e.message);
        });

        setUserAnnotations(prev => ({
            ...prev,
            lines: [...prev.lines, entity],
        }));
    };

    const createPolygon = (points: Cartesian3[]) => {
        if (!viewerRef.current) return;

        const viewer = viewerRef.current;
        const entity = viewer.entities.add({
            polygon: new PolygonGraphics({
                hierarchy: points,
                material: Color.PURPLE.withAlpha(0.5),
                outline: true,
                outlineColor: Color.PURPLE,
                outlineWidth: 2,
                classificationType: ClassificationType.CESIUM_3D_TILE,
            }),
        });

        const counter = measurementCounters.current.polygons++;
        const name = `Polygon ${counter}`;
        (entity as any).annotationType = 'polygon';
        (entity as any).annotationName = name;

        // SAVE TO API
        api.createFeature({
            name: name,
            description: '',
            type: 'polygon',
            category: 'annotation',
            geom: toGeoJSON('polygon', points)
        }).then(saved => {
            (entity as any).dbId = saved.id;
        }).catch(e => {
            console.error("Failed to save", e);
            alert("Failed to save measurement: " + e.message);
        });

        setUserAnnotations(prev => ({
            ...prev,
            polygons: [...prev.polygons, entity],
        }));
    };

    const resetAnnotationDrawing = () => {
        annotationPointsRef.current = [];
        setActiveAnnotationTool(null);
        // Clear temporary markers
        tempEntitiesRef.current.forEach(entity => {
            if (viewerRef.current) {
                viewerRef.current.entities.remove(entity);
            }
        });
        tempEntitiesRef.current = [];
    };


    const createCircleMeasurement = (points: Cartesian3[]) => {
        if (!viewerRef.current || points.length !== 2) return;

        const radius = Cartesian3.distance(points[0], points[1]);
        const area = Math.PI * radius * radius;

        // Calculate name using persistent counter
        const nextNumber = measurementCounters.current.circle;
        const name = `Circle ${nextNumber}`;

        const entity = viewerRef.current.entities.add({
            position: points[0],
            ellipse: new EllipseGraphics({
                semiMajorAxis: radius,
                semiMinorAxis: radius,
                material: Color.GREEN.withAlpha(0.5),
                outline: true,
                outlineColor: Color.GREEN,
                outlineWidth: 2,
                classificationType: ClassificationType.CESIUM_3D_TILE,
            }),
            label: new LabelGraphics({
                text: `Radius: ${convertDistance(radius)}\nArea: ${convertArea(area)}`,
                font: '14px sans-serif',
                fillColor: Color.BLACK,
                showBackground: true,
                backgroundColor: Color.WHITE,
                backgroundPadding: new Cartesian2(7, 5),
                style: 0,
                horizontalOrigin: HorizontalOrigin.CENTER,
                verticalOrigin: VerticalOrigin.CENTER,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            }),
        });

        (entity as any).measurementType = 'circle';
        (entity as any).measurementName = name;

        // Optimistic update
        setDrawnMeasurements(prev => {
            const newArray = [...prev.circle, entity];
            return {
                ...prev,
                circle: newArray,
            };
        });

        // SAVE TO DATABASE
        api.createFeature({
            name: name,
            description: '',
            type: 'circle',
            category: 'measurement',
            geom: toGeoJSON('circle', points)
        }).then(saved => {
            (entity as any).dbId = saved.id;
        }).catch(e => {
            console.error("Failed to save circle:", e);
            alert("Failed to save Circle: " + e.message);
        });
        // Increment persistent counter
        measurementCounters.current.circle++;
    };

    // Pan-to-location handlers
    const handlePanToMeasurement = (type: 'length' | 'height' | 'triangle' | 'area' | 'circle', index: number) => {
        if (!viewerRef.current) return;

        const entity = drawnMeasurements[type][index];
        if (!entity) return;

        const viewer = viewerRef.current;
        let targetPosition: Cartesian3 | undefined;

        // Calculate center position based on entity type
        if (entity.position) {
            // Point-based entities (circle center)
            targetPosition = entity.position.getValue(viewer.clock.currentTime);
        } else if (entity.polyline) {
            // Line-based entities (length, height)
            const positions = entity.polyline.positions?.getValue(viewer.clock.currentTime);
            if (positions && positions.length > 0) {
                // Calculate midpoint
                const midIndex = Math.floor(positions.length / 2);
                targetPosition = positions[midIndex];
            }
        } else if (entity.polygon) {
            // Polygon-based entities (triangle, area)
            const hierarchy = entity.polygon.hierarchy?.getValue(viewer.clock.currentTime);
            if (hierarchy && hierarchy.positions && hierarchy.positions.length > 0) {
                // Calculate centroid
                const positions = hierarchy.positions;
                let x = 0, y = 0, z = 0;
                positions.forEach((pos: Cartesian3) => {
                    x += pos.x;
                    y += pos.y;
                    z += pos.z;
                });
                targetPosition = new Cartesian3(
                    x / positions.length,
                    y / positions.length,
                    z / positions.length
                );
            }
        }

        if (targetPosition) {
            viewer.camera.flyTo({
                destination: Cartesian3.fromRadians(
                    Cartographic.fromCartesian(targetPosition).longitude,
                    Cartographic.fromCartesian(targetPosition).latitude,
                    500 // Height above ground
                ),
                duration: 1.5,
            });
        }
    };

    const handlePanToAnnotation = (type: 'marker' | 'line' | 'polygon', index: number) => {
        if (!viewerRef.current) return;

        const annotationType = type === 'marker' ? 'markers' : type === 'line' ? 'lines' : 'polygons';
        const entity = userAnnotations[annotationType][index];
        if (!entity) return;

        const viewer = viewerRef.current;
        let targetPosition: Cartesian3 | undefined;

        // Calculate center position based on annotation type
        if (entity.position) {
            // Marker
            targetPosition = entity.position.getValue(viewer.clock.currentTime);
        } else if (entity.polyline) {
            // Line
            const positions = entity.polyline.positions?.getValue(viewer.clock.currentTime);
            if (positions && positions.length > 0) {
                const midIndex = Math.floor(positions.length / 2);
                targetPosition = positions[midIndex];
            }
        } else if (entity.polygon) {
            // Polygon
            const hierarchy = entity.polygon.hierarchy?.getValue(viewer.clock.currentTime);
            if (hierarchy && hierarchy.positions && hierarchy.positions.length > 0) {
                const positions = hierarchy.positions;
                let x = 0, y = 0, z = 0;
                positions.forEach((pos: Cartesian3) => {
                    x += pos.x;
                    y += pos.y;
                    z += pos.z;
                });
                targetPosition = new Cartesian3(
                    x / positions.length,
                    y / positions.length,
                    z / positions.length
                );
            }
        }

        if (targetPosition) {
            viewer.camera.flyTo({
                destination: Cartesian3.fromRadians(
                    Cartographic.fromCartesian(targetPosition).longitude,
                    Cartographic.fromCartesian(targetPosition).latitude,
                    500 // Height above ground
                ),
                duration: 1.5,
            });
        }
    };



    return (
        <div className="discovery-page">
            <header className="discovery-header">
                <Link to="/" className="back-button">
                    <ArrowLeft size={20} />
                    <span>Back to Showcases</span>
                </Link>
                <h1 className="discovery-title">{siteTitle} - Data Discovery</h1>
            </header>

            <div className="discovery-content">
                {/* Manual Reload Button & Debug HUD */}
                <div style={{
                    position: 'absolute',
                    top: '10px',
                    right: '400px', // Left of the measurement toolbar
                    zIndex: 1000,
                    background: 'white',
                    padding: '10px',
                    borderRadius: '4px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    maxWidth: '300px',
                    fontSize: '12px'
                }}>
                    <div style={{ marginBottom: '5px', fontWeight: 'bold' }}>Debug Status:</div>
                    <div style={{ marginBottom: '5px' }}>{debugStatus}</div>
                    {lastFetchCount !== null && (
                        <div style={{ marginBottom: '5px' }}>Items in Last Fetch: {lastFetchCount}</div>
                    )}
                    <button
                        onClick={() => {
                            console.log("Manual reload triggered");
                            setDebugStatus("Forcing reload...");
                            window.location.reload();
                        }}
                        style={{ padding: '5px 10px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    >
                        Force Page Reload
                    </button>
                </div>

                {/* Sidebar */}
                <Sidebar
                    isOpen={sidebarOpen}
                    onToggle={() => setSidebarOpen(!sidebarOpen)}
                    viewer={viewerRef.current}
                    siteTitle={siteTitle ?? undefined}
                    tilesetUrl={tilesetUrl ?? undefined}
                    drawnMeasurements={drawnMeasurements}
                    onDeleteMeasurement={executeDeleteMeasurement}
                    onPanToMeasurement={handlePanToMeasurement}
                    userAnnotations={userAnnotations}
                    onDeleteAnnotation={executeDeleteAnnotation}
                    onPanToAnnotation={handlePanToAnnotation}
                    onEditItem={(type, subtype, index) => {
                        let currentName = '';
                        let currentDescription = '';

                        if (type === 'measurement') {
                            const entity = drawnMeasurements[subtype as keyof DrawnMeasurements][index];
                            if (entity) {
                                currentName = (entity as any).measurementName || '';
                                currentDescription = (entity as any).measurementDescription || '';
                            }
                        } else if (type === 'annotation') {
                            const annotationType = subtype as 'marker' | 'line' | 'polygon';
                            const arrayKey = annotationType === 'marker' ? 'markers' : annotationType === 'line' ? 'lines' : 'polygons';
                            const entity = userAnnotations[arrayKey][index];
                            if (entity) {
                                currentName = (entity as any).annotationName || '';
                                currentDescription = (entity as any).annotationDescription || '';
                            }
                        }

                        setEditingItem({
                            type,
                            subtype,
                            index,
                            currentName,
                            currentDescription
                        });
                    }}
                    onTilesetLoad={setLoadedTileset}
                />
                <div className="cesium-container">
                    <AnnotationToolbar
                        onToolSelect={setActiveAnnotationTool}
                        activeTool={activeAnnotationTool}
                        isSidebarOpen={sidebarOpen}
                    />
                    <MeasurementToolbar
                        onToolSelect={setActiveTool}
                        activeTool={activeTool}
                        isSidebarOpen={sidebarOpen}
                    />
                    <UnitToggle
                        unitSystem={unitSystem}
                        onToggle={() => setUnitSystem(prev => prev === 'metric' ? 'imperial' : 'metric')}
                        isSidebarOpen={sidebarOpen}
                    />

                    {/* Drawing Hint Banner */}
                    {(activeTool === 'area' || activeAnnotationTool === 'line' || activeAnnotationTool === 'polygon') && (
                        <div className="drawing-hint-banner">
                            <span className="drawing-hint-icon">🖱️</span>
                            <span><strong>Click</strong> to add points &nbsp;·&nbsp; <strong>Double-click</strong> to finish &nbsp;·&nbsp; <strong>ESC</strong> to cancel</span>
                        </div>
                    )}

                    {(activeTool === 'length' || activeTool === 'height' || activeTool === 'triangle' || activeTool === 'circle') && (
                        <div className="drawing-hint-banner">
                            <span className="drawing-hint-icon">🖱️</span>
                            <span><strong>Click</strong> 2 points to draw &nbsp;·&nbsp; <strong>ESC</strong> to cancel</span>
                        </div>
                    )}

                    {activeAnnotationTool === 'marker' && (
                        <div className="drawing-hint-banner">
                            <span className="drawing-hint-icon">📍</span>
                            <span><strong>Click</strong> to place marker &nbsp;·&nbsp; <strong>ESC</strong> to cancel</span>
                        </div>
                    )}

                    <div ref={cesiumContainer} className="cesium-viewer" />

                    {/* Popup Container - controlled by ref for performance */}
                    <div
                        ref={popupContainerRef}
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            pointerEvents: 'none', // Let clicks pass through transparent areas
                            zIndex: 1000,
                            display: selectedEntity ? 'block' : 'none'
                        }}
                    >
                        {selectedEntity && (
                            <EntityPopup
                                x={0}
                                y={0}
                                name={selectedEntity.name}
                                description={selectedEntity.description}
                                onEdit={() => {
                                    setEditingItem({
                                        type: selectedEntity.type,
                                        subtype: selectedEntity.subtype,
                                        index: selectedEntity.index,
                                        currentName: selectedEntity.name,
                                        currentDescription: selectedEntity.description,
                                    });
                                }}
                                onDelete={() => {
                                    if (selectedEntity) {
                                        // Confirm delete
                                        setDeleteConfirmation({
                                            show: true,
                                            type: selectedEntity.type === 'annotation'
                                                ? `annotation-${selectedEntity.subtype}`
                                                : selectedEntity.subtype,
                                            index: selectedEntity.index,
                                            name: selectedEntity.name
                                        });
                                        setSelectedEntity(null);
                                    }
                                }}
                                onClose={() => setSelectedEntity(null)}
                            />
                        )}
                    </div>

                    {editingItem && (
                        <EditEntityModal
                            isOpen={true}
                            initialName={editingItem.currentName}
                            initialDescription={editingItem.currentDescription}
                            onSave={(name, desc) => {
                                handleUpdateEntityMetadata(name, desc);
                                setEditingItem(null);
                            }}
                            onClose={() => setEditingItem(null)}
                        />
                    )}
                    {/* Custom Delete Confirmation Dialog */}
                    {deleteConfirmation && deleteConfirmation.show && (
                        <div style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            backgroundColor: 'rgba(0, 0, 0, 0.5)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 3000,
                        }}>
                            <div style={{
                                backgroundColor: 'white',
                                padding: '1.5rem',
                                borderRadius: '8px',
                                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                                minWidth: '300px',
                                maxWidth: '90%',
                            }}>
                                <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#1e293b' }}>Confirm Deletion</h3>
                                <p style={{ marginBottom: '1.5rem', color: '#475569' }}>
                                    Are you sure you want to delete <strong>{deleteConfirmation.name}</strong>?
                                </p>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                                    <button
                                        onClick={() => setDeleteConfirmation(null)}
                                        style={{
                                            padding: '0.5rem 1rem',
                                            borderRadius: '4px',
                                            border: '1px solid #cbd5e1',
                                            backgroundColor: 'white',
                                            color: '#475569',
                                            cursor: 'pointer',
                                            fontWeight: 500,
                                        }}
                                        className="hover:bg-slate-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (deleteConfirmation) {
                                                // Check if it's an annotation or measurement
                                                if (deleteConfirmation.type.startsWith('annotation-')) {
                                                    const annotationType = deleteConfirmation.type.replace('annotation-', '') as 'marker' | 'line' | 'polygon';
                                                    executeDeleteAnnotation(annotationType, deleteConfirmation.index);
                                                } else {
                                                    executeDeleteMeasurement(deleteConfirmation.type as any, deleteConfirmation.index);
                                                }
                                                setDeleteConfirmation(null);
                                            }
                                        }}
                                        style={{
                                            padding: '0.5rem 1rem',
                                            borderRadius: '4px',
                                            border: 'none',
                                            backgroundColor: '#ef4444',
                                            color: 'white',
                                            cursor: 'pointer',
                                            fontWeight: 500,
                                        }}
                                        className="hover:bg-red-600"
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Right side controls container */}
                    <div className="right-controls">
                        {/* Navigation (Compass) - Now above zoom controls */}
                        <div className="navigation-container">
                            {/* The navigation library will inject the compass here */}
                        </div>

                        {/* Control buttons */}
                        <div id="controls">
                            <div id="zoom-item" className="scale-item">
                                {/* Reset View */}
                                <div className="el-tooltip__trigger" title="Reset View" onClick={() => {
                                    if (viewerRef.current) {
                                        const viewer = viewerRef.current;

                                        if (loadedTileset) {
                                            viewer.zoomTo(
                                                loadedTileset,
                                                new HeadingPitchRange(
                                                    CesiumMath.toRadians(0.0),
                                                    CesiumMath.toRadians(-20.0),
                                                    loadedTileset.boundingSphere ? loadedTileset.boundingSphere.radius * 2.5 : 800.0
                                                )
                                            );
                                        } else {
                                            // Fallback to default location
                                            viewer.camera.flyTo({
                                                destination: Cartesian3.fromDegrees(-75.59, 40.04, 1500),
                                                orientation: {
                                                    heading: 0.0,
                                                    pitch: -0.5,
                                                    roll: 0.0
                                                },
                                                duration: 1.5
                                            });
                                        }
                                    }
                                }}>
                                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none"
                                        xmlns="http://www.w3.org/2000/svg">
                                        <path d="M13.75 2.5H17.5V6.25" stroke="currentColor" strokeWidth="1.66667"
                                            strokeLinecap="round" strokeLinejoin="round"></path>
                                        <path d="M17.5 13.75V17.5H13.75" stroke="currentColor" strokeWidth="1.66667"
                                            strokeLinecap="round" strokeLinejoin="round"></path>
                                        <path d="M6.25 17.5H2.5V13.75" stroke="currentColor" strokeWidth="1.66667"
                                            strokeLinecap="round" strokeLinejoin="round"></path>
                                        <path d="M2.5 6.25V2.5H6.25" stroke="currentColor" strokeWidth="1.66667" strokeLinecap="round"
                                            strokeLinejoin="round"></path>
                                        <rect x="8" y="8" width="4" height="4" rx="2" fill="currentColor"></rect>
                                    </svg>
                                </div>

                                {/* Zoom In */}
                                <div className="el-tooltip__trigger" title="Zoom In" onClick={() => {
                                    if (viewerRef.current) {
                                        viewerRef.current.camera.zoomIn(viewerRef.current.camera.positionCartographic.height * 0.2);
                                    }
                                }}>
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
                                        xmlns="http://www.w3.org/2000/svg">
                                        <path
                                            d="M12.0208 11.0782L14.8762 13.9328L13.9328 14.8762L11.0782 12.0208C10.016 12.8723 8.69483 13.3354 7.3335 13.3335C4.0215 13.3335 1.3335 10.6455 1.3335 7.3335C1.3335 4.0215 4.0215 1.3335 7.3335 1.3335C10.6455 1.3335 13.3335 4.0215 13.3335 7.3335C13.3354 8.69483 12.8723 10.016 12.0208 11.0782ZM10.6835 10.5835C11.5296 9.71342 12.0021 8.54712 12.0002 7.3335C12.0002 4.75483 9.9115 2.66683 7.3335 2.66683C4.75483 2.66683 2.66683 4.75483 2.66683 7.3335C2.66683 9.9115 4.75483 12.0002 7.3335 12.0002C8.54712 12.0021 9.71342 11.5296 10.5835 10.6835L10.6835 10.5835ZM6.66683 6.66683V4.66683H8.00016V6.66683H10.0002V8.00016H8.00016V10.0002H6.66683V8.00016H4.66683V6.66683Z"
                                            fill="currentColor"></path>
                                    </svg>
                                </div>

                                {/* Zoom Out */}
                                <div className="el-tooltip__trigger" title="Zoom Out" onClick={() => {
                                    if (viewerRef.current) {
                                        viewerRef.current.camera.zoomOut(viewerRef.current.camera.positionCartographic.height * 0.2);
                                    }
                                }}>
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
                                        xmlns="http://www.w3.org/2000/svg">
                                        <path
                                            d="M12.0208 11.0782L14.8762 13.9328L13.9328 14.8762L11.0782 12.0208C10.016 12.8723 8.69483 13.3354 7.3335 13.3335C4.0215 13.3335 1.3335 10.6455 1.3335 7.3335C1.3335 4.0215 4.0215 1.3335 7.3335 1.3335C10.6455 1.3335 13.3335 4.0215 13.3335 7.3335C13.3354 8.69483 12.8723 10.016 12.0208 11.0782ZM10.6835 10.5835C11.5296 9.71342 12.0021 8.54712 12.0002 7.3335C12.0002 4.75483 9.9115 2.66683 7.3335 2.66683C4.75483 2.66683 2.66683 4.75483 2.66683 7.3335C2.66683 9.9115 4.75483 12.0002 7.3335 12.0002C8.54712 12.0021 9.71342 11.5296 10.5835 10.6835L10.6835 10.5835ZM4.66683 6.66683H10.0002V8.00016H4.66683V6.66683Z"
                                            fill="currentColor"></path>
                                    </svg>
                                </div>

                                <div className="divider"></div>

                                {/* Fullscreen */}
                                <div className="el-tooltip__trigger" title="Fullscreen" onClick={() => {
                                    if (!document.fullscreenElement) {
                                        document.documentElement.requestFullscreen().catch((err) => {
                                            console.error(`Error attempting to enable fullscreen: ${err.message} (${err.name})`);
                                        });
                                    } else {
                                        document.exitFullscreen();
                                    }
                                }}>
                                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none"
                                        xmlns="http://www.w3.org/2000/svg">
                                        <path d="M13.75 2.5H17.5V6.25" stroke="currentColor" strokeWidth="1.66667"
                                            strokeLinecap="round" strokeLinejoin="round"></path>
                                        <path d="M17.5 13.75V17.5H13.75" stroke="currentColor" strokeWidth="1.66667"
                                            strokeLinecap="round" strokeLinejoin="round"></path>
                                        <path d="M6.25 17.5H2.5V13.75" stroke="currentColor" strokeWidth="1.66667"
                                            strokeLinecap="round" strokeLinejoin="round"></path>
                                        <path d="M2.5 6.25V2.5H6.25" stroke="currentColor" strokeWidth="1.66667" strokeLinecap="round"
                                            strokeLinejoin="round"></path>
                                    </svg>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

