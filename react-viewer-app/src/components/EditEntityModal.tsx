import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

interface EditEntityModalProps {
    isOpen: boolean;
    initialName: string;
    initialDescription: string;
    onSave: (name: string, description: string) => void;
    onClose: () => void;
}

export default function EditEntityModal({ isOpen, initialName, initialDescription, onSave, onClose }: EditEntityModalProps) {
    const [name, setName] = useState(initialName);
    const [description, setDescription] = useState(initialDescription);
    const [nameError, setNameError] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setName(initialName);
            setDescription(initialDescription || '');
            setNameError(false);
        }
    }, [isOpen, initialName, initialDescription]);

    if (!isOpen) return null;

    const handleSave = () => {
        const trimmedName = name.trim();
        if (!trimmedName) {
            setNameError(true);
            return;
        }
        onSave(trimmedName, description);
    };

    return (
        <div className="modal-overlay" style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 3000,
        }}>
            <div className="modal-content" style={{
                backgroundColor: '#ffffff',
                padding: '1.5rem',
                borderRadius: '8px',
                width: '400px',
                border: '1px solid #e2e8f0',
                color: '#1e293b',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <h3 style={{ margin: 0, fontWeight: 600 }}>Edit Item</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                        <X size={20} />
                    </button>
                </div>

                <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#475569', fontWeight: 500 }}>
                        Name <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => {
                            setName(e.target.value);
                            if (e.target.value.trim()) setNameError(false);
                        }}
                        style={{
                            width: '100%',
                            padding: '0.5rem',
                            borderRadius: '4px',
                            border: nameError ? '1px solid #ef4444' : '1px solid #cbd5e1',
                            backgroundColor: nameError ? '#fff5f5' : '#f8fafc',
                            color: '#1e293b',
                            outline: 'none',
                        }}
                    />
                    {nameError && (
                        <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#ef4444' }}>
                            Name cannot be empty.
                        </p>
                    )}
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#475569', fontWeight: 500 }}>Description</label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                        style={{
                            width: '100%',
                            padding: '0.5rem',
                            borderRadius: '4px',
                            border: '1px solid #cbd5e1',
                            backgroundColor: '#f8fafc',
                            color: '#1e293b',
                            resize: 'vertical',
                        }}
                    />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                    <button onClick={onClose} style={{
                        padding: '0.5rem 1rem',
                        borderRadius: '4px',
                        border: '1px solid #cbd5e1',
                        backgroundColor: 'white',
                        color: '#475569',
                        cursor: 'pointer',
                        fontWeight: 500,
                    }}
                        className='hover:bg-slate-50'
                    >
                        Cancel
                    </button>
                    <button onClick={handleSave} style={{
                        padding: '0.5rem 1rem',
                        borderRadius: '4px',
                        border: 'none',
                        backgroundColor: '#3b82f6',
                        color: 'white',
                        cursor: 'pointer',
                        fontWeight: 500,
                    }}
                        className='hover:bg-blue-600'
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
}
