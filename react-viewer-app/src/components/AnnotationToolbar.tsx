import React from 'react';
import { MapPin, Minus, Pentagon } from 'lucide-react';
import './AnnotationToolbar.css';

type AnnotationTool = 'marker' | 'line' | 'polygon' | null;

interface AnnotationToolbarProps {
    onToolSelect: (tool: AnnotationTool) => void;
    activeTool: string | null;
    isSidebarOpen: boolean;
}

const AnnotationToolbar: React.FC<AnnotationToolbarProps> = ({ onToolSelect, activeTool, isSidebarOpen }) => {
    const tools = [
        { id: 'marker', icon: MapPin, label: 'Add Marker' },
        { id: 'line', icon: Minus, label: 'Draw Line' },
        { id: 'polygon', icon: Pentagon, label: 'Draw Polygon' },
    ];

    const handleToolClick = (toolId: string) => {
        if (activeTool === toolId) {
            onToolSelect(null);
        } else {
            onToolSelect(toolId as AnnotationTool);
        }
    };

    return (
        <div className={`annotation-toolbar ${!isSidebarOpen ? 'sidebar-collapsed' : ''}`}>
            {tools.map((tool) => (
                <button
                    key={tool.id}
                    className={`annotation-tool-btn ${activeTool === tool.id ? 'active' : ''}`}
                    onClick={() => handleToolClick(tool.id)}
                    title={tool.label}
                >
                    <tool.icon size={20} />
                </button>
            ))}
        </div>
    );
};

export default AnnotationToolbar;

