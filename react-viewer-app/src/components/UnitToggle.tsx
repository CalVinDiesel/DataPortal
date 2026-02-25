import './UnitToggle.css';

interface UnitToggleProps {
    unitSystem: 'metric' | 'imperial';
    onToggle: () => void;
    isSidebarOpen: boolean;
}

function UnitToggle({ unitSystem, onToggle, isSidebarOpen }: UnitToggleProps) {
    return (
        <button
            className={`unit-toggle ${!isSidebarOpen ? 'sidebar-collapsed' : ''}`}
            onClick={onToggle}
            title={`Switch to ${unitSystem === 'metric' ? 'Imperial' : 'Metric'} units`}
        >
            {unitSystem === 'metric' ? '🌍 Metric' : '🇺🇸 Imperial'}
        </button>
    );
}

export default UnitToggle;

