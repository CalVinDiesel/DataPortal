const API_URL = 'http://localhost:3001/api';

export interface SpatialFeature {
    id: string;
    name: string;
    description?: string;
    type: string;
    category: 'measurement' | 'annotation';
    geom: any; // GeoJSON geometry
    created_at?: string;
    updated_at?: string;
}

export const api = {
    getFeatures: async (): Promise<SpatialFeature[]> => {
        const response = await fetch(`${API_URL}/features`);
        if (!response.ok) throw new Error('Failed to fetch features');
        return response.json();
    },

    createFeature: async (feature: Omit<SpatialFeature, 'id' | 'created_at' | 'updated_at'>): Promise<SpatialFeature> => {
        const response = await fetch(`${API_URL}/features`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(feature),
        });
        if (!response.ok) throw new Error('Failed to create feature');
        return response.json();
    },

    updateFeature: async (id: string, updates: Partial<SpatialFeature>): Promise<SpatialFeature> => {
        const response = await fetch(`${API_URL}/features/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
        });
        if (!response.ok) throw new Error('Failed to update feature');
        return response.json();
    },

    deleteFeature: async (id: string): Promise<void> => {
        const response = await fetch(`${API_URL}/features/${id}`, {
            method: 'DELETE',
        });
        if (!response.ok) throw new Error('Failed to delete feature');
    },
};
