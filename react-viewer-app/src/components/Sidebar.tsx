import { useState, useEffect, useRef } from 'react';
import {
    Viewer,
    Entity,
    Cesium3DTileset,
    HeadingPitchRange,
    Math as CesiumMath,
} from 'cesium';
import {
    ChevronLeft,
    ChevronRight,
    Layers,
    MapPin,
    Ruler,
    ChevronDown,
    ChevronUp,
    X,
    Edit2,
} from 'lucide-react';
import './Sidebar.css';

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

interface SidebarProps {
    isOpen: boolean;
    onToggle: () => void;
    viewer: Viewer | null;
    siteTitle?: string;
    tilesetUrl?: string;
    onTilesetLoad?: (tileset: Cesium3DTileset) => void;
    drawnMeasurements: DrawnMeasurements;
    onDeleteMeasurement: (type: 'length' | 'height' | 'triangle' | 'area' | 'circle', index: number) => void;
    onPanToMeasurement: (type: 'length' | 'height' | 'triangle' | 'area' | 'circle', index: number) => void;
    userAnnotations: UserAnnotations;
    onDeleteAnnotation: (type: 'marker' | 'line' | 'polygon', index: number) => void;
    onPanToAnnotation: (type: 'marker' | 'line' | 'polygon', index: number) => void;
    onEditItem: (type: 'measurement' | 'annotation', subtype: string, index: number) => void;
}

interface LayerState {
    '3DModel': boolean;
    'DSM': boolean;
    'DOM': boolean;
    'Modeling area': boolean;
}

interface AnnotationState {
    [key: string]: boolean;
}

interface MeasurementState {
    [key: string]: boolean;
}

interface EntityRefs {
    models: { [key: string]: Cesium3DTileset | null };
    annotations: { [key: string]: Entity[] };
    measurements: { [key: string]: Entity[] };
}

