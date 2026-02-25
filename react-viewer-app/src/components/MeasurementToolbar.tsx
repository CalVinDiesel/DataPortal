import { Ruler, MoveVertical, Triangle, Square, Circle } from 'lucide-react';
import './MeasurementToolbar.css';

interface MeasurementToolbarProps {
    onToolSelect: (tool: 'length' | 'height' | 'triangle' | 'area' | 'circle' | null) => void;
    activeTool: string | null;
    isSidebarOpen: boolean;
}

function MeasurementToolbar({ onToolSelect, activeTool, isSidebarOpen }: MeasurementToolbarProps) {
    const tools = [
        { id: 'length', icon: Ruler, label: 'Length' },
        { id: 'height', icon: MoveVertical, label: 'Height' },
        { id: 'triangle', icon: Triangle, label: 'Triangle' },
        { id: 'area', icon: Square, label: 'Area' },
        { id: 'circle', icon: Circle, label: 'Circle' },
    ];

    const handleToolClick = (toolId: string) => {
        // Toggle tool - if already active, deactivate it
        if (activeTool === toolId) {
            onToolSelect(null);
        } else {
            onToolSelect(toolId as 'length' | 'height' | 'triangle' | 'area' | 'circle');
        }
    };

    return (
        <div className={`measurement-toolbar ${!isSidebarOpen ? 'sidebar-collapsed' : ''}`}>
            {tools.map((tool) => {
                const Icon = tool.icon;
                return (
                    <button
                        key={tool.id}
                        className={`tool-button ${activeTool === tool.id ? 'active' : ''}`}
                        onClick={() => handleToolClick(tool.id)}
                        title={tool.label}
                    >
                        <Icon size={20} />
                    </button>
                );
            })}
        </div>
    );
}

export default MeasurementToolbar;

