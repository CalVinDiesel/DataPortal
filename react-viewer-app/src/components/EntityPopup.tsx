import { Edit2, Trash2, X } from 'lucide-react';

interface EntityPopupProps {
    x: number;
    y: number;
    name: string;
    description?: string;
    onEdit: () => void;
    onDelete: () => void;
    onClose: () => void;
}

export default function EntityPopup({ x, y, name, description, onEdit, onDelete, onClose }: EntityPopupProps) {
    return (
        <div style={{
            position: 'absolute',
            left: x,
            top: y,
            transform: 'translate(-50%, -100%)', // Anchor bottom-center
            backgroundColor: '#ffffff',
            padding: '1rem',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            color: '#1e293b',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            zIndex: 1000,
            width: '250px',
            pointerEvents: 'auto', // Ensure clicks work
            marginTop: '-15px' // Slight offset from the point
        }}>
            {/* Arrow/Triangle at bottom */}
            <div style={{
                position: 'absolute',
                bottom: '-6px',
                left: '50%',
                marginLeft: '-6px',
                width: '0',
                height: '0',
                borderLeft: '6px solid transparent',
                borderRight: '6px solid transparent',
                borderTop: '6px solid #e2e8f0',
            }} />
            <div style={{
                position: 'absolute',
                bottom: '-5px',
                left: '50%',
                marginLeft: '-6px',
                width: '0',
                height: '0',
                borderLeft: '6px solid transparent',
                borderRight: '6px solid transparent',
                borderTop: '6px solid #ffffff',
            }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{name}</h4>
                <button
                    onClick={onClose}
                    style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 0 }}
                >
                    <X size={16} />
                </button>
            </div>

            {description && (
                <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: '#475569', lineHeight: 1.4 }}>
                    {description}
                </p>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: description ? 0 : '0.5rem' }}>
                <button
                    onClick={onEdit}
                    style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.25rem',
                        padding: '0.4rem',
                        fontSize: '0.85rem',
                        backgroundColor: '#f1f5f9',
                        border: '1px solid #e2e8f0',
                        borderRadius: '4px',
                        color: '#475569',
                        cursor: 'pointer'
                    }}
                    className='hover:bg-slate-100'
                >
                    <Edit2 size={14} /> Edit
                </button>
                <button
                    onClick={onDelete}
                    style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.25rem',
                        padding: '0.4rem',
                        fontSize: '0.85rem',
                        backgroundColor: '#ef4444',
                        border: 'none',
                        borderRadius: '4px',
                        color: 'white',
                        cursor: 'pointer'
                    }}
                >
                    <Trash2 size={14} /> Delete
                </button>
            </div>
        </div>
    );
}