function Sidebar({ isOpen, onToggle, viewer, siteTitle = 'SITE', tilesetUrl, drawnMeasurements, onDeleteMeasurement, onPanToMeasurement, userAnnotations, onDeleteAnnotation, onPanToAnnotation, onEditItem, onTilesetLoad }: SidebarProps) {
    const [expandedSections, setExpandedSections] = useState({
        models: true,
        annotations: true,
        measurement: true,
    });

    const [expandedMeasurements, setExpandedMeasurements] = useState({
        Length: false,
        Height: false,
        Triangle: false,
        Area: false,
        Circle: false,
    });



    const [expandedPoints, setExpandedPoints] = useState(true);
    const [expandedLines, setExpandedLines] = useState(false);
    const [expandedPolygons, setExpandedPolygons] = useState(false);




    // Track visibility of individual measurement items
    const [measurementItemVisibility, setMeasurementItemVisibility] = useState<{
        [key: string]: boolean;
    }>({});

    // Initialize visibility for all measurement items
    useEffect(() => {
        const initialVisibility: { [key: string]: boolean } = {};

        // Drawn measurements
        Object.entries(drawnMeasurements).forEach(([type, items]) => {
            items.forEach((_: Entity, idx: number) => {
                initialVisibility[`${type}-${idx}`] = true;
            });
        });

        setMeasurementItemVisibility(prev => ({ ...prev, ...initialVisibility }));
    }, [drawnMeasurements]);

    const toggleMeasurementItem = (key: string) => {
        setMeasurementItemVisibility(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    };

    // Track visibility of individual annotation items
    const [annotationItemVisibility, setAnnotationItemVisibility] = useState<{
        [key: string]: boolean;
    }>({});

    const toggleAnnotationItem = (key: string) => {
        setAnnotationItemVisibility(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    };

    // Initialize visibility for all annotation items
    useEffect(() => {
        setAnnotationItemVisibility(prev => {
            const newVisibility = { ...prev };
            // Initialize newly added items to true if not already set
            userAnnotations.lines.forEach((_, idx) => {
                if (newVisibility[`line-${idx}`] === undefined) {
                    newVisibility[`line-${idx}`] = true;
                }
            });
            userAnnotations.polygons.forEach((_, idx) => {
                if (newVisibility[`polygon-${idx}`] === undefined) {
                    newVisibility[`polygon-${idx}`] = true;
                }
            });
            userAnnotations.markers.forEach((_, idx) => {
                if (newVisibility[`marker-${idx}`] === undefined) {
                    newVisibility[`marker-${idx}`] = true;
                }
            });
            return newVisibility;
        });
    }, [userAnnotations]);




    const [layers, setLayers] = useState<LayerState>({
        '3DModel': true,
        'DSM': false,
        'DOM': false,
        'Modeling area': false,
    });

    const [annotationStates, setAnnotationStates] = useState<AnnotationState>({
        'Points': true,
        'Lines': true,
        'Polygons': true,
    });

    const [measurementStates, setMeasurementStates] = useState<MeasurementState>({
        'Length': true,
        'Height': true,
        'Triangle': true,
        'Area': true,
        'Circle': true,
    });

    const entityRefs = useRef<EntityRefs>({
        models: {},
        annotations: {},
        measurements: {},
    });

    const [dataLoaded, setDataLoaded] = useState(false);

    // Load sample data when viewer is ready
    useEffect(() => {
        if (!viewer || dataLoaded) return;

        const loadData = async () => {
            try {
                // Load 3D Model — use custom URL if provided, otherwise fall back to Cesium Ion OSM Buildings
                let osmBuildings: Cesium3DTileset;
                if (tilesetUrl) {
                    osmBuildings = await Cesium3DTileset.fromUrl(tilesetUrl);
                } else {
                    osmBuildings = await Cesium3DTileset.fromIonAssetId(96188);
                }
                viewer.scene.primitives.add(osmBuildings);
                entityRefs.current.models['3DModel'] = osmBuildings;

                // Zoom to the model, but add an offset so it doesn't clip the edges
                if (osmBuildings.boundingSphere) {
                    viewer.zoomTo(
                        osmBuildings,
                        new HeadingPitchRange(
                            CesiumMath.toRadians(0.0),
                            CesiumMath.toRadians(-20.0),
                            osmBuildings.boundingSphere.radius * 2.5
                        )
                    );
                } else {
                    viewer.zoomTo(
                        osmBuildings,
                        new HeadingPitchRange(
                            CesiumMath.toRadians(0.0),
                            CesiumMath.toRadians(-20.0),
                            800.0
                        )
                    );
                }

                // REMOVED SAMPLE ANNOTATIONS AND MEASUREMENTS TO FIX GHOST ENTITIES

                if (onTilesetLoad) {
                    onTilesetLoad(osmBuildings);
                }

                setDataLoaded(true);
            } catch (error) {
                console.error('Error loading 3D models:', error);
            }
        };

        loadData();
    }, [viewer, dataLoaded]);

    // Update 3D model visibility
    useEffect(() => {
        if (!dataLoaded) return;

        Object.entries(layers).forEach(([layerName, isVisible]) => {
            const model = entityRefs.current.models[layerName];
            if (model) {
                model.show = isVisible;
            }
        });
    }, [layers, dataLoaded]);

    // Update annotation visibility
    useEffect(() => {
        if (!dataLoaded) return;

        Object.entries(annotationStates).forEach(([name, isVisible]) => {
            const entities = entityRefs.current.annotations[name];
            if (entities) {
                entities.forEach(entity => {
                    entity.show = isVisible;
                });
            }
        });

        // Apply individual visibility for user annotations
        // User Lines
        userAnnotations.lines.forEach((entity, idx) => {
            const isGroupVisible = annotationStates['Lines'] ?? true;
            const itemVisible = annotationItemVisibility[`line-${idx}`] ?? true;
            entity.show = isGroupVisible && itemVisible;
        });
        // User Polygons
        userAnnotations.polygons.forEach((entity, idx) => {
            const isGroupVisible = annotationStates['Polygons'] ?? true;
            const itemVisible = annotationItemVisibility[`polygon-${idx}`] ?? true;
            entity.show = isGroupVisible && itemVisible;
        });
        // Markers are a bit different as they are grouped under 'Points' in the original code but handled separately in userAnnotations
        // For now, let's assume if Points are visible, markers should be too, unless individually toggled
        // User Markers (Points)
        userAnnotations.markers.forEach((entity, idx) => {
            const isGroupVisible = annotationStates['Points'] ?? true; // Markers grouped under Points
            const itemVisible = annotationItemVisibility[`marker-${idx}`] ?? true;
            entity.show = isGroupVisible && itemVisible;
        });
    }, [annotationStates, dataLoaded, userAnnotations, annotationItemVisibility]);

    // Update measurement visibility
    useEffect(() => {
        if (!dataLoaded) return;

        Object.entries(measurementStates).forEach(([name, isVisible]) => {
            const entities = entityRefs.current.measurements[name];
            if (entities) {
                entities.forEach(entity => {
                    entity.show = isVisible;
                });
            }
        });

        // Also control drawn measurements - combine category visibility with individual item visibility
        if (drawnMeasurements.length.length > 0 && measurementStates['Length'] !== undefined) {
            drawnMeasurements.length.forEach((entity, idx) => {
                const itemKey = `length-${idx}`;
                const itemVisible = measurementItemVisibility[itemKey] ?? true;
                entity.show = measurementStates['Length'] && itemVisible;
            });
        }
        if (drawnMeasurements.height.length > 0 && measurementStates['Height'] !== undefined) {
            drawnMeasurements.height.forEach((entity, idx) => {
                const itemKey = `height-${idx}`;
                const itemVisible = measurementItemVisibility[itemKey] ?? true;
                entity.show = measurementStates['Height'] && itemVisible;
            });
        }
        if (drawnMeasurements.triangle.length > 0 && measurementStates['Triangle'] !== undefined) {
            drawnMeasurements.triangle.forEach((entity, idx) => {
                const itemKey = `triangle-${idx}`;
                const itemVisible = measurementItemVisibility[itemKey] ?? true;
                entity.show = measurementStates['Triangle'] && itemVisible;
            });
        }
        if (drawnMeasurements.area.length > 0 && measurementStates['Area'] !== undefined) {
            drawnMeasurements.area.forEach((entity, idx) => {
                const itemKey = `area-${idx}`;
                const itemVisible = measurementItemVisibility[itemKey] ?? true;
                entity.show = measurementStates['Area'] && itemVisible;
            });
        }
        if (drawnMeasurements.circle.length > 0 && measurementStates['Circle'] !== undefined) {
            drawnMeasurements.circle.forEach((entity, idx) => {
                const itemKey = `circle-${idx}`;
                const itemVisible = measurementItemVisibility[itemKey] ?? true;
                entity.show = measurementStates['Circle'] && itemVisible;
            });
        }
    }, [measurementStates, dataLoaded, drawnMeasurements, measurementItemVisibility]);


    const toggleSection = (section: keyof typeof expandedSections) => {
        setExpandedSections((prev) => ({
            ...prev,
            [section]: !prev[section],
        }));
    };

    const toggleLayer = (layer: keyof LayerState) => {
        setLayers((prev) => ({
            ...prev,
            [layer]: !prev[layer],
        }));
    };

    const toggleAnnotation = (name: string) => {
        if (name === 'Points') {
            // Toggle all point groups
            const newState = !annotationStates['Points'];
            setAnnotationStates((prev) => ({
                ...prev,
                'Points': newState,
            }));
        } else {
            setAnnotationStates((prev) => ({
                ...prev,
                [name]: !prev[name],
            }));
        }
    };

    const toggleMeasurement = (name: string) => {
        setMeasurementStates((prev) => ({
            ...prev,
            [name]: !prev[name],
        }));
    };

    // Removed deleteSampleMeasurement

    // Removed hardcoded annotations object

    const measurements = [
        { name: 'Length', count: drawnMeasurements.length.length },
        { name: 'Height', count: drawnMeasurements.height.length },
        { name: 'Triangle', count: drawnMeasurements.triangle.length },
        { name: 'Area', count: drawnMeasurements.area.length },
        { name: 'Circle', count: drawnMeasurements.circle.length },
    ];

    return (
        <>
            <div className={`sidebar ${isOpen ? 'open' : 'closed'}`}>
                <div className="sidebar-header">
                    <h2 className="sidebar-title">{siteTitle}</h2>
                </div>

                <div className="sidebar-content">
                    {/* 3D Models Section */}
                    <div className="section">
                        <button
                            className="section-header"
                            onClick={() => toggleSection('models')}
                        >
                            <div className="section-title">
                                <Layers size={18} />
                                <span>3D Models</span>
                            </div>
                            {expandedSections.models ? (
                                <ChevronUp size={18} />
                            ) : (
                                <ChevronDown size={18} />
                            )}
                        </button>
                        {expandedSections.models && (
                            <div className="section-content">
                                {(Object.keys(layers) as Array<keyof LayerState>).map((layer) => (
                                    <label key={layer} className="checkbox-item">
                                        <input
                                            type="checkbox"
                                            checked={layers[layer]}
                                            onChange={() => toggleLayer(layer)}
                                        />
                                        <span>{layer}</span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Annotations Section */}
                    <div className="section">
                        <button
                            className="section-header"
                            onClick={() => toggleSection('annotations')}
                        >
                            <div className="section-title">
                                <MapPin size={18} />
                                <span>Annotations</span>
                            </div>
                            {expandedSections.annotations ? (
                                <ChevronUp size={18} />
                            ) : (
                                <ChevronDown size={18} />
                            )}
                        </button>
                        {expandedSections.annotations && (
                            <div className="section-content">
                                <div className="annotation-group">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        {/* Expand/collapse arrow for Points */}
                                        <button
                                            onClick={() => setExpandedPoints(!expandedPoints)}
                                            style={{
                                                background: 'transparent',
                                                border: 'none',
                                                color: '#64748b',
                                                cursor: 'pointer',
                                                padding: '0',
                                                display: 'flex',
                                                alignItems: 'center',
                                            }}
                                        >
                                            {expandedPoints ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                        </button>
                                        <label className="checkbox-item" style={{ flex: 1, margin: 0 }}>
                                            <input
                                                type="checkbox"
                                                checked={annotationStates['Points']}
                                                onChange={() => toggleAnnotation('Points')}
                                            />
                                            <MapPin size={16} />
                                            <span>Points</span>
                                            <span className="count">{userAnnotations.markers.length}</span>
                                        </label>
                                    </div>
                                    {/* Show individual points when expanded */}
                                    {expandedPoints && (
                                        <div style={{ paddingLeft: '2rem' }}>
                                            {/* Hardcoded points removed */}
                                            {/* User-created markers */}
                                            {userAnnotations.markers.map((_, idx) => (
                                                <div
                                                    key={`marker-${idx}`}
                                                    className="annotation-item"
                                                    style={{
                                                        alignItems: 'center',
                                                        cursor: 'pointer'
                                                    }}
                                                    onClick={() => onPanToAnnotation('marker', idx)}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={annotationItemVisibility[`marker-${idx}`] ?? true}
                                                        onChange={() => toggleAnnotationItem(`marker-${idx}`)}
                                                        onClick={(e) => e.stopPropagation()}
                                                    />
                                                    <span style={{ fontSize: '0.85rem' }}>{(userAnnotations.markers[idx] as any).annotationName || `Point ${idx + 1}`}</span>
                                                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onEditItem('annotation', 'marker', idx);
                                                            }}
                                                            className="delete-button"
                                                            title="Edit"
                                                            style={{ color: '#94a3b8' }}
                                                        >
                                                            <Edit2 size={14} />
                                                        </button>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onDeleteAnnotation('marker', idx);
                                                            }}
                                                            className="delete-button"
                                                            title="Delete point"
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="annotation-group">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <button
                                            onClick={() => setExpandedLines(prev => !prev)}
                                            style={{
                                                background: 'transparent',
                                                border: 'none',
                                                color: '#64748b',
                                                cursor: 'pointer',
                                                padding: '0',
                                                display: 'flex',
                                                alignItems: 'center',
                                            }}
                                        >
                                            {expandedLines ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                        </button>
                                        <label className="checkbox-item" style={{ flex: 1, margin: 0 }}>
                                            <input
                                                type="checkbox"
                                                checked={annotationStates['Lines']}
                                                onChange={() => toggleAnnotation('Lines')}
                                            />
                                            <span>Lines</span>
                                            <span className="count">{userAnnotations.lines.length}</span>
                                        </label>
                                    </div>
                                    {expandedLines && (
                                        <div style={{ paddingLeft: '2rem' }}>
                                            {/* User-created lines */}
                                            {userAnnotations.lines.map((_, idx) => (
                                                <div key={`line-${idx}`} className="annotation-item"
                                                    style={{ cursor: 'pointer' }}
                                                    onClick={(e) => {
                                                        // Only pan if not clicking checkbox or delete
                                                        if ((e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'BUTTON' && (e.target as HTMLElement).tagName !== 'SVG' && (e.target as HTMLElement).tagName !== 'path') {
                                                            onPanToAnnotation('line', idx);
                                                        }
                                                    }}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={annotationItemVisibility[`line-${idx}`] ?? true}
                                                        onChange={() => toggleAnnotationItem(`line-${idx}`)}
                                                        onClick={(e) => e.stopPropagation()}
                                                    />
                                                    <span>{(userAnnotations.lines[idx] as any).annotationName || `Line ${idx + 1}`}</span>
                                                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onEditItem('annotation', 'line', idx);
                                                            }}
                                                            className="delete-button"
                                                            title="Edit"
                                                            style={{ color: '#94a3b8' }}
                                                        >
                                                            <Edit2 size={14} />
                                                        </button>
                                                        <button
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                onDeleteAnnotation('line', idx);
                                                            }}
                                                            className="delete-button"
                                                            title="Delete line"
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="annotation-group">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <button
                                            onClick={() => setExpandedPolygons(prev => !prev)}
                                            style={{
                                                background: 'transparent',
                                                border: 'none',
                                                color: '#64748b',
                                                cursor: 'pointer',
                                                padding: '0',
                                                display: 'flex',
                                                alignItems: 'center',
                                            }}
                                        >
                                            {expandedPolygons ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                        </button>
                                        <label className="checkbox-item" style={{ flex: 1, margin: 0 }}>
                                            <input
                                                type="checkbox"
                                                checked={annotationStates['Polygons']}
                                                onChange={() => toggleAnnotation('Polygons')}
                                            />
                                            <span>Polygons</span>
                                            <span className="count">{userAnnotations.polygons.length}</span>
                                        </label>
                                    </div>
                                    {expandedPolygons && (
                                        <div style={{ paddingLeft: '2rem' }}>
                                            {/* User-created polygons */}
                                            {userAnnotations.polygons.map((_, idx) => (
                                                <div key={`polygon-${idx}`} className="annotation-item"
                                                    style={{ cursor: 'pointer' }}
                                                    onClick={(e) => {
                                                        if ((e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'BUTTON' && (e.target as HTMLElement).tagName !== 'SVG' && (e.target as HTMLElement).tagName !== 'path') {
                                                            onPanToAnnotation('polygon', idx);
                                                        }
                                                    }}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={annotationItemVisibility[`polygon-${idx}`] ?? true}
                                                        onChange={() => toggleAnnotationItem(`polygon-${idx}`)}
                                                        onClick={(e) => e.stopPropagation()}
                                                    />
                                                    <span>{(userAnnotations.polygons[idx] as any).annotationName || `Polygon ${idx + 1}`}</span>
                                                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onEditItem('annotation', 'polygon', idx);
                                                            }}
                                                            className="delete-button"
                                                            title="Edit"
                                                            style={{ color: '#94a3b8' }}
                                                        >
                                                            <Edit2 size={14} />
                                                        </button>
                                                        <button
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                onDeleteAnnotation('polygon', idx);
                                                            }}
                                                            className="delete-button"
                                                            title="Delete polygon"
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                            </div>
                        )}
                    </div>

                    {/* Measurement Section */}
                    <div className="section">
                        <button
                            className="section-header"
                            onClick={() => toggleSection('measurement')}
                        >
                            <div className="section-title">
                                <Ruler size={18} />
                                <span>Measurement</span>
                            </div>
                            {expandedSections.measurement ? (
                                <ChevronUp size={18} />
                            ) : (
                                <ChevronDown size={18} />
                            )}
                        </button>
                        {expandedSections.measurement && (
                            <div className="section-content">
                                {measurements.map((measurement, idx) => {
                                    const measurementType = measurement.name.toLowerCase() as 'length' | 'height' | 'triangle' | 'area' | 'circle';
                                    const drawnItems = drawnMeasurements[measurementType] || [];
                                    const isExpanded = expandedMeasurements[measurement.name as keyof typeof expandedMeasurements];

                                    return (
                                        <div key={idx} className="annotation-group">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                {/* Always show expand/collapse arrow */}
                                                <button
                                                    onClick={() => setExpandedMeasurements(prev => ({
                                                        ...prev,
                                                        [measurement.name]: !prev[measurement.name as keyof typeof prev]
                                                    }))}
                                                    style={{
                                                        background: 'transparent',
                                                        border: 'none',
                                                        color: '#64748b',
                                                        cursor: 'pointer',
                                                        padding: '0',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                    }}
                                                >
                                                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                                </button>
                                                <label className="checkbox-item" style={{ flex: 1, margin: 0 }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={measurementStates[measurement.name]}
                                                        onChange={() => toggleMeasurement(measurement.name)}
                                                    />
                                                    <span>{measurement.name}</span>
                                                    <span className="count">{measurement.count}</span>
                                                </label>
                                            </div>
                                            {/* Show sample and drawn measurements as sub-items when expanded */}
                                            {isExpanded && (
                                                <div style={{ paddingLeft: '2rem' }}>

                                                    {/* Show drawn measurements (e.g., "Length 2", "Length 3") */}
                                                    {drawnItems.map((entity, drawIdx) => (
                                                        <div
                                                            key={`drawn-${drawIdx}`}
                                                            className="annotation-item"
                                                            style={{ cursor: 'pointer' }}
                                                            onClick={(e) => {
                                                                // Only pan if not clicking checkbox or delete
                                                                if ((e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'BUTTON' && (e.target as HTMLElement).tagName !== 'SVG' && (e.target as HTMLElement).tagName !== 'path') {
                                                                    onPanToMeasurement(measurementType, drawIdx);
                                                                }
                                                            }}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={measurementItemVisibility[`${measurementType}-${drawIdx}`] ?? true}
                                                                onChange={() => toggleMeasurementItem(`${measurementType}-${drawIdx}`)}
                                                                onClick={(e) => e.stopPropagation()}
                                                            />
                                                            <span>
                                                                {(entity as any).measurementName || `${measurement.name} ${drawIdx + 1}`}
                                                            </span>
                                                            <div style={{ display: 'flex', gap: '0.25rem' }}>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        onEditItem('measurement', measurementType, drawIdx);
                                                                    }}
                                                                    className="delete-button"
                                                                    title="Edit"
                                                                    style={{ color: '#94a3b8' }}
                                                                >
                                                                    <Edit2 size={14} />
                                                                </button>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.preventDefault();
                                                                        e.stopPropagation();
                                                                        onDeleteMeasurement(measurementType, drawIdx);
                                                                    }}
                                                                    className="delete-button"
                                                                    title="Delete measurement"
                                                                >
                                                                    <X size={14} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <button className="sidebar-toggle" onClick={onToggle}>
                {isOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
            </button>
        </>
    );
}

export default Sidebar;
