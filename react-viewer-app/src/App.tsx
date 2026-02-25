import { BrowserRouter, Routes, Route } from 'react-router-dom';
import DiscoveryPage from './pages/DiscoveryPage';
import './index.css';

function App() {
    return (
        <BrowserRouter basename="/html/cesium-viewer">
            <Routes>
                {/* When loaded directly, show the DiscoveryPage since it's now a standalone viewer integrated into TemaDataPortal */}
                <Route path="/" element={<DiscoveryPage />} />
                <Route path="/index.html" element={<DiscoveryPage />} />
                <Route path="/discovery" element={<DiscoveryPage />} />
                <Route path="*" element={<DiscoveryPage />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;
