import { Link } from 'react-router-dom';
import './LandingPage.css';

interface DemoShowcase {
    id: string;
    title: string;
    siteTitle: string;
    gradient: string;
    tilesetUrl: string | null;
}

const showcases: DemoShowcase[] = [
    {
        id: '839102475618203947562314',
        title: 'KB 3DTiles Lite',
        siteTitle: 'KB 3DTiles Lite',
        gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        tilesetUrl: 'https://3dhub.geosabah.my/3dmodel/Building_Planning/KB_3DTiles_Lite/tileset.json',
    },
    {
        id: '495830127649382715206948',
        title: 'Kolombong Fisheye Test',
        siteTitle: 'Kolombong',
        gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
        tilesetUrl: 'https://3dhub.geosabah.my/3dmodel/Building_Planning/fisheye_test_kolombong_18mac2025/tileset.json',
    },
    {
        id: '720594831627480391856273',
        title: 'KK OSPREY',
        siteTitle: 'KK OSPREY',
        gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
        tilesetUrl: 'https://3dhub.geosabah.my/3dmodel/KK_OSPREY/tileset.json',
    },
    {
        id: '618473920156283947502619',
        title: 'WISMA MERDEKA',
        siteTitle: 'WISMA MERDEKA',
        gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
        tilesetUrl: 'https://3dhub.geosabah.my/3dmodel/wismamerdeka/tileset.json',
    },
    {
        id: '304958716293847105672481',
        title: 'PPNS YS',
        siteTitle: 'PPNS YS',
        gradient: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
        tilesetUrl: 'https://3dhub.geosabah.my/3dmodel/ppns_ys/tileset.json',
    },
];

function LandingPage() {
    return (
        <div className="landing-page">
            <header className="landing-header">
                <div className="header-content">
                    <div className="logo-section">
                        <h1 className="main-title">
                            Demo <span className="highlight">Showcases</span>
                        </h1>
                    </div>
                    <p className="subtitle">
                        Explore interactive demos showcasing Cloud's capabilities in various industries.
                    </p>
                </div>
            </header>

            <main className="showcase-grid">
                {showcases.map((showcase) => (
                    <Link
                        key={showcase.id}
                        to={`/discovery?model=${showcase.id}`}
                        state={{ siteTitle: showcase.siteTitle }}
                        className="showcase-card"
                        style={{ background: showcase.gradient }}
                    >
                        <div className="card-overlay">
                            <h2 className="card-title">{showcase.title}</h2>
                        </div>
                    </Link>
                ))}
            </main>
        </div>
    );
}

export default LandingPage;
